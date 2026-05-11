// Worker execution engine.
//
// Atomic card movement protocol (see docs/data-model.md):
//   1. Read source card from prev step's ready/. Do not move it yet.
//   2. Allocate runs/<run_id>/, write input.json + meta.json (status=running).
//   3. Spawn the adapter session; the adapter writes terminal.log on its own.
//   4. On success: write output.json.tmp → rename to output.json.
//   5. Write run_completed to audit log BEFORE moving any files.
//   6. Atomic move: source card → archived/, new card → next step's pending/ or ready/.
//   7. Update worker counters and meta.json (status=succeeded, ended_at).
//   8. On failure: write run_failed audit entry, move source to 99-errors/.

import { join } from 'path'
import fs from 'fs/promises'
import { spawn as childSpawn } from 'child_process'
import { shell, type BrowserWindow } from 'electron'
import { fsService, Paths } from './fs-service'
import { projectService } from './project-service'
import { auditDb } from './audit-db'
import { adapterRegistry } from '../ai-terminals/registry'
import { IPC } from '../../shared/ipc-channels'
import type { AISession } from '../ai-terminals/adapter'
import type { Card, CardHistoryEntry } from '../../shared/card'
import type { WorkerRunEvent, WorkerRunMeta, WorkerRunStatus } from '../../shared/worker-run'

// ── Broadcast plumbing ────────────────────────────────────────────────────────

let broadcastTarget: () => BrowserWindow[] = () => []

export function setRunEventBroadcast(getWindows: () => BrowserWindow[]) {
  broadcastTarget = getWindows
}

function emit(event: WorkerRunEvent) {
  for (const win of broadcastTarget()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.worker.onRunEvent, event)
  }
}

// ── Workflow / step helpers ───────────────────────────────────────────────────

interface WorkflowJson {
  id: string
  name: string
  display_name: string
  step_ids: string[]
}

interface WorkerStepJson {
  id: string
  kind: 'worker'
  name: string
  skills?: string[]
  mcps?: string[]
  context_packs?: string[]
  execution?: {
    command?: string
    args?: string[]
    timeout_seconds?: number
    retry_attempts?: number
    adapter?: string
  }
  trigger?: { mode?: 'on_ready' | 'scheduled' | 'manual'; schedule_cron?: string | null }
  on_success?: 'advance'
  on_failure?: 'send_to_errors'
}

