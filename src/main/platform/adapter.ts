import type { BrowserWindow } from 'electron'

export interface TrayState {
  /** True when every active project is currently mounted (orchestrator). */
  allRunning: boolean
  /** True when no project is currently mounted. */
  allStopped: boolean
}

export interface PlatformCallbacks {
  onResumeAll: () => Promise<void>
  onStopAll: () => Promise<void>
  onQuit: () => void
}

export interface PlatformAdapter {
  /**
   * Called once after the main BrowserWindow is created.
   * Creates the system tray icon and registers all platform hooks.
   */
  setup(win: BrowserWindow, callbacks: PlatformCallbacks): void

  /**
   * Refreshes enabled/disabled state of the tray context-menu items.
   * Called after any orchestrator mount/unmount operation.
   */
  updateTrayState(state: TrayState): void

  /** Bring the main window to the foreground (from second-instance or tray click). */
  surfaceWindow(): void

  /** Hide the window without quitting (from close-button interception). */
  hideWindow(): void

  /** Tear down the tray icon. Called synchronously just before app.quit(). */
  destroy(): void

  /**
   * Register or unregister the app as an OS login item so it launches at
   * startup. Uses Electron's app.setLoginItemSettings() — the entry appears
   * in Windows Task Manager's Startup tab, macOS Login Items, and Linux XDG
   * autostart. openAsHidden is set so the app starts in the background.
   */
  setLaunchAtLogin(enabled: boolean): void
}
