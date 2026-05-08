import Store from 'electron-store'
import type { Settings } from '../../shared/types'

export type { Settings }

const defaults: Settings = {
  theme: 'system',
  defaultCliCommand: 'claude',
  defaultAdapterId: 'claude-code',
  notificationsEnabled: true,
}

export const settingsStore = new Store<Settings>({
  name: 'settings',
  defaults,
})
