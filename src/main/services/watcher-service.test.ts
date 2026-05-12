import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { Paths } from './fs-service'

// In-process fake of chokidar: every `watch(dir)` returns an EventEmitter
// the test can grab from `watchers` and emit `'add'` on synchronously.
interface FakeWatcher extends EventEmitter {
  dir: string
  closed: boolean
  close: () => Promise<void>
}
const watchers: FakeWatcher[] = []

vi.mock('chokidar', () => ({
  watch: (dir: string) => {
    const emitter = new EventEmitter() as FakeWatcher
    emitter.dir = dir
    emitter.closed = false
    emitter.close = async () => { emitter.closed = true }
    watchers.push(emitter)
    return emitter
  },
}))

// Stub workerRunner so the watcher's triggerRun calls are observable
const triggered: Array<{ project: string; workflow: string; stepId: string; cardId: string }> = []
vi.mock('./worker-runner', () => ({
  workerRunner: {
    triggerRun: vi.fn(async (args: { project: string; workflow: string; stepId: string; cardId: string }) => {
      triggered.push(args)
      return { runId: 'run_x' }
    }),
  },
}))

const { watcherService } = await import('./watcher-service')

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function buildWorkflow(project: string, opts: { triggerMode?: 'on_ready' | 'scheduled' | 'manual' } = {}) {
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
  const wfDir = join(Paths.projects, project, 'workflows', 'wf')
  await writeJson(join(wfDir, 'workflow.json'), {
    id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-src', '02-worker'],
  })
  await writeJson(join(wfDir, 'steps', '01-src', 'step.json'), {
    id: '01-src', kind: 'tray', name: 'Source',
  })
  await writeJson(join(wfDir, 'steps', '02-worker', 'step.json'), {
    id: '02-worker', kind: 'worker', name: 'W',
    trigger: { mode: opts.triggerMode ?? 'on_ready' },
  })
}

describe('watcherService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  beforeEach(async () => {
    watchers.length = 0
    triggered.length = 0
    await watcherService.unmountAll()
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  afterEach(async () => {
    await watcherService.unmountAll()
  })

  it('mountWorkflow creates one watcher per on_ready worker, pointed at the previous tray\'s ready/', async () => {
    await buildWorkflow('p1')
    await watcherService.mountWorkflow('p1', 'wf')

    expect(watchers).toHaveLength(1)
    expect(watchers[0].dir.endsWith(join('01-src', 'cards', 'ready'))).toBe(true)
  })

  it('does not mount when trigger.mode is not on_ready', async () => {
    await buildWorkflow('p-sched', { triggerMode: 'scheduled' })
    await watcherService.mountWorkflow('p-sched', 'wf')
    expect(watchers).toHaveLength(0)
  })

  it('is idempotent — a second mountWorkflow call for the same workflow is a no-op', async () => {
    await buildWorkflow('p-idem')
    await watcherService.mountWorkflow('p-idem', 'wf')
    await watcherService.mountWorkflow('p-idem', 'wf')
    expect(watchers).toHaveLength(1)
  })

  it('an add event on a card file fires workerRunner.triggerRun with the right ids', async () => {
    await buildWorkflow('p-add')
    await watcherService.mountWorkflow('p-add', 'wf')

    watchers[0].emit('add', join(watchers[0].dir, 'card_abc.json'))
    // Allow the queued microtask in the watcher to flush
    await new Promise((r) => setImmediate(r))

    expect(triggered).toEqual([
      { project: 'p-add', workflow: 'wf', stepId: '02-worker', cardId: 'card_abc' },
    ])
  })

  it('ignores .tmp and non-json files', async () => {
    await buildWorkflow('p-ignore')
    await watcherService.mountWorkflow('p-ignore', 'wf')

    watchers[0].emit('add', join(watchers[0].dir, 'card_abc.json.tmp'))
    watchers[0].emit('add', join(watchers[0].dir, 'note.txt'))
    await new Promise((r) => setImmediate(r))
    expect(triggered).toEqual([])
  })

  it('unmountWorkflow closes the watcher and clears the slot', async () => {
    await buildWorkflow('p-un')
    await watcherService.mountWorkflow('p-un', 'wf')
    expect(watchers[0].closed).toBe(false)

    await watcherService.unmountWorkflow('p-un', 'wf')
    expect(watchers[0].closed).toBe(true)

    // After unmount, mounting again should succeed (slot is free)
    await watcherService.mountWorkflow('p-un', 'wf')
    expect(watchers).toHaveLength(2)
  })

  it('remountWorkflow closes the old watcher and opens a fresh one', async () => {
    await buildWorkflow('p-remount')
    await watcherService.mountWorkflow('p-remount', 'wf')

    await watcherService.remountWorkflow('p-remount', 'wf')
    expect(watchers).toHaveLength(2)
    expect(watchers[0].closed).toBe(true)
    expect(watchers[1].closed).toBe(false)
  })
})
