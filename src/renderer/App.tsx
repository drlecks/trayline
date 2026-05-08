import { useEffect } from 'react'
import { useThemeStore } from './stores/theme-store'
import { useProjectStore } from './stores/project-store'
import TopBar from './components/layout/TopBar'
import Footer from './components/layout/Footer'
import WelcomeSplash from './components/splash/WelcomeSplash'
import WorkflowAuthorScreen from './components/author/WorkflowAuthorScreen'
import ProjectScreen from './components/project/ProjectScreen'
import SettingsScreen from './components/settings/SettingsScreen'

function applyThemeClass(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  }
}

export default function App() {
  const { theme, setTheme } = useThemeStore()
  const screen = useProjectStore((s) => s.screen)

  useEffect(() => {
    applyThemeClass(theme)
  }, [theme])

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyThemeClass('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  useEffect(() => {
    window.trayline.settings.get().then((s) => setTheme(s.theme))
  }, [setTheme])

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <main className="flex flex-1 overflow-hidden">
        {screen === 'splash' && (
          <div className="flex-1 overflow-y-auto py-12 flex">
            <WelcomeSplash />
          </div>
        )}
        {screen === 'author' && (
          <div className="flex-1 overflow-y-auto py-12 flex">
            <WorkflowAuthorScreen />
          </div>
        )}
        {screen === 'project' && <ProjectScreen />}
        {screen === 'settings' && (
          <div className="flex-1 overflow-y-auto">
            <SettingsScreen />
          </div>
        )}
      </main>
      <Footer />
    </div>
  )
}
