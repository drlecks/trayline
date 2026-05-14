import Store from 'electron-store'
import { Paths } from './fs-service'
import type { Settings } from '../../shared/types'

export type { Settings }

const defaults: Settings = {
  theme: 'system',
  defaultCliCommand: 'claude',
  defaultAdapterId: 'claude-code',
  defaultModelByAdapter: {},
  defaultEffortByAdapter: {},
  notificationsEnabled: true,
  lastOpenedProject: null,
  onboardingComplete: false,
}

// Settings live alongside the rest of Trayline's data under
// `~/Documents/Trayline/app-data/settings.json`, not in the OS userData dir.
// This keeps everything inspectable in one place and makes it possible to
// back up the entire Trayline directory by copying one folder.
export const settingsStore = new Store<Settings>({
  cwd: Paths.appData,
  name: 'settings',
  defaults,
})
