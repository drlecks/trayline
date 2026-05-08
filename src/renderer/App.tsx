import { useEffect } from 'react'
import { useThemeStore } from './stores/theme-store'
import TopBar from './components/layout/TopBar'

export default function App() {
  const { theme, setTheme } = useThemeStore()

  // Sync class on html element for Tailwind dark mode
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    if (theme === 'dark') root.classList.add('dark')
    else if (theme === 'light') root.classList.remove('dark')
    // 'system' — let Tailwind / OS decide (no class added)
  }, [theme])

  // Load saved theme from main on first mount
  useEffect(() => {
    window.trayline.settings.get().then((s) => {
      setTheme(s.theme)
    })
  }, [setTheme])

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      {/* Main content area — will be filled by later phases */}
      <main className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          No project open
        </div>
      </main>
    </div>
  )
}
