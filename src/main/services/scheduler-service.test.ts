import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'

// The scheduler imports node-cron at module load. Replace it with an in-memory
// fake so tests can record what was scheduled and manually fire callbacks
// without waiting on real cron timing.
interface FakeTask {
  expr: string
  cb: () => void | Promise<void>
  stopped: boolean
}
const scheduled: FakeTask[] = []

vi.mock('node-cron', () => ({
  default: {
    validate: (expr: string) => /^[\d*\/, -]+(\s+[\d*\/, -]+){4,5}$/.test(expr),
    schedule: (expr: string, cb: () => void | Promise<void>) => {
      const task: FakeTask = { expr, cb, stopped: false }
      scheduled.push(task)
      return {
        stop: () => { task.stopped = true },
      }
    },
  },
}))

// Also stub workerRunner so scheduler can call .triggerRun() without
// touching the real run pipeline.
const triggered: Array<{ project: string; workflow: string; stepId: string; cardId: string }> = []
vi.mock('./worker-runner', () => ({
  workerRunner: {
    triggerRun: vi.fn(async (args: { project: string; workflow: string; stepId: string; cardId: string }) => {
      triggered.push(args)
      return { runId: `run_${Date.now()}` }
    }),
  },
}))

// Stub outletRunner for outlet scheduled tests
const outletRuns: Array<{ project: string; workflow: string; stepId: string; cardId: string; prevStepId: string }> = []
vi.mock('./outlet-runner', () => ({
  outletRunner: {
    runOutlet: vi.fn(async (project: string, workflow: string, stepId: string, _cfg: unknown, cardId: string, prevStepId: string) => {
      outletRuns.push({ project, workflow, stepId, cardId, prevStepId })
    }),
  },
}))

// Import after mocks so the scheduler picks them up.
const { schedulerService } = await import('./scheduler-service')

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function buildScheduledWorkflow(project: string, cronExpr: string | null) {
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
  const wfDir = join(Paths.projects, project, 'workflows', 'wf')
  await writeJson(join(wfDir, 'workflow.json'), {
    id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-src', '02-worker'],
  })
  // Source tray with one ready card
  const srcDir = join(wfDir, 'steps', '01-src')
  await fs.mkdir(join(srcDir, 'cards', 'ready'), { recursive: true })
  await writeJson(join(srcDir, 'step.json'), { id: '01-src', kind: 'tray', name: 'Source' })
  await writeJson(join(srcDir, 'cards', 'ready', 'card_abc.json'), { id: 'card_abc' })

  // Worker with scheduled trigger
  const workerDir = join(wfDir, 'steps', '02-worker')
  await writeJson(join(workerDir, 'step.json'), {
    id: '02-worker',
    kind: 'worker',
    name: 'W',
    trigger: { mode: 'scheduled', schedule_cron: cronExpr },
  })
}

describe('schedulerService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  beforeEach(async () => {
    scheduled.length = 0
    triggered.length = 0
    outletRuns.length = 0
    schedulerService.stopAll()
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  afterEach(() => {
    schedulerService.stopAll()
  })

  it('mountWorkflow registers a cron task for each scheduled worker', async () => {
    await buildScheduledWorkflow('p1', '*/5 * * * *')
    await schedulerService.mountWorkflow('p1', 'wf')

    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].expr).toBe('*/5 * * * *')
  })

  it('skips workers whose schedule_cron is null or invalid', async () => {
    await buildScheduledWorkflow('p-null', null)
    await schedulerService.mountWorkflow('p-null', 'wf')
    expect(scheduled).toHaveLength(0)

    await buildScheduledWorkflow('p-bad', 'not-a-cron')
    await schedulerService.mountWorkflow('p-bad', 'wf')
    expect(scheduled).toHaveLength(0)
  })

  it('skips workers whose trigger.mode is not "scheduled"', async () => {
    const project = 'p-onready'
    await writeJson(join(Paths.projects, project, 'project.json'), {
      id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
    })
    const wfDir = join(Paths.projects, project, 'workflows', 'wf')
    await writeJson(join(wfDir, 'workflow.json'), { id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-src', '02-w'] })
    await writeJson(join(wfDir, 'steps', '01-src', 'step.json'), { id: '01-src', kind: 'tray', name: 'S' })
    await writeJson(join(wfDir, 'steps', '02-w', 'step.json'), {
      id: '02-w', kind: 'worker', name: 'W',
      trigger: { mode: 'on_ready', schedule_cron: '*/5 * * * *' },
    })

    await schedulerService.mountWorkflow(project, 'wf')
    expect(scheduled).toHaveLength(0)
  })

  it('firing the cron task triggers worker runs for every card in the previous tray\'s ready/', async () => {
    await buildScheduledWorkflow('p-fire', '*/5 * * * *')
    await schedulerService.mountWorkflow('p-fire', 'wf')

    // Fire the task once
    await scheduled[0].cb()
    // Drain pending micro/macrotasks scheduled by the fire-and-forget triggerRun
    await new Promise((r) => setTimeout(r, 0))

    expect(triggered).toEqual([
      { project: 'p-fire', workflow: 'wf', stepId: '02-worker', cardId: 'card_abc' },
    ])
  })

  it('unmountWorkflow stops cron tasks for that workflow only', async () => {
    await buildScheduledWorkflow('p-a', '*/5 * * * *')
    await buildScheduledWorkflow('p-b', '*/5 * * * *')
    await schedulerService.mountWorkflow('p-a', 'wf')
    await schedulerService.mountWorkflow('p-b', 'wf')
    expect(scheduled).toHaveLength(2)

    schedulerService.unmountWorkflow('p-a', 'wf')
    expect(scheduled[0].stopped).toBe(true)
    expect(scheduled[1].stopped).toBe(false)
  })

  it('remountWorkflow stops the old task and registers a fresh one', async () => {
    await buildScheduledWorkflow('p-remount', '*/5 * * * *')
    await schedulerService.mountWorkflow('p-remount', 'wf')
    expect(scheduled).toHaveLength(1)

    await schedulerService.remountWorkflow('p-remount', 'wf')
    expect(scheduled).toHaveLength(2)
    expect(scheduled[0].stopped).toBe(true)
    expect(scheduled[1].stopped).toBe(false)
  })

  it('stopAll stops every registered task', async () => {
    await buildScheduledWorkflow('p-stopall', '*/5 * * * *')
    await schedulerService.mountWorkflow('p-stopall', 'wf')

    schedulerService.stopAll()
    expect(scheduled.every((t) => t.stopped)).toBe(true)
  })
})

