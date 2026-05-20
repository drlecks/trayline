import 'dotenv/config'
import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } from 'electron'
import { join } from 'path'
import fs from 'fs'
import { settingsStore } from './services/settings-store'
import { fsService, Paths } from './services/fs-service'
import { auditDb } from './services/audit-db'
import { workerRunner, setRunEventBroadcast } from './services/worker-runner'
import { sourceRunner, setSourceEventBroadcast } from './services/source-runner'
import { setOutletEventBroadcast } from './services/outlet-runner'
import { orchestrator } from './services/orchestrator'
import { setupAutoUpdater } from './services/auto-update-service'
import { registerIpcHandlers } from './ipc/handlers'
import { notificationService } from './services/notification-service'
import { dirnameFromMeta } from './util/paths'
import { resolveAppIcon } from './util/app-icon'
import { getPlatformAdapter } from './platform/registry'
import type { TrayState } from './platform/adapter'

const __dirname = dirnameFromMeta(import.meta.url)

// ── N12-B: Single-instance lock ───────────────────────────────────────────────
// Must be called before app.whenReady(). If another instance is already running,
// quit this one and let the existing instance surface its window.
const platformAdapter = getPlatformAdapter()
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
app.on('second-instance', () => platformAdapter.surfaceWindow())

// ── N12-C1: Close-to-tray flag ────────────────────────────────────────────────
// When true the before-quit / close path does a real exit; when false, close
// hides the window instead of destroying it.
let isQuitting = false

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
  appVersion: string
}

let bootstrapInfo: BootstrapInfo

// ── N12-E2/E3: Tray state helpers ─────────────────────────────────────────────

async function getTrayState(): Promise<TrayState> {
  const mounted = orchestrator.getMountedCount()
  const total = await orchestrator.getTotalActiveCount()
  return { allRunning: mounted >= total && total > 0, allStopped: mounted === 0 }
}

async function refreshTrayState(): Promise<void> {
  const state = await getTrayState()
  platformAdapter.updateTrayState(state)
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

  // N12-C2: Intercept close button — hide instead of destroy when not quitting.
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      platformAdapter.hideWindow()
    }
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

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
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

    const { recovered } = await workerRunner.recoverOrphanedRuns()
    stage(`workerRunner.recoverOrphanedRuns done (recovered=${recovered})`)

    const { recovered: sourceRecovered } = await sourceRunner.recoverOrphanedRuns()
    stage(`sourceRunner.recoverOrphanedRuns done (recovered=${sourceRecovered})`)

    setRunEventBroadcast(() => BrowserWindow.getAllWindows())
    setSourceEventBroadcast(() => BrowserWindow.getAllWindows())
    setOutletEventBroadcast(() => BrowserWindow.getAllWindows())

    bootstrapInfo = { dataDir: Paths.root, appVersion: app.getVersion() }
    registerIpcHandlers(
      ipcMain,
      () => bootstrapInfo,
      () => void refreshTrayState(),
      (enabled) => platformAdapter.setLaunchAtLogin(enabled),
    )
    stage('registerIpcHandlers done')

    const win = createWindow()
    notificationService.setMainWindow(win)
    stage('createWindow returned')

    // N12-G2: Wire up the platform adapter after the window exists.
    platformAdapter.setup(win, {
      onResumeAll: async () => {
        await orchestrator.mountAll()
        void refreshTrayState()
      },
      onStopAll: async () => {
        await orchestrator.unmountAll()
        void refreshTrayState()
      },
      // N12-C5: Real quit sets the flag so the close handler lets the window destroy.
      onQuit: () => {
        isQuitting = true
        app.quit()
      },
    })

    // Apply the persisted launch-at-login preference on every startup so the
    // OS registration stays in sync if it was externally modified or cleared.
    platformAdapter.setLaunchAtLogin(settingsStore.get('launchAtLogin'))

    await orchestrator.mountAll()
    stage('orchestrator.mountAll done')

    // N12-G3: Sync tray state after initial mount.
    void refreshTrayState()

    void notificationService.refreshBadgeCount()
    stage('notificationService.refreshBadgeCount called')

    setupAutoUpdater(stage)

    const theme = settingsStore.get('theme')
    if (theme === 'dark') nativeTheme.themeSource = 'dark'
    else if (theme === 'light') nativeTheme.themeSource = 'light'
    else nativeTheme.themeSource = 'system'
  } catch (err) {
    logCrash('bootstrap', err)
    dialog.showErrorBox(
      'Trayline failed to start',
      err instanceof Error ? (err.stack ?? err.message) : String(err),
    )
    app.quit()
  }
})

// N12-C3: No-op — hiding the window must not trigger a quit.
// The real quit path is the "Quit" tray menu item (onQuit callback above).
app.on('window-all-closed', () => {
  /* intentionally empty — close hides to tray, not quits */
})

app.on('before-quit', () => {
  // N12-G4: Tear down the tray icon before the process exits.
  platformAdapter.destroy()
  void orchestrator.unmountAll()
})