interface TrayStepJson {
  id: string
  kind: 'tray'
  approval_mode: 'manual' | 'auto'
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readWorkflow(project: string, workflow: string): Promise<WorkflowJson> {
  return fsService.readJson<WorkflowJson>(
    join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
  )
}

async function readStepJson<T>(project: string, workflow: string, stepId: string): Promise<T> {
  return fsService.readJson<T>(
    join(projectService.paths.stepDir(project, workflow, stepId), 'step.json'),
  )
}

/** Find the step id immediately preceding this worker. Returns null at the head of the workflow. */
function findPrevStep(wf: WorkflowJson, workerId: string): string | null {
  const idx = wf.step_ids.indexOf(workerId)
  if (idx <= 0) return null
  return wf.step_ids[idx - 1]
}

/** Find the step id immediately following this worker. Defaults to 99-errors if absent. */
function findNextStep(wf: WorkflowJson, workerId: string): string | null {
  const idx = wf.step_ids.indexOf(workerId)
  if (idx === -1 || idx >= wf.step_ids.length - 1) return null
  return wf.step_ids[idx + 1]
}

// ── Skill / context-pack resolution ───────────────────────────────────────────

async function resolveSkill(skillId: string): Promise<{ id: string; content: string } | null> {
  const candidates = [
    join(Paths.skills, skillId, 'skill.md'),
    join(Paths.systemSkills, skillId, 'skill.md'),
  ]
  for (const p of candidates) {
    if (await pathExists(p)) {
      return { id: skillId, content: await fs.readFile(p, 'utf-8') }
    }
  }
  return null
}

async function resolveContextPack(project: string, file: string): Promise<string | null> {
  const path = join(projectService.paths.projectDir(project), 'context', file)
  if (!(await pathExists(path))) return null
  return fs.readFile(path, 'utf-8')
}

// ── Run id allocation ─────────────────────────────────────────────────────────

function todayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function nextRunId(workerDir: string): Promise<string> {
  const runsDir = join(workerDir, 'runs')
  if (!(await pathExists(runsDir))) {
    await fs.mkdir(runsDir, { recursive: true })
    return `run_${todayDate()}_001`
  }
  const date = todayDate()
  const entries = await fs.readdir(runsDir)
  let max = 0
  for (const e of entries) {
    const m = e.match(new RegExp(`^run_${date}_(\\d{3})$`))
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return `run_${date}_${String(max + 1).padStart(3, '0')}`
}

// ── Worker counters ───────────────────────────────────────────────────────────

interface WorkerCounters {
  runs_total: number
  successful: number
  failed: number
}

async function bumpWorkerCounters(
  project: string,
  workflow: string,
  stepId: string,
  outcome: 'success' | 'failed',
): Promise<void> {
  const path = join(projectService.paths.stepDir(project, workflow, stepId), 'state', 'counters.json')
  let current: WorkerCounters = { runs_total: 0, successful: 0, failed: 0 }
  if (await pathExists(path)) {
    try { current = await fsService.readJson<WorkerCounters>(path) } catch { /* keep defaults */ }
  }
  const next: WorkerCounters = {
    runs_total: current.runs_total + 1,
    successful: current.successful + (outcome === 'success' ? 1 : 0),
    failed: current.failed + (outcome === 'failed' ? 1 : 0),
  }
  await fsService.writeJsonAtomic(path, next)
}

// ── Card-id allocation for the produced card ──────────────────────────────────

async function nextCardIdForStep(project: string, workflow: string, stepId: string): Promise<string> {
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
        const n = parseInt(m[1], 10)
        if (n > max) max = n
      }
    }
  }
  return `card_${date}_${String(max + 1).padStart(3, '0')}`
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TriggerRunInput {
  project: string
  workflow: string
  stepId: string  // the worker
  cardId: string  // the source card (must be in prev step's ready/)
}

export interface TriggerRunResult {
  runId: string
}

const inFlight = new Set<string>()
function inFlightKey(i: TriggerRunInput): string {
  return `${i.project}/${i.workflow}/${i.stepId}/${i.cardId}`
}

// Map of runId → live AISession, used to forward interactive keystrokes from
// the renderer's xterm panel into the running PTY.
const liveSessions = new Map<string, AISession>()
function runKey(project: string, workflow: string, stepId: string, runId: string): string {
  return `${project}/${workflow}/${stepId}/${runId}`
}

async function triggerRun(input: TriggerRunInput): Promise<TriggerRunResult> {
  const key = inFlightKey(input)
  if (inFlight.has(key)) {
    throw new Error(`Run already in-flight for ${key}`)
  }
  inFlight.add(key)
  try {
    return await runInner(input)
  } finally {
    inFlight.delete(key)
  }
}

