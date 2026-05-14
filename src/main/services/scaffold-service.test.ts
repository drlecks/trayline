import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { scaffoldService } from './scaffold-service'
import type { WorkflowPlan } from '../../shared/workflow-plan'

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function makePlan(overrides: Partial<WorkflowPlan> = {}): WorkflowPlan {
  return {
    project: { name: 'demo', display_name: 'Demo', description: 'A demo project', ...(overrides.project ?? {}) },
    workflow: {
      name: 'main',
      display_name: 'Main',
      steps: [
        {
          kind: 'tray', id: '01-intake', name: 'Intake', description: 'inbox',
          approval_mode: 'manual',
          input_schema: { fields: [{ id: 'title', label: 'Title', type: 'text', required: true }] },
          allow_manual_create: true,
        },
        {
          kind: 'worker', id: '02-classify', name: 'Classify',
          skills: ['some-skill'], mcps: ['gmail'], context_packs: [],
          process_md: '# Custom Process\n',
        },
        {
          kind: 'tray', id: '03-done', name: 'Done',
          approval_mode: 'auto',
          input_schema: { fields: [] },
        },
      ],
      ...(overrides.workflow ?? {}),
    },
  }
}

describe('scaffoldService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  beforeEach(async () => {
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  it('scaffolds a project layout from a plan and surfaces unconfigured MCPs', async () => {
    const plan = makePlan()
    const res = await scaffoldService.scaffold(plan)

    expect(res.project.name).toBe('demo')
    expect(res.project.status).toBe('active')
    expect(res.project.updated_at).toBe(res.project.created_at)
    expect(res.unconfiguredMcps).toEqual(['gmail'])
    expect(res.projectPath).toBe(join(Paths.projects, 'demo'))

    // Project files
    expect(await pathExists(join(res.projectPath, 'project.json'))).toBe(true)
    expect(await pathExists(join(res.projectPath, 'README.md'))).toBe(true)
    expect(await pathExists(join(res.projectPath, 'context'))).toBe(true)
    expect(await pathExists(join(res.projectPath, 'exports'))).toBe(true)

    // Tray scaffolding
    const intake = join(res.projectPath, 'workflows', 'main', 'steps', '01-intake')
    expect(await pathExists(join(intake, 'cards', 'pending'))).toBe(true)
    expect(await pathExists(join(intake, 'cards', 'ready'))).toBe(true)
    expect(await pathExists(join(intake, 'cards', 'archived'))).toBe(true)
    const intakeJson = JSON.parse(await fs.readFile(join(intake, 'step.json'), 'utf-8'))
    expect(intakeJson.input_schema.fields).toHaveLength(1)
    expect(intakeJson.allow_manual_create).toBe(true)

    // Worker scaffolding
    const worker = join(res.projectPath, 'workflows', 'main', 'steps', '02-classify')
    expect(await pathExists(join(worker, 'runs'))).toBe(true)
    expect(await pathExists(join(worker, 'state', 'memory.md'))).toBe(true)
    expect(await fs.readFile(join(worker, 'process.md'), 'utf-8')).toBe('# Custom Process\n')
    const workerJson = JSON.parse(await fs.readFile(join(worker, 'step.json'), 'utf-8'))
    expect(workerJson.skills).toEqual(['some-skill'])
    expect(workerJson.mcps).toEqual(['gmail'])

    // 99-errors is always appended at the end
    const errStep = join(res.projectPath, 'workflows', 'main', 'steps', '99-errors')
    expect(await pathExists(errStep)).toBe(true)
    const wf = JSON.parse(await fs.readFile(join(res.projectPath, 'workflows', 'main', 'workflow.json'), 'utf-8'))
    expect(wf.step_ids).toEqual(['01-intake', '02-classify', '03-done', '99-errors'])
  })

  it('refuses to overwrite an existing project by default', async () => {
    const plan = makePlan()
    await scaffoldService.scaffold(plan)
    await expect(scaffoldService.scaffold(plan)).rejects.toThrow(/already exists/)
  })

  it('overwrites cleanly when overwrite=true', async () => {
    const plan = makePlan()
    await scaffoldService.scaffold(plan)
    // Drop a stray file inside the old project; after overwrite it should be gone.
    await fs.writeFile(join(Paths.projects, 'demo', 'stale.txt'), 'x', 'utf-8')
    await scaffoldService.scaffold(plan, { overwrite: true })
    expect(await pathExists(join(Paths.projects, 'demo', 'stale.txt'))).toBe(false)
    expect(await pathExists(join(Paths.projects, 'demo', 'project.json'))).toBe(true)
  })

  it('archives the existing project under .history/<name> when archiveExistingTo is set', async () => {
    const plan = makePlan()
    await scaffoldService.scaffold(plan)
    await scaffoldService.scaffold(plan, { archiveExistingTo: 'v1' })

    const historyDir = join(Paths.projects, 'demo', '.history', 'v1')
    expect(await pathExists(historyDir)).toBe(true)
    // Archived copy retains the previous project.json
    expect(await pathExists(join(historyDir, 'project.json'))).toBe(true)
    // New scaffold's project.json is back in place
    expect(await pathExists(join(Paths.projects, 'demo', 'project.json'))).toBe(true)
  })

  it('deleteProject removes the project folder', async () => {
    await scaffoldService.scaffold(makePlan())
    await scaffoldService.deleteProject('demo')
    expect(await pathExists(join(Paths.projects, 'demo'))).toBe(false)
  })

  it('deleteProject is a no-op when the project does not exist', async () => {
    await expect(scaffoldService.deleteProject('ghost')).resolves.toBeUndefined()
  })
})
