import { app, dialog } from 'electron'
import pkg from 'electron-updater'

const { autoUpdater } = pkg

/**
 * Auto-update wiring against the GitHub Releases feed declared in
 * package.json#build.publish. Only runs in packaged production builds —
 * dev runs skip the check entirely.
 *
 * Pre-release strategy: we publish to GitHub with `prerelease: true` while
 * the app is in beta, so the updater is configured to consume pre-releases.
 * Flip `allowPrerelease` to false once we cut a stable release line.
 */
export function setupAutoUpdater(onLog: (msg: string) => void): void {
  if (!app.isPackaged) {
    onLog('auto-update: dev build — skipping')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = true

  autoUpdater.on('checking-for-update', () => onLog('auto-update: checking'))
  autoUpdater.on('update-available', (info) => onLog(`auto-update: available ${info.version}`))
  autoUpdater.on('update-not-available', () => onLog('auto-update: up to date'))
  autoUpdater.on('error', (err) => onLog(`auto-update: error ${err.message}`))
  autoUpdater.on('download-progress', (p) => onLog(`auto-update: ${Math.round(p.percent)}%`))
  autoUpdater.on('update-downloaded', (info) => {
    onLog(`auto-update: downloaded ${info.version} — will install on quit`)
    void dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: `Trayline ${info.version} is ready to install.`,
      detail: 'The update will be applied the next time the app restarts.',
    }).then((res) => {
      if (res.response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.checkForUpdates().catch((err) => {
    onLog(`auto-update: check failed ${err instanceof Error ? err.message : String(err)}`)
  })
}