async function runInner(input: TriggerRunInput): Promise<TriggerRunResult> {
  const { project, workflow, stepId, cardId } = input

  const wf = await readWorkflow(project, workflow)
  const worker = await readStepJson<WorkerStepJson>(project, workflow, stepId)
  if (worker.kind !== 'worker') throw new Error(`Step ${stepId} is not a worker`)

  const prevStepId = findPrevStep(wf, stepId)
  if (!prevStepId) throw new Error(`Worker ${stepId} has no preceding step`)
  const sourceCardPath = join(
    projectService.paths.stepDir(project, workflow, prevStepId),
    'cards', 'ready', `${cardId}.json`,
  )
  if (!(await pathExists(sourceCardPath))) {
    throw new Error(`Source card not in ready/: ${cardId}`)
  }
  const sourceCard = await fsService.readJson<Card>(sourceCardPath)

  // 1. Allocate run + write input.json, meta.json (status=running)
  const workerDir = projectService.paths.stepDir(project, workflow, stepId)
  const runId = await nextRunId(workerDir)
  const runDir = join(workerDir, 'runs', runId)
  await fs.mkdir(runDir, { recursive: true })
  await fsService.writeJsonAtomic(join(runDir, 'input.json'), sourceCard)

  const startedAt = new Date().toISOString()
  const meta: WorkerRunMeta = {
    run_id: runId,
    worker_id: stepId,
    card_id: cardId,
    project,
    workflow,
    started_at: startedAt,
    status: 'running',
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), meta)

  // 2. Audit + emit
  auditDb.insert({
    project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
    event: 'run_started', actor: 'system',
    details_json: JSON.stringify({ run_id: runId }),
  })
  emit({ type: 'started', project, workflow, stepId, runId, cardId })

  // 3. Resolve skills + context packs
  const skills = (await Promise.all((worker.skills ?? []).map(resolveSkill))).filter((s): s is { id: string; content: string } => s !== null)
  const contextPacks = (await Promise.all(
    (worker.context_packs ?? []).map((f) => resolveContextPack(project, f)),
  )).filter((c): c is string => c !== null)

  // 4. Spawn adapter
  const adapterId = worker.execution?.adapter ?? 'claude-code'
  const adapter = adapterRegistry.get(adapterId)
  if (!adapter) throw new Error(`Adapter not found: ${adapterId}`)

  const timeoutMs = (worker.execution?.timeout_seconds ?? 180) * 1000
  const processFile = join(workerDir, 'process.md')

  let exitCode = -1
  let output: object | string | null = null
  let runError: string | undefined

  const sessionKey = runKey(project, workflow, stepId, runId)
  let session: AISession | null = null
  try {
    session = await adapter.spawn({
      processFile,
      cardData: sourceCard.data,
      skills,
      contextPacks,
      mcps: [],  // N2.5
      workingDir: runDir,
      timeout: timeoutMs,
      onAwaitingInputChange: (awaiting) => {
        emit({ type: 'awaiting_input', project, workflow, stepId, runId, awaiting })
      },
    })
    liveSessions.set(sessionKey, session)

    // Stream log chunks to renderer as they arrive
    void (async () => {
      try {
        for await (const chunk of session.stdout) {
          emit({ type: 'log', project, workflow, stepId, runId, chunk })
        }
      } catch { /* ignore */ }
    })()
    void (async () => {
      try {
        for await (const chunk of session.stderr) {
          emit({ type: 'log', project, workflow, stepId, runId, chunk })
        }
      } catch { /* ignore */ }
    })()

    const result = await session.result()
    exitCode = result.exitCode
    output = result.output
  } catch (err) {
    runError = err instanceof Error ? err.message : String(err)
  } finally {
    liveSessions.delete(sessionKey)
  }

  const endedAt = new Date().toISOString()
  const elapsedMs = Date.parse(endedAt) - Date.parse(startedAt)
  const succeeded = runError === undefined && exitCode === 0

  // 5. Persist output.json (atomic)
  if (succeeded && output !== null) {
    const tmp = join(runDir, 'output.json.tmp')
    await fs.writeFile(tmp, JSON.stringify(output, null, 2), 'utf-8')
    await fs.rename(tmp, join(runDir, 'output.json'))
  }

  // 6. Plan card movement *before* the move
  const nextStepId = findNextStep(wf, stepId)
  const failureStepId = '99-errors'

  let plannedNextCardId: string | undefined
  if (succeeded && nextStepId) {
    plannedNextCardId = await nextCardIdForStep(project, workflow, nextStepId)
  }

  // Update meta with planned move (so a crash can replay the move)
  const planMeta: WorkerRunMeta = {
    ...meta,
    ended_at: endedAt,
    elapsed_ms: elapsedMs,
    exit_code: exitCode,
    status: succeeded ? 'succeeded' : 'failed',
    error: runError,
    next_step_id: succeeded ? (nextStepId ?? undefined) : failureStepId,
    next_card_id: plannedNextCardId,
  }
  await fsService.writeJsonAtomic(join(runDir, 'meta.json'), planMeta)

  // 7. Audit log BEFORE the file move
  if (succeeded) {
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
      event: 'run_completed', actor: 'system',
      details_json: JSON.stringify({
        run_id: runId, exit_code: exitCode,
        next_step_id: nextStepId, next_card_id: plannedNextCardId,
        elapsed_ms: elapsedMs,
      }),
    })
  } else {
    auditDb.insert({
      project_id: project, workflow_id: workflow, step_id: stepId, card_id: cardId,
      event: 'run_failed', actor: 'system',
      details_json: JSON.stringify({
        run_id: runId, exit_code: exitCode, error: runError, elapsed_ms: elapsedMs,
      }),
    })
  }

  // 8. Move source card out of prev/ready and write produced card
  const sourceArchive = join(
    projectService.paths.stepDir(project, workflow, prevStepId),
    'cards', 'archived', `${cardId}.json`,
  )

  if (succeeded && nextStepId && plannedNextCardId) {
    const nextStep = await readStepJson<TrayStepJson | WorkerStepJson>(project, workflow, nextStepId)
    const isAutoTray = nextStep.kind === 'tray' && (nextStep as TrayStepJson).approval_mode === 'auto'
    // If the next step is a worker, drop the card straight into "ready" so the
    // worker's watcher fires. Otherwise honor the tray's approval_mode.
    const targetStatus = nextStep.kind === 'worker' || isAutoTray ? 'ready' : 'pending'

    const targetCardDir = join(
      projectService.paths.stepDir(project, workflow, nextStepId),
      'cards', targetStatus,
    )
    await fs.mkdir(targetCardDir, { recursive: true })

    const historyEntry: CardHistoryEntry = {
      at: endedAt, step: stepId, event: 'run_completed', by: 'worker',
    }
    const producedCard: Card = {
      id: plannedNextCardId,
      created_at: endedAt,
      created_by: 'worker',
      source_step: stepId,
      data: typeof output === 'object' && output !== null
        ? (output as Record<string, unknown>)
        : { raw: output },
      history: [...sourceCard.history, historyEntry, {
        at: endedAt, step: nextStepId, event: 'created', by: 'worker',
      }],
      worker_output: typeof output === 'object' && output !== null
        ? (output as Record<string, unknown>)
        : undefined,
    }
    await fsService.writeJsonAtomic(
      join(targetCardDir, `${plannedNextCardId}.json`),
      producedCard,
    )

    // Move source card to archived
    const updatedSource: Card = {
      ...sourceCard,
      history: [...sourceCard.history, historyEntry],
    }
    await fs.mkdir(join(projectService.paths.stepDir(project, workflow, prevStepId), 'cards', 'archived'), { recursive: true })
    await fsService.writeJsonAtomic(sourceArchive, updatedSource)
    if (await pathExists(sourceCardPath)) await fs.unlink(sourceCardPath)
  } else {
    // Failure path: move source card to 99-errors/pending
    const errStep = failureStepId
    const errDir = join(
      projectService.paths.stepDir(project, workflow, errStep),
      'cards', 'pending',
    )
    if (await pathExists(join(projectService.paths.stepDir(project, workflow, errStep), 'step.json'))) {
      await fs.mkdir(errDir, { recursive: true })
      const failedCard: Card = {
        ...sourceCard,
        history: [...sourceCard.history, {
          at: endedAt, step: stepId, event: 'run_failed', by: 'worker',
          note: runError ?? `exit ${exitCode}`,
        }],
      }
      await fsService.writeJsonAtomic(join(errDir, `${cardId}.json`), failedCard)
      if (await pathExists(sourceCardPath)) await fs.unlink(sourceCardPath)
    }
  }

  // 9. Counters + emit
  await bumpWorkerCounters(project, workflow, stepId, succeeded ? 'success' : 'failed')
  emit({
    type: 'finished', project, workflow, stepId, runId,
    status: succeeded ? 'succeeded' : 'failed',
    error: runError,
  })

  return { runId }
}

