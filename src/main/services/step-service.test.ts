import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { stepService } from './step-service'

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function makeWorkflow(project: string, workflow: string, stepIds: string[] = ['99-errors']) {
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
  await writeJson(join(Paths.projects, project, 'workflows', workflow, 'workflow.json'), {
    id: workflow, name: workflow, display_name: workflow, step_ids: stepIds,
  })
}

async function makeStep(project: string, workflow: string, stepId: string, raw: Record<string, unknown>) {
  const dir = join(Paths.projects, project, 'workflows', workflow, 'steps', stepId)
  await writeJson(join(dir, 'step.json'), { id: stepId, ...raw })
}

async function readWorkflow(project: string, workflow: string) {
  return JSON.parse(
    await fs.readFile(join(Paths.projects, project, 'workflows', workflow, 'workflow.json'), 'utf-8'),
  )
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

describe('stepService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  beforeEach(async () => {
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  it('addTray scaffolds folders + state, inserts before 99-errors, and slugifies name', async () => {
    const project = `step-add-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })

    const tray = await stepService.addTray({
      project, workflow: 'wf', name: 'New Inbox!', approval_mode: 'manual',
      fields: [{ id: 'title', label: 'Title', type: 'text', required: true }],
    })

    expect(tray.id).toBe('01-new-inbox')
    const stepDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', tray.id)
    expect(await pathExists(join(stepDir, 'cards', 'pending'))).toBe(true)
    expect(await pathExists(join(stepDir, 'cards', 'ready'))).toBe(true)
    expect(await pathExists(join(stepDir, 'cards', 'archived'))).toBe(true)
    expect(await pathExists(join(stepDir, 'state', 'counters.json'))).toBe(true)

    const wf = await readWorkflow(project, 'wf')
    expect(wf.step_ids).toEqual([tray.id, '99-errors'])
  })

  it('addTray increments the prefix and ignores 99-errors when picking the next index', async () => {
    const project = `step-prefix-${Date.now()}`
    await makeWorkflow(project, 'wf', ['01-first', '02-second', '99-errors'])
    await makeStep(project, 'wf', '01-first', { kind: 'tray', name: 'First' })
    await makeStep(project, 'wf', '02-second', { kind: 'tray', name: 'Second' })
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })

    const t = await stepService.addTray({ project, workflow: 'wf', name: 'Third', approval_mode: 'manual' })
    expect(t.id).toBe('03-third')

    const wf = await readWorkflow(project, 'wf')
    expect(wf.step_ids).toEqual(['01-first', '02-second', '03-third', '99-errors'])
  })

  it('addWorker creates runs/, process.md, memory.md and worker counters', async () => {
    const project = `step-worker-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })

    const worker = await stepService.addWorker({
      project, workflow: 'wf', name: 'Classifier', process_md: '# Custom\n',
    })

    expect(worker.id).toBe('01-classifier')
    const stepDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', worker.id)
    expect(await pathExists(join(stepDir, 'runs'))).toBe(true)
    expect(await pathExists(join(stepDir, 'state', 'memory.md'))).toBe(true)
    expect(await fs.readFile(join(stepDir, 'process.md'), 'utf-8')).toBe('# Custom\n')

    const counters = JSON.parse(await fs.readFile(join(stepDir, 'state', 'counters.json'), 'utf-8'))
    expect(counters).toEqual({ runs_total: 0, successful: 0, failed: 0 })
  })

  it('addWorker falls back to the default process template when none provided', async () => {
    const project = `step-worker-def-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })

    const worker = await stepService.addWorker({ project, workflow: 'wf', name: 'Default' })
    const md = await fs.readFile(
      join(Paths.projects, project, 'workflows', 'wf', 'steps', worker.id, 'process.md'),
      'utf-8',
    )
    expect(md).toMatch(/# Worker Instructions/)
  })

  it('addTray throws if the step id already exists', async () => {
    const project = `step-dupe-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })
    await stepService.addTray({ project, workflow: 'wf', name: 'Inbox', approval_mode: 'manual' })
    // Manually drop the same-named folder back in so the slug collides.
    await expect(
      stepService.addTray({ project, workflow: 'wf', name: 'Inbox', approval_mode: 'manual' }),
    ).resolves.toMatchObject({ id: '02-inbox' })
  })

  it('updateStep merges patch into step.json', async () => {
    const project = `step-update-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })
    const tray = await stepService.addTray({ project, workflow: 'wf', name: 'Tray', approval_mode: 'manual' })

    await stepService.updateStep({
      project, workflow: 'wf', stepId: tray.id,
      patch: { name: 'Renamed', approval_mode: 'auto' },
    })

    const onDisk = JSON.parse(
      await fs.readFile(join(Paths.projects, project, 'workflows', 'wf', 'steps', tray.id, 'step.json'), 'utf-8'),
    )
    expect(onDisk.name).toBe('Renamed')
    expect(onDisk.approval_mode).toBe('auto')
    expect(onDisk.kind).toBe('tray') // unchanged
  })

  it('updateWorkerProcess + readWorkerProcess round-trip', async () => {
    const project = `step-proc-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })
    const worker = await stepService.addWorker({ project, workflow: 'wf', name: 'W' })

    await stepService.updateWorkerProcess({ project, workflow: 'wf', stepId: worker.id, processMd: '# Hello' })
    expect(await stepService.readWorkerProcess(project, 'wf', worker.id)).toBe('# Hello')
  })

  it('readWorkerProcess returns "" when process.md is missing', async () => {
    const project = `step-proc-missing-${Date.now()}`
    await makeWorkflow(project, 'wf', [])
    expect(await stepService.readWorkerProcess(project, 'wf', '01-ghost')).toBe('')
  })

  it('deleteStep removes the folder and the step id from workflow.json', async () => {
    const project = `step-del-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })
    const tray = await stepService.addTray({ project, workflow: 'wf', name: 'Doomed', approval_mode: 'manual' })

    await stepService.deleteStep({ project, workflow: 'wf', stepId: tray.id })
    const stepDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', tray.id)
    expect(await pathExists(stepDir)).toBe(false)
    const wf = await readWorkflow(project, 'wf')
    expect(wf.step_ids).toEqual(['99-errors'])
  })

  it('deleteStep refuses to delete the error tray', async () => {
    const project = `step-del-err-${Date.now()}`
    await makeWorkflow(project, 'wf', ['99-errors'])
    await makeStep(project, 'wf', '99-errors', { kind: 'tray', name: 'Errors' })
    await expect(
      stepService.deleteStep({ project, workflow: 'wf', stepId: '99-errors' }),
    ).rejects.toThrow(/Cannot delete the errors tray/)
  })
})
