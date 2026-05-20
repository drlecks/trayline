// Source step execution engine.
//
// HTTP GET: one fetch per scheduled run → one card (data.body = full response text).
// IMAP:     one card per email, deduplicated via seen-ids.json.
//
// Atomic protocol for IMAP:
//   1. Read seen-ids.json (or empty on first run).
//   2. Fetch emails from IMAP.
//   3. Dedup loop: skip items whose ID is already in seen set.
//   4. Write audit entry for each new item BEFORE creating the card file.
//   5. Create card files in cards/ready/.
//   6. Atomic seen-ids write: write .tmp → rename.
//   7. Update state/counters.json.

import { join } from 'path'
import fs from 'fs/promises'
import { BrowserWindow } from 'electron'
import { fsService, Paths } from './fs-service'
import { projectService } from './project-service'
import { credentialService } from './credential-service'
import { notificationService } from './notification-service'
import { auditDb } from './audit-db'
import { IPC } from '../../shared/ipc-channels'
import { runAIStep } from './ai-step-helper'
import { outputLog } from './output-log'
import type { SourceStepConfig, SourceCounters, SeenIdsEntry, SourceRunMeta, SourceState, SourceRunEvent, HttpCredential, ImapCredential, HttpErrorDetail, FileWatchChannel } from '../../shared/types'
import type { Card, CardHistoryEntry } from '../../shared/card'

// ── Broadcast ─────────────────────────────────────────────────────────────────

let broadcastTarget: () => BrowserWindow[] = () => []

export function setSourceEventBroadcast(getWindows: () => BrowserWindow[]) {
  broadcastTarget = getWindows
}

