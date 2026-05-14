import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  Settings,
  AuditRow,
  BootstrapInfo,
  ProjectMeta,
  ProjectStatus,
  WorkflowMeta,
  StepMeta,
  SkillManifest,
  UsageSnapshot,
  AdapterUsageSnapshot,
  ProjectCreateOutcome,
  ProviderReadyResult,
  SkillCatalogFetchResult,
  InstalledSkillRow,
  ExportOptions,
  ImportResult,
  ImportSuccess,
} from '../shared/types'
import type { MissingSkillsEntry } from '../shared/types'
import type { Card, CardStatus, CardCounts } from '../shared/card'
import type { QueueEntry } from '../shared/queue'
import type { PlanFieldDef, PlanTrayStep, PlanWorkerStep } from '../shared/workflow-plan'
import type { WorkerRun, WorkerRunEvent } from '../shared/worker-run'
import type { SourceStepConfig, SourceState, SourceRunMeta, SourceRunEvent } from '../shared/types'

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
    listSkills: (): Promise<SkillManifest[]> => ipcRenderer.invoke(IPC.project.listSkills),
    checkSkills: (project: string): Promise<MissingSkillsEntry[]> =>
      ipcRenderer.invoke(IPC.project.checkSkills, project),
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
    list: (): Promise<{ id: string; displayName: string; kind: 'production' | 'mock'; installUrl: string | null }[]> =>
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
  skills: {
    fetchCatalog: (opts?: { forceRefresh?: boolean }): Promise<SkillCatalogFetchResult> =>
      ipcRenderer.invoke(IPC.skills.fetchCatalog, opts),
    listInstalled: (): Promise<InstalledSkillRow[]> =>
      ipcRenderer.invoke(IPC.skills.listInstalled),
    install: (skillId: string): Promise<InstalledSkillRow> =>
      ipcRenderer.invoke(IPC.skills.install, skillId),
    installFromUrl: (url: string): Promise<InstalledSkillRow> =>
      ipcRenderer.invoke(IPC.skills.installFromUrl, url),
    update: (skillId: string): Promise<InstalledSkillRow> =>
      ipcRenderer.invoke(IPC.skills.update, skillId),
    uninstall: (skillId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.skills.uninstall, skillId),
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
  platform: process.platform as NodeJS.Platform,
}

contextBridge.exposeInMainWorld('trayline', api)

export type TraylineAPI = typeof api
