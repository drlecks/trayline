// Source step execution engine.
//
// Runs the AI adapter against source.md, parses the JSON array output,
// deduplicates against seen-ids.json, and creates cards in cards/ready/.
//
// Atomic protocol:
//   1. Read seen-ids.json (or empty on first run).
//   2. Spawn AI adapter with source.md as the instruction file (no card input).
//   3. Parse stdout as JSON array.  On parse failure: audit + return early.
//   4. Dedup loop: for each item, skip if id already in seen set.
//   5. Write audit entry for each new item BEFORE creating the card file.
//   6. Create card files in cards/ready/.
//   7. Atomic seen-ids write: write .tmp → rename.
//   8. Update state/counters.json.

import { join } from 'path'
import fs from 'fs/promises'
import { BrowserWindow } from 'electron'
import { fsService, Paths } from './fs-service'
import { projectService } from './project-service'
import { auditDb } from './audit-db'
import { adapterRegistry } from '../ai-terminals/registry'
import { mcpRegistry } from './mcp-registry'
import { mcpCredentials } from './mcp-credentials'
import { IPC } from '../../shared/ipc-channels'
import type { SourceStepConfig, SourceCounters, SeenIdsEntry, SourceRunMeta, SourceState, SourceRunEvent } from '../../shared/types'
import type { MCPDefinition } from '../ai-terminals/adapter'
import type { Card } from '../../shared/card'

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

// ── MCP pre-flight ────────────────────────────────────────────────────────────

