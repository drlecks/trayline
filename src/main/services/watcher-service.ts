// File watcher that triggers worker runs when a card lands in the previous
// tray's cards/ready/ folder. One watcher per worker step; the watcher service
// (re)mounts on project open and on workflow changes.

import { join, basename } from 'path'
import fs from 'fs/promises'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
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
  trigger?: { mode?: 'on_ready' | 'scheduled' | 'manual' }
}

interface MountedWorkflow {
  project: string
  workflow: string
  watchers: FSWatcher[]
}

const mounted = new Map<string, MountedWorkflow>()

function key(project: string, workflow: string): string {
  return `${project}/${workflow}`
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try { return await fsService.readJson<T>(p) } catch { return null }
}

/** Mount watchers for every worker step in the workflow. Idempotent. */
async function mountWorkflow(project: string, workflow: string): Promise<void> {
  const k = key(project, workflow)
  if (mounted.has(k)) return

  const wf = await readJsonSafe<WorkflowJson>(
    join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
  )
  if (!wf) return

  const watchers: FSWatcher[] = []
  for (let i = 0; i < wf.step_ids.length; i++) {
    const stepId = wf.step_ids[i]
    const stepJson = await readJsonSafe<StepJson>(
      join(projectService.paths.stepDir(project, workflow, stepId), 'step.json'),
    )
    if (!stepJson) continue
    const prevId = i > 0 ? wf.step_ids[i - 1] : null

    if (stepJson.kind === 'worker') {
      if ((stepJson.trigger?.mode ?? 'on_ready') !== 'on_ready') continue
      if (!prevId) continue
      const readyDir = join(projectService.paths.stepDir(project, workflow, prevId), 'cards', 'ready')
      if (!(await pathExists(readyDir))) {
        await fs.mkdir(readyDir, { recursive: true })
      }
      const watcher = chokidarWatch(readyDir, {
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 300 },
      })
      watcher.on('add', (filePath) => {
        const name = basename(filePath)
        if (!name.endsWith('.json') || name.endsWith('.tmp')) return
        const cardId = name.replace(/\.json$/, '')
        void workerRunner.triggerRun({ project, workflow, stepId, cardId }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[watcher] triggerRun failed for ${cardId}:`, err)
        })
      })
      watchers.push(watcher)
    } else if (stepJson.kind === 'outlet') {
      if ((stepJson.trigger?.mode ?? 'on_ready') !== 'on_ready') continue
      if (!prevId) continue
      const readyDir = join(projectService.paths.stepDir(project, workflow, prevId), 'cards', 'ready')
      if (!(await pathExists(readyDir))) {
        await fs.mkdir(readyDir, { recursive: true })
      }
      const outletConfig = stepJson as unknown as OutletStepConfig
      const watcher = chokidarWatch(readyDir, {
        ignoreInitial: true,
        depth: 0,
        awaitWriteFinish: { stabilityThreshold: 300 },
      })
      watcher.on('add', (filePath) => {
        const name = basename(filePath)
        if (!name.endsWith('.json') || name.endsWith('.tmp')) return
        const cardId = name.replace(/\.json$/, '')
        void outletRunner.runOutlet(project, workflow, stepId, outletConfig, cardId, prevId).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(`[watcher] outlet run failed for ${cardId}:`, err)
        })
      })
      watchers.push(watcher)
    } else {
      continue
    }
  }

  mounted.set(k, { project, workflow, watchers })
}

async function unmountWorkflow(project: string, workflow: string): Promise<void> {
  const k = key(project, workflow)
  const m = mounted.get(k)
  if (!m) return
  await Promise.all(m.watchers.map((w) => w.close()))
  mounted.delete(k)
}

/** Mount every workflow in every project. Used at app startup. */
async function mountAll(): Promise<void> {
  const projects = await projectService.listProjects()
  for (const p of projects) {
    const workflows = await projectService.listWorkflows(p.name)
    for (const w of workflows) {
      await mountWorkflow(p.name, w.name)
    }
  }
}

async function unmountAll(): Promise<void> {
  for (const k of [...mounted.keys()]) {
    const m = mounted.get(k)!
    await Promise.all(m.watchers.map((w) => w.close()))
  }
  mounted.clear()
}

/** Re-mount a workflow after its structure changes (step added/removed/edited). */
async function remountWorkflow(project: string, workflow: string): Promise<void> {
  await unmountWorkflow(project, workflow)
  await mountWorkflow(project, workflow)
}

export const watcherService = {
  mountWorkflow,
  unmountWorkflow,
  remountWorkflow,
  mountAll,
  unmountAll,
}
