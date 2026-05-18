import { useEffect, useState } from 'react'
import { useThemeStore } from './stores/theme-store'
import { useProjectStore } from './stores/project-store'
import { useAdapterStore } from './stores/adapter-store'
import TopBar from './components/layout/TopBar'
import Footer from './components/layout/Footer'
import WelcomeSplash from './components/splash/WelcomeSplash'
import WorkflowAuthorScreen from './components/author/WorkflowAuthorScreen'
import ProjectListScreen from './components/projects/ProjectListScreen'
import ProjectScreen from './components/project/ProjectScreen'
import SettingsScreen from './components/settings/SettingsScreen'
import CredentialsScreen from './components/credentials/CredentialsScreen'
import ProviderNotInstalledModal from './components/layout/ProviderNotInstalledModal'
import AdapterSetupScreen from './components/adapter/AdapterSetupScreen'
import OnboardingTour from './components/onboarding/OnboardingTour'
import ShortcutsDialog from './components/shortcuts/ShortcutsDialog'
import CommandPalette from './components/shortcuts/CommandPalette'
import QuickAIConsoleModal from './components/ai/QuickAIConsoleModal'
import { useGlobalShortcuts } from './components/shortcuts/useGlobalShortcuts'
import { useActiveRunsStore } from './stores/active-runs-store'

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
  const setScreen = useProjectStore((s) => s.setScreen)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)
  const updateFromCheckAll = useAdapterStore((s) => s.updateFromCheckAll)
  const setReadiness = useAdapterStore((s) => s.setReadiness)

  // null = still checking; true = at least one installed; false = none installed
  const [adapterGateResolved, setAdapterGateResolved] = useState<boolean | null>(null)

  const [tourOpen, setTourOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [aiConsoleOpen, setAiConsoleOpen] = useState(false)

  useGlobalShortcuts({
    openSettings: () => setScreen('settings'),
    openPalette: () => setPaletteOpen(true),
    openShortcuts: () => setShortcutsOpen(true),
    openAIConsole: () => setAiConsoleOpen(true),
  })

  // Initialize global active-runs subscription (runs until app unmounts)
  useEffect(() => {
    return useActiveRunsStore.getState().init()
  }, [])

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

  // Subscribe to adapter readiness changes broadcast from main.
  useEffect(() => {
    return window.trayline.adapter.onReadinessChanged((r) => {
      setReadiness(r.adapterId, r)
      if (r.installed && adapterGateResolved === false) {
        setAdapterGateResolved(true)
      }
    })
  }, [setReadiness, adapterGateResolved])

  // First-mount bootstrap. Routing rules:
  //   1. Check adapter readiness. If no production adapter is installed → show
  //      AdapterSetupScreen gate before anything else.
  //   2. No projects on disk → straight into the Workflow Author (clean state).
  //   3. Otherwise → Project List screen.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [settings, readinessMap] = await Promise.all([
        window.trayline.settings.get(),
        window.trayline.adapter.checkReadiness(),
      ])
      if (cancelled) return

      setTheme(settings.theme)
      updateFromCheckAll(readinessMap)

      const installed = Object.values(readinessMap).some((r) => r.installed)
      setAdapterGateResolved(installed)
      if (!installed) return  // AdapterSetupScreen takes over; onReady() will resume bootstrap

      await bootstrapRouting()
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function bootstrapRouting() {
    await refreshProjects()
    const projects = useProjectStore.getState().all
    if (projects.length === 0) {
      setScreen('author')
      void window.trayline.settings.set('lastOpenedProject', null)
    } else {
      setScreen('projectList')
    }
  }

  async function handleAdapterReady() {
    setAdapterGateResolved(true)
    const settings = await window.trayline.settings.get()
    setTheme(settings.theme)
    await bootstrapRouting()
  }

  // Allow other screens to re-trigger the tour (Help link in Settings).
  useEffect(() => {
    function open() { setTourOpen(true) }
    window.addEventListener('trayline:open-tour', open)
    return () => window.removeEventListener('trayline:open-tour', open)
  }, [])

  // Navigate to a specific card when a notification is clicked.
  useEffect(() => {
    return window.trayline.notifications.onNavigate(async ({ projectName, cardId }) => {
      const project = await window.trayline.project.get(projectName)
      if (!project) return
      const { setActive, setSelectedStepId, setJumpTarget } = useProjectStore.getState()

      // Find which tray step has this card in pending
      const workflows = await window.trayline.project.listWorkflows(projectName)
      for (const wf of workflows) {
        const steps = await window.trayline.project.listSteps(projectName, wf.name)
        for (const step of steps) {
          if (step.kind !== 'tray') continue
          const result = await window.trayline.card.get(projectName, wf.name, step.id, cardId)
          if (result) {
            setActive(project)
            setSelectedStepId(step.id)
            setJumpTarget({ stepId: step.id, cardId })
            return
          }
        }
      }
      // Fallback: just open the project
      setActive(project)
    })
  }, [])

  async function closeTour() {
    setTourOpen(false)
    await window.trayline.settings.set('onboardingComplete', true)
  }

  // While checking — render nothing (avoids a flash of the wrong screen).
  if (adapterGateResolved === null) return null

  // No adapter installed — show the full-window setup gate.
  if (adapterGateResolved === false) {
    return <AdapterSetupScreen onReady={() => void handleAdapterReady()} />
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar onOpenAIConsole={() => setAiConsoleOpen(true)} />
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
        {screen === 'credentials' && (
          <div className="flex-1 overflow-y-auto flex">
            <CredentialsScreen />
          </div>
        )}
      </main>
      <Footer />
      <ProviderNotInstalledModal />
      <OnboardingTour open={tourOpen} onClose={closeTour} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <QuickAIConsoleModal open={aiConsoleOpen} onOpenChange={setAiConsoleOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />
    </div>
  )
}
