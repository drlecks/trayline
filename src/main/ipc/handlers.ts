import { IpcMain, nativeTheme, BrowserWindow, dialog } from 'electron'
import { settingsStore, Settings } from '../services/settings-store'
import { auditDb } from '../services/audit-db'
import { projectService } from '../services/project-service'
import { projectCreateService } from '../services/project-create-service'
import { usageService } from '../services/usage-service'
import { adapterRegistry } from '../ai-terminals/registry'
import { stepService } from '../services/step-service'
import { cardService } from '../services/card-service'
import { workerRunner } from '../services/worker-runner'
import { sourceRunner } from '../services/source-runner'
import { sourceScheduler } from '../services/source-scheduler'
import { exportService } from '../services/export-service'
import { orchestrator } from '../services/orchestrator'
import { adapterReadinessService } from '../services/adapter-readiness-service'
import { queueService } from '../services/queue-service'
import { notificationService } from '../services/notification-service'
import { credentialService } from '../services/credential-service'
import { outletRunner } from '../services/outlet-runner'
import { aiOutputLog } from '../services/ai-output-log'
import { join } from 'path'
import os from 'os'
import fs from 'fs/promises'
import { fsService } from '../services/fs-service'
import type { AISession } from '../ai-terminals/adapter'
import { ANSI_RE } from '../ai-terminals/prompt-utils'
import { IPC } from '../../shared/ipc-channels'
import type { BootstrapInfo, NotificationSettings, ProviderInstallSuggestion, ProviderReadyResult, ExportOptions, ImportSuccess, SourceStepConfig, Credential, OutletStepConfig } from '../../shared/types'
import type { CardStatus } from '../../shared/card'

export type { BootstrapInfo }

