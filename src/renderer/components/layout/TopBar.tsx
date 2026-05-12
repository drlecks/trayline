import { Moon, Sun, Monitor, Settings as SettingsIcon, Package } from 'lucide-react'
import { useThemeStore } from '../../stores/theme-store'
import { useProjectStore } from '../../stores/project-store'
import WindowControls from './WindowControls'
import ProjectSwitcher from './ProjectSwitcher'
import type { Settings } from '../../../shared/types'

const THEME_CYCLE: Settings['theme'][] = ['system', 'light', 'dark']

const THEME_ICON = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

export default function TopBar() {
  const { theme, setTheme } = useThemeStore()
  const setScreen = useProjectStore((s) => s.setScreen)

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  const Icon = THEME_ICON[theme]

  return (
    <header className="
      flex items-center justify-between
      h-11 shrink-0
      border-b border-black/[0.06] dark:border-white/[0.06]
      bg-[var(--bg)]
      app-drag
    ">
      {/* Logo + project switcher */}
      <div className="flex items-center gap-3 px-4">
        <span className="font-semibold text-sm tracking-tight select-none no-drag">
          Trayline
        </span>
        <span className="text-neutral-300 dark:text-neutral-700 select-none no-drag">·</span>
        <ProjectSwitcher />
      </div>

      {/* Right controls */}
      <div className="flex items-center">
        <div className="flex items-center gap-1 px-2 no-drag">
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="
              p-1.5 rounded-md
              text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
              hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
              transition-colors duration-150
            "
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setScreen('skills')}
            title="Skills"
            className="
              p-1.5 rounded-md
              text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
              hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
              transition-colors duration-150
            "
          >
            <Package size={15} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setScreen('settings')}
            title="Settings"
            className="
              p-1.5 rounded-md
              text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
              hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
              transition-colors duration-150
            "
          >
            <SettingsIcon size={15} strokeWidth={1.75} />
          </button>
        </div>

        <WindowControls />
      </div>
    </header>
  )
}
