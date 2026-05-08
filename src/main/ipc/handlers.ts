import { IpcMain, nativeTheme, BrowserWindow } from 'electron'
import { settingsStore, Settings } from '../services/settings-store'
import { auditDb } from '../services/audit-db'
import { projectService } from '../services/project-service'
import type { BootstrapInfo } from '../../shared/types'

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
}
