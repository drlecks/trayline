import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { setMockScript, getMockClearContextCalls, resetMockClearContextCalls, getLastSpawnedMcps, resetLastSpawnedMcps } from '../ai-terminals/mock'
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
    skills: [], mcps: [], context_packs: [],
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

  // ── MCP pre-flight tests ─────────────────────────────────────────────────────

  it('aborts with run_aborted_mcp_not_ready when MCP is not installed', async () => {
    const project = `mcp-not-installed-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    // Worker references an MCP that has no directory under Paths.mcps
    await writeJson(join(stepsDir, '02-worker', 'step.json'), {
      id: '02-worker', kind: 'worker', name: 'Worker',
      skills: [], mcps: ['nonexistent-mcp'], context_packs: [],
      execution: { adapter: 'mock', timeout_seconds: 5, retry_attempts: 0 },
      trigger: { mode: 'on_ready' },
      on_success: 'advance', on_failure: 'send_to_errors',
    })

    await seedReadyCard(stepsDir, '01-src', 'card_mni_001')

    const { runId } = await workerRunner.triggerRun({
      project, workflow: 'wf', stepId: '02-worker', cardId: 'card_mni_001',
    })

    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toContain('nonexistent-mcp')

    const rows = auditDb.query({ project_id: project, event: 'run_aborted_mcp_not_ready' })
    expect(rows.length).toBeGreaterThan(0)
    const details = JSON.parse(rows[0].details_json)
    expect(details.mcp_id).toBe('nonexistent-mcp')
    expect(details.reason).toBe('not_installed')
  })

  it('aborts with run_aborted_mcp_not_ready when MCP has unconfigured credentials', async () => {
    const project = `mcp-not-configured-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    // Create an MCP that requires credentials but is not configured
    const mcpId = `test-mcp-unconf-${Date.now()}`
    const mcpDir = join(Paths.mcps, mcpId)
    await fs.mkdir(join(mcpDir, 'state'), { recursive: true })
    await writeJson(join(mcpDir, 'mcp.json'), {
      id: mcpId, name: 'Needs Config MCP', version: '1.0.0',
      description: 'Test', install_method: 'npm',
      command_template: 'npx test-mcp',
      credentials_schema: [{ id: 'api_key', label: 'API Key', kind: 'api_key' }],
    })
    await writeJson(join(mcpDir, 'state', 'status.json'), {
      configured: false, health: null, healthCheckedAt: null,
    })

    await writeJson(join(stepsDir, '02-worker', 'step.json'), {
      id: '02-worker', kind: 'worker', name: 'Worker',
      skills: [], mcps: [mcpId], context_packs: [],
      execution: { adapter: 'mock', timeout_seconds: 5, retry_attempts: 0 },
      trigger: { mode: 'on_ready' },
      on_success: 'advance', on_failure: 'send_to_errors',
    })

    await seedReadyCard(stepsDir, '01-src', 'card_mnc_001')

    const { runId } = await workerRunner.triggerRun({
      project, workflow: 'wf', stepId: '02-worker', cardId: 'card_mnc_001',
    })

    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toContain('Needs Config MCP')

    const rows = auditDb.query({ project_id: project, event: 'run_aborted_mcp_not_ready' })
    expect(rows.length).toBeGreaterThan(0)
    const details = JSON.parse(rows[0].details_json)
    expect(details.reason).toBe('not_configured')
  })

  it('resolves a ready no-credential MCP and passes it to the adapter', async () => {
    resetLastSpawnedMcps()
    const project = `mcp-ready-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    // Create a ready MCP with no credentials (auto-configured)
    const mcpId = `test-mcp-ready-${Date.now()}`
    const mcpDir = join(Paths.mcps, mcpId)
    await fs.mkdir(join(mcpDir, 'state'), { recursive: true })
    await writeJson(join(mcpDir, 'mcp.json'), {
      id: mcpId, name: 'Ready MCP', version: '1.0.0',
      description: 'Test', install_method: 'npm',
      command_template: 'npx ready-test-mcp',
      credentials_schema: [],
    })
    await writeJson(join(mcpDir, 'state', 'status.json'), {
      configured: true, health: null, healthCheckedAt: null,
    })

    await writeJson(join(stepsDir, '02-worker', 'step.json'), {
      id: '02-worker', kind: 'worker', name: 'Worker',
      skills: [], mcps: [mcpId], context_packs: [],
      execution: { adapter: 'mock', timeout_seconds: 5, retry_attempts: 0 },
      trigger: { mode: 'on_ready' },
      on_success: 'advance', on_failure: 'send_to_errors',
    })

    await seedReadyCard(stepsDir, '01-src', 'card_mr_001')

    const { runId } = await workerRunner.triggerRun({
      project, workflow: 'wf', stepId: '02-worker', cardId: 'card_mr_001',
    })

    // Run should succeed
    const runDir = join(stepsDir, '02-worker', 'runs', runId)
    const meta = JSON.parse(await fs.readFile(join(runDir, 'meta.json'), 'utf-8'))
    expect(meta.status).toBe('succeeded')
    expect(meta.mcps_active).toEqual([mcpId])

    // Mock adapter received the MCP definition
    const spawnedMcps = getLastSpawnedMcps()
    expect(spawnedMcps).toHaveLength(1)
    expect(spawnedMcps[0].id).toBe(mcpId)
    expect((spawnedMcps[0].manifest as Record<string, unknown>)['command_template']).toBe('npx ready-test-mcp')
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

  it('rejects before allocating a run when adapter.supportsMcps is false and MCPs are configured', async () => {
    const project = `mcps-not-supported-${Date.now()}`
    const { stepsDir } = await buildWorkflow({ name: project, trayId: '01-src', workerId: '02-worker', nextTrayId: '03-next' })

    // local-llm is registered in the registry and has supportsMcps: false
    await writeJson(join(stepsDir, '02-worker', 'step.json'), {
      id: '02-worker', kind: 'worker', name: 'Worker',
      skills: [], mcps: ['some-mcp'], context_packs: [],
      execution: { adapter: 'local-llm', timeout_seconds: 5, retry_attempts: 0 },
      trigger: { mode: 'on_ready' },
      on_success: 'advance', on_failure: 'send_to_errors',
    })

    await seedReadyCard(stepsDir, '01-src', 'card_ns_001')

    // triggerRun should throw before creating any run directory
    await expect(
      workerRunner.triggerRun({ project, workflow: 'wf', stepId: '02-worker', cardId: 'card_ns_001' }),
    ).rejects.toThrow(/does not support MCP/)

    // No run directory should exist
    const runsDir = join(stepsDir, '02-worker', 'runs')
    let entries: string[] = []
    try { entries = await fs.readdir(runsDir) } catch { /* dir may not exist */ }
    const runDirs = entries.filter((e) => e.startsWith('run_'))
    expect(runDirs).toHaveLength(0)
  })
})