export function registerIpcHandlers(
  ipcMain: IpcMain,
  getBootstrapInfo: () => BootstrapInfo,
  onMountChanged?: () => void,
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
  ipcMain.handle('project:listContextFiles', (_: unknown, project: string) =>
    projectService.listContextFiles(project),
  )
  ipcMain.handle('project:readContextFile', (_: unknown, project: string, file: string) =>
    projectService.readContextFile(project, file),
  )
  ipcMain.handle('project:writeContextFile', (_: unknown, project: string, file: string, content: string) =>
    projectService.writeContextFile(project, file, content),
  )
  ipcMain.handle('project:deleteContextFile', (_: unknown, project: string, file: string) =>
    projectService.deleteContextFile(project, file),
  )
  ipcMain.handle('project:create', async (_: unknown, description: string, opts?: { regenerateOf?: string }) => {
    if (opts?.regenerateOf) {
      await orchestrator.unmountProject(opts.regenerateOf)
    }
    const result = await projectCreateService.createFromDescription(description, opts)
    if (result.ok) {
      await orchestrator.mountProject(result.project.name)
    }
    onMountChanged?.()
    return result
  })
  ipcMain.handle('project:updateMeta', async (
    _: unknown,
    name: string,
    patch: { display_name?: string; description?: string },
  ) => projectService.updateMeta(name, patch))
  ipcMain.handle('project:updatePermissions', async (
    _: unknown,
    name: string,
    permissions: import('../../shared/types').ProjectPermissions,
  ) => projectService.updatePermissions(name, permissions))

  ipcMain.handle('project:setStatus', async (_: unknown, name: string, status: 'active' | 'inactive') => {
    const meta = await projectService.setStatus(name, status)
    if (status === 'active') {
      await orchestrator.mountProject(name)
    } else {
      await orchestrator.unmountProject(name)
    }
    onMountChanged?.()
    const mounted = orchestrator.isMounted(name)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('project:onStatusChanged', { name, status, mounted })
    }
    return meta
  })
  ipcMain.handle('project:getOrchestration', (_: unknown, name: string) => ({
    name,
    mounted: orchestrator.isMounted(name),
  }))

  ipcMain.handle('project:live-stats', async (_: unknown, projectName: string) => {
    async function countJsonFiles(dir: string): Promise<number> {
      try {
        const files = await fs.readdir(dir)
        return files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp')).length
      } catch { return 0 }
    }

    let pendingCards = 0, readyCards = 0, errorCards = 0
    const workflows = await projectService.listWorkflows(projectName).catch(() => [])
    for (const wf of workflows) {
      const steps = await projectService.listSteps(projectName, wf.name)
      for (const step of steps) {
        const stepPath = projectService.paths.stepDir(projectName, wf.name, step.id)
        if (step.id === '99-errors') {
          errorCards += await countJsonFiles(join(stepPath, 'cards', 'pending'))
        } else if (step.kind === 'tray') {
          pendingCards += await countJsonFiles(join(stepPath, 'cards', 'pending'))
          readyCards += await countJsonFiles(join(stepPath, 'cards', 'ready'))
        } else if (step.kind === 'source') {
          readyCards += await countJsonFiles(join(stepPath, 'cards', 'ready'))
        }
      }
    }
    return {
      pendingCards,
      readyCards,
      errorCards,
      runningWorkers: workerRunner.activeRunCount(projectName),
      runningSources: sourceRunner.activeRunCount(projectName),
    }
  })

  ipcMain.handle('project:check-readiness', async (_: unknown, _projectName: string) => {
    const blockers: string[] = []

    let adapterOk = false
    for (const a of adapterRegistry.list()) {
      if (a.kind !== 'production') continue
      if (await a.detectInstalled()) { adapterOk = true; break }
    }
    if (!adapterOk) blockers.push('No AI adapter installed')

    return { ready: blockers.length === 0, blockers }
  })

  ipcMain.handle('project:delete', async (_: unknown, name: string) => {
    await orchestrator.unmountProject(name)
    await projectCreateService.deleteProject(name)
    onMountChanged?.()
  })

  // ── Import / Export ───────────────────────────────────────────────────────
  ipcMain.handle('project:export', async (_: unknown, projectName: string, options: ExportOptions) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Export project',
      defaultPath: `${projectName}.zip`,
      filters: [{ name: 'Trayline Project', extensions: ['zip'] }],
    })
    if (canceled || !filePath) return { canceled: true }
    await exportService.exportProject(projectName, options, filePath)
    return { ok: true, path: filePath }
  })

  ipcMain.handle('project:import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      title: 'Import project',
      filters: [{ name: 'Trayline Project', extensions: ['zip'] }],
      properties: ['openFile'],
    })
    if (canceled || filePaths.length === 0) return { canceled: true }
    const result = await exportService.importProject(filePaths[0])
    // Only mount if immediately committed (clean scan); needs_review defers to importCommit
    if (result.ok === true) {
      await orchestrator.mountProject(result.projectName)
      onMountChanged?.()
    }
    return result
  })

  ipcMain.handle('project:importCommit', async (_: unknown, token: string): Promise<ImportSuccess> => {
    const result = await exportService.commitImport(token)
    await orchestrator.mountProject(result.projectName)
    onMountChanged?.()
    return result
  })

  ipcMain.handle('project:importAbort', async (_: unknown, token: string): Promise<void> => {
    await exportService.abortImport(token)
  })

  ipcMain.handle('project:openExample', async () => {
    const result = await exportService.openExampleProject()
    await orchestrator.mountProject(result.projectName)
    onMountChanged?.()
    return result
  })

  // ── Usage / rate-limit windows ────────────────────────────────────────────
  ipcMain.handle('usage:get', () => usageService.getSnapshot())

  // ── AI adapters ───────────────────────────────────────────────────────────
  ipcMain.handle('adapters:list', () =>
    adapterRegistry.list().map((a) => ({
      id: a.id,
      displayName: a.displayName,
      kind: a.kind,
      installUrl: a.installUrl ?? null,
      description: a.description ?? null,
      requiresExternalInstall: a.installUrl != null,
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

  // Curated suggestions surfaced when no production adapter is installed.
  // Only `claude-code` is wired up today; the others are forward-looking
  // entries the install modal can point users at. Keep this list in sync with
  // the adapter registry as new adapters land.
  const PROVIDER_SUGGESTIONS: ProviderInstallSuggestion[] = [
    {
      id: 'claude-code',
      displayName: 'Claude Code',
      description: 'Anthropic\'s official CLI — the recommended default. Runs locally and works with the Claude API.',
      installUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',
      available: true,
    },
    {
      id: 'open-code',
      displayName: 'OpenCode',
      description: 'Open-source CLI agent. Bring-your-own-key for any major model provider.',
      installUrl: 'https://opencode.ai',
      available: false,
    },
    {
      id: 'pi',
      displayName: 'Pi',
      description: 'Inflection\'s assistant. Lighter-weight option for everyday tasks.',
      installUrl: 'https://pi.ai',
      available: false,
    },
  ]

  ipcMain.handle('adapters:checkProviderReady', async (): Promise<ProviderReadyResult> => {
    const installedIds: string[] = []
    for (const a of adapterRegistry.list()) {
      if (a.kind !== 'production') continue
      if (await a.detectInstalled()) installedIds.push(a.id)
    }
    return {
      ready: installedIds.length > 0,
      installedIds,
      suggestions: PROVIDER_SUGGESTIONS,
    }
  })

  // ── Adapter readiness ─────────────────────────────────────────────────────
  ipcMain.handle('adapter:check-readiness', async () => {
    const map = await adapterReadinessService.checkAll()
    return Object.fromEntries(map)
  })

  ipcMain.handle('adapter:recheck', async (_: unknown, adapterId: string) => {
    const readiness = await adapterReadinessService.recheck(adapterId)
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('adapter:readiness-changed', readiness)
    }
    return readiness
  })

  ipcMain.handle('adapter:get-cached', (_: unknown, adapterId: string) =>
    adapterReadinessService.getCached(adapterId),
  )

  // ── Steps (trays/workers/sources) ────────────────────────────────────────
  // Wrap mutating handlers so the workflow's watchers are re-mounted after
  // structural changes (added/removed step, new worker trigger config).
  const remount = (i: { project: string; workflow: string }) =>
    orchestrator.remountWorkflow(i.project, i.workflow)

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
  ipcMain.handle('step:addSource', async (_: unknown, input: Parameters<typeof stepService.addSource>[0]) => {
    const r = await stepService.addSource(input)
    await remount(input)
    return r
  })
  ipcMain.handle('step:addOutlet', async (_: unknown, input: Parameters<typeof stepService.addOutlet>[0]) => {
    const r = await stepService.addOutlet(input)
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
  ipcMain.handle('step:moveUp', async (_: unknown, input: { project: string; workflow: string; stepId: string }) => {
    // Guard: no in-flight runs on the step being moved or the one directly above it
    const steps = await projectService.listSteps(input.project, input.workflow)
    const idx = steps.findIndex((s) => s.id === input.stepId)
    if (idx > 0) {
      const aboveId = steps[idx - 1].id
      if (workerRunner.hasInFlightForStep(input.project, input.workflow, aboveId)) {
        throw new Error(`Cannot reorder: a worker run is in flight on "${steps[idx - 1].name}"`)
      }
    }
    if (workerRunner.hasInFlightForStep(input.project, input.workflow, input.stepId)) {
      throw new Error('Cannot reorder: a worker run is in flight for this step')
    }
    // Unmount watchers first to release chokidar file handles (required on Windows
    // before fs.rename — held handles cause EPERM on directory renames).
    await orchestrator.unmountWorkflow(input.project, input.workflow)
    const result = await stepService.moveStepUp(input)
    await remount(input)
    return result
  })

  // ── Source steps ──────────────────────────────────────────────────────────
  ipcMain.handle('source:create', async (_: unknown, input: Parameters<typeof stepService.addSource>[0]) => {
    const r = await stepService.addSource(input)
    await remount(input)
    return r
  })
  ipcMain.handle('source:run-now', async (_: unknown, project: string, workflow: string, stepId: string) => {
    const stepDir = projectService.paths.stepDir(project, workflow, stepId)
    const cfg = await fsService.readJson<SourceStepConfig>(join(stepDir, 'step.json'))

    void sourceRunner.runSource({ project, workflow, stepId, stepConfig: cfg }).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[source:run-now] failed:', e)
    })
    return { ok: true }
  })
  ipcMain.handle('source:pause', async (_: unknown, project: string, workflow: string, stepId: string) => {
    await stepService.updateStep({ project, workflow, stepId, patch: { paused: true } })
    sourceScheduler.unmountWorkflow(project, workflow)
    return { ok: true }
  })
  ipcMain.handle('source:resume', async (_: unknown, project: string, workflow: string, stepId: string) => {
    await stepService.updateStep({ project, workflow, stepId, patch: { paused: false } })
    await sourceScheduler.remountWorkflow(project, workflow)
    return { ok: true }
  })
  ipcMain.handle('source:get-state', async (_: unknown, project: string, workflow: string, stepId: string) => {
    const state = await sourceRunner.getState(project, workflow, stepId)
    return {
      ...state,
      nextRunAt: sourceScheduler.getNextRunAt(project, workflow, stepId),
    }
  })
  ipcMain.handle('source:list-runs', (_: unknown, project: string, workflow: string, stepId: string) =>
    sourceRunner.listRuns(project, workflow, stepId),
  )
  ipcMain.handle('source:reset-dedup', (_: unknown, project: string, workflow: string, stepId: string) =>
    sourceRunner.resetDedup(project, workflow, stepId),
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
  ipcMain.handle('card:edit', (_: unknown, project: string, workflow: string, stepId: string, cardId: string, data: Record<string, unknown>, andMarkReady: boolean) =>
    cardService.editCard(project, workflow, stepId, cardId, data, { andMarkReady }),
  )
  ipcMain.handle('card:sendBack', (_: unknown, project: string, workflow: string, stepId: string, cardId: string, note?: string) =>
    cardService.sendBackCard(project, workflow, stepId, cardId, note),
  )

  // ── Queue (My Queue) ──────────────────────────────────────────────────────
  ipcMain.handle('queue:getPending', () => queueService.getPending())

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.handle('notifications:get-settings', () =>
    settingsStore.get('notificationSettings'),
  )

  ipcMain.handle('notifications:update-settings', (_: unknown, partial: Partial<NotificationSettings>) => {
    const current = settingsStore.get('notificationSettings')
    const next: NotificationSettings = {
      enabled: partial.enabled ?? current.enabled,
      disabledProjects: partial.disabledProjects ?? current.disabledProjects,
    }
    settingsStore.set('notificationSettings', next)
    return next
  })

  ipcMain.handle('notifications:clear-all-notified', () => {
    notificationService.clearAllNotified()
  })

  ipcMain.handle('notifications:get-badge-count', () =>
    notificationService.getCurrentBadgeCount(),
  )

  // ── Credentials ───────────────────────────────────────────────────────────
  ipcMain.handle('credential:list', async () => {
    const all = await credentialService.list()
    return all.map(credentialService.toSummary)
  })
  ipcMain.handle('credential:get', (_: unknown, id: string) => credentialService.get(id))
  ipcMain.handle('credential:save', (_: unknown, credential: Credential) => credentialService.save(credential))
  ipcMain.handle('credential:delete', (_: unknown, id: string) => credentialService.delete(id))
  ipcMain.handle('credential:save-secret', (_: unknown, credentialId: string, account: string, value: string) =>
    credentialService.saveSecret(credentialId, account, value),
  )
  ipcMain.handle('credential:test-connection', (_: unknown, id: string) =>
    credentialService.testConnection(id),
  )

  // ── Outlet ────────────────────────────────────────────────────────────────
  ipcMain.handle('outlet:run-now', (_: unknown, project: string, workflow: string, stepId: string, cardId: string, prevStepId: string, config: OutletStepConfig) =>
    outletRunner.runOutlet(project, workflow, stepId, config, cardId, prevStepId),
  )
  ipcMain.handle('outlet:list-runs', (_: unknown, project: string, workflow: string, stepId: string) =>
    outletRunner.listOutletRuns(project, workflow, stepId),
  )

  // ── Quick AI Console ──────────────────────────────────────────────────────

  let activeAiSession: AISession | null = null

  ipcMain.handle(IPC.ai.query, async (event, prompt: string) => {
    // Kill any stale session from a previous request
    if (activeAiSession) {
      await activeAiSession.kill().catch(() => {})
      activeAiSession = null
    }

    const adapterId = settingsStore.get('defaultAdapterId') ?? 'claude-code'
    const adapter = adapterRegistry.get(adapterId) ?? adapterRegistry.get('claude-code')
    if (!adapter) throw new Error('No AI adapter available')

    const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'trayline-ai-'))
    const promptFile = join(tmpDir, 'process.md')
    await fs.writeFile(promptFile, prompt, 'utf-8')

    try {
      const session = await adapter.spawn({
        processFile: promptFile,
        cardData: {},
        contextPacks: [],
        workingDir: tmpDir,
        timeout: 120_000,
      })
      activeAiSession = session

      // Stream chunks to renderer while session runs
      void (async () => {
        try {
          for await (const chunk of session.stdout) {
            if (!event.sender.isDestroyed()) {
              const clean = chunk.replace(ANSI_RE, '')
              if (clean) event.sender.send(IPC.ai.onChunk, clean)
            }
          }
        } catch { /* ignore */ }
      })()

      await session.result()
    } finally {
      activeAiSession = null
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  ipcMain.on(IPC.ai.abort, async () => {
    if (activeAiSession) {
      await activeAiSession.kill().catch(() => {})
      activeAiSession = null
    }
  })

  // ── AI output log ─────────────────────────────────────────────────────────
  ipcMain.handle(IPC.aiLog.getLines, () => aiOutputLog.getLines())
}