// ── Run listing / reading ─────────────────────────────────────────────────────

async function listRuns(project: string, workflow: string, stepId: string): Promise<WorkerRunMeta[]> {
  const runsDir = join(projectService.paths.stepDir(project, workflow, stepId), 'runs')
  if (!(await pathExists(runsDir))) return []
  const entries = await fs.readdir(runsDir, { withFileTypes: true })
  const out: WorkerRunMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const metaPath = join(runsDir, e.name, 'meta.json')
    if (!(await pathExists(metaPath))) continue
    try {
      out.push(await fsService.readJson<WorkerRunMeta>(metaPath))
    } catch { /* skip malformed */ }
  }
  out.sort((a, b) => b.started_at.localeCompare(a.started_at))
  return out
}

async function getRun(project: string, workflow: string, stepId: string, runId: string): Promise<WorkerRunMeta | null> {
  const path = join(projectService.paths.stepDir(project, workflow, stepId), 'runs', runId, 'meta.json')
  if (!(await pathExists(path))) return null
  try { return await fsService.readJson<WorkerRunMeta>(path) } catch { return null }
}

async function readTerminalLog(project: string, workflow: string, stepId: string, runId: string): Promise<string> {
  const path = join(projectService.paths.stepDir(project, workflow, stepId), 'runs', runId, 'terminal.log')
  if (!(await pathExists(path))) return ''
  return fs.readFile(path, 'utf-8')
}

