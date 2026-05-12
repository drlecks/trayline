import { useEffect } from 'react'
import { useThemeStore } from './stores/theme-store'
import { useProjectStore } from './stores/project-store'
import TopBar from './components/layout/TopBar'
import Footer from './components/layout/Footer'
import WelcomeSplash from './components/splash/WelcomeSplash'
import WorkflowAuthorScreen from './components/author/WorkflowAuthorScreen'
import ProjectScreen from './components/project/ProjectScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import ProviderNotInstalledModal from './components/layout/ProviderNotInstalledModal'

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
  const setActive = useProjectStore((s) => s.setActive)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)

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

  // First-mount bootstrap: load saved settings, then if a last-opened project
  // is recorded and still exists on disk, jump straight back into it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settings = await window.trayline.settings.get()
      if (cancelled) return
      setTheme(settings.theme)

      if (settings.lastOpenedProject) {
        await refreshProjects()
        if (cancelled) return
        const project = await window.trayline.project.get(settings.lastOpenedProject)
        if (cancelled) return
        if (project) {
          setActive(project)
        } else {
          // Recorded project no longer exists (deleted, renamed). Forget it
          // so the next launch goes straight to the welcome screen.
          void window.trayline.settings.set('lastOpenedProject', null)
        }
      }
    })()
    return () => { cancelled = true }
  }, [setTheme, setActive, refreshProjects])

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
      <ProviderNotInstalledModal />
    </div>
  )
}
