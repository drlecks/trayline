import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { sourceRunner } from './source-runner'
import type { SourceStepConfig, SeenIdsEntry, SourceRunMeta } from '../../shared/types'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('./credential-service', () => ({
  credentialService: {
    get: vi.fn().mockResolvedValue({
      id: 'test-cred', type: 'http', name: 'Test',
      base_url: 'https://example.com', headers: [], timeout_ms: 5000,
    }),
  },
}))

vi.mock('./http-channel', () => ({ fetchHttp: vi.fn() }))
vi.mock('./imap-channel', () => ({ fetchEmails: vi.fn() }))
vi.mock('./file-source-channel', () => ({ scanFiles: vi.fn() }))
vi.mock('./ai-step-helper', () => ({ runAIStep: vi.fn() }))

async function setHttpBody(text: string) {
  const mod = await import('./http-channel')
  vi.mocked(mod.fetchHttp).mockResolvedValue(text)
}

async function setHttpError(message: string) {
  const mod = await import('./http-channel')
  vi.mocked(mod.fetchHttp).mockRejectedValue(new Error(message))
}

async function setImapEmails(emails: unknown[]) {
  const mod = await import('./imap-channel')
  vi.mocked(mod.fetchEmails).mockResolvedValue(emails as never)
}

async function setAIOutput(output: object | string) {
  const mod = await import('./ai-step-helper')
  vi.mocked(mod.runAIStep).mockResolvedValue({ output, terminalLog: '' })
}

async function setAIError(message: string) {
  const mod = await import('./ai-step-helper')
  vi.mocked(mod.runAIStep).mockRejectedValue(new Error(message))
}

async function setScanFiles(files: unknown[]) {
  const mod = await import('./file-source-channel')
  vi.mocked(mod.scanFiles).mockResolvedValue(files as never)
}

function makeFileWatchConfig(overrides: Partial<SourceStepConfig> = {}): SourceStepConfig {
  return {
    id: '00-source', kind: 'source', name: 'Test Source', description: '',
    color: '#4CB87E', icon: 'rss', schedule_cron: '0 * * * *', paused: false,
    dedup: { key: 'file_path', max_memory: 10000, first_run: 'process_all' },
    channel: { type: 'file_watch', directory_path: '/tmp/watch', file_pattern: '*', include_subdirs: false },
    ...overrides,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await fs.readFile(path, 'utf-8')) as T
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function makeHttpConfig(overrides: Partial<SourceStepConfig> = {}): SourceStepConfig {
  return {
    id: '00-source', kind: 'source', name: 'Test Source', description: '',
    color: '#4CB87E', icon: 'rss', schedule_cron: '0 * * * *', paused: false,
    channel: { type: 'http_get', credential_id: 'test-cred', url_path: '/data' },
    ...overrides,
  }
}

function makeImapConfig(overrides: Partial<SourceStepConfig> = {}): SourceStepConfig {
  return {
    id: '00-source', kind: 'source', name: 'Test Source', description: '',
    color: '#4CB87E', icon: 'rss', schedule_cron: '0 * * * *', paused: false,
    dedup: { key: 'message_id', max_memory: 10000, first_run: 'process_all' },
    channel: { type: 'imap', credential_id: 'test-cred', folder: 'INBOX', unseen_only: true, max_messages: 50 },
    ...overrides,
  }
}

async function setupSourceStep(project: string, workflow: string, stepId: string, cfg: SourceStepConfig = makeHttpConfig()) {
  const stepDir = join(Paths.projects, project, 'workflows', workflow, 'steps', stepId)
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'ready'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'archived'), { recursive: true })
  await fs.mkdir(join(stepDir, 'runs'), { recursive: true })
  await writeJson(join(stepDir, 'step.json'), cfg)
  await writeJson(join(stepDir, 'state', 'counters.json'), { runs_total: 0, items_found: 0, items_new: 0, last_run_at: null })
  await writeJson(join(Paths.projects, project, 'workflows', workflow, 'workflow.json'), {
    id: workflow, name: workflow, display_name: workflow, step_ids: [stepId, '99-errors'],
  })
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await fs.mkdir(Paths.projects, { recursive: true })
  await fs.mkdir(Paths.appData, { recursive: true })
  auditDb.init()
})

