// Cron scheduler for workers with trigger.mode === 'scheduled'.
//
// Mirrors the structure of watcher-service: mount/unmount per workflow,
// mountAll() on app launch, remountWorkflow() after any step edit,
// stopAll() on before-quit.

import cron, { type ScheduledTask } from 'node-cron'
import { join } from 'path'
import fs from 'fs/promises'
import { projectService } from './project-service'
import { fsService } from './fs-service'
import { workerRunner } from './worker-runner'
import { outletRunner } from './outlet-runner'
import type { OutletStepConfig } from '../../shared/types'

interface WorkflowJson {
  step_ids: string[]
}

interface StepJson {
  id: string
  kind: 'tray' | 'worker' | 'outlet'
  trigger?: { mode?: 'on_ready' | 'scheduled' | 'manual'; schedule_cron?: string | null }
}

// taskKey → live ScheduledTask
const tasks = new Map<string, ScheduledTask>()

function taskKey(project: string, workflow: string, stepId: string): string {
  return `${project}/${workflow}/${stepId}`
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try { return await fsService.readJson<T>(p) } catch { return null }
}

/** Register cron tasks for all scheduled workers in a workflow. */
async function mountWorkflow(project: string, workflow: string): Promise<void> {
  const wf = await readJsonSafe<WorkflowJson>(
    join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
  )
  if (!wf) return

  for (let i = 0; i < wf.step_ids.length; i++) {
    const stepId = wf.step_ids[i]
    const stepJson = await readJsonSafe<StepJson>(
      join(projectService.paths.stepDir(project, workflow, stepId), 'step.json'),
    )
    if (!stepJson) continue

    if (stepJson.kind === 'worker') {
      if (stepJson.trigger?.mode !== 'scheduled') continue

      const expr = stepJson.trigger?.schedule_cron
      if (!expr || !cron.validate(expr)) continue

      const k = taskKey(project, workflow, stepId)
      tasks.get(k)?.stop()

      const prevStepId = i > 0 ? wf.step_ids[i - 1] : null
      if (!prevStepId) continue

      const task = cron.schedule(expr, async () => {
        const readyDir = join(
          projectService.paths.stepDir(project, workflow, prevStepId),
          'cards', 'ready',
        )
        if (!(await pathExists(readyDir))) return
        const files = await fs.readdir(readyDir)
        for (const f of files) {
          if (!f.endsWith('.json') || f.endsWith('.tmp')) continue
          const cardId = f.replace(/\.json$/, '')
          void workerRunner.triggerRun({ project, workflow, stepId, cardId }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`[scheduler] triggerRun failed for ${cardId}:`, err)
          })
        }
      })

      tasks.set(k, task)
    } else if (stepJson.kind === 'outlet') {
      if (stepJson.trigger?.mode !== 'scheduled') continue

      const expr = stepJson.trigger?.schedule_cron
      if (!expr || !cron.validate(expr)) continue

      const k = taskKey(project, workflow, stepId)
      tasks.get(k)?.stop()

      const prevStepId = i > 0 ? wf.step_ids[i - 1] : null
      if (!prevStepId) continue

      const task = cron.schedule(expr, async () => {
        const readyDir = join(
          projectService.paths.stepDir(project, workflow, prevStepId),
          'cards', 'ready',
        )
        if (!(await pathExists(readyDir))) return
        const cfg = await readJsonSafe<OutletStepConfig>(
          join(projectService.paths.stepDir(project, workflow, stepId), 'step.json'),
        )
        if (!cfg) return
        const files = await fs.readdir(readyDir)
        for (const f of files) {
          if (!f.endsWith('.json') || f.endsWith('.tmp')) continue
          const cardId = f.replace(/\.json$/, '')
          void outletRunner.runOutlet(project, workflow, stepId, cfg, cardId, prevStepId).catch((err) => {
            // eslint-disable-next-line no-console
            console.error(`[scheduler] outlet run failed for ${cardId}:`, err)
          })
        }
      })

      tasks.set(k, task)
    }
  }
}

/** Stop and deregister all cron tasks for a workflow. */
function unmountWorkflow(project: string, workflow: string): void {
  for (const [k, task] of tasks.entries()) {
    if (k.startsWith(`${project}/${workflow}/`)) {
      task.stop()
      tasks.delete(k)
    }
  }
}

/** Re-mount after a step is added, removed, or edited. */
async function remountWorkflow(project: string, workflow: string): Promise<void> {
  unmountWorkflow(project, workflow)
  await mountWorkflow(project, workflow)
}

/** Register all scheduled workers across all projects. Called on app launch. */
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
  for (const task of tasks.values()) task.stop()
  tasks.clear()
}

export const schedulerService = {
  mountWorkflow,
  unmountWorkflow,
  remountWorkflow,
  mountAll,
  stopAll,
}