function emit(event: SourceRunEvent) {
  for (const win of broadcastTarget()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.source.onRunEvent, event)
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

async function nextCardId(project: string, workflow: string, stepId: string, n: number): Promise<string> {
  const date = todayDate()
  const stepDir = projectService.paths.stepDir(project, workflow, stepId)
  let max = 0
  for (const status of ['pending', 'ready', 'archived'] as const) {
    const dir = join(stepDir, 'cards', status)
    if (!(await pathExists(dir))) continue
    const files = await fs.readdir(dir)
    for (const f of files) {
      const m = f.match(new RegExp(`^card_${date}_(\\d{3})\\.json$`))
      if (m) {
        const num = parseInt(m[1], 10)
        if (num > max) max = num
      }
    }
  }
  return `card_${date}_${String(max + n).padStart(3, '0')}`
}

async function readSeenIds(stateDir: string): Promise<SeenIdsEntry[]> {
  const p = join(stateDir, 'seen-ids.json')
  if (!(await pathExists(p))) return []
  try {
    return await fsService.readJson<SeenIdsEntry[]>(p)
  } catch {
    return []
  }
}

async function writeSeenIdsAtomic(stateDir: string, entries: SeenIdsEntry[]): Promise<void> {
  const tmp = join(stateDir, 'seen-ids.json.tmp')
  await fs.writeFile(tmp, JSON.stringify(entries, null, 2), 'utf-8')
  await fs.rename(tmp, join(stateDir, 'seen-ids.json'))
}

async function readCounters(stateDir: string): Promise<SourceCounters> {
  const p = join(stateDir, 'counters.json')
  const defaults: SourceCounters = { runs_total: 0, items_found: 0, items_new: 0, last_run_at: null }
  if (!(await pathExists(p))) return defaults
  try { return await fsService.readJson<SourceCounters>(p) } catch { return defaults }
}

function pruneSeenIds(entries: SeenIdsEntry[], maxMemory: number): SeenIdsEntry[] {
  if (entries.length <= maxMemory) return entries
  // Sort oldest first, drop the oldest entries
  const sorted = [...entries].sort((a, b) => a.seen_at.localeCompare(b.seen_at))
  return sorted.slice(sorted.length - maxMemory)
}

// If the step immediately after the source in the workflow is a tray, write produced
// cards directly to that tray's ready/ folder so they bypass the pending review queue.
// Falls back to the source step's own ready/ when the next step is a worker, outlet,
// 99-errors, or when the workflow/step file cannot be read.
async function resolveCardOutputDir(
  project: string,
  workflow: string,
  sourceStepId: string,
): Promise<{ dir: string; autoForwarded: boolean; forwardedToStepId: string | null }> {
  const fallback = {
    dir: join(projectService.paths.stepDir(project, workflow, sourceStepId), 'cards', 'ready'),
    autoForwarded: false,
    forwardedToStepId: null,
  }
  try {
    const wf = await fsService.readJson<{ step_ids: string[] }>(
      join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
    )
    const idx = wf.step_ids.indexOf(sourceStepId)
    if (idx === -1 || idx >= wf.step_ids.length - 1) return fallback
    const nextStepId = wf.step_ids[idx + 1]
    const nextStepDir = projectService.paths.stepDir(project, workflow, nextStepId)
    const nextStep = await fsService.readJson<{ kind: string }>(join(nextStepDir, 'step.json'))
    if (nextStep.kind === 'tray') {
      return {
        dir: join(nextStepDir, 'cards', 'ready'),
        autoForwarded: true,
        forwardedToStepId: nextStepId,
      }
    }
  } catch { /* fall through */ }
  return fallback
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

function stepKey(project: string, workflow: string, stepId: string): string {
  return `${project}/${workflow}/${stepId}`
}

// ── Run orchestration ─────────────────────────────────────────────────────────

export interface RunSourceInput {
  project: string
  workflow: string
  stepId: string
  stepConfig: SourceStepConfig
}

async function runSource(input: RunSourceInput): Promise<void> {
  const { project, workflow, stepId } = input
  const key = stepKey(project, workflow, stepId)
  if (inFlight.has(key)) {
    // eslint-disable-next-line no-console
    console.warn(`[source-runner] skipping overlapping run for ${key}`)
    return
  }
  inFlight.add(key)
  try {
    await runSourceInner(input)
  } finally {
    inFlight.delete(key)
  }
}

async function runSourceInner({ project, workflow, stepId, stepConfig }: RunSourceInput): Promise<void> {
  const stepDir = projectService.paths.stepDir(project, workflow, stepId)
  const stateDir = join(stepDir, 'state')
  const runsDir = join(stepDir, 'runs')
  await fs.mkdir(runsDir, { recursive: true })

  let existingRuns: string[] = []
  try { existingRuns = await fs.readdir(runsDir) } catch { /* empty */ }
  const runId = nextRunId(existingRuns)
  const runDir = join(runsDir, runId)
  await fs.mkdir(runDir, { recursive: true })

  const startedAt = new Date().toISOString()
  const meta: SourceRunMeta = {
    run_id: runId, step_id: stepId, project, workflow, started_at: startedAt, status: 'running',
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), meta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
    event: 'source_run_started', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, schedule_cron: stepConfig.schedule_cron }),
  })
  emit({ type: 'started', project, workflow, stepId, runId })

  if (!stepConfig.channel) {
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: 'No channel configured — open source settings to set up a data channel.' })
    return
  }

  const channel = stepConfig.channel

  const { dir: cardOutputDir, autoForwarded, forwardedToStepId } = await resolveCardOutputDir(project, workflow, stepId)
  await fs.mkdir(cardOutputDir, { recursive: true })
  const now = new Date().toISOString()

  // ── HTTP GET: one fetch → one card (full response text as card.data.body) ──
  if (channel.type === 'http_get') {
    const credential = await credentialService.get(channel.credential_id)
    if (!credential) {
      await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `Credential not found: ${channel.credential_id}` })
      return
    }
    const counters = await readCounters(stateDir)
    const lastRunAt = counters.last_run_at ?? ''
    let rawBody: string
    try {
      const { fetchHttp } = await import('./http-channel')
      rawBody = await fetchHttp(credential as HttpCredential, channel, { last_run_at: lastRunAt })
    } catch (err) {
      const error = `Channel fetch failed: ${err instanceof Error ? err.message : String(err)}`
      let httpError: HttpErrorDetail | undefined
      if (err && typeof err === 'object' && 'detail' in err) {
        const d = (err as { detail: unknown }).detail
        if (d && typeof d === 'object' && 'url' in d && 'status' in d) {
          httpError = d as HttpErrorDetail
        }
      }
      await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error, httpError })
      return
    }

    await fs.writeFile(join(runDir, 'output.txt'), rawBody, 'utf-8')

    let cardData: object = { body: rawBody }
    if (stepConfig.prompt) {
      try {
        const projectMeta = await projectService.getProject(project)
        const permissions = projectService.getPermissions(projectMeta)
        const aiResult = await runAIStep({ runDir, prompt: stepConfig.prompt, prefetchedData: rawBody, permissions })
        cardData = typeof aiResult.output === 'object' ? aiResult.output : { ai_output: aiResult.output }
      } catch (err) {
        await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `AI step failed: ${err instanceof Error ? err.message : String(err)}` })
        return
      }
    }

    const cardId = await nextCardId(project, workflow, autoForwarded && forwardedToStepId ? forwardedToStepId : stepId, 1)
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
      event: 'source_item_new', actor: 'system',
      details_json: JSON.stringify({ card_id: cardId, run_id: runId }),
    })
    const cardHistory: CardHistoryEntry[] = [{ at: now, step: stepId, event: 'created', by: 'system' }]
    if (autoForwarded && forwardedToStepId) {
      cardHistory.push({ at: now, step: forwardedToStepId, event: 'marked_ready', by: 'system' })
    }
    const card: Card = {
      id: cardId, created_at: now, created_by: 'source', source_step: stepId,
      data: cardData as Record<string, unknown>,
      history: cardHistory,
    }
    await fsService.writeJsonAtomic(join(cardOutputDir, `${cardId}.json`), card)

    const endedAt = new Date().toISOString()
    const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)
    await fsService.writeJsonAtomic(join(stateDir, 'counters.json'), {
      ...counters,
      runs_total: counters.runs_total + 1,
      items_found: counters.items_found + 1,
      items_new: counters.items_new + 1,
      last_run_at: endedAt,
    })
    await fsService.writeJsonAtomic(join(runDir, 'meta.json'), {
      ...meta, ended_at: endedAt, elapsed_ms: elapsedMs, status: 'completed',
      items_found: 1, items_new: 1,
    })
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
      event: 'source_run_completed', actor: 'system',
      details_json: JSON.stringify({ run_id: runId, items_found: 1, items_new: 1, duration_ms: elapsedMs }),
    })
    emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: 1, itemsNew: 1 })
    return
  }

  // ── IMAP: one card per email, deduplicated via seen-ids.json ──────────────
  if (channel.type === 'imap') {
    const credential = await credentialService.get(channel.credential_id)
    if (!credential) {
      await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `Credential not found: ${channel.credential_id}` })
      return
    }
    const seenEntries = await readSeenIds(stateDir)
    const seenSet = new Set(seenEntries.map((e) => e.id))
    const isFirstRun = seenEntries.length === 0

    let items: Record<string, unknown>[]
    try {
      const { fetchEmails } = await import('./imap-channel')
      items = (await fetchEmails(credential as ImapCredential, channel)) as unknown as Record<string, unknown>[]
    } catch (err) {
      const error = `Channel fetch failed: ${err instanceof Error ? err.message : String(err)}`
      await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error })
      return
    }

    await fs.writeFile(join(runDir, 'output.json'), JSON.stringify(items, null, 2), 'utf-8')

    const dedup = stepConfig.dedup ?? { key: 'message_id', max_memory: 10000, first_run: 'skip_existing' as const }
    const dedupKey = dedup.key
    const firstRunPolicy = dedup.first_run
    const maxMemory = dedup.max_memory ?? 10000

    const newItems: Record<string, unknown>[] = []
    const allIds: string[] = []

    for (const item of items) {
      const itemId = String(item[dedupKey] ?? '')
      if (!itemId) continue
      allIds.push(itemId)
      if (!seenSet.has(itemId)) newItems.push(item)
    }

    let cardsToCreate: Record<string, unknown>[]
    if (isFirstRun) {
      if (firstRunPolicy === 'skip_existing') {
        cardsToCreate = []
      } else if (firstRunPolicy === 'process_last_n') {
        cardsToCreate = newItems.slice(-(dedup.first_run_n ?? 10))
      } else {
        cardsToCreate = newItems
      }
    } else {
      cardsToCreate = newItems
    }

    for (let i = 0; i < cardsToCreate.length; i++) {
      const item = cardsToCreate[i]
      const itemId = String(item[dedupKey] ?? '')
      const cardId = await nextCardId(project, workflow, autoForwarded && forwardedToStepId ? forwardedToStepId : stepId, i + 1)

      let cardData: object = item
      if (stepConfig.prompt) {
        try {
          const projectMeta = await projectService.getProject(project)
          const permissions = projectService.getPermissions(projectMeta)
          const aiResult = await runAIStep({ runDir, prompt: stepConfig.prompt, prefetchedData: JSON.stringify(item, null, 2), permissions })
          cardData = typeof aiResult.output === 'object' ? aiResult.output : { ai_output: aiResult.output }
        } catch (err) {
          await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `AI step failed for item ${itemId}: ${err instanceof Error ? err.message : String(err)}` })
          return
        }
      }

      auditDb.insert({
        project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
        event: 'source_item_new', actor: 'system',
        details_json: JSON.stringify({ item_id: itemId, card_id: cardId, run_id: runId }),
      })
      const cardHistory: CardHistoryEntry[] = [{ at: now, step: stepId, event: 'created', by: 'system' }]
      if (autoForwarded && forwardedToStepId) {
        cardHistory.push({ at: now, step: forwardedToStepId, event: 'marked_ready', by: 'system' })
      }
      const card: Card = {
        id: cardId, created_at: now, created_by: 'source', source_step: stepId,
        data: cardData as Record<string, unknown>,
        history: cardHistory,
      }
      await fsService.writeJsonAtomic(join(cardOutputDir, `${cardId}.json`), card)
    }

    const nextSeen: SeenIdsEntry[] = [
      ...seenEntries.filter((e) => !allIds.includes(e.id)),
      ...allIds.map((id) => ({ id, seen_at: now })),
    ]
    await writeSeenIdsAtomic(stateDir, pruneSeenIds(nextSeen, maxMemory))

    const endedAt = new Date().toISOString()
    const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)
    const counters = await readCounters(stateDir)
    await fsService.writeJsonAtomic(join(stateDir, 'counters.json'), {
      runs_total: counters.runs_total + 1,
      items_found: counters.items_found + items.length,
      items_new: counters.items_new + cardsToCreate.length,
      last_run_at: endedAt,
    })
    if (cardsToCreate.length === 0) {
      await fs.rm(runDir, { recursive: true, force: true })
      emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: items.length, itemsNew: 0 })
      return
    }
    await fsService.writeJsonAtomic(join(runDir, 'meta.json'), {
      ...meta, ended_at: endedAt, elapsed_ms: elapsedMs, status: 'completed',
      items_found: items.length, items_new: cardsToCreate.length,
    })
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
      event: 'source_run_completed', actor: 'system',
      details_json: JSON.stringify({ run_id: runId, items_found: items.length, items_new: cardsToCreate.length, duration_ms: elapsedMs }),
    })
    emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: items.length, itemsNew: cardsToCreate.length })
    return
  }

  // ── File watch: one card per new file, deduplicated via file_path ─────────
  if (channel.type === 'file_watch') {
    const seenEntries = await readSeenIds(stateDir)
    const seenSet = new Set(seenEntries.map((e) => e.id))

    let items: Record<string, unknown>[]
    try {
      const { scanFiles } = await import('./file-source-channel')
      items = (await scanFiles(channel as FileWatchChannel)) as unknown as Record<string, unknown>[]
    } catch (err) {
      const error = `Directory scan failed: ${err instanceof Error ? err.message : String(err)}`
      await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error })
      return
    }

    await fs.writeFile(join(runDir, 'output.json'), JSON.stringify(items.map((i) => ({ file_path: i.file_path, filename: i.filename, size_bytes: i.size_bytes })), null, 2), 'utf-8')

    // file_path is always the dedup key for file_watch — not configurable.
    // Every unseen file path is processed regardless of first-run policy.
    const maxMemory = stepConfig.dedup?.max_memory ?? 10000

    const newItems: Record<string, unknown>[] = []
    const allIds: string[] = []

    for (const item of items) {
      const itemId = String(item['file_path'] ?? '')
      if (!itemId) continue
      allIds.push(itemId)
      if (!seenSet.has(itemId)) newItems.push(item)
    }

    const cardsToCreate = newItems

    for (let i = 0; i < cardsToCreate.length; i++) {
      const item = cardsToCreate[i]
      const itemId = String(item['file_path'] ?? '')
      const cardId = await nextCardId(project, workflow, autoForwarded && forwardedToStepId ? forwardedToStepId : stepId, i + 1)

      let cardData: object = item
      if (stepConfig.prompt) {
        try {
          const projectMeta = await projectService.getProject(project)
          const permissions = projectService.getPermissions(projectMeta)
          const aiResult = await runAIStep({ runDir, prompt: stepConfig.prompt, prefetchedData: String(item.content ?? ''), permissions })
          cardData = typeof aiResult.output === 'object' ? aiResult.output : { ai_output: aiResult.output }
        } catch (err) {
          await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `AI step failed for file ${itemId}: ${err instanceof Error ? err.message : String(err)}` })
          return
        }
      }

      auditDb.insert({
        project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
        event: 'source_item_new', actor: 'system',
        details_json: JSON.stringify({ item_id: itemId, card_id: cardId, run_id: runId }),
      })
      const cardHistory: CardHistoryEntry[] = [{ at: now, step: stepId, event: 'created', by: 'system' }]
      if (autoForwarded && forwardedToStepId) {
        cardHistory.push({ at: now, step: forwardedToStepId, event: 'marked_ready', by: 'system' })
      }
      const card: Card = {
        id: cardId, created_at: now, created_by: 'source', source_step: stepId,
        data: cardData as Record<string, unknown>,
        history: cardHistory,
      }
      await fsService.writeJsonAtomic(join(cardOutputDir, `${cardId}.json`), card)
    }

    const nextSeen: SeenIdsEntry[] = [
      ...seenEntries.filter((e) => !allIds.includes(e.id)),
      ...allIds.map((id) => ({ id, seen_at: now })),
    ]
    await writeSeenIdsAtomic(stateDir, pruneSeenIds(nextSeen, maxMemory))

    const endedAt = new Date().toISOString()
    const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)
    const counters = await readCounters(stateDir)
    await fsService.writeJsonAtomic(join(stateDir, 'counters.json'), {
      runs_total: counters.runs_total + 1,
      items_found: counters.items_found + items.length,
      items_new: counters.items_new + cardsToCreate.length,
      last_run_at: endedAt,
    })
    if (cardsToCreate.length === 0) {
      await fs.rm(runDir, { recursive: true, force: true })
      emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: items.length, itemsNew: 0 })
      return
    }
    await fsService.writeJsonAtomic(join(runDir, 'meta.json'), {
      ...meta, ended_at: endedAt, elapsed_ms: elapsedMs, status: 'completed',
      items_found: items.length, items_new: cardsToCreate.length,
    })
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
      event: 'source_run_completed', actor: 'system',
      details_json: JSON.stringify({ run_id: runId, items_found: items.length, items_new: cardsToCreate.length, duration_ms: elapsedMs }),
    })
    emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: items.length, itemsNew: cardsToCreate.length })
    return
  }

  await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: `Unknown channel type: ${(channel as { type: string }).type}` })
}

