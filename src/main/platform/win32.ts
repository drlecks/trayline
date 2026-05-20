import { Tray, Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PlatformAdapter, PlatformCallbacks, TrayState } from './adapter'
import { resolveAppIcon } from '../util/app-icon'

export class Win32Adapter implements PlatformAdapter {
  private tray: Tray | null = null
  private win: BrowserWindow | null = null
  private callbacks: PlatformCallbacks | null = null
  private state: TrayState = { allRunning: false, allStopped: true }

  setup(win: BrowserWindow, callbacks: PlatformCallbacks): void {
    this.win = win
    this.callbacks = callbacks
    this.tray = new Tray(resolveAppIcon())
    this.tray.setToolTip('Trayline')
    this.tray.on('click', () => this.surfaceWindow())
    this.tray.on('right-click', () => this.tray!.popUpContextMenu())
    this.tray.setContextMenu(this.buildMenu())
  }

  updateTrayState(state: TrayState): void {
    this.state = state
    if (this.tray) this.tray.setContextMenu(this.buildMenu())
  }

  surfaceWindow(): void {
    if (!this.win) return
    if (this.win.isMinimized()) this.win.restore()
    else if (!this.win.isVisible()) this.win.show()
    this.win.focus()
  }

  hideWindow(): void {
    this.win?.hide()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
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
