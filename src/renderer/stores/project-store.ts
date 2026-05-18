import { create } from 'zustand'
import type { ProjectMeta, StepMeta, WorkflowMeta } from '../../shared/types'

type Screen = 'splash' | 'projectList' | 'author' | 'project' | 'settings' | 'credentials'

interface ProjectStoreState {
  /** The project currently open in the right canvas, or null on the splash. */
  active: ProjectMeta | null
  /** All projects on disk; populated by refreshProjects(). */
  all: ProjectMeta[]
  /** Active project's first workflow, populated by refreshSteps(). */
  workflow: WorkflowMeta | null
  /** All steps in the active workflow, in display order. */
  steps: StepMeta[]
  /** Step the user has selected in the rail; drives the right canvas. */
  selectedStepId: string | null
  /** Which top-level screen is rendered. */
  screen: Screen
  /** When set, the author screen treats Generate as a regenerate of this project. */
  regenerateOf: string | null
  /** When set, CardsTab opens this card directly after mounting. */
  jumpTarget: { stepId: string; cardId: string } | null
  /** Name of the most recently generated project; drives the FirstProjectGuide. Cleared on dismiss or step selection. */
  justCreatedProject: string | null

  setScreen: (s: Screen) => void
  setActive: (p: ProjectMeta | null) => void
  setSelectedStepId: (id: string | null) => void
  setRegenerateOf: (name: string | null) => void
  setJumpTarget: (target: { stepId: string; cardId: string } | null) => void
  setJustCreatedProject: (name: string | null) => void
  refreshProjects: () => Promise<void>
  refreshSteps: () => Promise<void>
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  active: null,
  all: [],
  workflow: null,
  steps: [],
  selectedStepId: null,
  screen: 'splash',
  regenerateOf: null,
  jumpTarget: null,
  justCreatedProject: null,

  setScreen: (s) => set({ screen: s }),
  setActive: (p) => {
    set({ active: p, screen: p ? 'project' : 'projectList', selectedStepId: null, steps: [], workflow: null })
    void window.trayline.settings.set('lastOpenedProject', p ? p.name : null)
  },
  setSelectedStepId: (id) => {
    set({ selectedStepId: id })
    // Any step selection dismisses the first-project guide
    if (id !== null) set({ justCreatedProject: null })
  },
  setRegenerateOf: (name) => set({ regenerateOf: name }),
  setJumpTarget: (target) => set({ jumpTarget: target }),
  setJustCreatedProject: (name) => set({ justCreatedProject: name }),

  refreshProjects: async () => {
    const all = await window.trayline.project.list()
    set({ all })
  },

  refreshSteps: async () => {
    const active = get().active
    if (!active) {
      set({ workflow: null, steps: [] })
      return
    }
    const workflows = await window.trayline.project.listWorkflows(active.name)
    const wf = workflows[0] ?? null
    if (!wf) {
      set({ workflow: null, steps: [] })
      return
    }
    const steps = await window.trayline.project.listSteps(active.name, wf.name)
    set({ workflow: wf, steps })
    // If the previously selected step no longer exists, clear it.
    const sel = get().selectedStepId
    if (sel && !steps.some((s) => s.id === sel)) set({ selectedStepId: null })
  },
}))
