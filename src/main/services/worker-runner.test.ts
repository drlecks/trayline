import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import {
  setMockScript, getMockClearContextCalls, resetMockClearContextCalls,
  setPermissionPromptChunks, getSendInputCalls, resetPermissionState,
} from '../ai-terminals/mock'
import { workerRunner } from './worker-runner'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function buildWorkflow(opts: { name: string; trayId: string; workerId: string; nextTrayId: string }) {
  const wfDir = join(Paths.projects, opts.name, 'workflows', 'wf')
  const stepsDir = join(wfDir, 'steps')

  await fs.mkdir(join(Paths.projects, opts.name), { recursive: true })
  await writeJson(join(Paths.projects, opts.name, 'project.json'), {
    id: opts.name, name: opts.name, display_name: opts.name, description: '', created_at: new Date().toISOString(),
  })
  await writeJson(join(wfDir, 'workflow.json'), {
    id: 'wf', name: 'wf', display_name: 'wf',
    step_ids: [opts.trayId, opts.workerId, opts.nextTrayId, '99-errors'],
  })

  // Source tray
  for (const sub of ['pending', 'ready', 'archived']) {
    await fs.mkdir(join(stepsDir, opts.trayId, 'cards', sub), { recursive: true })
  }
  await writeJson(join(stepsDir, opts.trayId, 'step.json'), {
    id: opts.trayId, kind: 'tray', name: 'Source', approval_mode: 'manual',
    input_schema: { fields: [] }, allow_manual_create: true,
  })

  // Worker
  await fs.mkdir(join(stepsDir, opts.workerId, 'runs'), { recursive: true })
  await fs.mkdir(join(stepsDir, opts.workerId, 'state'), { recursive: true })
  await writeJson(join(stepsDir, opts.workerId, 'step.json'), {
    id: opts.workerId, kind: 'worker', name: 'Worker',
    context_packs: [],
    execution: { adapter: 'mock', timeout_seconds: 5, retry_attempts: 0 },
    trigger: { mode: 'on_ready' },
    on_success: 'advance', on_failure: 'send_to_errors',
  })
  await fs.writeFile(join(stepsDir, opts.workerId, 'process.md'), '# Test\n', 'utf-8')

  // Next tray
  for (const sub of ['pending', 'ready', 'archived']) {
    await fs.mkdir(join(stepsDir, opts.nextTrayId, 'cards', sub), { recursive: true })
  }
  await writeJson(join(stepsDir, opts.nextTrayId, 'step.json'), {
    id: opts.nextTrayId, kind: 'tray', name: 'Next', approval_mode: 'manual',
    input_schema: { fields: [] }, allow_manual_create: true,
  })

  // 99-errors
  for (const sub of ['pending', 'ready', 'archived']) {
    await fs.mkdir(join(stepsDir, '99-errors', 'cards', sub), { recursive: true })
  }
  await writeJson(join(stepsDir, '99-errors', 'step.json'), {
    id: '99-errors', kind: 'tray', name: 'Errors', approval_mode: 'manual',
    input_schema: { fields: [] }, allow_manual_create: false,
  })

  return { wfDir, stepsDir }
}

