import { app, Tray, Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PlatformAdapter, PlatformCallbacks, TrayState } from './adapter'
import { resolveAppIcon } from '../util/app-icon'

export class DarwinAdapter implements PlatformAdapter {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null
  private callbacks: PlatformCallbacks | null = null
  private state: TrayState = { allRunning: false, allStopped: true }

  setup(win: BrowserWindow, callbacks: PlatformCallbacks): void {
    this.win = win
    this.callbacks = callbacks
    this.tray = new Tray(resolveAppIcon())
    this.tray.setToolTip('Trayline')
    // macOS convention: left-click opens the context menu, not the window directly.
    this.tray.on('click', () => this.tray!.popUpContextMenu())
    this.tray.setContextMenu(this.buildMenu())
    // Dock icon click re-surfaces the window.
    app.on('activate', () => this.surfaceWindow())
  }

  updateTrayState(state: TrayState): void {
    this.state = state
    if (this.tray) this.tray.setContextMenu(this.buildMenu())
  }

  surfaceWindow(): void {
    this.win?.show()
    this.win?.focus()
  }

  hideWindow(): void {
    // Do NOT hide the dock icon — Cmd+Tab should still show the app.
    this.win?.hide()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  setLaunchAtLogin(enabled: boolean): void {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
  }

  private buildMenu(): Electron.Menu {
    return Menu.buildFromTemplate([
      {
        label: 'Resume All',
        enabled: !this.state.allRunning,
        click: () => void this.callbacks?.onResumeAll(),
      },
      {
        label: 'Stop All',
        enabled: !this.state.allStopped,
        click: () => void this.callbacks?.onStopAll(),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => this.callbacks?.onQuit() },
    ])
  }
}
