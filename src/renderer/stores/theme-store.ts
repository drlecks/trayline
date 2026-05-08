import { create } from 'zustand'
import type { Settings } from '../../main/services/settings-store'

interface ThemeStore {
  theme: Settings['theme']
  setTheme: (theme: Settings['theme']) => void
  toggleTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'system',

  setTheme: (theme) => {
    set({ theme })
    window.trayline.settings.set('theme', theme)
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },
}))
