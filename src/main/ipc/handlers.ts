import { IpcMain, nativeTheme, BrowserWindow } from 'electron'
import { settingsStore, Settings } from '../services/settings-store'
import { auditDb } from '../services/audit-db'
import { projectService } from '../services/project-service'
import { projectCreateService } from '../services/project-create-service'
import { usageService } from '../services/usage-service'
import { adapterRegistry } from '../ai-terminals/registry'
import { stepService } from '../services/step-service'
import { cardService } from '../services/card-service'
import { workerRunner } from '../services/worker-runner'
import { watcherService } from '../services/watcher-service'
import { schedulerService } from '../services/scheduler-service'
import type { BootstrapInfo } from '../../shared/types'
import type { CardStatus } from '../../shared/card'

export type { BootstrapInfo }

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getBootstrapInfo: () => BootstrapInfo,
) {
  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => settingsStore.store)

  ipcMain.handle('settings:set', <K extends keyof Settings>(_: unknown, key: K, value: Settings[K]) => {
    settingsStore.set(key, value)

    if (key === 'theme') {
      const t = value as Settings['theme']
      nativeTheme.themeSource = t === 'system' ? 'system' : t
    }

    // Broadcast so other panes (e.g. the footer) refresh without waiting for
    // the next worker run.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('settings:onChange', settingsStore.store)
    }

    return settingsStore.store
  })

  // ── Audit log ─────────────────────────────────────────────────────────────
  ipcMain.handle('audit:query', (_: unknown, filters: Parameters<typeof auditDb.query>[0]) =>
    auditDb.query(filters),
  )

  // ── Window controls ───────────────────────────────────────────────────────
  ipcMain.on('window:minimize',   (e) => BrowserWindow.fromWebContents(e.sender)?.minimize())
  ipcMain.on('window:maximize',   (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    win.isMaximized() ? win.unmaximize() : win.maximize()
  })
  ipcMain.on('window:close',      (e) => BrowserWindow.fromWebContents(e.sender)?.close())
  ipcMain.handle('window:isMaximized', (e) =>
    BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false,
  )

  // ── Bootstrap / app info ──────────────────────────────────────────────────
  ipcMain.handle('app:bootstrapInfo', () => getBootstrapInfo())

  // ── Project metadata ──────────────────────────────────────────────────────
  ipcMain.handle('project:list', () => projectService.listProjects())
  ipcMain.handle('project:get', (_: unknown, name: string) => projectService.getProject(name))
  ipcMain.handle('project:listWorkflows', (_: unknown, name: string) =>
    projectService.listWorkflows(name),
  )
  ipcMain.handle('project:listSteps', (_: unknown, project: string, workflow: string) =>
    projectService.listSteps(project, workflow),
  )
  ipcMain.handle('project:listSkills', () => projectService.listSkills())
  ipcMain.handle('project:create', async (_: unknown, description: string, opts?: { regenerateOf?: string }) => {
    // If regenerating, tear down watchers for the old project's workflows
    // before scaffolding overwrites the folders.
    if (opts?.regenerateOf) {
      const oldWorkflows = await projectService.listWorkflows(opts.regenerateOf).catch(() => [])
      for (const w of oldWorkflows) {
        await watcherService.unmountWorkflow(opts.regenerateOf, w.name)
        schedulerService.unmountWorkflow(opts.regenerateOf, w.name)
      }
    }
    const result = await projectCreateService.createFromDescription(description, opts)
    if (result.ok) {
      // Mount watchers + scheduler for every workflow in the new project so
      // `on_ready` cards trigger workers without needing an app restart.
      const workflows = await projectService.listWorkflows(result.project.name).catch(() => [])
      for (const w of workflows) {
        await watcherService.mountWorkflow(result.project.name, w.name)
        await schedulerService.mountWorkflow(result.project.name, w.name)
      }
    }
    return result
  })
  ipcMain.handle('project:delete', async (_: unknown, name: string) => {
    const workflows = await projectService.listWorkflows(name).catch(() => [])
    for (const w of workflows) {
      await watcherService.unmountWorkflow(name, w.name)
      schedulerService.unmountWorkflow(name, w.name)
    }
    await projectCreateService.deleteProject(name)
  })

  // ── Usage / rate-limit windows ────────────────────────────────────────────
  ipcMain.handle('usage:get', () => usageService.getSnapshot())

  // ── AI adapters ───────────────────────────────────────────────────────────
  ipcMain.handle('adapters:list', () =>
    adapterRegistry.list().map((a) => ({
      id: a.id,
      displayName: a.displayName,
      installUrl: a.installUrl ?? null,
    })),
  )
  ipcMain.handle('adapters:detect', async (_: unknown, id: string) => {
    const a = adapterRegistry.get(id)
    if (!a) return { installed: false, version: null }
    const installed = await a.detectInstalled()
    const version = installed ? await a.getVersion() : null
    return { installed, version }
  })
  ipcMain.handle('adapters:listModels', async (_: unknown, id: string) => {
    const a = adapterRegistry.get(id)
    if (!a) return []
    return a.listModels()
  })
  ipcMain.handle('adapters:listEfforts', async (_: unknown, id: string, modelId: string) => {
    const a = adapterRegistry.get(id)
    if (!a) return []
    return a.listEfforts(modelId)
  })
  ipcMain.handle('adapters:getUsage', async (_: unknown, id: string) => {
    const a = adapterRegistry.get(id)
    if (!a || !a.getUsage) return null
    return a.getUsage()
  })

  // ── Steps (trays/workers) ─────────────────────────────────────────────────
  // Wrap mutating handlers so the workflow's watchers are re-mounted after
  // structural changes (added/removed step, new worker trigger config).
  const remount = async (i: { project: string; workflow: string }) => {
    await watcherService.remountWorkflow(i.project, i.workflow)
    await schedulerService.remountWorkflow(i.project, i.workflow)
  }

  ipcMain.handle('step:addTray', async (_: unknown, input: Parameters<typeof stepService.addTray>[0]) => {
    const r = await stepService.addTray(input)
    await remount(input)
    return r
  })
  ipcMain.handle('step:addWorker', async (_: unknown, input: Parameters<typeof stepService.addWorker>[0]) => {
    const r = await stepService.addWorker(input)
    await remount(input)
    return r
  })
  ipcMain.handle('step:update', async (_: unknown, input: Parameters<typeof stepService.updateStep>[0]) => {
    await stepService.updateStep(input)
    await remount(input)
  })
  ipcMain.handle('step:delete', async (_: unknown, input: Parameters<typeof stepService.deleteStep>[0]) => {
    await stepService.deleteStep(input)
    await remount(input)
  })
  ipcMain.handle('step:readProcess', (_: unknown, project: string, workflow: string, stepId: string) =>
    stepService.readWorkerProcess(project, workflow, stepId),
  )
  ipcMain.handle('step:updateProcess', (_: unknown, input: Parameters<typeof stepService.updateWorkerProcess>[0]) =>
    stepService.updateWorkerProcess(input),
  )

  // ── Worker runs ───────────────────────────────────────────────────────────
  ipcMain.handle('worker:triggerRun', (_: unknown, project: string, workflow: string, stepId: string, cardId: string) =>
    workerRunner.triggerRun({ project, workflow, stepId, cardId }),
  )
  ipcMain.handle('worker:runNow', (_: unknown, project: string, workflow: string, stepId: string) =>
    workerRunner.runNow(project, workflow, stepId),
  )
  ipcMain.handle('worker:listRuns', (_: unknown, project: string, workflow: string, stepId: string) =>
    workerRunner.listRuns(project, workflow, stepId),
  )
  ipcMain.handle('worker:getRun', (_: unknown, project: string, workflow: string, stepId: string, runId: string) =>
    workerRunner.getRun(project, workflow, stepId, runId),
  )
  ipcMain.handle('worker:readTerminalLog', (_: unknown, project: string, workflow: string, stepId: string, runId: string) =>
    workerRunner.readTerminalLog(project, workflow, stepId, runId),
  )
  ipcMain.handle('worker:sendInput', (_: unknown, project: string, workflow: string, stepId: string, runId: string, text: string) =>
    workerRunner.sendInput(project, workflow, stepId, runId, text),
  )
  ipcMain.handle('worker:openExternalTerminal', (_: unknown, project: string, workflow: string, stepId: string, runId: string) =>
    workerRunner.openExternalTerminal(project, workflow, stepId, runId),
  )

  // ── Cards ─────────────────────────────────────────────────────────────────
  ipcMain.handle('card:list', (_: unknown, project: string, workflow: string, stepId: string, status: CardStatus) =>
    cardService.listCards(project, workflow, stepId, status),
  )
  ipcMain.handle('card:get', (_: unknown, project: string, workflow: string, stepId: string, cardId: string) =>
    cardService.getCard(project, workflow, stepId, cardId),
  )
  ipcMain.handle('card:counts', (_: unknown, project: string, workflow: string, stepId: string) =>
    cardService.getCounts(project, workflow, stepId),
  )
  ipcMain.handle('card:create', (_: unknown, project: string, workflow: string, stepId: string, data: Record<string, unknown>) =>
    cardService.createCard(project, workflow, stepId, data, { createdBy: 'manual' }),
  )
  ipcMain.handle('card:markReady', (_: unknown, project: string, workflow: string, stepId: string, cardId: string) =>
    cardService.markReady(project, workflow, stepId, cardId),
  )
  ipcMain.handle('card:archive', (_: unknown, project: string, workflow: string, stepId: string, cardId: string, fromStatus: CardStatus) =>
    cardService.archiveCard(project, workflow, stepId, cardId, fromStatus),
  )
  ipcMain.handle('card:retry', (_: unknown, project: string, workflow: string, cardId: string) =>
    cardService.retryFromErrors(project, workflow, cardId),
  )
}
