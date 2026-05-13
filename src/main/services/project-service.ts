import { join, basename } from 'path'
import fs from 'fs/promises'
import { Paths } from './fs-service'
import type {
  ProjectMeta,
  ProjectStatus,
  WorkflowMeta,
  StepKind,
  StepMeta,
  SkillManifest,
  MissingSkillsEntry,
} from '../../shared/types'

export type { ProjectMeta, ProjectStatus, WorkflowMeta, StepKind, StepMeta, SkillManifest }

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function projectDir(projectName: string): string {
  return join(Paths.projects, projectName)
}

function workflowDir(projectName: string, workflowName: string): string {
  return join(projectDir(projectName), 'workflows', workflowName)
}

function stepDir(projectName: string, workflowName: string, stepId: string): string {
  return join(workflowDir(projectName, workflowName), 'steps', stepId)
}

function normalizeMeta(raw: Partial<ProjectMeta> & { name: string }): ProjectMeta {
  const created_at = raw.created_at ?? new Date(0).toISOString()
  return {
    id: raw.id ?? raw.name,
    name: raw.name,
    display_name: raw.display_name ?? raw.name,
    description: raw.description ?? '',
    created_at,
    status: raw.status === 'inactive' ? 'inactive' : 'active',
    updated_at: raw.updated_at ?? created_at,
  }
}

// ─── Project operations ───────────────────────────────────────────────────────

async function listProjects(): Promise<ProjectMeta[]> {
  if (!(await pathExists(Paths.projects))) return []
  const entries = await fs.readdir(Paths.projects, { withFileTypes: true })
  const projects: ProjectMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readJsonSafe<Partial<ProjectMeta>>(join(Paths.projects, entry.name, 'project.json'))
    if (meta) projects.push(normalizeMeta({ ...meta, name: meta.name ?? entry.name }))
  }
  // Most-recently-updated first.
  projects.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
  return projects
}

async function getProject(projectName: string): Promise<ProjectMeta | null> {
  const raw = await readJsonSafe<Partial<ProjectMeta>>(join(projectDir(projectName), 'project.json'))
  if (!raw) return null
  return normalizeMeta({ ...raw, name: raw.name ?? projectName })
}

async function setStatus(projectName: string, status: ProjectStatus): Promise<ProjectMeta> {
  const path = join(projectDir(projectName), 'project.json')
  const raw = await readJsonSafe<Partial<ProjectMeta>>(path)
  if (!raw) throw new Error(`Project not found: ${projectName}`)
  const next = normalizeMeta({ ...raw, name: raw.name ?? projectName, status, updated_at: new Date().toISOString() })
  const tmp = path + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), 'utf-8')
  await fs.rename(tmp, path)
  return next
}

async function listWorkflows(projectName: string): Promise<WorkflowMeta[]> {
  const wfRoot = join(projectDir(projectName), 'workflows')
  if (!(await pathExists(wfRoot))) return []
  const entries = await fs.readdir(wfRoot, { withFileTypes: true })
  const workflows: WorkflowMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readJsonSafe<WorkflowMeta>(join(wfRoot, entry.name, 'workflow.json'))
    if (meta) workflows.push(meta)
  }
  return workflows
}

async function getWorkflow(projectName: string, workflowName: string): Promise<WorkflowMeta | null> {
  return readJsonSafe<WorkflowMeta>(join(workflowDir(projectName, workflowName), 'workflow.json'))
}

async function listSteps(projectName: string, workflowName: string): Promise<StepMeta[]> {
  const stepsRoot = join(workflowDir(projectName, workflowName), 'steps')
  if (!(await pathExists(stepsRoot))) return []
  const entries = await fs.readdir(stepsRoot, { withFileTypes: true })
  // Sort by directory name so 01-, 02-, ..., 99-errors land in the right order
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const steps: StepMeta[] = []
  for (const id of dirs) {
    const raw = await readJsonSafe<Record<string, unknown>>(join(stepsRoot, id, 'step.json'))
    if (!raw) continue
    steps.push({
      id: String(raw.id ?? id),
      kind: (raw.kind as StepKind) ?? 'tray',
      name: String(raw.name ?? id),
      description: raw.description as string | undefined,
      raw,
    })
  }
  return steps
}

