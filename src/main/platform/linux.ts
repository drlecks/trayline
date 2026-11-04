import { app, Tray, Menu } from 'electron'
import type { BrowserWindow } from 'electron'
import type { PlatformAdapter, PlatformCallbacks, TrayState } from './adapter'
import { resolveAppIcon } from '../util/app-icon'
import { setLinuxAutostart } from './linux-autostart'

export class LinuxAdapter implements PlatformAdapter {
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
    // On Linux, popUpContextMenu() is unreliable across DEs — use static setContextMenu.
    this.tray.setContextMenu(this.buildMenu())
    // Ctrl+Q quits. The window is frameless with no menu bar, and the tray menu
    // may be missing (see hideWindow), so this is the always-available Quit.
    win.webContents.on('before-input-event', (e, input) => {
      if (input.type === 'keyDown' && input.control && !input.alt && !input.meta && input.key.toLowerCase() === 'q') {
        e.preventDefault()
        this.callbacks?.onQuit()
      }
    })
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
    // Minimize rather than hide: stock GNOME (and some other DEs) show no tray
    // icon without an AppIndicator extension, and Electron can't detect that.
    // A hidden window would leave the app running with nothing on screen and
    // no way to reach it; a minimized one stays in the taskbar/dock.
    this.win?.minimize()
  }

  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }

  setLaunchAtLogin(enabled: boolean): void {
    // app.setLoginItemSettings() is a no-op on Linux. Only packaged builds get an
    // entry — in dev, execPath is the bare Electron binary, not Trayline.
    if (!app.isPackaged) return
    // Inside an AppImage, execPath points into a temporary mount; APPIMAGE is
    // the stable path to the .AppImage file itself.
    setLinuxAutostart(enabled, process.env.APPIMAGE ?? process.execPath)
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
