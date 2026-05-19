// Central service that mounts/unmounts all four sub-services (watcher, scheduler,
// source-scheduler, queue) for a project as a unit. The project's status field is
// the gate at startup: only active projects mount. Toggling status calls
// mountProject / unmountProject directly — no restart needed.

import { projectService } from './project-service'
import { watcherService } from './watcher-service'
import { schedulerService } from './scheduler-service'
import { sourceScheduler } from './source-scheduler'
import { queueService } from './queue-service'

const mounted = new Set<string>()

/** Mount all four sub-services for every workflow in a project. Idempotent. */
async function mountProject(projectName: string): Promise<void> {
  if (mounted.has(projectName)) return
  const workflows = await projectService.listWorkflows(projectName).catch(() => [])
  for (const w of workflows) {
    await watcherService.mountWorkflow(projectName, w.name)
    await schedulerService.mountWorkflow(projectName, w.name)
    await sourceScheduler.mountWorkflow(projectName, w.name)
    await queueService.mountWorkflow(projectName, w.name)
  }
  mounted.add(projectName)
}

/** Unmount all four sub-services for every workflow in a project. No-op if not mounted. */
async function unmountProject(projectName: string): Promise<void> {
  if (!mounted.has(projectName)) return
  const workflows = await projectService.listWorkflows(projectName).catch(() => [])
  for (const w of workflows) {
    await watcherService.unmountWorkflow(projectName, w.name)
    schedulerService.unmountWorkflow(projectName, w.name)
    sourceScheduler.unmountWorkflow(projectName, w.name)
    await queueService.unmountWorkflow(projectName, w.name)
  }
  mounted.delete(projectName)
}

/**
 * Unmount a single workflow's sub-services without removing the project from
 * the mounted set. Used before structural renames (e.g. move-step-up) to
 * release chokidar file handles on Windows before the fs.rename call.
 */
async function unmountWorkflow(projectName: string, workflowName: string): Promise<void> {
  if (!mounted.has(projectName)) return
  await watcherService.unmountWorkflow(projectName, workflowName)
  schedulerService.unmountWorkflow(projectName, workflowName)
  sourceScheduler.unmountWorkflow(projectName, workflowName)
  await queueService.unmountWorkflow(projectName, workflowName)
}

/**
 * Re-mount a single workflow after its step configuration changes.
 * No-op if the project is not currently mounted (project is inactive).
 */
async function remountWorkflow(projectName: string, workflowName: string): Promise<void> {
  if (!mounted.has(projectName)) return
  await watcherService.remountWorkflow(projectName, workflowName)
  await schedulerService.remountWorkflow(projectName, workflowName)
  await sourceScheduler.remountWorkflow(projectName, workflowName)
  await queueService.remountWorkflow(projectName, workflowName)
}

function isMounted(projectName: string): boolean {
  return mounted.has(projectName)
}

/** Mount all active projects. Called once at app startup. */
async function mountAll(): Promise<void> {
  const projects = await projectService.listProjects()
  for (const p of projects) {
    if (p.status !== 'active') continue
    await mountProject(p.name)
  }
}

/** Unmount all currently mounted projects. Called on before-quit. */
async function unmountAll(): Promise<void> {
  for (const name of [...mounted]) {
    await unmountProject(name)
  }
}

export const orchestrator = {
  mountProject,
  unmountProject,
  unmountWorkflow,
  remountWorkflow,
  isMounted,
  mountAll,
  unmountAll,
}