async function buildScheduledOutletWorkflow(project: string, cronExpr: string | null) {
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
  const wfDir = join(Paths.projects, project, 'workflows', 'wf')
  await writeJson(join(wfDir, 'workflow.json'), {
    id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-tray', '02-outlet'],
  })
  const trayDir = join(wfDir, 'steps', '01-tray')
  await fs.mkdir(join(trayDir, 'cards', 'ready'), { recursive: true })
  await writeJson(join(trayDir, 'step.json'), { id: '01-tray', kind: 'tray', name: 'Tray' })
  await writeJson(join(trayDir, 'cards', 'ready', 'card_xyz.json'), { id: 'card_xyz' })

  const outletDir = join(wfDir, 'steps', '02-outlet')
  await fs.mkdir(outletDir, { recursive: true })
  await writeJson(join(outletDir, 'step.json'), {
    id: '02-outlet',
    kind: 'outlet',
    name: 'Send',
    trigger: { mode: 'scheduled', schedule_cron: cronExpr },
    channel: { type: 'smtp', credential_id: '', to: '', subject: '', body: '' },
    on_failure: 'send_to_errors',
  })
}

describe('schedulerService — outlet scheduled mode', () => {
  beforeEach(async () => {
    scheduled.length = 0
    triggered.length = 0
    outletRuns.length = 0
    schedulerService.stopAll()
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  afterEach(() => {
    schedulerService.stopAll()
  })

  it('registers a cron task for an outlet with scheduled trigger', async () => {
    await buildScheduledOutletWorkflow('p-out-sched', '0 8 * * *')
    await schedulerService.mountWorkflow('p-out-sched', 'wf')
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].expr).toBe('0 8 * * *')
  })

  it('does not register a cron task for an outlet with on_ready trigger', async () => {
    const project = 'p-out-onready'
    await writeJson(join(Paths.projects, project, 'project.json'), {
      id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
    })
    const wfDir = join(Paths.projects, project, 'workflows', 'wf')
    await writeJson(join(wfDir, 'workflow.json'), { id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-tray', '02-outlet'] })
    await writeJson(join(wfDir, 'steps', '01-tray', 'step.json'), { id: '01-tray', kind: 'tray', name: 'T' })
    await writeJson(join(wfDir, 'steps', '02-outlet', 'step.json'), {
      id: '02-outlet', kind: 'outlet', name: 'S',
      trigger: { mode: 'on_ready', schedule_cron: null },
      channel: { type: 'smtp', credential_id: '', to: '', subject: '', body: '' },
      on_failure: 'send_to_errors',
    })
    await schedulerService.mountWorkflow(project, 'wf')
    expect(scheduled).toHaveLength(0)
  })

  it('firing the cron task calls outletRunner.runOutlet for each ready card', async () => {
    await buildScheduledOutletWorkflow('p-out-fire', '0 8 * * *')
    await schedulerService.mountWorkflow('p-out-fire', 'wf')

    await scheduled[0].cb()
    await new Promise((r) => setTimeout(r, 0))

    expect(outletRuns).toEqual([
      { project: 'p-out-fire', workflow: 'wf', stepId: '02-outlet', cardId: 'card_xyz', prevStepId: '01-tray' },
    ])
  })
})
