import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { sourceRunner } from './source-runner'
import { setMockScript } from '../ai-terminals/mock'
import type { SourceStepConfig, SeenIdsEntry, SourceRunMeta } from '../../shared/types'

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

function makeConfig(overrides: Partial<SourceStepConfig> = {}): SourceStepConfig {
  return {
    id: '00-source',
    kind: 'source',
    name: 'Test Source',
    description: '',
    color: '#4CB87E',
    icon: 'rss',
    schedule_cron: '0 * * * *',
    dedup: { key: 'id', max_memory: 10000, first_run: 'process_all' },
    execution: { timeout_seconds: 60, adapter: 'mock' },
    paused: false,
    ...overrides,
  }
}

async function setupSourceStep(project: string, workflow: string, stepId: string, cfg: SourceStepConfig = makeConfig()) {
  const stepDir = join(Paths.projects, project, 'workflows', workflow, 'steps', stepId)
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'ready'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'archived'), { recursive: true })
  await fs.mkdir(join(stepDir, 'runs'), { recursive: true })
  await writeJson(join(stepDir, 'step.json'), cfg)
  await fs.writeFile(join(stepDir, 'source.md'), '# Source\nFetch items.', 'utf-8')
  await writeJson(join(stepDir, 'state', 'counters.json'), { runs_total: 0, items_found: 0, items_new: 0, last_run_at: null })
  // Also write workflow.json so project-service can resolve paths
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

describe('sourceRunner.runSource', () => {
  it('creates cards for new items and writes seen-ids', async () => {
    const project = `sr-basic-${Date.now()}`
    const stepId = '00-source'
    const items = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]
    setMockScript({ output: items, exitCode: 0 })
    await setupSourceStep(project, 'wf', stepId)

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'process_all' } }) })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = await fs.readdir(readyDir)
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(2)

    const seenPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json')
    const seen = await readJson<SeenIdsEntry[]>(seenPath)
    expect(seen.map((e) => e.id).sort()).toEqual(['a', 'b'])
  })

  it('skips items already in seen set', async () => {
    const project = `sr-dedup-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    // Seed seen-ids with 'a' already present
    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    await writeJson(join(stateDir, 'seen-ids.json'), [{ id: 'a', seen_at: new Date().toISOString() }])

    const items = [{ id: 'a', title: 'Alpha' }, { id: 'b', title: 'Beta' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = await fs.readdir(readyDir)
    // Only 'b' should be new
    expect(files.filter((f) => f.endsWith('.json'))).toHaveLength(1)
  })

  it('does not mutate state when AI returns invalid JSON', async () => {
    const project = `sr-invalid-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    setMockScript({ output: 'not json at all', exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig() })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    const files = await fs.readdir(readyDir)
    expect(files).toHaveLength(0)

    // seen-ids should not be written
    const seenPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json')
    expect(await pathExists(seenPath)).toBe(false)
  })

  it('first_run: skip_existing — no cards created but all IDs added to seen', async () => {
    const project = `sr-skip-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId, makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'skip_existing' } }))

    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'skip_existing' } }) })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(0)

    const seen = await readJson<SeenIdsEntry[]>(join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json'))
    expect(seen).toHaveLength(3)
  })

  it('first_run: process_all — cards created for all items', async () => {
    const project = `sr-all-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId, makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'process_all' } }))

    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'process_all' } }) })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(3)
  })

  it('first_run: process_last_n — creates only last N cards', async () => {
    const project = `sr-lastn-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeConfig({ dedup: { key: 'id', max_memory: 10000, first_run: 'process_last_n', first_run_n: 2 } })
    await setupSourceStep(project, 'wf', stepId, cfg)

    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const readyDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'cards', 'ready')
    expect((await fs.readdir(readyDir)).filter((f) => f.endsWith('.json'))).toHaveLength(2)

    // All 4 IDs should be in seen set (not just the 2 processed)
    const seen = await readJson<SeenIdsEntry[]>(join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'seen-ids.json'))
    expect(seen).toHaveLength(4)
  })

  it('prunes seen-ids to max_memory', async () => {
    const project = `sr-prune-${Date.now()}`
    const stepId = '00-source'
    const cfg = makeConfig({ dedup: { key: 'id', max_memory: 3, first_run: 'process_all' } })
    await setupSourceStep(project, 'wf', stepId, cfg)

    // Seed with 3 existing entries
    const stateDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state')
    const existing: SeenIdsEntry[] = [
      { id: 'old1', seen_at: '2020-01-01T00:00:00.000Z' },
      { id: 'old2', seen_at: '2020-01-02T00:00:00.000Z' },
      { id: 'old3', seen_at: '2020-01-03T00:00:00.000Z' },
    ]
    await writeJson(join(stateDir, 'seen-ids.json'), existing)

    const items = [{ id: 'new1' }, { id: 'new2' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: cfg })

    const seen = await readJson<SeenIdsEntry[]>(join(stateDir, 'seen-ids.json'))
    // max_memory = 3, we had 3 old + 2 new = 5, should prune to 3 newest
    expect(seen).toHaveLength(3)
    expect(seen.map((e) => e.id)).not.toContain('old1')
    expect(seen.map((e) => e.id)).not.toContain('old2')
  })

  it('counters are updated after each run', async () => {
    const project = `sr-counters-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    const items = [{ id: 'x' }, { id: 'y' }]
    setMockScript({ output: items, exitCode: 0 })

    await sourceRunner.runSource({ project, workflow: 'wf', stepId, stepConfig: makeConfig() })

    const countersPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'state', 'counters.json')
    const counters = await readJson<{ runs_total: number; items_found: number; items_new: number; last_run_at: string | null }>(countersPath)
    expect(counters.runs_total).toBe(1)
    expect(counters.items_found).toBe(2)
    expect(counters.items_new).toBe(2)
    expect(counters.last_run_at).toBeTruthy()
  })
})

describe('sourceRunner.recoverOrphanedRuns', () => {
  it('discards .tmp file left by a crashed seen-ids write', async () => {
    const project = `sr-crash-${Date.now()}`
    const stepId = '00-source'
    await setupSourceStep(project, 'wf', stepId)

    // Simulate a crash: leave .tmp file
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

    // Simulate a run left in 'running' state
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
