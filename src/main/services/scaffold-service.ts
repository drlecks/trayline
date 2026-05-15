// Materializes a JSON workflow plan to disk under ~/Documents/Trayline/projects/<name>.
// This is the "trayline-scaffold" system skill made concrete in code — the
// system skill's skill.md documents the contract; this file implements it.

import { join } from 'path'
import fs from 'fs/promises'
import { Paths } from './fs-service'
import { systemSkillsService } from './system-skills-service'
import type { WorkflowPlan, PlanStep } from '../../shared/workflow-plan'
import type { ProjectMeta } from '../../shared/types'

const TEMPLATE_DIR_REL = join('trayline-scaffold', 'templates')

async function readTemplate(name: string): Promise<string> {
  const path = join(Paths.systemSkills, TEMPLATE_DIR_REL, name)
  return fs.readFile(path, 'utf-8')
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function writeFileAtomic(target: string, content: string): Promise<void> {
  const tmp = target + '.tmp'
  await fs.writeFile(tmp, content, 'utf-8')
  await fs.rename(tmp, target)
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '',
  )
}

function defaultIcon(step: PlanStep): string {
  if (step.icon) return step.icon
  if (step.kind === 'tray') return 'inbox'
  if (step.kind === 'source') return 'rss'
  return 'cpu'
}

interface ScaffoldOptions {
  /** If false, refuses to overwrite an existing project folder. Default false. */
  overwrite?: boolean
  /** If set, the existing project (if any) is moved to <project>/.history/<archiveName>. */
  archiveExistingTo?: string
}

interface ScaffoldResult {
  project: ProjectMeta
  projectPath: string
  unconfiguredMcps: string[]
  hasSourceStep: boolean
}