async function seedReadyCard(stepsDir: string, trayId: string, cardId: string) {
  const path = join(stepsDir, trayId, 'cards', 'ready', `${cardId}.json`)
  await writeJson(path, {
    id: cardId,
    created_at: new Date().toISOString(),
    created_by: 'manual',
    source_step: trayId,
    data: { foo: 'bar' },
    history: [],
  })
  return path
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('workerRunner', () => {
  beforeAll(async () => {
    // Make sure projects root exists and audit DB is initialised.
    await fs.mkdir(Paths.projects, { recursive: true })
    await fs.mkdir(Paths.appData, { recursive: true })
    auditDb.init()
  })

  beforeEach(() => {
    setMockScript({ output: { summary: 'ok', fields: { result: 42 } }, exitCode: 0 })
  })

  it('runs a worker happily: source archived, new card in next pending, audit recorded', async () => {
    const project = `happy-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
    const sourcePath = await seedReadyCard(stepsDir, '01-src', 'card_x_001')

    const { runId } = await workerRunner.triggerRun({
      project, workflow: 'wf', stepId: '02-worker', cardId: 'card_x_001',
    })

    expect(runId).toMatch(/^run_/)
    // Source moved out of ready/, into archived/
    expect(await pathExists(sourcePath)).toBe(false)
    expect(await pathExists(join(stepsDir, '01-src', 'cards', 'archived', 'card_x_001.json'))).toBe(true)

    // Next tray got a new card
    const nextPending = await fs.readdir(join(stepsDir, '03-next', 'cards', 'pending'))
    expect(nextPending).toHaveLength(1)
    const nextCard = JSON.parse(await fs.readFile(join(stepsDir, '03-next', 'cards', 'pending', nextPending[0]), 'utf-8'))
    expect(nextCard.created_by).toBe('worker')
    expect(nextCard.data.fields.result).toBe(42)

    // Run meta + output saved
    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
    expect(meta.status).toBe('succeeded')
    expect(await pathExists(join(runDir, 'output.json'))).toBe(true)
    expect(await pathExists(join(runDir, 'output.json.tmp'))).toBe(false)

    // Counters bumped
    const counters = JSON.parse(await fs.readFile(join(stepsDir, '02-worker', 'state', 'counters.json'), 'utf-8'))
    expect(counters.runs_total).toBe(1)
    expect(counters.successful).toBe(1)

    // Audit log has run_completed
    const rows = auditDb.query({ project_id: project, event: 'run_completed' })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('routes failed runs to 99-errors', async () => {
    setMockScript({ output: 'no-good', exitCode: 1 })
    const project = `fail-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
    await seedReadyCard(stepsDir, '01-src', 'card_y_001')

    await workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_y_001' })

    expect(await pathExists(join(stepsDir, '01-src', 'cards', 'ready', 'card_y_001.json'))).toBe(false)
    const errPending = await fs.readdir(join(stepsDir, '99-errors', 'cards', 'pending'))
    expect(errPending).toContain('card_y_001.json')

    const rows = auditDb.query({ project_id: project, event: 'run_failed' })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('clears adapter context exactly once per run on success', async () => {
    resetMockClearContextCalls()
    const project = `clear-ok-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
    await seedReadyCard(stepsDir, '01-src', 'card_c_001')

    await workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_c_001' })

    expect(getMockClearContextCalls()).toBe(1)
  })

  it('clears adapter context exactly once per run on failure', async () => {
    resetMockClearContextCalls()
    setMockScript({ output: 'nope', exitCode: 1 })
    const project = `clear-fail-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
    await seedReadyCard(stepsDir, '01-src', 'card_c_002')

    await workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_c_002' })

    expect(getMockClearContextCalls()).toBe(1)
  })

  it('resolves {{context.x}} variables in process.md before passing to adapter', async () => {
    const project = `ctx-vars-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    // Write a context file
    const contextDir = join(Paths.projects, project, 'context')
    await fs.mkdir(contextDir, { recursive: true })
    await fs.writeFile(join(contextDir, '_brand-voice.md'), 'Be friendly and concise.', 'utf-8')

    // Write process.md that references the context variable
    await fs.writeFile(
      join(stepsDir, '02-worker', 'process.md'),
      '# Instructions\n\n{{context._brand-voice}}\n\nProcess: {{card.data}}',
      'utf-8',
    )

    await seedReadyCard(stepsDir, '01-src', 'card_ctx_001')
    const { runId } = await workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_ctx_001' })

    // The run dir should contain a resolved process.md with the context injected
    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const resolved = await fs.readFile(join(runDir, 'process.md'), 'utf-8')
    expect(resolved).toContain('Be friendly and concise.')
    expect(resolved).not.toContain('{{context._brand-voice}}')
    // {{card.data}} should remain in the snapshot (adapter resolves it)
    expect(resolved).toContain('{{card.data}}')
  })

  it('leaves process.md unchanged when no context variables are present', async () => {
    const project = `no-ctx-vars-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    const processMd = '# Simple\n\nProcess this card: {{card.data}}'
    await fs.writeFile(join(stepsDir, '02-worker', 'process.md'), processMd, 'utf-8')

    await seedReadyCard(stepsDir, '01-src', 'card_noctx_001')
    const { runId } = await workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_noctx_001' })

    // No resolved snapshot should exist when no substitution occurred
    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const resolvedExists = await pathExists(join(runDir, 'process.md'))
    expect(resolvedExists).toBe(false)
  })

  describe('permission auto-accept', () => {
    beforeEach(() => {
      resetPermissionState()
      setMockScript({ output: { summary: 'ok' }, exitCode: 0 })
    })

    it('auto-accepts a single permission prompt and logs the audit event', async () => {
      setPermissionPromptChunks(['Allow this tool? [y/N] '])
      const project = `perm-ok-${Date.now()}`
      const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
      await seedReadyCard(stepsDir, '01-src', 'card_p_001')

      const { runId } = await workerRunner.triggerRun({
        project, workflow: 'wf', stepId: '02-worker', cardId: 'card_p_001',
      })

      // Run succeeded (permission was auto-accepted)
      const runDir = join(stepsDir, '02-worker', 'runs', runId)
      const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
      expect(meta.status).toBe('succeeded')

      // sendInput was called with 'y\n'
      expect(getSendInputCalls()).toEqual(['y\n'])

      // Audit event logged
      const rows = auditDb.query({ project_id: project, event: 'ai_permission_auto_accepted' })
      expect(rows.length).toBe(1)
      const details = JSON.parse(rows[0].details_json)
      expect(details.retry).toBe(1)
    })

    it('fails with max_permission_retries_exceeded after 4 prompts (max 3 retries)', async () => {
      // 4 permission prompt chunks → 3 auto-accepts, 4th triggers abort
      setPermissionPromptChunks([
        'Allow? [y/N] ',
        'Allow? [y/N] ',
        'Allow? [y/N] ',
        'Allow? [y/N] ',
      ])
      const project = `perm-max-${Date.now()}`
      const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
      await seedReadyCard(stepsDir, '01-src', 'card_p_002')

      await workerRunner.triggerRun({
        project, workflow: 'wf', stepId: '02-worker', cardId: 'card_p_002',
      })

      // Run failed with max_permission_retries_exceeded
      const runs = await workerRunner.listRuns(project, 'wf', '02-worker')
      const meta = runs[0]
      expect(meta.status).toBe('failed')
      expect(meta.error).toBe('max_permission_retries_exceeded')

      // Exactly 3 sendInput calls (retries 1–3); 4th triggered abort
      expect(getSendInputCalls()).toHaveLength(3)
      expect(getSendInputCalls().every(r => r === 'y\n')).toBe(true)

      // Card moved to 99-errors
      const errPending = await fs.readdir(join(stepsDir, '99-errors', 'cards', 'pending'))
      expect(errPending).toContain('card_p_002.json')
    })

    it('does not log permission events when no prompt is present', async () => {
      const project = `perm-none-${Date.now()}`
      const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
      await seedReadyCard(stepsDir, '01-src', 'card_p_003')

      await workerRunner.triggerRun({
        project, workflow: 'wf', stepId: '02-worker', cardId: 'card_p_003',
      })

      expect(getSendInputCalls()).toHaveLength(0)
      const rows = auditDb.query({ project_id: project, event: 'ai_permission_auto_accepted' })
      expect(rows.length).toBe(0)
    })
  })

  describe('enqueueForWatcher — serial card queue', () => {
    it('processes both cards when two arrive simultaneously, neither left in limbo', async () => {
      const project = `queue-sim-${Date.now()}`
      const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
      await seedReadyCard(stepsDir, '01-src', 'card_q_001')
      await seedReadyCard(stepsDir, '01-src', 'card_q_002')

      // Enqueue both in the same tick — simulates simultaneous chokidar 'add' events
      workerRunner.enqueueForWatcher(project, 'wf', '02-worker', 'card_q_001')
      workerRunner.enqueueForWatcher(project, 'wf', '02-worker', 'card_q_002')

      while (workerRunner.isWatcherQueueActive(project, 'wf', '02-worker')) {
        await new Promise(r => setImmediate(r))
      }

      // Both source cards moved out of ready/
      expect(await pathExists(join(stepsDir, '01-src', 'cards', 'ready', 'card_q_001.json'))).toBe(false)
      expect(await pathExists(join(stepsDir, '01-src', 'cards', 'ready', 'card_q_002.json'))).toBe(false)

      // Both archived
      expect(await pathExists(join(stepsDir, '01-src', 'cards', 'archived', 'card_q_001.json'))).toBe(true)
      expect(await pathExists(join(stepsDir, '01-src', 'cards', 'archived', 'card_q_002.json'))).toBe(true)

      // Two produced cards in next step
      const nextPending = await fs.readdir(join(stepsDir, '03-next', 'cards', 'pending'))
      expect(nextPending).toHaveLength(2)

      // Two unique run IDs (no collision)
      const runDirs = await fs.readdir(join(stepsDir, '02-worker', 'runs'))
      expect(runDirs).toHaveLength(2)
      expect(new Set(runDirs).size).toBe(2)
    })

    it('deduplicates the same card ID enqueued multiple times', async () => {
      const project = `queue-dup-${Date.now()}`
      const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
      await seedReadyCard(stepsDir, '01-src', 'card_dup_001')

      // Enqueue the same card three times (e.g. chokidar re-fires)
      workerRunner.enqueueForWatcher(project, 'wf', '02-worker', 'card_dup_001')
      workerRunner.enqueueForWatcher(project, 'wf', '02-worker', 'card_dup_001')
      workerRunner.enqueueForWatcher(project, 'wf', '02-worker', 'card_dup_001')

      while (workerRunner.isWatcherQueueActive(project, 'wf', '02-worker')) {
        await new Promise(r => setImmediate(r))
      }

      // Processed exactly once
      const nextPending = await fs.readdir(join(stepsDir, '03-next', 'cards', 'pending'))
      expect(nextPending).toHaveLength(1)
    })
  })

  it('marks orphaned running runs as interrupted', async () => {
    const project = `crash-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })
    await seedReadyCard(stepsDir, '01-src', 'card_z_001')

    // Hand-write an orphaned run dir + meta with status=running
    const runDir = join(stepsDir, '02-worker', 'runs', 'run_orphan')
    await fs.mkdir(runDir, { recursive: true })
    await writeJson(join(runDir, 'meta.json'), {
      run_id: 'run_orphan', worker_id: '02-worker', card_id: 'card_z_001',
      project, workflow: 'wf',
      started_at: new Date().toISOString(),
      status: 'running',
    })

    const { recovered } = await workerRunner.recoverOrphanedRuns()
    expect(recovered).toBeGreaterThanOrEqual(1)

    const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
    expect(meta.status).toBe('interrupted')

    // Source card untouched in ready/
    expect(await pathExists(join(stepsDir, '01-src', 'cards', 'ready', 'card_z_001.json'))).toBe(true)
  })

})
