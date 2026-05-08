import { IpcMain, nativeTheme } from 'electron'
import { settingsStore, Settings } from '../services/settings-store'
import { auditDb } from '../services/audit-db'

export function registerIpcHandlers(ipcMain: IpcMain) {
  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', () => settingsStore.store)

  ipcMain.handle('settings:set', <K extends keyof Settings>(_: unknown, key: K, value: Settings[K]) => {
    settingsStore.set(key, value)

    if (key === 'theme') {
      const t = value as Settings['theme']
      nativeTheme.themeSource = t === 'system' ? 'system' : t
    }

    return settingsStore.store
  })

  // ── Audit log ─────────────────────────────────────────────────────────────
  ipcMain.handle('audit:query', (_: unknown, filters: Parameters<typeof auditDb.query>[0]) =>
    auditDb.query(filters),
  )
}