async function resolveMcps(
  project: string, workflow: string, stepId: string, runId: string,
  mcpIds: string[],
): Promise<MCPDefinition[]> {
  const defs: MCPDefinition[] = []
  for (const id of mcpIds) {
    const manifest = await mcpRegistry.readManifest(id)
    if (!manifest) {
      auditDb.insert({
        project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
        event: 'run_aborted_mcp_not_ready', actor: 'system',
        details_json: JSON.stringify({ run_id: runId, mcp_id: id, reason: 'not_installed' }),
      })
      throw new Error(`MCP "${id}" is not installed. Set it up in the MCPs screen before running.`)
    }
    const status = await mcpRegistry.readStatus(id)
    if (status.disabled) {
      auditDb.insert({
        project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
        event: 'run_aborted_mcp_not_ready', actor: 'system',
        details_json: JSON.stringify({ run_id: runId, mcp_id: id, reason: 'disabled' }),
      })
      throw new Error(`MCP "${manifest.name}" is disabled. Enable it in the MCPs screen before running.`)
    }
    if (!status.configured && manifest.credentials_schema.length > 0) {
      auditDb.insert({
        project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
        event: 'run_aborted_mcp_not_ready', actor: 'system',
        details_json: JSON.stringify({ run_id: runId, mcp_id: id, reason: 'not_configured' }),
      })
      throw new Error(`MCP "${manifest.name}" needs credentials. Configure it in the MCPs screen before running.`)
    }
    const credentials: Record<string, string> = {}
    for (const cred of manifest.credentials_schema) {
      const val = await mcpCredentials.readCredential(id, cred.id)
      if (val) credentials[cred.id] = val
    }
    defs.push({ id, manifest: manifest as unknown as Record<string, unknown>, credentials })
  }
  return defs
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

  // Allocate run id
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

  // Read existing seen ids
  const seenEntries = await readSeenIds(stateDir)
  const seenSet = new Set(seenEntries.map((e) => e.id))
  const isFirstRun = seenEntries.length === 0

  // Spawn adapter
  const adapterId = stepConfig.execution.adapter ?? 'claude-code'
  const adapter = adapterRegistry.get(adapterId)
  if (!adapter) {
    const err = `Adapter not found: ${adapterId}`
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: err })
    return
  }

  const instructionFile = join(stepDir, 'source.md')
  if (!(await pathExists(instructionFile))) {
    const err = 'source.md not found — write instructions before running'
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: err })
    return
  }

  const timeoutMs = (stepConfig.execution.timeout_seconds ?? 60) * 1000

  // Pre-flight: reject if the adapter cannot use MCPs and this source has MCPs configured.
  const sourceMcpIds = stepConfig.mcps ?? []
  if (adapter.supportsMcps === false && sourceMcpIds.length > 0) {
    const err = `${adapter.displayName} does not support MCP tools. Remove the MCPs from this source step, or switch to Claude Code in Settings.`
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: err })
    return
  }

  let rawOutput = ''
  let runError: string | undefined

  try {
    const mcpIds = sourceMcpIds
    const mcpDefs = mcpIds.length > 0
      ? await resolveMcps(project, workflow, stepId, runId, mcpIds)
      : []

    const session = await adapter.spawn({
      processFile: instructionFile,
      cardData: {},
      skills: [],
      contextPacks: [],
      mcps: mcpDefs,
      workingDir: runDir,
      timeout: timeoutMs,
    })

    // Collect full stdout
    void (async () => {
      try {
        for await (const chunk of session.stderr) {
          void chunk // discard stderr for source runs
        }
      } catch { /* ignore */ }
    })()

    for await (const chunk of session.stdout) {
      rawOutput += chunk
    }

    const result = await session.result()
    if (result.exitCode !== 0 && !rawOutput.trim()) {
      runError = `Adapter exited with code ${result.exitCode}`
    }

    try { await adapter.clearContext() } catch { /* non-fatal */ }
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
  }

  if (runError !== undefined) {
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error: runError })
    return
  }

  // Parse JSON array
  let items: Record<string, unknown>[]
  try {
    // Try to extract a JSON array from the output (may be wrapped in markdown code fences)
    const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/) ?? rawOutput.match(/(\[[\s\S]*\])/)
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawOutput.trim()
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) throw new Error('Output is not a JSON array')
    items = parsed as Record<string, unknown>[]
  } catch (err) {
    const error = `Failed to parse AI output as JSON array: ${err instanceof Error ? err.message : String(err)}`
    await failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error })
    return
  }

  // Save raw output for inspection
  await fs.writeFile(join(runDir, 'output.json'), JSON.stringify(items, null, 2), 'utf-8')

  // Dedup
  const dedupKey = stepConfig.dedup.key
  const firstRunPolicy = stepConfig.dedup.first_run
  const maxMemory = stepConfig.dedup.max_memory ?? 10000

  const newItems: Record<string, unknown>[] = []
  const allIds: string[] = []

  for (const item of items) {
    const itemId = String(item[dedupKey] ?? '')
    if (!itemId) continue
    allIds.push(itemId)
    if (!seenSet.has(itemId)) {
      newItems.push(item)
    }
  }

  // Apply first_run policy
  let cardsToCreate: Record<string, unknown>[]
  if (isFirstRun) {
    if (firstRunPolicy === 'skip_existing') {
      cardsToCreate = []
    } else if (firstRunPolicy === 'process_last_n') {
      const n = stepConfig.dedup.first_run_n ?? 10
      cardsToCreate = newItems.slice(-n)
    } else {
      // process_all
      cardsToCreate = newItems
    }
  } else {
    cardsToCreate = newItems
  }

  // Create cards
  const readyDir = join(stepDir, 'cards', 'ready')
  await fs.mkdir(readyDir, { recursive: true })
  const now = new Date().toISOString()

  for (let i = 0; i < cardsToCreate.length; i++) {
    const item = cardsToCreate[i]
    const itemId = String(item[dedupKey] ?? '')
    const cardId = await nextCardId(project, workflow, stepId, i + 1)

    // Audit BEFORE writing card (replayable)
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
      event: 'source_item_new', actor: 'system',
      details_json: JSON.stringify({ item_id: itemId, card_id: cardId, run_id: runId }),
    })

    const card: Card = {
      id: cardId,
      created_at: now,
      created_by: 'source',
      source_step: stepId,
      data: item,
      history: [{ at: now, step: stepId, event: 'created', by: 'system' }],
    }
    await fsService.writeJsonAtomic(join(readyDir, `${cardId}.json`), card)
  }

  // Update seen ids — add all item ids (not just new ones) to seen set
  const nextSeen: SeenIdsEntry[] = [
    ...seenEntries.filter((e) => !allIds.includes(e.id)),
    ...allIds.map((id) => ({ id, seen_at: now })),
  ]
  const pruned = pruneSeenIds(nextSeen, maxMemory)
  await writeSeenIdsAtomic(stateDir, pruned)

  // Update counters
  const endedAt = new Date().toISOString()
  const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)
  const counters = await readCounters(stateDir)
  const nextCounters: SourceCounters = {
    runs_total: counters.runs_total + 1,
    items_found: counters.items_found + items.length,
    items_new: counters.items_new + cardsToCreate.length,
    last_run_at: endedAt,
  }
  await fsService.writeJsonAtomic(join(stateDir, 'counters.json'), nextCounters)

  // Update run meta
  const finalMeta: SourceRunMeta = {
    ...meta, ended_at: endedAt, elapsed_ms: elapsedMs, status: 'completed',
    items_found: items.length, items_new: cardsToCreate.length,
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), finalMeta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
    event: 'source_run_completed', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, items_found: items.length, items_new: cardsToCreate.length, duration_ms: elapsedMs }),
  })
  emit({ type: 'completed', project, workflow, stepId, runId, itemsFound: items.length, itemsNew: cardsToCreate.length })
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
}

async function failRun({ project, workflow, stepId, runId, stateDir, runDir, startedAt, meta, error }: FailRunInput): Promise<void> {
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
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), failMeta)

  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: '',
    event: 'source_run_failed', actor: 'system',
    details_json: JSON.stringify({ run_id: runId, error, duration_ms: elapsedMs }),
  })
  emit({ type: 'failed', project, workflow, stepId, runId, error })
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

export const sourceRunner = {
  runSource,
  getState,
  listRuns,
  recoverOrphanedRuns,
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