async function scaffold(plan: WorkflowPlan, options: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  const projectPath = join(Paths.projects, plan.project.name)

  if (await pathExists(projectPath)) {
    if (options.archiveExistingTo) {
      const archiveDir = join(projectPath, '.history', options.archiveExistingTo)
      await fs.mkdir(join(projectPath, '.history'), { recursive: true })
      await archiveCurrent(projectPath, archiveDir)
    } else if (!options.overwrite) {
      throw new Error(`Project already exists: ${plan.project.name}`)
    } else {
      await fs.rm(projectPath, { recursive: true, force: true })
    }
  }

  // Ensure system skills are available before we start (templates live there)
  await systemSkillsService.ensureInstalled()

  // ── 1. Project root ─────────────────────────────────────────────────────────
  await fs.mkdir(projectPath, { recursive: true })
  await fs.mkdir(join(projectPath, 'context'), { recursive: true })
  await fs.mkdir(join(projectPath, 'exports'), { recursive: true })

  const now = new Date().toISOString()
  const projectMeta: ProjectMeta = {
    id: plan.project.name,
    name: plan.project.name,
    display_name: plan.project.display_name,
    description: plan.project.description,
    created_at: now,
    status: 'active',
    updated_at: now,
  }
  await writeFileAtomic(join(projectPath, 'project.json'), JSON.stringify(projectMeta, null, 2))
  await writeFileAtomic(join(projectPath, 'README.md'), `# ${plan.project.display_name}\n\n${plan.project.description}\n`)

  // Base context file: always auto-included in every worker run (prefix '_' marks it as base)
  await writeFileAtomic(
    join(projectPath, 'context', '_brand-voice.md'),
    `# Brand Voice\n\n_Describe your brand's communication style here. All workers will use this as a reference for tone, style, and language._\n\n## Tone\n\n## Language guidelines\n\n## Things to avoid\n`,
  )

  // ── 2. Workflow + steps ─────────────────────────────────────────────────────
  const workflowPath = join(projectPath, 'workflows', plan.workflow.name)
  const stepsRoot = join(workflowPath, 'steps')
  await fs.mkdir(stepsRoot, { recursive: true })

  const trayTemplate = await readTemplate('tray.step.json')
  const workerTemplate = await readTemplate('worker.step.json')
  const sourceTemplate = await readTemplate('source.step.json')
  const sourceMdTemplate = await readTemplate('source.md')
  const processTemplate = await readTemplate('process.md')
  const workflowTemplate = await readTemplate('workflow.json')

  const stepIds: string[] = []
  const unconfiguredMcps = new Set<string>()
  let hasSourceStep = false

  for (const step of plan.workflow.steps) {
    stepIds.push(step.id)
    const stepPath = join(stepsRoot, step.id)
    await fs.mkdir(stepPath, { recursive: true })
    await fs.mkdir(join(stepPath, 'state'), { recursive: true })

    if (step.kind === 'tray') {
      const json = JSON.parse(fillTemplate(trayTemplate, {
        id: step.id,
        name: step.name,
        description: step.description ?? '',
        icon: defaultIcon(step),
        approval_mode: step.approval_mode,
      }))
      json.input_schema = step.input_schema
      json.allow_manual_create = step.allow_manual_create ?? true

      await writeFileAtomic(join(stepPath, 'step.json'), JSON.stringify(json, null, 2))
      await fs.mkdir(join(stepPath, 'cards', 'pending'), { recursive: true })
      await fs.mkdir(join(stepPath, 'cards', 'ready'), { recursive: true })
      await fs.mkdir(join(stepPath, 'cards', 'archived'), { recursive: true })
      await writeFileAtomic(
        join(stepPath, 'state', 'counters.json'),
        JSON.stringify({ received_total: 0, today: 0 }, null, 2),
      )
    } else if (step.kind === 'source') {
      hasSourceStep = true
      const json = JSON.parse(fillTemplate(sourceTemplate, {
        id: step.id,
        name: step.name,
        description: step.description ?? '',
        schedule_cron: step.schedule_cron,
        dedup_key: step.dedup.key,
        first_run: step.dedup.first_run,
      }))
      if (step.dedup.first_run_n != null) json.dedup.first_run_n = step.dedup.first_run_n

      await writeFileAtomic(join(stepPath, 'step.json'), JSON.stringify(json, null, 2))
      await writeFileAtomic(
        join(stepPath, 'source.md'),
        step.source_md && step.source_md.trim().length > 0 ? step.source_md : sourceMdTemplate,
      )
      await fs.mkdir(join(stepPath, 'cards', 'ready'), { recursive: true })
      await fs.mkdir(join(stepPath, 'cards', 'archived'), { recursive: true })
      await fs.mkdir(join(stepPath, 'runs'), { recursive: true })
      await writeFileAtomic(
        join(stepPath, 'state', 'counters.json'),
        JSON.stringify({ runs_total: 0, items_found: 0, items_new: 0, last_run_at: null }, null, 2),
      )
      await writeFileAtomic(join(stepPath, 'state', 'seen-ids.json'), '[]')
    } else {
      const json = JSON.parse(fillTemplate(workerTemplate, {
        id: step.id,
        name: step.name,
        description: step.description ?? '',
        icon: defaultIcon(step),
      }))
      json.skills = step.skills ?? []
      json.mcps = step.mcps ?? []
      json.context_packs = step.context_packs ?? []
      if (step.batch_mode) {
        json.batch_mode = true
        json.batch_max = step.batch_max ?? null
        // Batch workers default to manual trigger
        if (json.trigger?.mode === 'on_ready') json.trigger.mode = 'manual'
      }

      // Track MCPs the user has not yet installed
      for (const mcp of json.mcps as string[]) unconfiguredMcps.add(mcp)

      await writeFileAtomic(join(stepPath, 'step.json'), JSON.stringify(json, null, 2))
      await writeFileAtomic(
        join(stepPath, 'process.md'),
        step.process_md && step.process_md.trim().length > 0
          ? step.process_md
          : processTemplate,
      )
      await fs.mkdir(join(stepPath, 'runs'), { recursive: true })
      await writeFileAtomic(
        join(stepPath, 'state', 'counters.json'),
        JSON.stringify({ runs_total: 0, successful: 0, failed: 0 }, null, 2),
      )
      await writeFileAtomic(join(stepPath, 'state', 'memory.md'), '')
    }
  }

  // Always-present 99-errors tray
  const errorPath = join(stepsRoot, '99-errors')
  if (!(await pathExists(errorPath))) {
    await fs.mkdir(errorPath, { recursive: true })
    await fs.mkdir(join(errorPath, 'cards', 'pending'), { recursive: true })
    await fs.mkdir(join(errorPath, 'cards', 'ready'), { recursive: true })
    await fs.mkdir(join(errorPath, 'cards', 'archived'), { recursive: true })
    const errorJson = JSON.parse(fillTemplate(trayTemplate, {
      id: '99-errors',
      name: 'Errors',
      description: 'Failed runs land here for retry or archival.',
      icon: 'alert-triangle',
      approval_mode: 'manual',
    }))
    errorJson.input_schema = { fields: [] }
    errorJson.allow_manual_create = false
    await writeFileAtomic(join(errorPath, 'step.json'), JSON.stringify(errorJson, null, 2))
  }
  stepIds.push('99-errors')

  // workflow.json
  const wfJson = JSON.parse(fillTemplate(workflowTemplate, {
    id: plan.workflow.name,
    name: plan.workflow.name,
    display_name: plan.workflow.display_name,
  }))
  wfJson.step_ids = stepIds
  await writeFileAtomic(join(workflowPath, 'workflow.json'), JSON.stringify(wfJson, null, 2))

  return {
    project: projectMeta,
    projectPath,
    unconfiguredMcps: [...unconfiguredMcps],
    hasSourceStep,
  }
}

async function archiveCurrent(projectPath: string, archiveDir: string): Promise<void> {
  await fs.mkdir(archiveDir, { recursive: true })
  // Move everything except .history itself
  const entries = await fs.readdir(projectPath, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === '.history') continue
    const src = join(projectPath, entry.name)
    const dest = join(archiveDir, entry.name)
    await fs.rename(src, dest)
  }
}

async function deleteProject(projectName: string): Promise<void> {
  const path = join(Paths.projects, projectName)
  if (!(await pathExists(path))) return
  await fs.rm(path, { recursive: true, force: true })
}

export const scaffoldService = {
  scaffold,
  deleteProject,
}