beforeEach(async () => {
  await fs.rm(Paths.projects, { recursive: true, force: true })
  await fs.mkdir(Paths.projects, { recursive: true })
})

describe('sourceRunner — HTTP GET channel', () => {
  it('creates exactly one card per run with data.body set to the response text', async () => {
    const project = `sr-http-basic-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('{"items":[1,2,3]}')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = (await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(1)

    const card = await readJson<{ data: { body: string } }>(join(readyDir, files[0]))
    expect(card.data.body).toBe('{"items":[1,2,3]}')
  })

  it('does not write seen-ids.json (no dedup for HTTP)', async () => {
    const project = `sr-http-nodedup-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('hello world')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const seenPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json')
    expect(await pathExists(seenPath)).toBe(false)
  })

  it('creates a new card on every run (no duplicate prevention)', async () => {
    const project = `sr-http-everyrun-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeHttpConfig()
    await setHttpBody('response text')
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })
    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = (await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(2)
  })

  it('saves output.txt with the raw response text', async () => {
    const project = `sr-http-output-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('<html>page</html>')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const runDirs = await fs.readdir(runsDir)
    const outputTxt = join(runsDir, runDirs[0], 'output.txt')
    expect(await fs.readFile(outputTxt, 'utf-8')).toBe('<html>page</html>')
  })

  it('fails cleanly when channel fetch throws', async () => {
    const project = `sr-http-fetcherr-${Date.now()}`
    const stepId = '00-source'
    await setHttpError('Network unreachable')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(0)

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const meta = await readJson<SourceRunMeta>(join(runsDir, (await fs.readdir(runsDir))[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/Network unreachable/)
  })

  it('counters reflect items_found: 1 and items_new: 1 per run', async () => {
    const project = `sr-http-counters-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('data')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const counters = await readJson<{ runs_total: number; items_found: number; items_new: number }>(
      join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'counters.json'),
    )
    expect(counters.runs_total).toBe(1)
    expect(counters.items_found).toBe(1)
    expect(counters.items_new).toBe(1)
  })
})

describe('sourceRunner — IMAP channel', () => {
  it('creates one card per email and writes seen-ids', async () => {
    const project = `sr-imap-basic-${Date.now()}`
    const stepId = '00-source'
    await setImapEmails([
      { message_id: 'msg-a', subject: 'Alpha' },
      { message_id: 'msg-b', subject: 'Beta' },
    ])
    await setupSourceStep(project, 'wf', stepId, makeImapConfig())

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeImapConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(2)

    const seen = await readJson<SeenIdsEntry[]>(
      join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json'),
    )
    expect(seen.map((e) => e.id).sort()).toEqual(['msg-a', 'msg-b'])
  })

  it('skips emails already in seen set', async () => {
    const project = `sr-imap-dedup-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId, makeImapConfig())

    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await writeJson(join(stateDir, 'seen-ids.json'), [{ id: 'msg-a', seen_at: new Date().toISOString() }])

    await setImapEmails([
      { message_id: 'msg-a', subject: 'Alpha' },
      { message_id: 'msg-b', subject: 'Beta' },
    ])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeImapConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(1)
  })

  it('first_run skip_existing: no cards but all IDs added to seen', async () => {
    const project = `sr-imap-skip-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig({ dedup: { key: 'message_id', max_memory: 10000, first_run: 'skip_existing' } })
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setImapEmails([{ message_id: 'a' }, { message_id: 'b' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(0)

    const seen = await readJson<SeenIdsEntry[]>(join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json'))
    expect(seen).toHaveLength(2)
  })

  it('prunes seen-ids to max_memory', async () => {
    const project = `sr-imap-prune-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig({ dedup: { key: 'message_id', max_memory: 3, first_run: 'process_all' } })
    await setupSourceStep(project, 'wf', stepId, cfg)

    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await writeJson(join(stateDir, 'seen-ids.json'), [
      { id: 'old1', seen_at: '2020-01-01T00:00:00.000Z' },
      { id: 'old2', seen_at: '2020-01-02T00:00:00.000Z' },
      { id: 'old3', seen_at: '2020-01-03T00:00:00.000Z' },
    ])
    await setImapEmails([{ message_id: 'new1' }, { message_id: 'new2' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const seen = await readJson<SeenIdsEntry[]>(join(stateDir, 'seen-ids.json'))
    expect(seen).toHaveLength(3)
    expect(seen.map((e) => e.id)).not.toContain('old1')
    expect(seen.map((e) => e.id)).not.toContain('old2')
  })
})

describe('sourceRunner — common', () => {
  it('fails cleanly when no channel is configured', async () => {
    const project = `sr-nochan-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeHttpConfig({ channel: null })
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect(await fs.readdir(readyDir)).toHaveLength(0)

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const meta = await readJson<SourceRunMeta>(join(runsDir, (await fs.readdir(runsDir))[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/No channel configured/)
  })
})

describe('sourceRunner.recoverOrphanedRuns', () => {
  it('discards .tmp file left by a crashed seen-ids write', async () => {
    const project = `sr-crash-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await fs.writeFile(join(stateDir, 'seen-ids.json.tmp'), '[]', 'utf-8')

    const { recovered } = await sourceRunner.recoverOrphanedRuns()
    expect(recovered).toBeGreaterThan(0)
    expect(await pathExists(join(stateDir, 'seen-ids.json.tmp'))).toBe(false)
  })

  it('marks in-flight runs as failed on launch', async () => {
    const project = `sr-inflight-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    const runDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs', 'run_2026-01-01_001')
    await fs.mkdir(runDir, { recursive: true })
    const meta: SourceRunMeta = {
      run_id: 'run_2026-01-01_001', step_id: stepId, project, workflow: 'wf',
      started_at: new Date().toISOString(), status: 'running',
    }
    await writeJson(join(runDir, 'meta.json'), meta)

    await sourceRunner.recoverOrphanedRuns()

    const recovered = await readJson<SourceRunMeta>(join(runDir, 'meta.json'))
    expect(recovered.status).toBe('failed')
    expect(recovered.error).toMatch(/interrupted/)
  })
})

describe('sourceRunner — prompt (AI processing)', () => {
  it('HTTP GET: uses AI output as card.data when prompt is set', async () => {
    const project = `sr-http-prompt-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('<html>article page</html>')
    await setAIOutput({ title: 'Hello', author: 'Alex', published_at: '2026-01-01' })
    const cfg = makeHttpConfig({ prompt: 'Extract title, author, published_at from HTML. Return JSON.' })
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = (await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))
    expect(files).toHaveLength(1)
    const card = await readJson<{ data: Record<string, unknown> }>(join(readyDir, files[0]))
    expect(card.data).toEqual({ title: 'Hello', author: 'Alex', published_at: '2026-01-01' })
  })

  it('HTTP GET: wraps string AI output under ai_output key', async () => {
    const project = `sr-http-prompt-str-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('raw content')
    await setAIOutput('formatted text result')
    const cfg = makeHttpConfig({ prompt: 'Summarise this.' })
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = (await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))
    const card = await readJson<{ data: Record<string, unknown> }>(join(readyDir, files[0]))
    expect(card.data).toEqual({ ai_output: 'formatted text result' })
  })

  it('HTTP GET: falls back to verbatim card when prompt is absent', async () => {
    const project = `sr-http-noprompt-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('plain text')
    const cfg = makeHttpConfig({ prompt: null })
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = (await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))
    const card = await readJson<{ data: Record<string, unknown> }>(join(readyDir, files[0]))
    expect(card.data).toEqual({ body: 'plain text' })
  })

  it('HTTP GET: run fails when AI step throws', async () => {
    const project = `sr-http-aierr-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('some data')
    await setAIError('adapter not installed')
    const cfg = makeHttpConfig({ prompt: 'Do something.' })
    await setupSourceStep(project, 'wf', stepId, cfg)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(0)
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const meta = await readJson<{ status: string; error: string }>(join(runsDir, (await fs.readdir(runsDir))[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/adapter not installed/)
  })
})

describe('sourceRunner — auto-forward to next tray', () => {
  async function setupSourceWithNextTray(
    project: string,
    workflow: string,
    sourceId: string,
    trayId: string,
    sourceCfg?: SourceStepConfig,
  ) {
    const cfg = sourceCfg ?? makeHttpConfig({ id: sourceId })
    const stepDir = join(Paths.projects, project, 'workflows', workflow, 'steps', sourceId)
    await fs.mkdir(join(stepDir, 'state'), { recursive: true })
    await fs.mkdir(join(stepDir, 'cards', 'ready'), { recursive: true })
    await fs.mkdir(join(stepDir, 'runs'), { recursive: true })
    await writeJson(join(stepDir, 'step.json'), cfg)
    await writeJson(join(stepDir, 'state', 'counters.json'), { runs_total: 0, items_found: 0, items_new: 0, last_run_at: null })

    const trayDir = join(Paths.projects, project, 'workflows', workflow, 'steps', trayId)
    await fs.mkdir(join(trayDir, 'cards', 'ready'), { recursive: true })
    await writeJson(join(trayDir, 'step.json'), { id: trayId, kind: 'tray', name: 'Intake', approval_mode: 'manual' })

    await writeJson(join(Paths.projects, project, 'workflows', workflow, 'workflow.json'), {
      id: workflow, name: workflow, display_name: workflow, step_ids: [sourceId, trayId],
    })
    await writeJson(join(Paths.projects, project, 'project.json'), {
      id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
    })
  }

  it('HTTP GET: card lands in next tray ready/, not source ready/', async () => {
    const project = `sr-fwd-http-${Date.now()}`
    const sourceId = '00-source'
    const trayId = '01-intake'
    await setHttpBody('forwarded data')
    await setupSourceWithNextTray(project, 'wf', sourceId, trayId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId: sourceId, stepConfig: makeHttpConfig({ id: sourceId }) })

    const trayReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', trayId, 'cards', 'ready')
    const sourceReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', sourceId, 'cards', 'ready')

    expect((await fs.readdir(trayReady)).filter((f) => f.endsWith('.json'))).toHaveLength(1)
    expect((await fs.readdir(sourceReady)).filter((f) => f.endsWith('.json'))).toHaveLength(0)
  })

  it('HTTP GET: forwarded card history includes marked_ready by system', async () => {
    const project = `sr-fwd-hist-${Date.now()}`
    const sourceId = '00-source'
    const trayId = '01-intake'
    await setHttpBody('test data')
    await setupSourceWithNextTray(project, 'wf', sourceId, trayId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId: sourceId, stepConfig: makeHttpConfig({ id: sourceId }) })

    const trayReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', trayId, 'cards', 'ready')
    const files = (await fs.readdir(trayReady)).filter((f) => f.endsWith('.json'))
    const card = await readJson<{ history: Array<{ event: string; by: string; step: string }> }>(join(trayReady, files[0]))

    expect(card.history).toHaveLength(2)
    expect(card.history[0].event).toBe('created')
    expect(card.history[1].event).toBe('marked_ready')
    expect(card.history[1].by).toBe('system')
    expect(card.history[1].step).toBe(trayId)
  })

  it('IMAP: all new cards land in next tray ready/', async () => {
    const project = `sr-fwd-imap-${Date.now()}`
    const sourceId = '00-source'
    const trayId = '01-intake'
    await setImapEmails([
      { message_id: 'msg-a', subject: 'Alpha' },
      { message_id: 'msg-b', subject: 'Beta' },
    ])
    await setupSourceWithNextTray(project, 'wf', sourceId, trayId, makeImapConfig({ id: sourceId }))

    await sourceRunner.runSource({ project, workflow: 'wf', stepId: sourceId, stepConfig: makeImapConfig({ id: sourceId }) })

    const trayReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', trayId, 'cards', 'ready')
    const sourceReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', sourceId, 'cards', 'ready')

    expect((await fs.readdir(trayReady)).filter((f) => f.endsWith('.json'))).toHaveLength(2)
    expect((await fs.readdir(sourceReady)).filter((f) => f.endsWith('.json'))).toHaveLength(0)
  })

  it('falls back to source ready/ when next step is not a tray', async () => {
    const project = `sr-fwd-fallback-${Date.now()}`
    const stepId = '00-source'
    await setHttpBody('data')
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeHttpConfig() })

    const sourceReady = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(sourceReady)).filter((f) => f.endsWith('.json'))).toHaveLength(1)
  })
})

describe('sourceRunner.listRuns', () => {
  it('returns runs sorted newest first', async () => {
    const project = `sr-list-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const run1: SourceRunMeta = { run_id: 'run_2026-01-01_001', step_id: stepId, project, workflow: 'wf', started_at: '2026-01-01T00:00:00.000Z', status: 'completed' }
    const run2: SourceRunMeta = { run_id: 'run_2026-01-02_001', step_id: stepId, project, workflow: 'wf', started_at: '2026-01-02T00:00:00.000Z', status: 'completed' }
    await fs.mkdir(join(runsDir, run1.run_id), { recursive: true })
    await fs.mkdir(join(runsDir, run2.run_id), { recursive: true })
    await writeJson(join(runsDir, run1.run_id, 'meta.json'), run1)
    await writeJson(join(runsDir, run2.run_id, 'meta.json'), run2)

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs[0].run_id).toBe(run2.run_id)
    expect(runs[1].run_id).toBe(run1.run_id)
  })
})

describe('sourceRunner — skip empty successful runs', () => {
  it('IMAP: run directory is not persisted when 0 items found and 0 new', async () => {
    const project = `sr-imap-empty-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setImapEmails([])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(0)
  })

  it('IMAP: counters are still updated even when run directory is skipped', async () => {
    const project = `sr-imap-empty-ctr-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setImapEmails([])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })
    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const counters = await readJson<{ runs_total: number; items_found: number; items_new: number }>(
      join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'counters.json'),
    )
    expect(counters.runs_total).toBe(2)
    expect(counters.items_found).toBe(0)
    expect(counters.items_new).toBe(0)
  })

  it('IMAP: run directory is NOT persisted when items are found but 0 new', async () => {
    const project = `sr-imap-found-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)

    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await writeJson(join(stateDir, 'seen-ids.json'), [
      { id: 'msg-a', seen_at: new Date().toISOString() },
      { id: 'msg-b', seen_at: new Date().toISOString() },
    ])
    await setImapEmails([{ message_id: 'msg-a', subject: 'Alpha' }, { message_id: 'msg-b', subject: 'Beta' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(0)
  })

  it('IMAP: failed runs are always persisted', async () => {
    const project = `sr-imap-fail-persist-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeImapConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)
    const mod = await import('./imap-channel')
    vi.mocked(mod.fetchEmails).mockRejectedValue(new Error('connection refused'))

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('failed')
  })

  it('file_watch: run directory is not persisted when 0 files found and 0 new', async () => {
    const project = `sr-fw-empty-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeFileWatchConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setScanFiles([])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(0)
  })

  it('file_watch: run directory IS persisted when new files are found', async () => {
    const project = `sr-fw-found-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeFileWatchConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setScanFiles([{ file_path: '/tmp/watch/report.pdf', filename: 'report.pdf', size_bytes: 1024, content: '' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(1)
    expect(runs[0].status).toBe('completed')
  })

  it('file_watch: run directory is NOT persisted when files found are all already seen', async () => {
    const project = `sr-fw-allseen-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeFileWatchConfig()
    await setupSourceStep(project, 'wf', stepId, cfg)

    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await writeJson(join(stateDir, 'seen-ids.json'), [{ id: '/tmp/watch/report.pdf', seen_at: new Date().toISOString() }])
    await setScanFiles([{ file_path: '/tmp/watch/report.pdf', filename: 'report.pdf', size_bytes: 1024, content: '' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const runs = await sourceRunner.listRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(0)
  })

  it('file_watch: first run always processes unseen files regardless of dedup.first_run setting', async () => {
    const project = `sr-fw-firstrun-${Date.now()}`
    const stepId = '00-source'
    // dedup.first_run = 'skip_existing' must NOT prevent file processing for file_watch
    const cfg = makeFileWatchConfig({ dedup: { key: 'file_path', max_memory: 10000, first_run: 'skip_existing' } })
    await setupSourceStep(project, 'wf', stepId, cfg)
    await setScanFiles([{ file_path: '/tmp/watch/report.pdf', filename: 'report.pdf', size_bytes: 1024, content: '' }])

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(1)
  })
})
