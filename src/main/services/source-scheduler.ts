// Cron scheduler for Source steps (kind === 'source').
//
// Mirrors scheduler-service.ts but for source steps:
// on each tick it calls sourceRunner.runSource() rather than workerRunner.triggerRun().
// Overlapping runs are prevented by the sourceRunner's in-flight guard.

import cron, { type ScheduledTask } from 'node-cron'
import { join } from 'path'
import { projectService } from './project-service'
import { fsService } from './fs-service'
import { sourceRunner } from './source-runner'
import type { SourceStepConfig } from '../../shared/types'

interface WorkflowJson {
  step_ids: string[]
}

interface StepKindProbe {
  kind: string
}

// taskKey → { task, nextRunAt }
const tasks = new Map<string, { task: ScheduledTask; nextRunAt: string | null }>()

function taskKey(project: string, workflow: string, stepId: string): string {
  return `${project}/${workflow}/${stepId}`
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try { return await fsService.readJson<T>(p) } catch { return null }
}

function computeNextRunAt(expr: string): string | null {
  try {
    // node-cron doesn't expose next-run time, so we calculate it manually
    // by checking intervals against the cron expression
    const now = new Date()
    for (let i = 1; i <= 525600; i++) {
      // Check each minute for up to 1 year
      const candidate = new Date(now.getTime() + i * 60000)
      // Use the cron validate approach: convert to cron fields
      const fields = expr.trim().split(/\s+/)
      if (fields.length < 5) return null
      const [minF, hourF, domF, monF, dowF] = fields
      if (matchCronField(minF, candidate.getMinutes(), 0, 59)
        && matchCronField(hourF, candidate.getHours(), 0, 23)
        && matchCronField(domF, candidate.getDate(), 1, 31)
        && matchCronField(monF, candidate.getMonth() + 1, 1, 12)
        && matchCronField(dowF, candidate.getDay(), 0, 6)) {
        candidate.setSeconds(0, 0)
        return candidate.toISOString()
      }
    }
    return null
  } catch {
    return null
  }
}

function matchCronField(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true
  if (field.includes('/')) {
    const [rangeStr, stepStr] = field.split('/')
    const step = parseInt(stepStr, 10)
    if (isNaN(step)) return false
    const start = rangeStr === '*' ? min : parseInt(rangeStr, 10)
    return value >= start && (value - start) % step === 0
  }
  if (field.includes(',')) {
    return field.split(',').some((f) => matchCronField(f.trim(), value, min, max))
  }
  if (field.includes('-')) {
    const [lo, hi] = field.split('-').map(Number)
    return value >= lo && value <= hi
  }
  return parseInt(field, 10) === value
}

/** Register cron tasks for all source steps in a workflow. */
async function mountWorkflow(project: string, workflow: string): Promise<void> {
  const wf = await readJsonSafe<WorkflowJson>(
    join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
  )
  if (!wf) return

  for (const stepId of wf.step_ids) {
    const stepJson = await readJsonSafe<SourceStepConfig & StepKindProbe>(
      join(projectService.paths.stepDir(project, workflow, stepId), 'step.json'),
    )
    if (!stepJson || stepJson.kind !== 'source') continue
    if (stepJson.paused) continue

    const expr = stepJson.schedule_cron
    if (!expr || !cron.validate(expr)) continue

    const k = taskKey(project, workflow, stepId)
    tasks.get(k)?.task.stop()

    const task = cron.schedule(expr, () => {
      void sourceRunner.runSource({ project, workflow, stepId, stepConfig: stepJson }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[source-scheduler] runSource failed for ${k}:`, err)
      })
    })

    tasks.set(k, { task, nextRunAt: computeNextRunAt(expr) })
  }
}

/** Stop and deregister all cron tasks for a workflow. */
function unmountWorkflow(project: string, workflow: string): void {
  for (const [k, entry] of tasks.entries()) {
    if (k.startsWith(`${project}/${workflow}/`)) {
      entry.task.stop()
      tasks.delete(k)
    }
  }
}

/** Re-mount after a step is added, removed, or edited. */
async function remountWorkflow(project: string, workflow: string): Promise<void> {
  unmountWorkflow(project, workflow)
  await mountWorkflow(project, workflow)
}

/** Register all source steps across all projects. Called on app launch. */
async function mountAll(): Promise<void> {
  const projects = await projectService.listProjects()
  for (const p of projects) {
    const workflows = await projectService.listWorkflows(p.name)
    for (const w of workflows) {
      await mountWorkflow(p.name, w.name)
    }
  }
}

/** Stop every cron task. Called on before-quit. */
function stopAll(): void {
  for (const entry of tasks.values()) entry.task.stop()
  tasks.clear()
}

/** Get the next scheduled run time for a source step (ISO string or null). */
function getNextRunAt(project: string, workflow: string, stepId: string): string | null {
  return tasks.get(taskKey(project, workflow, stepId))?.nextRunAt ?? null
}

export const sourceScheduler = {
  mountWorkflow,
  unmountWorkflow,
  remountWorkflow,
  mountAll,
  stopAll,
  getNextRunAt,
}
