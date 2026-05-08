import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../main/ipc/channels'
import type { Settings } from '../main/services/settings-store'
import type { AuditRow } from '../main/services/audit-db'

// Typed API exposed to the renderer via window.trayline
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
}

contextBridge.exposeInMainWorld('trayline', api)

// Type declaration merged into Window for the renderer
export type TraylineAPI = typeof api
