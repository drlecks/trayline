import { useEffect } from 'react'
import { useThemeStore } from './stores/theme-store'
import TopBar from './components/layout/TopBar'

function applyThemeClass(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    // system — follow OS preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

export default function App() {
  const { theme, setTheme } = useThemeStore()

  // Apply theme class whenever theme changes
  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  // When in system mode, re-apply whenever the OS preference changes
  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Load saved theme from main on first mount
  useEffect(() => {
    window.trayline.settings.get().then((s) => setTheme(s.theme))
  }, [setTheme])

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-neutral-400 text-sm">
          No project open
        </div>
      </main>
    </div>
  )
}
