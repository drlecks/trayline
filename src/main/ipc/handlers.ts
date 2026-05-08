import { IpcMain, nativeTheme, BrowserWindow } from 'electron'
import { settingsStore, Settings } from '../services/settings-store'
import { auditDb } from '../services/audit-db'
import { projectService } from '../services/project-service'
import { projectCreateService } from '../services/project-create-service'
import { usageService } from '../services/usage-service'
import { adapterRegistry } from '../ai-terminals/registry'
import { stepService } from '../services/step-service'
import { cardService } from '../services/card-service'
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
  ipcMain.handle('project:create', (_: unknown, description: string, opts?: { regenerateOf?: string }) =>
    projectCreateService.createFromDescription(description, opts),
  )
  ipcMain.handle('project:delete', (_: unknown, name: string) =>
    projectCreateService.deleteProject(name),
  )

  // ── Usage / rate-limit windows ────────────────────────────────────────────
  ipcMain.handle('usage:get', () => usageService.getSnapshot())

  // ── AI adapters ───────────────────────────────────────────────────────────
  ipcMain.handle('adapters:list', () =>
    adapterRegistry.list().map((a) => ({ id: a.id, displayName: a.displayName })),
  )
  ipcMain.handle('adapters:detect', async (_: unknown, id: string) => {
    const a = adapterRegistry.get(id)
    if (!a) return { installed: false, version: null }
    const installed = await a.detectInstalled()
    const version = installed ? await a.getVersion() : null
    return { installed, version }
  })

  // ── Steps (trays/workers) ─────────────────────────────────────────────────
  ipcMain.handle('step:addTray', (_: unknown, input: Parameters<typeof stepService.addTray>[0]) =>
    stepService.addTray(input),
  )
  ipcMain.handle('step:update', (_: unknown, input: Parameters<typeof stepService.updateStep>[0]) =>
    stepService.updateStep(input),
  )
  ipcMain.handle('step:delete', (_: unknown, input: Parameters<typeof stepService.deleteStep>[0]) =>
    stepService.deleteStep(input),
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
}
