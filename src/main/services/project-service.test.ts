import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { projectService } from './project-service'

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function makeProject(name: string, extra: Record<string, unknown> = {}) {
  const projectDir = join(Paths.projects, name)
  await writeJson(join(projectDir, 'project.json'), {
    id: name,
    name,
    display_name: name,
    description: '',
    created_at: new Date().toISOString(),
    ...extra,
  })
  return projectDir
}

async function makeWorkflow(project: string, workflow: string, stepIds: string[] = []) {
  const wfDir = join(Paths.projects, project, 'workflows', workflow)
  await writeJson(join(wfDir, 'workflow.json'), {
    id: workflow,
    name: workflow,
    display_name: workflow,
    step_ids: stepIds,
  })
  return wfDir
}

async function makeStep(project: string, workflow: string, id: string, raw: Record<string, unknown>) {
  const dir = join(Paths.projects, project, 'workflows', workflow, 'steps', id)
  await writeJson(join(dir, 'step.json'), { id, ...raw })
  return dir
}

describe('projectService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
    await fs.mkdir(Paths.skills, { recursive: true })
  })

  beforeEach(async () => {
    // Each test gets a clean projects + user-skills slate.
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })

    if (await exists(Paths.skills)) {
      for (const e of await fs.readdir(Paths.skills)) {
        if (e === '_system') continue
        await fs.rm(join(Paths.skills, e), { recursive: true, force: true })
      }
    }
  })

  it('listProjects returns [] when projects/ is empty', async () => {
    expect(await projectService.listProjects()).toEqual([])
  })

  it('listProjects skips entries without project.json', async () => {
    await makeProject('proj-a')
    await fs.mkdir(join(Paths.projects, 'orphan'), { recursive: true })
    const all = await projectService.listProjects()
    expect(all.map((p) => p.name)).toEqual(['proj-a'])
  })

  it('getProject returns null for missing project', async () => {
    expect(await projectService.getProject('nope')).toBeNull()
  })

  it('listProjects defaults missing status to "active" and missing updated_at to created_at', async () => {
    await makeProject('legacy')
    const [meta] = await projectService.listProjects()
    expect(meta.status).toBe('active')
    expect(meta.updated_at).toBe(meta.created_at)
  })

  it('listProjects orders by updated_at descending (most recent first)', async () => {
    await makeProject('older', { updated_at: '2026-01-01T00:00:00.000Z' })
    await makeProject('newer', { updated_at: '2026-05-01T00:00:00.000Z' })
    await makeProject('middle', { updated_at: '2026-03-01T00:00:00.000Z' })
    const all = await projectService.listProjects()
    expect(all.map((p) => p.name)).toEqual(['newer', 'middle', 'older'])
  })

  it('setStatus updates status and bumps updated_at; rejects unknown projects', async () => {
    await makeProject('p', { status: 'active', updated_at: '2026-01-01T00:00:00.000Z' })
    const next = await projectService.setStatus('p', 'inactive')
    expect(next.status).toBe('inactive')
    expect(next.updated_at > '2026-01-01T00:00:00.000Z').toBe(true)
    // Round-tripped through getProject
    const round = await projectService.getProject('p')
    expect(round?.status).toBe('inactive')
    await expect(projectService.setStatus('missing', 'inactive')).rejects.toThrow(/Project not found/)
  })

  it('listWorkflows reads workflow.json files', async () => {
    await makeProject('p1')
    await makeWorkflow('p1', 'wf-a')
    await makeWorkflow('p1', 'wf-b')
    const wfs = await projectService.listWorkflows('p1')
    expect(wfs.map((w) => w.name).sort()).toEqual(['wf-a', 'wf-b'])
  })

  it('listSteps sorts by folder name and falls back to id from folder', async () => {
    await makeProject('p2')
    await makeWorkflow('p2', 'wf', ['02-second', '01-first', '99-errors'])
    await makeStep('p2', 'wf', '02-second', { kind: 'worker', name: 'Second' })
    await makeStep('p2', 'wf', '01-first', { kind: 'tray', name: 'First' })
    // Step folder missing the `id` field — service should fall back to folder name.
    const errDir = join(Paths.projects, 'p2', 'workflows', 'wf', 'steps', '99-errors')
    await writeJson(join(errDir, 'step.json'), { kind: 'tray', name: 'Errors' })

    const steps = await projectService.listSteps('p2', 'wf')
    expect(steps.map((s) => s.id)).toEqual(['01-first', '02-second', '99-errors'])
    expect(steps[2].id).toBe('99-errors')
    expect(steps[0].kind).toBe('tray')
    expect(steps[1].kind).toBe('worker')
  })

  it('listSteps skips folders without step.json', async () => {
    await makeProject('p3')
    await makeWorkflow('p3', 'wf')
    await makeStep('p3', 'wf', '01-real', { kind: 'tray', name: 'R' })
    await fs.mkdir(join(Paths.projects, 'p3', 'workflows', 'wf', 'steps', '02-broken'), { recursive: true })
    const steps = await projectService.listSteps('p3', 'wf')
    expect(steps.map((s) => s.id)).toEqual(['01-real'])
  })

  it('getStep returns null when step.json is missing', async () => {
    await makeProject('p4')
    await makeWorkflow('p4', 'wf')
    expect(await projectService.getStep('p4', 'wf', 'missing')).toBeNull()
  })

  it('listSkills returns user skills, skipping _system folder at this level', async () => {
    await writeJson(join(Paths.skills, 'my-skill', 'skill.json'), {
      id: 'my-skill', name: 'My', version: '1.0.0', description: 'd',
    })
    await fs.mkdir(join(Paths.skills, '_system'), { recursive: true })

    const skills = await projectService.listSkills()
    expect(skills.map((s) => s.id)).toContain('my-skill')
    expect(skills.find((s) => s.id === '_system')).toBeUndefined()
  })

  it('paths helpers build the expected layout', () => {
    const dir = projectService.paths.stepDir('p', 'w', '01-x')
    expect(dir.endsWith(join('p', 'workflows', 'w', 'steps', '01-x'))).toBe(true)
  })

  // ── Context pack CRUD ──────────────────────────────────────────────────────

  it('listContextFiles returns [] when context/ does not exist', async () => {
    await makeProject('ctx0')
    expect(await projectService.listContextFiles('ctx0')).toEqual([])
  })

  it('writeContextFile creates the file and listContextFiles returns it', async () => {
    await makeProject('ctx1')
    await projectService.writeContextFile('ctx1', '_brand-voice.md', '# Brand\n\nFriendly.')
    const files = await projectService.listContextFiles('ctx1')
    expect(files).toEqual(['_brand-voice.md'])
  })

  it('readContextFile returns the written content', async () => {
    await makeProject('ctx2')
    await projectService.writeContextFile('ctx2', 'guide.md', 'Hello context')
    const content = await projectService.readContextFile('ctx2', 'guide.md')
    expect(content).toBe('Hello context')
  })

  it('readContextFile returns "" for a missing file', async () => {
    await makeProject('ctx3')
    expect(await projectService.readContextFile('ctx3', 'nope.md')).toBe('')
  })

  it('writeContextFile rejects non-.md extensions', async () => {
    await makeProject('ctx4')
    await expect(projectService.writeContextFile('ctx4', 'secrets.txt', 'bad')).rejects.toThrow(/.md/)
  })

  it('deleteContextFile removes the file', async () => {
    await makeProject('ctx5')
    await projectService.writeContextFile('ctx5', 'temp.md', 'delete me')
    await projectService.deleteContextFile('ctx5', 'temp.md')
    expect(await projectService.listContextFiles('ctx5')).toEqual([])
  })

  it('deleteContextFile is a no-op for a missing file', async () => {
    await makeProject('ctx6')
    await expect(projectService.deleteContextFile('ctx6', 'ghost.md')).resolves.toBeUndefined()
  })

  it('writeContextFile prevents path traversal', async () => {
    await makeProject('ctx7')
    // basename() strips the traversal — file lands in context/ as-is
    await projectService.writeContextFile('ctx7', '../../../evil.md', 'x')
    const files = await projectService.listContextFiles('ctx7')
    expect(files).toEqual(['evil.md'])
  })

  it('listContextFiles only returns .md files', async () => {
    await makeProject('ctx8')
    const contextDir = join(Paths.projects, 'ctx8', 'context')
    await fs.mkdir(contextDir, { recursive: true })
    await fs.writeFile(join(contextDir, 'valid.md'), 'ok', 'utf-8')
    await fs.writeFile(join(contextDir, 'ignored.txt'), 'no', 'utf-8')
    const files = await projectService.listContextFiles('ctx8')
    expect(files).toEqual(['valid.md'])
  })
})

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}
