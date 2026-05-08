import { Moon, Sun, Monitor } from 'lucide-react'
import { useThemeStore } from '../../stores/theme-store'
import type { Settings } from '../../../main/services/settings-store'

const THEME_CYCLE: Settings['theme'][] = ['system', 'light', 'dark']

const THEME_ICON = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export default function TopBar() {
  const { theme, setTheme } = useThemeStore()

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  const Icon = THEME_ICON[theme]

  return (
    <header className="
      flex items-center justify-between
      h-11 px-4 shrink-0
      border-b border-black/[0.06] dark:border-white/[0.06]
      bg-[var(--bg)]
      app-drag
    ">
      {/* Logo */}
      <div className="flex items-center gap-2 no-drag">
        <span className="font-semibold text-sm tracking-tight select-none">
          Trayline
        </span>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-1 no-drag">
        <button
          onClick={cycleTheme}
          title={`Theme: ${theme}`}
          className="
            p-1.5 rounded-md
            text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100
            hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
            transition-colors duration-150
          "
        >
          <Icon size={15} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  )
}
