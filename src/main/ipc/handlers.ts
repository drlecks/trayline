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
import { watcherService } from '../services/watcher-service'
import { schedulerService } from '../services/scheduler-service'
import { skillService } from '../services/skill-service'
import { mcpRegistry } from '../services/mcp-registry'
import { mcpCredentials } from '../services/mcp-credentials'
import { startOAuth, cancelOAuth } from '../services/mcp-oauth'
import { testConnection } from '../services/mcp-connection-test'
import { queueService } from '../services/queue-service'
import { exportService } from '../services/export-service'
import { join } from 'path'
import { fsService } from '../services/fs-service'
import type { BootstrapInfo, ProviderInstallSuggestion, ProviderReadyResult, ExportOptions, ImportSuccess, SourceStepConfig, McpStatus } from '../../shared/types'
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
  ipcMain.handle('project:checkSkills', (_: unknown, project: string) =>
    projectService.checkProjectSkills(project),
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
    // If regenerating, tear down watchers for the old project's workflows
    // before scaffolding overwrites the folders.
    if (opts?.regenerateOf) {
      const oldWorkflows = await projectService.listWorkflows(opts.regenerateOf).catch(() => [])
      for (const w of oldWorkflows) {
        await watcherService.unmountWorkflow(opts.regenerateOf, w.name)
        schedulerService.unmountWorkflow(opts.regenerateOf, w.name)
        sourceScheduler.unmountWorkflow(opts.regenerateOf, w.name)
        await queueService.unmountWorkflow(opts.regenerateOf, w.name)
      }
    }
    const result = await projectCreateService.createFromDescription(description, opts)
    if (result.ok) {
      const workflows = await projectService.listWorkflows(result.project.name).catch(() => [])
      for (const w of workflows) {
        await watcherService.mountWorkflow(result.project.name, w.name)
        await schedulerService.mountWorkflow(result.project.name, w.name)
        await sourceScheduler.mountWorkflow(result.project.name, w.name)
        await queueService.mountWorkflow(result.project.name, w.name)
      }
    }
    return result
  })
  ipcMain.handle('project:setStatus', (_: unknown, name: string, status: 'active' | 'inactive') =>
    projectService.setStatus(name, status),
  )
  ipcMain.handle('project:delete', async (_: unknown, name: string) => {
    const workflows = await projectService.listWorkflows(name).catch(() => [])
    for (const w of workflows) {
      await watcherService.unmountWorkflow(name, w.name)
      schedulerService.unmountWorkflow(name, w.name)
      sourceScheduler.unmountWorkflow(name, w.name)
      await queueService.unmountWorkflow(name, w.name)
    }
    await projectCreateService.deleteProject(name)
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
      const workflows = await projectService.listWorkflows(result.projectName).catch(() => [])
      for (const w of workflows) {
        await watcherService.mountWorkflow(result.projectName, w.name)
        await schedulerService.mountWorkflow(result.projectName, w.name)
        await queueService.mountWorkflow(result.projectName, w.name)
      }
    }
    return result
  })

  const mountProject = async (projectName: string) => {
    const workflows = await projectService.listWorkflows(projectName).catch(() => [])
    for (const w of workflows) {
      await watcherService.mountWorkflow(projectName, w.name)
      await schedulerService.mountWorkflow(projectName, w.name)
      await sourceScheduler.mountWorkflow(projectName, w.name)
      await queueService.mountWorkflow(projectName, w.name)
    }
  }

  ipcMain.handle('project:importCommit', async (_: unknown, token: string): Promise<ImportSuccess> => {
    const result = await exportService.commitImport(token)
    await mountProject(result.projectName)
    return result
  })

  ipcMain.handle('project:importAbort', async (_: unknown, token: string): Promise<void> => {
    await exportService.abortImport(token)
  })

  ipcMain.handle('project:openExample', async () => {
    const result = await exportService.openExampleProject()
    await mountProject(result.projectName)
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

  // ── Steps (trays/workers/sources) ────────────────────────────────────────
  // Wrap mutating handlers so the workflow's watchers are re-mounted after
  // structural changes (added/removed step, new worker trigger config).
  const remount = async (i: { project: string; workflow: string }) => {
    await watcherService.remountWorkflow(i.project, i.workflow)
    await schedulerService.remountWorkflow(i.project, i.workflow)
    await sourceScheduler.remountWorkflow(i.project, i.workflow)
    await queueService.remountWorkflow(i.project, i.workflow)
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
  ipcMain.handle('step:addSource', async (_: unknown, input: Parameters<typeof stepService.addSource>[0]) => {
    const r = await stepService.addSource(input)
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
  ipcMain.handle('source:read-instructions', (_: unknown, project: string, workflow: string, stepId: string) =>
    stepService.readSourceInstructions(project, workflow, stepId),
  )
  ipcMain.handle('source:update-instructions', (_: unknown, input: Parameters<typeof stepService.updateSourceInstructions>[0]) =>
    stepService.updateSourceInstructions(input),
  )
  ipcMain.handle('source:list-runs', (_: unknown, project: string, workflow: string, stepId: string) =>
    sourceRunner.listRuns(project, workflow, stepId),
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

  // ── Skills ────────────────────────────────────────────────────────────────
  ipcMain.handle('skills:fetchCatalog', (_: unknown, opts?: { forceRefresh?: boolean }) =>
    skillService.fetchCatalog(opts),
  )
  ipcMain.handle('skills:listInstalled', () => skillService.listInstalled())
  ipcMain.handle('skills:install', (_: unknown, skillId: string) =>
    skillService.installFromCatalog(skillId),
  )
  ipcMain.handle('skills:installFromUrl', (_: unknown, url: string) =>
    skillService.installFromUrl(url),
  )
  ipcMain.handle('skills:validateFromUrl', (_: unknown, url: string) =>
    skillService.validateFromUrl(url),
  )
  ipcMain.handle('skills:confirmInstall', (
    _: unknown,
    tempDir: string,
    acceptedWarnings: string[],
    sourceUrl: string,
    source: 'url' | 'catalog',
  ) => skillService.confirmInstall(tempDir, acceptedWarnings, sourceUrl, source))
  ipcMain.handle('skills:cancelValidation', (_: unknown, tempDir: string) =>
    skillService.cancelValidation(tempDir),
  )
  ipcMain.handle('skills:update', (_: unknown, skillId: string) => skillService.update(skillId))
  ipcMain.handle('skills:uninstall', (_: unknown, skillId: string) =>
    skillService.uninstall(skillId),
  )
  ipcMain.handle('skills:revalidateAll', () => skillService.revalidateAll())

  // ── MCPs ──────────────────────────────────────────────────────────────────────
  ipcMain.handle('mcp:list-installed', () => mcpRegistry.listInstalled())
  ipcMain.handle('mcp:list-catalog', () => mcpRegistry.listCatalog())
  ipcMain.handle('mcp:install', (_: unknown, mcpId: string) => mcpRegistry.install(mcpId))
  ipcMain.handle('mcp:uninstall', (_: unknown, mcpId: string) => mcpRegistry.uninstall(mcpId))
  ipcMain.handle('mcp:read-status', (_: unknown, mcpId: string) => mcpRegistry.readStatus(mcpId))
  ipcMain.handle('mcp:write-status', (_: unknown, mcpId: string, partial: Partial<McpStatus>) =>
    mcpRegistry.writeStatus(mcpId, partial),
  )
  ipcMain.handle('mcp:save-credential', async (_: unknown, mcpId: string, credId: string, value: string) => {
    await mcpCredentials.storeCredential(mcpId, credId, value)
  })
  ipcMain.handle('mcp:delete-credentials', async (_: unknown, mcpId: string) => {
    await mcpCredentials.deleteAllForMcp(mcpId)
  })
  ipcMain.handle('mcp:start-oauth', (
    _: unknown,
    mcpId: string,
    credId: string,
    provider: string,
    scopes: string[],
    opts?: { clientIdKey?: string; clientSecretKey?: string },
  ) => startOAuth(mcpId, credId, provider, scopes, opts))
  ipcMain.handle('mcp:cancel-oauth', (_: unknown, mcpId: string) => { cancelOAuth(mcpId) })
  ipcMain.handle('mcp:test-connection', (_: unknown, mcpId: string) => testConnection(mcpId))

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
}
