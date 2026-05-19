// Outlet step execution engine.
// Picks up cards from the preceding tray's ready/ folder, resolves template tokens,
// dispatches via SMTP or HTTP POST, then archives the card (or sends to 99-errors).

import { join, basename } from 'path'
import fs from 'fs/promises'
import { BrowserWindow } from 'electron'
import { fsService } from './fs-service'
import { projectService } from './project-service'
import { credentialService } from './credential-service'
import { auditDb } from './audit-db'
import { resolveTokens } from '../ai-terminals/prompt-utils'
import { runAIStep } from './ai-step-helper'
import { IPC } from '../../shared/ipc-channels'
import type { OutletStepConfig, OutletRunMeta, OutletRunEvent, HttpCredential, SmtpCredential } from '../../shared/types'
import type { Card } from '../../shared/card'

// ── Broadcast ─────────────────────────────────────────────────────────────────

let broadcastTarget: () => BrowserWindow[] = () => []

export function setOutletEventBroadcast(getWindows: () => BrowserWindow[]) {
  broadcastTarget = getWindows
}

function emitTyped(channel: string, event: OutletRunEvent) {
  for (const win of broadcastTarget()) {
    if (!win.isDestroyed()) win.webContents.send(channel, event)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nextRunId(existing: string[]): string {
  const date = todayDate()
  let max = 0
  for (const e of existing) {
    const m = e.match(new RegExp(`^run_${date}_(\\d{3})$`))
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `run_${date}_${String(max + 1).padStart(3, '0')}`
}

// ── In-flight guard ───────────────────────────────────────────────────────────

const inFlight = new Set<string>()

// ── Run ───────────────────────────────────────────────────────────────────────

export async function runOutlet(
  project: string,
  workflow: string,
  stepId: string,
  stepConfig: OutletStepConfig,
  cardId: string,
  prevStepId: string,
): Promise<void> {
  const runKey = `${project}/${workflow}/${stepId}/${cardId}`
  if (inFlight.has(runKey)) return
  inFlight.add(runKey)
  try {
    await runOutletInner(project, workflow, stepId, stepConfig, cardId, prevStepId)
  } finally {
    inFlight.delete(runKey)
  }
}

async function runOutletInner(
  project: string,
  workflow: string,
  stepId: string,
  stepConfig: OutletStepConfig,
  cardId: string,
  prevStepId: string,
): Promise<void> {
  const stepDir = projectService.paths.stepDir(project, workflow, stepId)
  const prevStepDir = projectService.paths.stepDir(project, workflow, prevStepId)
  const runsDir = join(stepDir, 'runs')
  await fs.mkdir(runsDir, { recursive: true })

  let existingRuns: string[] = []
  try { existingRuns = await fs.readdir(runsDir) } catch { /* empty */ }
  const runId = nextRunId(existingRuns)
  const runDir = join(runsDir, runId)
  await fs.mkdir(runDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const channelType = stepConfig.channel.type

  const meta: OutletRunMeta = {
    run_id: runId, status: 'running', started_at: startedAt, card_id: cardId, channel_type: channelType,
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), meta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
    event: 'outlet_run_started', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, channel_type: channelType }),
  })
  emitTyped(IPC.outlet.onStarted, { type: 'started', project, workflow, stepId, runId, cardId })

  // Read source card
  const cardPath = join(prevStepDir, 'cards', 'ready', `${cardId}.json`)
  if (!(await pathExists(cardPath))) {
    await completeWithError(project, workflow, stepId, runId, runDir, cardId, prevStepDir, meta, 'Card file not found')
    return
  }

  let card: Card
  try { card = await fsService.readJson<Card>(cardPath) }
  catch (err) {
    await completeWithError(project, workflow, stepId, runId, runDir, cardId, prevStepDir, meta, `Failed to read card: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  let cardData = card.data as Record<string, unknown>
  // When an AI step returns a plain string (e.g. a pre-formatted HTTP body),
  // we use it directly instead of passing it through the body template.
  let aiBodyOverride: string | undefined

  // Apply AI formatting if a prompt is configured
  if (stepConfig.prompt) {
    try {
      const projectMeta = await projectService.getProject(project)
      const permissions = projectService.getPermissions(projectMeta)

      // For HTTP outlets, prepend a system preamble so the AI knows:
      // (a) the target endpoint & expected body format, and
      // (b) to output ONLY the body — not to make HTTP calls itself.
      let preamble = ''
      if (stepConfig.channel.type === 'http_post') {
        const ch = stepConfig.channel
        const rawCred = await credentialService.get(ch.credential_id).catch(() => null)
        const httpCred = rawCred as HttpCredential | null
        const baseUrl = httpCred?.base_url?.replace(/\/$/, '') ?? ''
        const urlPath = ch.url_path ? (ch.url_path.startsWith('/') ? ch.url_path : '/' + ch.url_path) : ''
        const fullUrl = baseUrl + urlPath
        const method = ch.method ?? 'POST'
        const headerLines = httpCred?.headers.map(h => `  - ${h.name}: ${h.value}`).join('\n') ?? ''
        preamble = [
          '## HTTP Request Context',
          'You are preparing the body for the HTTP request below.',
          'Output ONLY the final request body — raw text or JSON — with no code fences, no markdown, and no explanation.',
          'The system sends the request automatically; do NOT use any tools, make HTTP calls, or run shell commands.',
          '',
          `Method: ${method}`,
          `URL: ${fullUrl}`,
          headerLines ? `Headers:\n${headerLines}` : '',
          ch.body ? `Body template: ${ch.body}` : '',
          '',
          '---',
          '',
        ].filter(l => l !== null).join('\n')
      }

      const hasDataToken = stepConfig.prompt.includes('{{card.data')
      const userInstructions = hasDataToken
        ? stepConfig.prompt
        : `${stepConfig.prompt}\n\n## Card data\n\n\`\`\`json\n${JSON.stringify(cardData, null, 2)}\n\`\`\`\n\nApply the instructions above to the card data and output only the result.`
      const aiPrompt = preamble ? preamble + userInstructions : userInstructions

      const aiResult = await runAIStep({
        runDir,
        prompt: aiPrompt,
        cardData,
        permissions,
        timeoutMs: 60_000,
      })
      if (typeof aiResult.output === 'object') {
        cardData = aiResult.output as Record<string, unknown>
      } else {
        // String output for HTTP outlet — use directly as the request body.
        // For other channel types fall back to keying under ai_output.
        if (stepConfig.channel.type === 'http_post') {
          aiBodyOverride = aiResult.output
        } else {
          cardData = { ...cardData, ai_output: aiResult.output }
        }
      }
    } catch (err) {
      await completeWithError(project, workflow, stepId, runId, runDir, cardId, prevStepDir, meta, `AI step failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
  }

  try {
    if (stepConfig.channel.type === 'smtp') {
      const cred = await credentialService.get(stepConfig.channel.credential_id)
      if (!cred) throw new Error(`Credential not found: ${stepConfig.channel.credential_id}`)
      const { sendEmail } = await import('./smtp-channel')
      const ch = stepConfig.channel
      await sendEmail(cred as SmtpCredential, {
        to: resolveTokens(ch.to, cardData),
        subject: resolveTokens(ch.subject, cardData),
        body: resolveTokens(ch.body, cardData),
      })
    } else if (stepConfig.channel.type === 'http_post') {
      const cred = await credentialService.get(stepConfig.channel.credential_id)
      if (!cred) throw new Error(`Credential not found: ${stepConfig.channel.credential_id}`)
      const { postHttp } = await import('./http-channel')
      const ch = stepConfig.channel
      // If AI produced a string body override, use it directly.
      // Otherwise resolve the body template with the rich token system.
      const resolvedBody = aiBodyOverride ?? (ch.body ? resolveTokens(ch.body, cardData) : undefined)
      const resolvedCh = resolvedBody !== undefined ? { ...ch, body: resolvedBody } : ch
      await postHttp(cred as HttpCredential, resolvedCh, {})
    }
  } catch (err) {
    await completeWithError(project, workflow, stepId, runId, runDir, cardId, prevStepDir, meta, err instanceof Error ? err.message : String(err))
    return
  }

  // Success: archive card from prev step
  const archivedDir = join(prevStepDir, 'cards', 'archived')
  await fs.mkdir(archivedDir, { recursive: true })
  await fs.rename(cardPath, join(archivedDir, `${cardId}.json`))

  const endedAt = new Date().toISOString()
  const finalMeta: OutletRunMeta = { ...meta, status: 'completed', ended_at: endedAt }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), finalMeta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
    event: 'outlet_run_completed', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, channel_type: channelType }),
  })
  emitTyped(IPC.outlet.onCompleted, { type: 'completed', project, workflow, stepId, runId, cardId })
}

async function completeWithError(
  project: string,
  workflow: string,
  stepId: string,
  runId: string,
  runDir: string,
  cardId: string,
  prevStepDir: string,
  meta: OutletRunMeta,
  error: string,
): Promise<void> {
  const endedAt = new Date().toISOString()
  const failMeta: OutletRunMeta = { ...meta, status: 'failed', ended_at: endedAt, error }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), failMeta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
    event: 'outlet_run_failed', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, error }),
  })
  emitTyped(IPC.outlet.onFailed, { type: 'failed', project, workflow, stepId, runId, cardId, error })

  // Move card to 99-errors
  const cardPath = join(prevStepDir, 'cards', 'ready', `${cardId}.json`)
  if (await pathExists(cardPath)) {
    const wfRoot = join(projectService.paths.stepDir(project, workflow, '99-errors'))
    const errReady = join(wfRoot, 'cards', 'ready')
    await fs.mkdir(errReady, { recursive: true })
    await fs.rename(cardPath, join(errReady, basename(cardPath)))
  }
}

// ── Run listing ───────────────────────────────────────────────────────────────

export async function listOutletRuns(project: string, workflow: string, stepId: string): Promise<OutletRunMeta[]> {
  const runsDir = join(projectService.paths.stepDir(project, workflow, stepId), 'runs')
  if (!(await pathExists(runsDir))) return []
  const entries = await fs.readdir(runsDir, { withFileTypes: true })
  const out: OutletRunMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const metaPath = join(runsDir, e.name, 'meta.json')
    if (!(await pathExists(metaPath))) continue
    try { out.push(await fsService.readJson<OutletRunMeta>(metaPath)) } catch { /* skip */ }
  }
  out.sort((a, b) => b.started_at.localeCompare(a.started_at))
  return out
}

export const outletRunner = {
  runOutlet,
  listOutletRuns,
}
