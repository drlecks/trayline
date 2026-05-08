import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { Settings } from '../main/services/settings-store'
import type { AuditRow } from '../main/services/audit-db'

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settings.get),
    set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settings.set, key, value),
  },
  audit: {
    query: (filters: Record<string, string>): Promise<AuditRow[]> =>
      ipcRenderer.invoke(IPC.audit.query, filters),
  },
  window: {
    minimize: () => ipcRenderer.send(IPC.window.minimize),
    maximize: () => ipcRenderer.send(IPC.window.maximize),
    close: () => ipcRenderer.send(IPC.window.close),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.window.isMaximized),
  },
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('trayline', api)

export type TraylineAPI = typeof api