async function getStep(projectName: string, workflowName: string, stepId: string): Promise<StepMeta | null> {
  const raw = await readJsonSafe<Record<string, unknown>>(
    join(stepDir(projectName, workflowName, stepId), 'step.json'),
  )
  if (!raw) return null
  return {
    id: String(raw.id ?? stepId),
    kind: (raw.kind as StepKind) ?? 'tray',
    name: String(raw.name ?? stepId),
    description: raw.description as string | undefined,
    raw,
  }
}

// ─── Skill discovery ──────────────────────────────────────────────────────────

async function listSkills(): Promise<SkillManifest[]> {
  if (!(await pathExists(Paths.skills))) return []
  const out: SkillManifest[] = []

  // User-installed skills only (top level of skills/, not _system/)
  // System skills are auto-managed and never exposed to the worker skill picker.
  const top = await fs.readdir(Paths.skills, { withFileTypes: true })
  for (const e of top) {
    if (!e.isDirectory()) continue
    if (e.name === '_system') continue
    const m = await readJsonSafe<SkillManifest>(join(Paths.skills, e.name, 'skill.json'))
    if (m) out.push(m)
  }

  return out
}

/**
 * Check every worker in the project and return entries for any worker whose
 * required skills are not installed as user skills.
 * System skills (in Paths.systemSkills) are auto-restored on launch and never
 * appear in a worker's skills[] array, so we only check Paths.skills here.
 */
async function checkProjectSkills(projectName: string): Promise<MissingSkillsEntry[]> {
  const result: MissingSkillsEntry[] = []
  const wfRoot = join(projectDir(projectName), 'workflows')
  if (!(await pathExists(wfRoot))) return result

  const wfs = await fs.readdir(wfRoot, { withFileTypes: true })
  for (const wfEntry of wfs) {
    if (!wfEntry.isDirectory()) continue
    const stepsRoot = join(wfRoot, wfEntry.name, 'steps')
    if (!(await pathExists(stepsRoot))) continue

    const steps = await fs.readdir(stepsRoot, { withFileTypes: true })
    for (const stepEntry of steps) {
      if (!stepEntry.isDirectory()) continue
      const raw = await readJsonSafe<{ kind?: string; skills?: string[] }>(
        join(stepsRoot, stepEntry.name, 'step.json'),
      )
      if (!raw || raw.kind !== 'worker') continue

      const missing: string[] = []
      for (const skillId of raw.skills ?? []) {
        if (!(await pathExists(join(Paths.skills, skillId, 'skill.json')))) {
          missing.push(skillId)
        }
      }
      if (missing.length > 0) {
        result.push({ stepId: stepEntry.name, workflowId: wfEntry.name, missingSkillIds: missing })
      }
    }
  }
  return result
}

async function getSkill(skillId: string): Promise<SkillManifest | null> {
  // Look in user skills first, then system
  const candidates = [
    join(Paths.skills, skillId, 'skill.json'),
    join(Paths.systemSkills, skillId, 'skill.json'),
  ]
  for (const p of candidates) {
    const m = await readJsonSafe<SkillManifest>(p)
    if (m) return m
  }
  return null
}

// ─── Context pack operations ──────────────────────────────────────────────────

async function listContextFiles(projectName: string): Promise<string[]> {
  const dir = join(projectDir(projectName), 'context')
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
    .sort()
}

async function readContextFile(projectName: string, file: string): Promise<string> {
  const safe = basename(file)
  const p = join(projectDir(projectName), 'context', safe)
  if (!(await pathExists(p))) return ''
  return fs.readFile(p, 'utf-8')
}

async function writeContextFile(projectName: string, file: string, content: string): Promise<void> {
  const safe = basename(file)
  if (!safe.endsWith('.md')) throw new Error('Context files must have a .md extension')
  const dir = join(projectDir(projectName), 'context')
  await fs.mkdir(dir, { recursive: true })
  const p = join(dir, safe)
  const tmp = p + '.tmp'
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, p)
}

async function deleteContextFile(projectName: string, file: string): Promise<void> {
  const safe = basename(file)
  const p = join(projectDir(projectName), 'context', safe)
  if (await pathExists(p)) await fs.unlink(p)
}

export const projectService = {
  listProjects,
  getProject,
  setStatus,
  listWorkflows,
  getWorkflow,
  listSteps,
  getStep,
  listSkills,
  getSkill,
  checkProjectSkills,
  listContextFiles,
  readContextFile,
  writeContextFile,
  deleteContextFile,
  paths: {
    projectDir,
    workflowDir,
    stepDir,
  },
}