interface FailRunInput {
  project: string
  workflow: string
  stepId: string
  runId: string
  stateDir: string
  runDir: string
  startedAt: string
  meta: SourceRunMeta
  error: string
  httpError?: HttpErrorDetail
}

async function failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error, httpError }: FailRunInput): Promise<void> {
  const endedAt = new Date().toISOString()
  const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)

  const counters = await readCounters(stateDir)
  await fsService.writeJsonAtomic(join(stateDir, 'counters.json'), {
    ...counters,
    runs_total: counters.runs_total + 1,
    last_run_at: endedAt,
  })

  const failMeta: SourceRunMeta = {
    ...meta, ended_at: endedAt, elapsed_ms: elapsedMs, status: 'failed', error,
    ...(httpError ? { http_error: httpError } : {}),
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), failMeta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
    event: 'source_run_failed', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, error, duration_ms: elapsedMs }),
  })
  void outputLog.append('source', `Run failed: ${error}`, 'error')
  emit({ type: 'failed', project, workflow, stepId, runId, error })
  notificationService.notifySourceRunFailed({ projectName: project, workflowName: workflow, error })
}

// ── State query ───────────────────────────────────────────────────────────────

async function getState(project: string, workflow: string, stepId: string): Promise<SourceState> {
  const stepDir = projectService.paths.stepDir(project, workflow, stepId)
  const stateDir = join(stepDir, 'state')

  const counters = await readCounters(stateDir)
  const seen = await readSeenIds(stateDir)

  let stepConfig: Partial<SourceStepConfig> = {}
  try {
    stepConfig = await fsService.readJson<SourceStepConfig>(join(stepDir, 'step.json'))
  } catch { /* ignore */ }

  const paused = stepConfig.paused ?? false
  const key = stepKey(project, workflow, stepId)
  const running = inFlight.has(key)

  return {
    counters,
    seenCount: seen.length,
    paused,
    nextRunAt: null, // scheduler fills this in via sourceScheduler.getNextRunAt
    running,
  }
}

