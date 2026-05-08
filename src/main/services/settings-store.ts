import Store from 'electron-store'

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  defaultCliCommand: string
  defaultAdapterId: string
  notificationsEnabled: boolean
}

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
