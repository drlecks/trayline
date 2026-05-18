import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  Settings,
  NotificationSettings,
  AuditRow,
  BootstrapInfo,
  ProjectMeta,
  ProjectStatus,
  WorkflowMeta,
  StepMeta,
  UsageSnapshot,
  AdapterUsageSnapshot,
  AdapterReadiness,
  ProjectCreateOutcome,
  ProviderReadyResult,
  ExportOptions,
  ImportResult,
  ImportSuccess,
  ProjectLiveStats,
  ProjectReadiness,
  LocalModelEntry,
  ModelDownloadProgress,
  SourceStepConfig,
  SourceState,
  SourceRunMeta,
  SourceRunEvent,
  Credential,
  CredentialSummary,
  OutletStepConfig,
  OutletRunMeta,
  OutletRunEvent,
} from '../shared/types'
import type { Card, CardStatus, CardCounts } from '../shared/card'
import type { QueueEntry } from '../shared/queue'
import type { PlanFieldDef, PlanTrayStep, PlanWorkerStep } from '../shared/workflow-plan'
import type { WorkerRun, WorkerRunEvent } from '../shared/worker-run'

const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settings.get),
    set: <K extends keyof Settings>(key: K, value: Settings[K]): Promise<Settings> =>
      ipcRenderer.invoke(IPC.settings.set, key, value),
    onChange: (handler: (next: Settings) => void): (() => void) => {
      const listener = (_e: unknown, next: Settings) => handler(next)
      ipcRenderer.on(IPC.settings.onChange, listener)
      return () => ipcRenderer.off(IPC.settings.onChange, listener)
    },
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
    listContextFiles: (project: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.project.listContextFiles, project),
    readContextFile: (project: string, file: string): Promise<string> =>
      ipcRenderer.invoke(IPC.project.readContextFile, project, file),
    writeContextFile: (project: string, file: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IPC.project.writeContextFile, project, file, content),
    deleteContextFile: (project: string, file: string): Promise<void> =>
      ipcRenderer.invoke(IPC.project.deleteContextFile, project, file),
    create: (description: string, opts?: { regenerateOf?: string }): Promise<ProjectCreateOutcome> =>
      ipcRenderer.invoke(IPC.project.create, description, opts),
    delete: (name: string): Promise<void> => ipcRenderer.invoke(IPC.project.delete, name),
    setStatus: (name: string, status: ProjectStatus): Promise<ProjectMeta> =>
      ipcRenderer.invoke(IPC.project.setStatus, name, status),
    getOrchestration: (name: string): Promise<{ name: string; mounted: boolean }> =>
      ipcRenderer.invoke(IPC.project.getOrchestration, name),
    onStatusChanged: (
      handler: (event: { name: string; status: ProjectStatus; mounted: boolean }) => void,
    ): (() => void) => {
      const listener = (_e: unknown, ev: { name: string; status: ProjectStatus; mounted: boolean }) => handler(ev)
      ipcRenderer.on(IPC.project.onStatusChanged, listener)
      return () => ipcRenderer.off(IPC.project.onStatusChanged, listener)
    },
    liveStats: (name: string): Promise<ProjectLiveStats> =>
      ipcRenderer.invoke(IPC.project.liveStats, name),
    checkReadiness: (name: string): Promise<ProjectReadiness> =>
      ipcRenderer.invoke(IPC.project.checkReadiness, name),
    export: (name: string, options: ExportOptions): Promise<{ ok: true; path: string } | { canceled: true }> =>
      ipcRenderer.invoke(IPC.project.export, name, options),
    import: (): Promise<ImportResult | { canceled: true }> =>
      ipcRenderer.invoke(IPC.project.import),
    importCommit: (token: string): Promise<ImportSuccess> =>
      ipcRenderer.invoke(IPC.project.importCommit, token),
    importAbort: (token: string): Promise<void> =>
      ipcRenderer.invoke(IPC.project.importAbort, token),
    openExample: (): Promise<ImportSuccess> =>
      ipcRenderer.invoke(IPC.project.openExample),
  },
  usage: {
    get: (): Promise<UsageSnapshot> => ipcRenderer.invoke(IPC.usage.get),
  },
  adapters: {
    list: (): Promise<{ id: string; displayName: string; kind: 'production' | 'mock'; installUrl: string | null; description: string | null; requiresExternalInstall: boolean }[]> =>
      ipcRenderer.invoke(IPC.adapters.list),
    checkProviderReady: (): Promise<ProviderReadyResult> =>
      ipcRenderer.invoke(IPC.adapters.checkProviderReady),
    detect: (id: string): Promise<{ installed: boolean; version: string | null }> =>
      ipcRenderer.invoke(IPC.adapters.detect, id),
    listModels: (id: string): Promise<{ id: string; label: string; description?: string }[]> =>
      ipcRenderer.invoke(IPC.adapters.listModels, id),
    listEfforts: (id: string, modelId: string): Promise<{ id: string; label: string }[]> =>
      ipcRenderer.invoke(IPC.adapters.listEfforts, id, modelId),
    getUsage: (id: string): Promise<AdapterUsageSnapshot | null> =>
      ipcRenderer.invoke(IPC.adapters.getUsage, id),
    onUsageUpdate: (handler: () => void): (() => void) => {
      const listener = () => handler()
      ipcRenderer.on(IPC.adapters.onUsageUpdate, listener)
      return () => ipcRenderer.off(IPC.adapters.onUsageUpdate, listener)
    },
  },
  adapter: {
    checkReadiness: (): Promise<Record<string, AdapterReadiness>> =>
      ipcRenderer.invoke(IPC.adapter.checkReadiness),
    recheck: (adapterId: string): Promise<AdapterReadiness> =>
      ipcRenderer.invoke(IPC.adapter.recheck, adapterId),
    getCached: (adapterId: string): Promise<AdapterReadiness | null> =>
      ipcRenderer.invoke(IPC.adapter.getCached, adapterId),
    onReadinessChanged: (handler: (r: AdapterReadiness) => void): (() => void) => {
      const listener = (_e: unknown, r: AdapterReadiness) => handler(r)
      ipcRenderer.on(IPC.adapter.onReadinessChanged, listener)
      return () => ipcRenderer.off(IPC.adapter.onReadinessChanged, listener)
    },
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
    addWorker: (input: {
      project: string
      workflow: string
      name: string
      description?: string
      icon?: string
      process_md?: string
    }): Promise<PlanWorkerStep & { id: string }> =>
      ipcRenderer.invoke(IPC.step.addWorker, input),
    addSource: (input: {
      project: string
      workflow: string
      name: string
      description?: string
      schedule_cron?: string
      dedup_key?: string
    }): Promise<SourceStepConfig & { id: string }> =>
      ipcRenderer.invoke(IPC.step.addSource, input),
    readProcess: (project: string, workflow: string, stepId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.step.readProcess, project, workflow, stepId),
    updateProcess: (input: {
      project: string
      workflow: string
      stepId: string
      processMd: string
    }): Promise<void> => ipcRenderer.invoke(IPC.step.updateProcess, input),
  },
  worker: {
    triggerRun: (project: string, workflow: string, stepId: string, cardId: string): Promise<{ runId: string }> =>
      ipcRenderer.invoke(IPC.worker.triggerRun, project, workflow, stepId, cardId),
    runNow: (project: string, workflow: string, stepId: string): Promise<{ triggered: number }> =>
      ipcRenderer.invoke(IPC.worker.runNow, project, workflow, stepId),
    listRuns: (project: string, workflow: string, stepId: string): Promise<WorkerRun[]> =>
      ipcRenderer.invoke(IPC.worker.listRuns, project, workflow, stepId),
    getRun: (project: string, workflow: string, stepId: string, runId: string): Promise<WorkerRun | null> =>
      ipcRenderer.invoke(IPC.worker.getRun, project, workflow, stepId, runId),
    readTerminalLog: (project: string, workflow: string, stepId: string, runId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.worker.readTerminalLog, project, workflow, stepId, runId),
    sendInput: (project: string, workflow: string, stepId: string, runId: string, text: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.worker.sendInput, project, workflow, stepId, runId, text),
    openExternalTerminal: (project: string, workflow: string, stepId: string, runId: string): Promise<{ ok: boolean; message?: string }> =>
      ipcRenderer.invoke(IPC.worker.openExternalTerminal, project, workflow, stepId, runId),
    onRunEvent: (handler: (event: WorkerRunEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: WorkerRunEvent) => handler(ev)
      ipcRenderer.on(IPC.worker.onRunEvent, listener)
      return () => ipcRenderer.off(IPC.worker.onRunEvent, listener)
    },
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
    retry: (project: string, workflow: string, cardId: string): Promise<{ card: Card; targetStepId: string }> =>
      ipcRenderer.invoke(IPC.card.retry, project, workflow, cardId),
    edit: (project: string, workflow: string, stepId: string, cardId: string, data: Record<string, unknown>, andMarkReady: boolean): Promise<Card> =>
      ipcRenderer.invoke(IPC.card.edit, project, workflow, stepId, cardId, data, andMarkReady),
    sendBack: (project: string, workflow: string, stepId: string, cardId: string, note?: string): Promise<{ card: Card; targetStepId: string }> =>
      ipcRenderer.invoke(IPC.card.sendBack, project, workflow, stepId, cardId, note),
  },
  queue: {
    getPending: (): Promise<QueueEntry[]> =>
      ipcRenderer.invoke(IPC.queue.getPending),
    onUpdate: (handler: (entries: QueueEntry[]) => void): (() => void) => {
      const listener = (_e: unknown, entries: QueueEntry[]) => handler(entries)
      ipcRenderer.on(IPC.queue.onUpdate, listener)
      return () => ipcRenderer.off(IPC.queue.onUpdate, listener)
    },
  },
  source: {
    create: (input: {
      project: string
      workflow: string
      name: string
      description?: string
      schedule_cron?: string
      dedup_key?: string
    }): Promise<SourceStepConfig & { id: string }> =>
      ipcRenderer.invoke(IPC.source.create, input),
    runNow: (project: string, workflow: string, stepId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.source.runNow, project, workflow, stepId),
    pause: (project: string, workflow: string, stepId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.source.pause, project, workflow, stepId),
    resume: (project: string, workflow: string, stepId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.source.resume, project, workflow, stepId),
    getState: (project: string, workflow: string, stepId: string): Promise<SourceState> =>
      ipcRenderer.invoke(IPC.source.getState, project, workflow, stepId),
    readInstructions: (project: string, workflow: string, stepId: string): Promise<string> =>
      ipcRenderer.invoke(IPC.source.readInstructions, project, workflow, stepId),
    updateInstructions: (input: { project: string; workflow: string; stepId: string; content: string }): Promise<void> =>
      ipcRenderer.invoke(IPC.source.updateInstructions, input),
    listRuns: (project: string, workflow: string, stepId: string): Promise<SourceRunMeta[]> =>
      ipcRenderer.invoke(IPC.source.listRuns, project, workflow, stepId),
    onRunEvent: (handler: (event: SourceRunEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: SourceRunEvent) => handler(ev)
      ipcRenderer.on(IPC.source.onRunEvent, listener)
      return () => ipcRenderer.off(IPC.source.onRunEvent, listener)
    },
  },
  notifications: {
    getSettings: (): Promise<NotificationSettings> =>
      ipcRenderer.invoke(IPC.notifications.getSettings),
    updateSettings: (partial: Partial<NotificationSettings>): Promise<NotificationSettings> =>
      ipcRenderer.invoke(IPC.notifications.updateSettings, partial),
    clearAllNotified: (): Promise<void> =>
      ipcRenderer.invoke(IPC.notifications.clearAllNotified),
    getBadgeCount: (): Promise<number> =>
      ipcRenderer.invoke(IPC.notifications.getBadgeCount),
    onNavigate: (handler: (payload: { projectName: string; workflowName: string; cardId: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { projectName: string; workflowName: string; cardId: string }) => handler(payload)
      ipcRenderer.on(IPC.notification.navigate, listener)
      return () => ipcRenderer.off(IPC.notification.navigate, listener)
    },
  },
  localModel: {
    list: (): Promise<LocalModelEntry[]> =>
      ipcRenderer.invoke(IPC.localModel.list),
    download: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.localModel.download, modelId),
    cancel: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.localModel.cancel, modelId),
    delete: (modelId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.localModel.delete, modelId),
    recheckAdapter: (): Promise<AdapterReadiness> =>
      ipcRenderer.invoke(IPC.localModel.recheckAdapter),
    onProgress: (handler: (p: ModelDownloadProgress) => void): (() => void) => {
      const listener = (_e: unknown, p: ModelDownloadProgress) => handler(p)
      ipcRenderer.on(IPC.localModel.onProgress, listener)
      return () => ipcRenderer.off(IPC.localModel.onProgress, listener)
    },
    onDownloadComplete: (handler: (payload: { modelId: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { modelId: string }) => handler(payload)
      ipcRenderer.on(IPC.localModel.onDownloadComplete, listener)
      return () => ipcRenderer.off(IPC.localModel.onDownloadComplete, listener)
    },
    onDownloadError: (handler: (payload: { modelId: string; error: string }) => void): (() => void) => {
      const listener = (_e: unknown, payload: { modelId: string; error: string }) => handler(payload)
      ipcRenderer.on(IPC.localModel.onDownloadError, listener)
      return () => ipcRenderer.off(IPC.localModel.onDownloadError, listener)
    },
  },
  credential: {
    list: (): Promise<CredentialSummary[]> => ipcRenderer.invoke(IPC.credential.list),
    get: (id: string): Promise<Credential | null> => ipcRenderer.invoke(IPC.credential.get, id),
    save: (credential: Credential): Promise<void> => ipcRenderer.invoke(IPC.credential.save, credential),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(IPC.credential.delete, id),
    saveSecret: (credentialId: string, account: string, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.credential.saveSecret, credentialId, account, value),
    testConnection: (id: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.credential.testConnection, id),
  },
  outlet: {
    runNow: (project: string, workflow: string, stepId: string, cardId: string, prevStepId: string, config: OutletStepConfig): Promise<void> =>
      ipcRenderer.invoke(IPC.outlet.runNow, project, workflow, stepId, cardId, prevStepId, config),
    listRuns: (project: string, workflow: string, stepId: string): Promise<OutletRunMeta[]> =>
      ipcRenderer.invoke(IPC.outlet.listRuns, project, workflow, stepId),
    onStarted: (handler: (event: OutletRunEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: OutletRunEvent) => handler(ev)
      ipcRenderer.on(IPC.outlet.onStarted, listener)
      return () => ipcRenderer.off(IPC.outlet.onStarted, listener)
    },
    onCompleted: (handler: (event: OutletRunEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: OutletRunEvent) => handler(ev)
      ipcRenderer.on(IPC.outlet.onCompleted, listener)
      return () => ipcRenderer.off(IPC.outlet.onCompleted, listener)
    },
    onFailed: (handler: (event: OutletRunEvent) => void): (() => void) => {
      const listener = (_e: unknown, ev: OutletRunEvent) => handler(ev)
      ipcRenderer.on(IPC.outlet.onFailed, listener)
      return () => ipcRenderer.off(IPC.outlet.onFailed, listener)
    },
  },
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('trayline', api)

export type TraylineAPI = typeof api
