import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'

// Mock all four sub-services so no real watchers or cron tasks are created.
const mockWatcher = {
  mountWorkflow: vi.fn(async () => {}),
  unmountWorkflow: vi.fn(async () => {}),
  remountWorkflow: vi.fn(async () => {}),
}
vi.mock('./watcher-service', () => ({ watcherService: mockWatcher }))

const mockScheduler = {
  mountWorkflow: vi.fn(async () => {}),
  unmountWorkflow: vi.fn(() => {}),
  remountWorkflow: vi.fn(async () => {}),
}
vi.mock('./scheduler-service', () => ({ schedulerService: mockScheduler }))

const mockSourceScheduler = {
  mountWorkflow: vi.fn(async () => {}),
  unmountWorkflow: vi.fn(() => {}),
  remountWorkflow: vi.fn(async () => {}),
}
vi.mock('./source-scheduler', () => ({ sourceScheduler: mockSourceScheduler }))

const mockQueue = {
  mountWorkflow: vi.fn(async () => {}),
  unmountWorkflow: vi.fn(async () => {}),
  remountWorkflow: vi.fn(async () => {}),
}
vi.mock('./queue-service', () => ({ queueService: mockQueue }))

const { orchestrator } = await import('./orchestrator')

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function buildProject(
  name: string,
  status: 'active' | 'inactive' = 'active',
  workflows: string[] = ['wf'],
) {
  await writeJson(join(Paths.projects, name, 'project.json'), {
    id: name, name, display_name: name, description: '',
    created_at: new Date().toISOString(), status,
  })
  for (const wf of workflows) {
    await writeJson(join(Paths.projects, name, 'workflows', wf, 'workflow.json'), {
      id: wf, name: wf, display_name: wf, step_ids: [],
    })
  }
}

describe('orchestrator', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  beforeEach(async () => {
    await orchestrator.unmountAll()
    vi.clearAllMocks()
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  it('mountAll only mounts active projects', async () => {
    await buildProject('active-p', 'active')
    await buildProject('inactive-p', 'inactive')
    await orchestrator.mountAll()

    expect(orchestrator.isMounted('active-p')).toBe(true)
    expect(orchestrator.isMounted('inactive-p')).toBe(false)
    expect(mockWatcher.mountWorkflow).toHaveBeenCalledWith('active-p', 'wf')
    expect(mockWatcher.mountWorkflow).not.toHaveBeenCalledWith('inactive-p', expect.anything())
  })

  it('mountProject calls all four services for each workflow', async () => {
    await buildProject('p1', 'active', ['wf1', 'wf2'])
    await orchestrator.mountProject('p1')

    expect(mockWatcher.mountWorkflow).toHaveBeenCalledTimes(2)
    expect(mockScheduler.mountWorkflow).toHaveBeenCalledTimes(2)
    expect(mockSourceScheduler.mountWorkflow).toHaveBeenCalledTimes(2)
    expect(mockQueue.mountWorkflow).toHaveBeenCalledTimes(2)
    expect(orchestrator.isMounted('p1')).toBe(true)
  })

  it('mountProject is idempotent — second call is a no-op', async () => {
    await buildProject('p-idem')
    await orchestrator.mountProject('p-idem')
    await orchestrator.mountProject('p-idem')

    expect(mockWatcher.mountWorkflow).toHaveBeenCalledTimes(1)
    expect(orchestrator.isMounted('p-idem')).toBe(true)
  })

  it('unmountProject calls all four services and clears mounted state', async () => {
    await buildProject('p-un')
    await orchestrator.mountProject('p-un')
    vi.clearAllMocks()

    await orchestrator.unmountProject('p-un')

    expect(mockWatcher.unmountWorkflow).toHaveBeenCalledWith('p-un', 'wf')
    expect(mockScheduler.unmountWorkflow).toHaveBeenCalledWith('p-un', 'wf')
    expect(mockSourceScheduler.unmountWorkflow).toHaveBeenCalledWith('p-un', 'wf')
    expect(mockQueue.unmountWorkflow).toHaveBeenCalledWith('p-un', 'wf')
    expect(orchestrator.isMounted('p-un')).toBe(false)
  })

  it('unmountProject is a no-op if project is not mounted', async () => {
    await orchestrator.unmountProject('not-mounted')

    expect(mockWatcher.unmountWorkflow).not.toHaveBeenCalled()
    expect(mockScheduler.unmountWorkflow).not.toHaveBeenCalled()
  })

  it('remountWorkflow calls all four services if project is mounted', async () => {
    await buildProject('p-remount')
    await orchestrator.mountProject('p-remount')
    vi.clearAllMocks()

    await orchestrator.remountWorkflow('p-remount', 'wf')

    expect(mockWatcher.remountWorkflow).toHaveBeenCalledWith('p-remount', 'wf')
    expect(mockScheduler.remountWorkflow).toHaveBeenCalledWith('p-remount', 'wf')
    expect(mockSourceScheduler.remountWorkflow).toHaveBeenCalledWith('p-remount', 'wf')
    expect(mockQueue.remountWorkflow).toHaveBeenCalledWith('p-remount', 'wf')
  })

  it('remountWorkflow is a no-op if project is not mounted', async () => {
    await orchestrator.remountWorkflow('inactive-p', 'wf')

    expect(mockWatcher.remountWorkflow).not.toHaveBeenCalled()
  })

  it('unmountAll clears all mounted projects', async () => {
    await buildProject('p-a')
    await buildProject('p-b')
    await orchestrator.mountProject('p-a')
    await orchestrator.mountProject('p-b')

    await orchestrator.unmountAll()

    expect(orchestrator.isMounted('p-a')).toBe(false)
    expect(orchestrator.isMounted('p-b')).toBe(false)
  })
})
