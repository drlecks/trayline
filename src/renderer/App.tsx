import { useEffect, useState } from 'react'
import { useThemeStore } from './stores/theme-store'
import { useProjectStore } from './stores/project-store'
import TopBar from './components/layout/TopBar'
import Footer from './components/layout/Footer'
import WelcomeSplash from './components/splash/WelcomeSplash'
import WorkflowAuthorScreen from './components/author/WorkflowAuthorScreen'
import ProjectListScreen from './components/projects/ProjectListScreen'
import ProjectScreen from './components/project/ProjectScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import SkillsScreen from './components/skills/SkillsScreen'
import McpsScreen from './components/mcps/McpsScreen'
import ProviderNotInstalledModal from './components/layout/ProviderNotInstalledModal'
import OnboardingTour from './components/onboarding/OnboardingTour'
import ShortcutsDialog from './components/shortcuts/ShortcutsDialog'
import CommandPalette from './components/shortcuts/CommandPalette'
import { useGlobalShortcuts } from './components/shortcuts/useGlobalShortcuts'

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
  const setScreen = useProjectStore((s) => s.setScreen)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)

  const [tourOpen, setTourOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useGlobalShortcuts({
    openSettings: () => setScreen('settings'),
    openPalette: () => setPaletteOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
  })

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

  // First-mount bootstrap. Routing rules:
  //   - No projects on disk → straight into the Workflow Author (clean state).
  //   - Otherwise → Project List screen, where the user picks one to open.
  // The previous behaviour of auto-resuming the last-opened project was removed
  // intentionally so the user always sees the list (and project status) first.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const settings = await window.trayline.settings.get()
      if (cancelled) return
      setTheme(settings.theme)

      await refreshProjects()
      if (cancelled) return
      const projects = useProjectStore.getState().all
      if (projects.length === 0) {
        setScreen('author')
        void window.trayline.settings.set('lastOpenedProject', null)
      } else {
        setScreen('projectList')
      }
      if (!settings.onboardingComplete) setTourOpen(true)
    })()
    return () => { cancelled = true }
  }, [setTheme, setActive, setScreen, refreshProjects])

  // Allow other screens to re-trigger the tour (Help link in Settings).
  useEffect(() => {
    function open() { setTourOpen(true) }
    window.addEventListener('trayline:open-tour', open)
    return () => window.removeEventListener('trayline:open-tour', open)
  }, [])

  async function closeTour() {
    setTourOpen(false)
    await window.trayline.settings.set('onboardingComplete', true)
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <main className="flex flex-1 overflow-hidden">
        {screen === 'splash' && (
          <div className="flex-1 overflow-y-auto py-12 flex">
            <WelcomeSplash />
          </div>
        )}
        {screen === 'projectList' && (
          <div className="flex-1 overflow-y-auto py-12 flex">
            <ProjectListScreen />
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
        {screen === 'skills' && (
          <div className="flex-1 overflow-y-auto">
            <SkillsScreen />
          </div>
        )}
        {screen === 'mcps' && (
          <div className="flex-1 overflow-y-auto">
            <McpsScreen />
          </div>
        )}
      </main>
      <Footer />
      <ProviderNotInstalledModal />
      <OnboardingTour open={tourOpen} onClose={closeTour} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
    </div>
  )
}
