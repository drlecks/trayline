import { app, BrowserWindow, ipcMain, nativeTheme, dialog } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { settingsStore } from './services/settings-store'
import { fsService, Paths } from './services/fs-service'
import { auditDb } from './services/audit-db'
import { systemSkillsService } from './services/system-skills-service'
import { workerRunner, setRunEventBroadcast } from './services/worker-runner'
import { watcherService } from './services/watcher-service'
import { schedulerService } from './services/scheduler-service'
import { queueService } from './services/queue-service'
import { registerIpcHandlers } from './ipc/handlers'
import { dirnameFromMeta } from './util/paths'

const __dirname = dirnameFromMeta(import.meta.url)

// ── Crash & startup logging ──────────────────────────────────────────────────
// In packaged builds there's no terminal, so any failure during bootstrap
// would otherwise be invisible. We append every stage transition to
// startup.log and any thrown/rejected error to crash.log inside the user's
// Trayline data dir so the user (or we) can read them after the fact.

function logsDir(): string {
  return join(app.getPath('documents'), 'Trayline', 'app-data')
}

function logCrash(label: string, err: unknown) {
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err)
  const message = `[${new Date().toISOString()}] ${label}\n${detail}\n\n`
  try {
    fs.mkdirSync(logsDir(), { recursive: true })
    fs.appendFileSync(join(logsDir(), 'crash.log'), message)
  } catch {
    process.stderr.write(message)
  }
}

function stage(name: string) {
  try {
    fs.mkdirSync(logsDir(), { recursive: true })
    fs.appendFileSync(join(logsDir(), 'startup.log'), `[${new Date().toISOString()}] ${name}\n`)
  } catch {
    /* ignore */
  }
}

process.on('uncaughtException', (err) => {
  logCrash('uncaughtException', err)
  if (app.isReady()) {
    dialog.showErrorBox(
      'Trayline crashed',
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    )
  }
})

process.on('unhandledRejection', (reason) => {
  logCrash('unhandledRejection', reason)
})

// ── Bootstrap state shared with the renderer via IPC ─────────────────────────

interface BootstrapInfo {
  dataDir: string
  systemSkillsRestored: string[]
}

let bootstrapInfo: BootstrapInfo

function resolveAppIcon(): string {
  // Packaged: icon-fill-128.png is copied via extraResources to process.resourcesPath.
  // Dev: read straight from the project's resources/ folder (cwd = project root under `vite`).
  const packaged = join(process.resourcesPath, 'icon-fill-128.png')
  if (app.isPackaged) return packaged
  return join(process.cwd(), 'resources', 'icon-fill-128.png')
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: resolveAppIcon(),
    show: false, // shown after ready-to-show to avoid white flash
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0F0F0F' : '#FAFAF9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    stage('window ready-to-show — calling show()')
    win.show()
  })

  // Surface renderer load failures (CSP blocks, missing files, etc.) instead
  // of leaving the user with a silent dead window.
  win.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    logCrash('did-fail-load', `${errorCode} ${errorDescription} (${validatedURL})`)
    dialog.showErrorBox(
      'Trayline failed to load',
      `Renderer failed: ${errorDescription} (${errorCode})\nURL: ${validatedURL}`,
    )
  })

  // Forward renderer console output to the startup log so we can diagnose
  // blank windows in packaged builds where DevTools isn't open.
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    const lvl = ['debug', 'info', 'warning', 'error'][level] ?? `lvl${level}`
    stage(`[renderer:${lvl}] ${message} (${source}:${line})`)
  })

  win.webContents.on('render-process-gone', (_e, details) => {
    logCrash('render-process-gone', JSON.stringify(details))
  })

  win.webContents.on('preload-error', (_e, preloadPath, err) => {
    logCrash('preload-error', `${preloadPath}: ${err.message}\n${err.stack ?? ''}`)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    // app.getAppPath() points to the asar root in production. loadFile handles
    // asar transparently so this works in dev and packaged builds alike.
    const indexPath = join(app.getAppPath(), 'dist', 'index.html')
    stage(`loadFile ${indexPath}`)
    win.loadFile(indexPath).catch((err) => {
      logCrash('loadFile', err)
      dialog.showErrorBox('Trayline failed to load', String(err))
    })
  }

  return win
}

app.whenReady().then(async () => {
  try {
    stage(`app.whenReady (electron=${process.versions.electron}, node=${process.versions.node}, modules=${process.versions.modules})`)

    await fsService.bootstrap()
    stage('fsService.bootstrap done')

    auditDb.init()
    stage('auditDb.init done')

    const { restored } = await systemSkillsService.ensureInstalled()
    stage(`systemSkillsService.ensureInstalled done (restored=${restored.join(',') || 'none'})`)

    const { recovered } = await workerRunner.recoverOrphanedRuns()
    stage(`workerRunner.recoverOrphanedRuns done (recovered=${recovered})`)

    setRunEventBroadcast(() => BrowserWindow.getAllWindows())

    bootstrapInfo = { dataDir: Paths.root, systemSkillsRestored: restored }
    registerIpcHandlers(ipcMain, () => bootstrapInfo)
    stage('registerIpcHandlers done')

    createWindow()
    stage('createWindow returned')

    await watcherService.mountAll()
    stage('watcherService.mountAll done')

    await schedulerService.mountAll()
    stage('schedulerService.mountAll done')

    await queueService.mountAll()
    stage('queueService.mountAll done')

    const theme = settingsStore.get('theme')
    if (theme === 'dark') nativeTheme.themeSource = 'dark'
    else if (theme === 'light') nativeTheme.themeSource = 'light'
    else nativeTheme.themeSource = 'system'

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  } catch (err) {
    logCrash('bootstrap', err)
    dialog.showErrorBox(
      'Trayline failed to start',
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void watcherService.unmountAll()
  void queueService.unmountAll()
  schedulerService.stopAll()
})
