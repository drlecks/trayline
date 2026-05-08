import { join } from 'path'
import fs from 'fs/promises'
import { Paths } from './fs-service'
import type {
  ProjectMeta,
  WorkflowMeta,
  StepKind,
  StepMeta,
  SkillManifest,
} from '../../shared/types'

export type { ProjectMeta, WorkflowMeta, StepKind, StepMeta, SkillManifest }

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

// ─── Project operations ───────────────────────────────────────────────────────

async function listProjects(): Promise<ProjectMeta[]> {
  if (!(await pathExists(Paths.projects))) return []
  const entries = await fs.readdir(Paths.projects, { withFileTypes: true })
  const projects: ProjectMeta[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const meta = await readJsonSafe<ProjectMeta>(join(Paths.projects, entry.name, 'project.json'))
    if (meta) projects.push(meta)
  }
  return projects
}

async function getProject(projectName: string): Promise<ProjectMeta | null> {
  return readJsonSafe<ProjectMeta>(join(projectDir(projectName), 'project.json'))
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

  // User skills (top level of skills/)
  const top = await fs.readdir(Paths.skills, { withFileTypes: true })
  for (const e of top) {
    if (!e.isDirectory()) continue
    if (e.name === '_system') continue
    const m = await readJsonSafe<SkillManifest>(join(Paths.skills, e.name, 'skill.json'))
    if (m) out.push(m)
  }

  // System skills
  if (await pathExists(Paths.systemSkills)) {
    const sys = await fs.readdir(Paths.systemSkills, { withFileTypes: true })
    for (const e of sys) {
      if (!e.isDirectory()) continue
      const m = await readJsonSafe<SkillManifest>(join(Paths.systemSkills, e.name, 'skill.json'))
      if (m) out.push(m)
    }
  }

  return out
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

export const projectService = {
  listProjects,
  getProject,
  listWorkflows,
  getWorkflow,
  listSteps,
  getStep,
  listSkills,
  getSkill,
  paths: {
    projectDir,
    workflowDir,
    stepDir,
  },
}
