// Watches all manual-approval tray pending/ folders across every project and
// workflow. Pushes queue:onUpdate to all windows when any pending/ dir changes.
// Delegates OS notifications to notification-service.

import { join, basename } from 'path'
import fs from 'fs/promises'
import { BrowserWindow } from 'electron'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import { projectService } from './project-service'
import { fsService } from './fs-service'
import { notificationService } from './notification-service'
import type { QueueEntry } from '../../shared/queue'

export type { QueueEntry }

interface StepJson {
  id: string
  kind: 'tray' | 'worker'
  name: string
  approval_mode?: 'manual' | 'auto'
}

interface WatchedTray {
  project: string
  projectDisplayName: string
  workflow: string
  stepId: string
  stepName: string
  pendingDir: string
  watcher: FSWatcher
}

const watchedTrays = new Map<string, WatchedTray>()

function trayKey(project: string, workflow: string, stepId: string): string {
  return `${project}/${workflow}/${stepId}`
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readJsonSafe<T>(p: string): Promise<T | null> {
  try { return await fsService.readJson<T>(p) } catch { return null }
}

async function scanPendingDir(pendingDir: string): Promise<{ cardId: string; createdAt: string }[]> {
  if (!(await pathExists(pendingDir))) return []
  try {
    const files = await fs.readdir(pendingDir)
    const results: { cardId: string; createdAt: string }[] = []
    for (const f of files) {
      if (!f.endsWith('.json') || f.endsWith('.tmp')) continue
      const card = await readJsonSafe<{ id: string; created_at: string }>(join(pendingDir, f))
      if (card) results.push({ cardId: card.id, createdAt: card.created_at })
    }
    return results
  } catch {
    return []
  }
}

async function getPending(): Promise<QueueEntry[]> {
  const entries: QueueEntry[] = []
  for (const tray of watchedTrays.values()) {
    const cards = await scanPendingDir(tray.pendingDir)
    for (const c of cards) {
      entries.push({
        project: tray.project,
        projectDisplayName: tray.projectDisplayName,
        workflow: tray.workflow,
        stepId: tray.stepId,
        stepName: tray.stepName,
        cardId: c.cardId,
        cardCreatedAt: c.createdAt,
      })
    }
  }
  entries.sort((a, b) => a.cardCreatedAt.localeCompare(b.cardCreatedAt))
  return entries
}

function pushUpdate(): void {
  getPending()
    .then((entries) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('queue:onUpdate', entries)
      }
    })
    .catch(() => { /* ignore */ })
}

async function mountWorkflow(project: string, workflow: string): Promise<void> {
  const projectMeta = await readJsonSafe<{ display_name?: string }>(
    join(projectService.paths.projectDir(project), 'project.json'),
  )
  const projectDisplayName = projectMeta?.display_name ?? project

  const wf = await readJsonSafe<{ step_ids: string[] }>(
    join(projectService.paths.workflowDir(project, workflow), 'workflow.json'),
  )
  if (!wf) return

  for (const stepId of wf.step_ids) {
    if (stepId === '99-errors') continue
    const k = trayKey(project, workflow, stepId)
    if (watchedTrays.has(k)) continue

    const stepDir = projectService.paths.stepDir(project, workflow, stepId)
    const step = await readJsonSafe<StepJson>(join(stepDir, 'step.json'))
    if (!step || step.kind !== 'tray') continue
    if ((step.approval_mode ?? 'manual') !== 'manual') continue

    const pendingDir = join(stepDir, 'cards', 'pending')
    if (!(await pathExists(pendingDir))) {
      await fs.mkdir(pendingDir, { recursive: true })
    }

    const stepName = step.name
    const watcher = chokidarWatch(pendingDir, {
      ignoreInitial: true,
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 300 },
    })

    watcher.on('add', (filePath) => {
      const name = basename(filePath)
      if (!name.endsWith('.json') || name.endsWith('.tmp')) return
      const cardId = name.replace(/\.json$/, '')
      readJsonSafe<{ id: string; data?: Record<string, unknown> }>(filePath)
        .then((card) => {
          const cardTitle = card?.data
            ? String(card.data.title ?? card.data.name ?? card.data.subject ?? '')
            : ''
          notificationService.notifyCardNeedsReview({
            projectName: project,
            workflowName: workflow,
            trayName: stepName,
            cardId,
            cardTitle: cardTitle || undefined,
          })
        })
        .catch(() => {
          notificationService.notifyCardNeedsReview({
            projectName: project,
            workflowName: workflow,
            trayName: stepName,
            cardId,
          })
        })
      pushUpdate()
      void notificationService.refreshBadgeCount()
    })
    watcher.on('unlink', () => {
      pushUpdate()
      void notificationService.refreshBadgeCount()
    })

    watchedTrays.set(k, {
      project, projectDisplayName, workflow, stepId, stepName, pendingDir, watcher,
    })
  }
}

async function unmountWorkflow(project: string, workflow: string): Promise<void> {
  for (const [k, tray] of watchedTrays) {
    if (tray.project === project && tray.workflow === workflow) {
      await tray.watcher.close()
      watchedTrays.delete(k)
    }
  }
}

async function remountWorkflow(project: string, workflow: string): Promise<void> {
  await unmountWorkflow(project, workflow)
  await mountWorkflow(project, workflow)
}

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
  for (const tray of watchedTrays.values()) {
    await tray.watcher.close()
  }
  watchedTrays.clear()
}

export const queueService = {
  mountWorkflow,
  unmountWorkflow,
  remountWorkflow,
  mountAll,
  unmountAll,
  getPending,
}
