import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  Settings,
  AuditRow,
  BootstrapInfo,
  ProjectMeta,
  WorkflowMeta,
  StepMeta,
  SkillManifest,
  UsageSnapshot,
} from '../shared/types'

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
  app: {
    bootstrapInfo: (): Promise<BootstrapInfo> => ipcRenderer.invoke(IPC.app.bootstrapInfo),
  },
  project: {
    list: (): Promise<ProjectMeta[]> => ipcRenderer.invoke(IPC.project.list),
    get: (name: string): Promise<ProjectMeta | null> =>
      ipcRenderer.invoke(IPC.project.get, name),
    listWorkflows: (name: string): Promise<WorkflowMeta[]> =>
      ipcRenderer.invoke(IPC.project.listWorkflows, name),
    listSteps: (project: string, workflow: string): Promise<StepMeta[]> =>
      ipcRenderer.invoke(IPC.project.listSteps, project, workflow),
    listSkills: (): Promise<SkillManifest[]> => ipcRenderer.invoke(IPC.project.listSkills),
  },
  usage: {
    get: (): Promise<UsageSnapshot> => ipcRenderer.invoke(IPC.usage.get),
  },
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('trayline', api)

export type TraylineAPI = typeof api