// ── Crash recovery ────────────────────────────────────────────────────────────

/**
 * Scan every worker step in every project for orphaned runs whose meta.json
 * has status=running. Mark them as `interrupted`, append a run_failed audit
 * row, and leave the source card untouched.
 */
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
        const runsDir = join(stepsRoot, s.name, 'runs')
        if (!(await pathExists(runsDir))) continue
        const runs = await fs.readdir(runsDir, { withFileTypes: true })
        for (const r of runs) {
          if (!r.isDirectory()) continue
          const metaPath = join(runsDir, r.name, 'meta.json')
          if (!(await pathExists(metaPath))) continue
          let meta: WorkerRunMeta
          try { meta = await fsService.readJson<WorkerRunMeta>(metaPath) } catch { continue }
          if (meta.status !== 'running') continue
          const ended = new Date().toISOString()
          const next: WorkerRunMeta = {
            ...meta,
            status: 'interrupted' as WorkerRunStatus,
            ended_at: ended,
            error: 'Process interrupted before completion',
          }
          await fsService.writeJsonAtomic(metaPath, next)
          auditDb.insert({
            project_id: p.name, workflow_id: w.name, step_id: s.name, card_id: meta.card_id,
            event: 'run_failed', actor: 'system',
            details_json: JSON.stringify({ run_id: meta.run_id, reason: 'interrupted' }),
          })
          recovered++
        }
      }
    }
  }
  return { recovered }
}

// ── Interactive input + external terminal ────────────────────────────────────

async function sendInput(
  project: string, workflow: string, stepId: string, runId: string, text: string,
): Promise<{ ok: boolean }> {
  const session = liveSessions.get(runKey(project, workflow, stepId, runId))
  if (!session) return { ok: false }
  await session.sendInput(text)
  return { ok: true }
}

/**
 * Launch the OS terminal in the run directory. The user can then poke around
 * the artifacts (`prompt.txt`, `output.json`, `terminal.log`) or re-run a
 * command by hand. We never re-attach to the live PTY — that would need
 * cross-process PTY handoff which is out of scope.
 */
async function openExternalTerminal(
  project: string, workflow: string, stepId: string, runId: string,
): Promise<{ ok: boolean; message?: string }> {
  const dir = join(projectService.paths.stepDir(project, workflow, stepId), 'runs', runId)
  if (!(await pathExists(dir))) {
    return { ok: false, message: `Run directory not found: ${dir}` }
  }
  try {
    if (process.platform === 'win32') {
      // `start` is a cmd builtin, so spawn through cmd and let it pick the
      // user's default console (Windows Terminal if installed, else conhost).
      childSpawn('cmd.exe', ['/c', 'start', '""', '/D', dir, 'cmd.exe'], {
        detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
      }).unref()
    } else if (process.platform === 'darwin') {
      childSpawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref()
    } else {
      // Best-effort on Linux — try x-terminal-emulator, fall back to revealing.
      const child = childSpawn('x-terminal-emulator', ['--working-directory', dir], {
        detached: true, stdio: 'ignore',
      })
      child.on('error', () => { void shell.openPath(dir) })
      child.unref()
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}

export const workerRunner = {
  triggerRun,
  listRuns,
  getRun,
  readTerminalLog,
  recoverOrphanedRuns,
  sendInput,
  openExternalTerminal,
}

