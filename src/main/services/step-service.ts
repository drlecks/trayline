// Adds/updates step folders inside an existing project.
// Phase 3 only needs trays; workers come in Phase 4.

import { join } from 'path'
import fs from 'fs/promises'
import { fsService } from './fs-service'
import { projectService } from './project-service'
import type { PlanFieldDef, PlanTrayStep } from '../../shared/workflow-plan'

interface AddTrayInput {
  project: string
  workflow: string
  name: string
  description?: string
  icon?: string
  approval_mode: 'manual' | 'auto'
  fields?: PlanFieldDef[]
  allow_manual_create?: boolean
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

/**
 * Find the next free numeric prefix for a new step. Steps are listed in folder
 * order (01-, 02-, ...), with 99-errors always at the end. We insert before
 * 99-errors using the next sequential number.
 */
async function nextStepPrefix(project: string, workflow: string): Promise<string> {
  const stepsRoot = join(projectService.paths.workflowDir(project, workflow), 'steps')
  if (!(await pathExists(stepsRoot))) return '01'
  const entries = await fs.readdir(stepsRoot, { withFileTypes: true })
  const nums = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name.match(/^(\d{2,3})-/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n < 99)
  const max = nums.length ? Math.max(...nums) : 0
  return String(max + 1).padStart(2, '0')
}

async function addTray(input: AddTrayInput): Promise<PlanTrayStep & { id: string }> {
  const prefix = await nextStepPrefix(input.project, input.workflow)
  const id = `${prefix}-${slugify(input.name) || 'tray'}`
  const stepDir = projectService.paths.stepDir(input.project, input.workflow, id)

  if (await pathExists(stepDir)) {
    throw new Error(`Step already exists: ${id}`)
  }

  await fs.mkdir(stepDir, { recursive: true })
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'pending'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'ready'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'archived'), { recursive: true })

  const stepJson = {
    id,
    kind: 'tray' as const,
    name: input.name,
    description: input.description ?? '',
    color: '#4F8EF7',
    icon: input.icon ?? 'inbox',
    approval_mode: input.approval_mode,
    input_schema: { fields: input.fields ?? [] },
    allow_manual_create: input.allow_manual_create ?? true,
    webhook_enabled: false,
  }

  await fsService.writeJsonAtomic(join(stepDir, 'step.json'), stepJson)
  await fsService.writeJsonAtomic(join(stepDir, 'state', 'counters.json'), {
    received_total: 0,
    today: 0,
  })

  // Insert the new step id into workflow.json's step_ids, keeping 99-errors last
  await insertStepIntoWorkflow(input.project, input.workflow, id)

  return {
    kind: 'tray',
    id,
    name: input.name,
    description: input.description,
    icon: input.icon ?? 'inbox',
    approval_mode: input.approval_mode,
    input_schema: { fields: input.fields ?? [] },
    allow_manual_create: input.allow_manual_create ?? true,
  }
}

async function insertStepIntoWorkflow(project: string, workflow: string, newId: string): Promise<void> {
  const wfPath = join(projectService.paths.workflowDir(project, workflow), 'workflow.json')
  const wf = await fsService.readJson<{ id: string; name: string; display_name: string; step_ids: string[] }>(wfPath)

  const existing = wf.step_ids.filter((id) => id !== newId)
  const errorIdx = existing.indexOf('99-errors')
  const next = errorIdx === -1
    ? [...existing, newId]
    : [...existing.slice(0, errorIdx), newId, ...existing.slice(errorIdx)]

  await fsService.writeJsonAtomic(wfPath, { ...wf, step_ids: next })
}

interface UpdateStepConfigInput {
  project: string
  workflow: string
  stepId: string
  patch: {
    name?: string
    description?: string
    color?: string
    icon?: string
    approval_mode?: 'manual' | 'auto'
    allow_manual_create?: boolean
    input_schema?: { fields: PlanFieldDef[] }
  }
}

async function updateStep(input: UpdateStepConfigInput): Promise<void> {
  const path = join(
    projectService.paths.stepDir(input.project, input.workflow, input.stepId),
    'step.json',
  )
  const current = await fsService.readJson<Record<string, unknown>>(path)
  const next = { ...current, ...input.patch }
  await fsService.writeJsonAtomic(path, next)
}

interface DeleteStepInput {
  project: string
  workflow: string
  stepId: string
}

async function deleteStep(input: DeleteStepInput): Promise<void> {
  if (input.stepId === '99-errors') {
    throw new Error('Cannot delete the errors tray')
  }
  const dir = projectService.paths.stepDir(input.project, input.workflow, input.stepId)
  if (await pathExists(dir)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  // Remove from workflow.json
  const wfPath = join(projectService.paths.workflowDir(input.project, input.workflow), 'workflow.json')
  const wf = await fsService.readJson<{ id: string; name: string; display_name: string; step_ids: string[] }>(wfPath)
  await fsService.writeJsonAtomic(wfPath, {
    ...wf,
    step_ids: wf.step_ids.filter((id) => id !== input.stepId),
  })
}

export const stepService = { addTray, updateStep, deleteStep }