// ── Run listing ───────────────────────────────────────────────────────────────

async function listRuns(project: string, workflow: string, stepId: string): Promise<SourceRunMeta[]> {
  const runsDir = join(projectService.paths.stepDir(project, workflow, stepId), 'runs')
  if (!(await pathExists(runsDir))) return []
  const entries = await fs.readdir(runsDir, { withFileTypes: true })
  const out: SourceRunMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const metaPath = join(runsDir, e.name, 'meta.json')
    if (!(await pathExists(metaPath))) continue
    try { out.push(await fsService.readJson<SourceRunMeta>(metaPath)) } catch { /* skip */ }
  }
  out.sort((a, b) => b.started_at.localeCompare(a.started_at))
  return out
}

// ── Crash recovery ────────────────────────────────────────────────────────────

async function recoverOrphanedRuns(): Promise<{ recovered: number }> {
  let recovered = 0
  if (!(await pathExists(Paths.projects))) return { recovered: 0 }
  const projects = await fs.readdir(Paths.projects, { withFileTypes: true })
  for (const p of projects) {
    if (!p.isDirectory()) continue
    const wfRoot = join(Paths.projects, p.name, 'workflows')
    if (!(await pathExists(wfRoot))) continue
    const wfs = await fs.readdir(wfRoot, { withFileTypes: true })
    for (const w of wfs) {
      if (!w.isDirectory()) continue
      const stepsRoot = join(wfRoot, w.name, 'steps')
      if (!(await pathExists(stepsRoot))) continue
      const steps = await fs.readdir(stepsRoot, { withFileTypes: true })
      for (const s of steps) {
        if (!s.isDirectory()) continue
        const stateDir = join(stepsRoot, s.name, 'state')
        // Discard any leftover .tmp from a crashed seen-ids write
        const tmp = join(stateDir, 'seen-ids.json.tmp')
        if (await pathExists(tmp)) {
          await fs.unlink(tmp)
          recovered++
        }
        // Mark any in-flight source runs as failed
        const runsDir = join(stepsRoot, s.name, 'runs')
        if (!(await pathExists(runsDir))) continue
        const runs = await fs.readdir(runsDir, { withFileTypes: true })
        for (const r of runs) {
          if (!r.isDirectory()) continue
          const metaPath = join(runsDir, r.name, 'meta.json')
          if (!(await pathExists(metaPath))) continue
          let meta: SourceRunMeta
          try { meta = await fsService.readJson<SourceRunMeta>(metaPath) } catch { continue }
          if (meta.status !== 'running') continue
          const ended = new Date().toISOString()
          await fsService.writeJsonAtomic(metaPath, {
            ...meta, status: 'failed', ended_at: ended, error: 'Process interrupted before completion',
          })
          auditDb.insert({
            project_id: p.name, workflow_id: w.name, step_id: s.name, card_id: '',
            event: 'source_run_failed', actor: 'system',
            details_json: JSON.stringify({ run_id: meta.run_id, reason: 'interrupted' }),
          })
          recovered++
        }
      }
    }
  }
  return { recovered }
}

async function resetDedup(project: string, workflow: string, stepId: string): Promise<void> {
  const stateDir = join(projectService.paths.stepDir(project, workflow, stepId), 'state')
  const seenPath = join(stateDir, 'seen-ids.json')
  const tmpPath = join(stateDir, 'seen-ids.json.tmp')
  // Remove .tmp first in case a previous crash left one
  try { await fs.unlink(tmpPath) } catch { /* ignore */ }
  await fs.writeFile(seenPath, '[]', 'utf-8')
}

export const sourceRunner = {
  runSource,
  getState,
  listRuns,
  recoverOrphanedRuns,
  resetDedup,
  isRunning: (project: string, workflow: string, stepId: string) => inFlight.has(stepKey(project, workflow, stepId)),
  activeRunCount: (project: string): number => {
    const prefix = project + '/'
    let count = 0
    for (const k of inFlight) {
      if (k.startsWith(prefix)) count++
    }
    return count
  },
}
