import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { join } from 'path'
import { settingsStore } from './services/settings-store'
import { fsService } from './services/fs-service'
import { auditDb } from './services/audit-db'
import { registerIpcHandlers } from './ipc/handlers'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0F0F0F' : '#FAFAF9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  await fsService.bootstrap()
  auditDb.init()
  registerIpcHandlers(ipcMain)

  const win = createWindow()

  // Apply saved theme on launch
  const theme = settingsStore.get('theme')
  if (theme === 'dark') nativeTheme.themeSource = 'dark'
  else if (theme === 'light') nativeTheme.themeSource = 'light'
  else nativeTheme.themeSource = 'system'

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
