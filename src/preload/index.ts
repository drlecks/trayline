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
  ProjectCreateOutcome,
} from '../shared/types'
import type { Card, CardStatus, CardCounts } from '../shared/card'
import type { PlanFieldDef, PlanTrayStep } from '../shared/workflow-plan'

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
    create: (description: string, opts?: { regenerateOf?: string }): Promise<ProjectCreateOutcome> =>
      ipcRenderer.invoke(IPC.project.create, description, opts),
    delete: (name: string): Promise<void> => ipcRenderer.invoke(IPC.project.delete, name),
  },
  usage: {
    get: (): Promise<UsageSnapshot> => ipcRenderer.invoke(IPC.usage.get),
  },
  adapters: {
    list: (): Promise<{ id: string; displayName: string }[]> =>
      ipcRenderer.invoke(IPC.adapters.list),
    detect: (id: string): Promise<{ installed: boolean; version: string | null }> =>
      ipcRenderer.invoke(IPC.adapters.detect, id),
  },
  step: {
    addTray: (input: {
      project: string
      workflow: string
      name: string
      description?: string
      icon?: string
      approval_mode: 'manual' | 'auto'
      fields?: PlanFieldDef[]
      allow_manual_create?: boolean
    }): Promise<PlanTrayStep & { id: string }> =>
      ipcRenderer.invoke(IPC.step.addTray, input),
    update: (input: {
      project: string
      workflow: string
      stepId: string
      patch: Record<string, unknown>
    }): Promise<void> => ipcRenderer.invoke(IPC.step.update, input),
    delete: (input: { project: string; workflow: string; stepId: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.step.delete, input),
  },
  card: {
    list: (project: string, workflow: string, stepId: string, status: CardStatus): Promise<Card[]> =>
      ipcRenderer.invoke(IPC.card.list, project, workflow, stepId, status),
    get: (project: string, workflow: string, stepId: string, cardId: string): Promise<{ card: Card; status: CardStatus } | null> =>
      ipcRenderer.invoke(IPC.card.get, project, workflow, stepId, cardId),
    counts: (project: string, workflow: string, stepId: string): Promise<CardCounts> =>
      ipcRenderer.invoke(IPC.card.counts, project, workflow, stepId),
    create: (project: string, workflow: string, stepId: string, data: Record<string, unknown>): Promise<Card> =>
      ipcRenderer.invoke(IPC.card.create, project, workflow, stepId, data),
    markReady: (project: string, workflow: string, stepId: string, cardId: string): Promise<Card> =>
      ipcRenderer.invoke(IPC.card.markReady, project, workflow, stepId, cardId),
    archive: (project: string, workflow: string, stepId: string, cardId: string, fromStatus: CardStatus): Promise<Card> =>
      ipcRenderer.invoke(IPC.card.archive, project, workflow, stepId, cardId, fromStatus),
  },
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('trayline', api)

export type TraylineAPI = typeof api
