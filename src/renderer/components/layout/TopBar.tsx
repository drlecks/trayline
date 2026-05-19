import { Moon, Sun, Monitor, Settings as SettingsIcon, KeyRound, Terminal } from 'lucide-react'
import { useThemeStore } from '../../stores/theme-store'
import { useProjectStore } from '../../stores/project-store'
import { useActiveRunsStore } from '../../stores/active-runs-store'
import WindowControls from './WindowControls'
import ProjectSwitcher from './ProjectSwitcher'
import QueueBadge from './QueueBadge'
import type { Settings } from '../../../shared/types'
import iconUrl from '../../../../resources/icon-128.png'

const THEME_CYCLE: Settings['theme'][] = ['system', 'light', 'dark']

const THEME_ICON = {
  system: Monitor,
  light: Sun,
  dark: Moon,
}

interface Props {
  onOpenAIConsole: () => void
}

export default function TopBar({ onOpenAIConsole }: Props) {
  const { theme, setTheme } = useThemeStore()
  const setScreen = useProjectStore((s) => s.setScreen)
  const setActive = useProjectStore((s) => s.setActive)
  const activeRunCount = useActiveRunsStore((s) => s.activeRuns.length)

  function cycleTheme() {
    const idx = THEME_CYCLE.indexOf(theme)
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  const Icon = THEME_ICON[theme]

  return (
    <header data-tour="topbar" className="
      flex items-center justify-between
      h-11 shrink-0
      border-b border-black/[0.06] dark:border-white/[0.06]
      bg-[var(--bg)]
      app-drag
    ">
      {/* Logo + project switcher */}
      <div className="flex items-center gap-3 px-4">
        <button
          onClick={() => setActive(null)}
          className="flex items-center gap-2 no-drag rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors duration-150 px-1 -mx-1"
          title="All projects"
        >
          <img
            src={iconUrl}
            alt=""
            className="w-5 h-5 rounded select-none"
            draggable={false}
          />
          <span className="font-semibold text-sm tracking-tight select-none">
            Trayline
          </span>
        </button>
        <span className="text-neutral-300 dark:text-neutral-700 select-none no-drag">·</span>
        <ProjectSwitcher />
      </div>

      {/* Right controls */}
      <div className="flex items-center">
        <div className="flex items-center gap-1 px-2 no-drag">
          {activeRunCount > 0 && (
            <button
              onClick={() => setScreen('projectList')}
              title={`${activeRunCount} run${activeRunCount > 1 ? 's' : ''} in progress`}
              className="p-1.5 rounded-md hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors duration-150"
            >
              <span className="block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>
          )}
          <QueueBadge />
          <button
            onClick={onOpenAIConsole}
            title="Quick AI (Ctrl+Shift+A)"
            className="
              p-1.5 rounded-md
              text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
              hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
              transition-colors duration-150
            "
          >
            <Terminal size={15} strokeWidth={1.75} />
          </button>
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
            onClick={() => setScreen('credentials')}
            title="Credentials"
            className="
              p-1.5 rounded-md
              text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
              hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
              transition-colors duration-150
            "
          >
            <KeyRound size={15} strokeWidth={1.75} />
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
