// Adds/updates step folders inside an existing project.

import { join } from 'path'
import fs from 'fs/promises'
import { fsService } from './fs-service'
import { projectService } from './project-service'
import type { PlanFieldDef, PlanTrayStep, PlanWorkerStep } from '../../shared/workflow-plan'
import type { SourceStepConfig } from '../../shared/types'

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

interface AddWorkerInput {
  project: string
  workflow: string
  name: string
  description?: string
  icon?: string
  process_md?: string
}

const DEFAULT_PROCESS_MD = `# Worker Instructions

You are processing a card in the workflow.

## Input

The card you are processing is provided as JSON:

\`\`\`
{{card.data}}
\`\`\`

## What to do

(Replace this section with specific instructions for what this worker should do.)

## Output

Reply with a single JSON object describing the result. Do not include any prose.

\`\`\`json
{
  "summary": "<one-line summary>",
  "fields": {
    "<field_id>": "<value>"
  }
}
\`\`\`
`

async function addWorker(input: AddWorkerInput): Promise<PlanWorkerStep & { id: string }> {
  const prefix = await nextStepPrefix(input.project, input.workflow)
  const id = `${prefix}-${slugify(input.name) || 'worker'}`
  const stepDir = projectService.paths.stepDir(input.project, input.workflow, id)

  if (await pathExists(stepDir)) {
    throw new Error(`Step already exists: ${id}`)
  }

  await fs.mkdir(stepDir, { recursive: true })
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await fs.mkdir(join(stepDir, 'runs'), { recursive: true })

  const stepJson = {
    id,
    kind: 'worker' as const,
    name: input.name,
    description: input.description ?? '',
    color: '#F7A14F',
    icon: input.icon ?? 'cpu',
    context_packs: [] as string[],
    execution: {
      command: 'claude',
      args: ['-p'],
      timeout_seconds: 180,
      retry_attempts: 1,
      adapter: 'claude-code',
    },
    trigger: {
      mode: 'on_ready' as const,
      schedule_cron: null as string | null,
    },
    on_success: 'advance' as const,
    on_failure: 'send_to_errors' as const,
  }

  await fsService.writeJsonAtomic(join(stepDir, 'step.json'), stepJson)
  await fs.writeFile(
    join(stepDir, 'process.md'),
    input.process_md && input.process_md.trim().length > 0 ? input.process_md : DEFAULT_PROCESS_MD,
    'utf-8',
  )
  await fsService.writeJsonAtomic(join(stepDir, 'state', 'counters.json'), {
    runs_total: 0,
    successful: 0,
    failed: 0,
  })
  await fs.writeFile(join(stepDir, 'state', 'memory.md'), '', 'utf-8')

  await insertStepIntoWorkflow(input.project, input.workflow, id)

  return {
    kind: 'worker',
    id,
    name: input.name,
    description: input.description,
    icon: input.icon ?? 'cpu',
    context_packs: [],
    process_md: input.process_md ?? DEFAULT_PROCESS_MD,
  }
}

interface UpdateStepConfigInput {
  project: string
  workflow: string
  stepId: string
  patch: Record<string, unknown>
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

interface UpdateWorkerProcessInput {
  project: string
  workflow: string
  stepId: string
  processMd: string
}

async function updateWorkerProcess(input: UpdateWorkerProcessInput): Promise<void> {
  const path = join(
    projectService.paths.stepDir(input.project, input.workflow, input.stepId),
    'process.md',
  )
  await fs.writeFile(path, input.processMd, 'utf-8')
}

async function readWorkerProcess(
  project: string,
  workflow: string,
  stepId: string,
): Promise<string> {
  const path = join(projectService.paths.stepDir(project, workflow, stepId), 'process.md')
  if (!(await pathExists(path))) return ''
  return fs.readFile(path, 'utf-8')
}

// ── Source steps ──────────────────────────────────────────────────────────────

interface AddSourceInput {
  project: string
  workflow: string
  name: string
  description?: string
  schedule_cron?: string
  dedup_key?: string
}

async function addSource(input: AddSourceInput): Promise<SourceStepConfig & { id: string }> {
  // Source steps always go at position 0 — before all other steps
  const stepsRoot = join(projectService.paths.workflowDir(input.project, input.workflow), 'steps')
  if (!(await pathExists(stepsRoot))) await fs.mkdir(stepsRoot, { recursive: true })

  const id = `00-${slugify(input.name) || 'source'}`
  const stepDir = projectService.paths.stepDir(input.project, input.workflow, id)

  if (await pathExists(stepDir)) {
    throw new Error(`Step already exists: ${id}`)
  }

  await fs.mkdir(stepDir, { recursive: true })
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'ready'), { recursive: true })
  await fs.mkdir(join(stepDir, 'cards', 'archived'), { recursive: true })
  await fs.mkdir(join(stepDir, 'runs'), { recursive: true })

  const stepJson: SourceStepConfig = {
    id,
    kind: 'source',
    name: input.name,
    description: input.description ?? '',
    color: '#4CB87E',
    icon: 'rss',
    schedule_cron: input.schedule_cron ?? '0 * * * *',
    dedup: {
      key: input.dedup_key ?? 'id',
      max_memory: 10000,
      first_run: 'skip_existing',
    },
    paused: false,
    channel: null,
  }

  await fsService.writeJsonAtomic(join(stepDir, 'step.json'), stepJson)
  await fsService.writeJsonAtomic(join(stepDir, 'state', 'counters.json'), {
    runs_total: 0,
    items_found: 0,
    items_new: 0,
    last_run_at: null,
  })

  // Insert at position 0 in workflow.json (before all other steps)
  await insertSourceIntoWorkflow(input.project, input.workflow, id)

  return { ...stepJson, id }
}

async function insertSourceIntoWorkflow(project: string, workflow: string, sourceId: string): Promise<void> {
  const wfPath = join(projectService.paths.workflowDir(project, workflow), 'workflow.json')
  const wf = await fsService.readJson<{ id: string; name: string; display_name: string; step_ids: string[] }>(wfPath)

  const existing = wf.step_ids.filter((id) => id !== sourceId)
  // Source always first, before all other steps including 99-errors
  await fsService.writeJsonAtomic(wfPath, { ...wf, step_ids: [sourceId, ...existing] })
}

export const stepService = {
  addTray,
  addWorker,
  addSource,
  updateStep,
  updateWorkerProcess,
  readWorkerProcess,
  deleteStep,
}
