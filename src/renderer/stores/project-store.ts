import { create } from 'zustand'
import type { ProjectMeta, StepMeta, WorkflowMeta } from '../../shared/types'
import type { MissingSkillsEntry } from '../../shared/types'

type Screen = 'splash' | 'projectList' | 'author' | 'project' | 'settings' | 'skills'

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
  /** MCPs referenced by the active project that aren't ready. Drives the banner. */
  unconfiguredMcps: string[]
  /** Missing skills per worker step in the open project. stepId → skill IDs. */
  missingSkillsByStep: Record<string, string[]>
  /** Project names that have at least one worker with a missing skill. */
  projectsWithMissingSkills: Set<string>
  /** When set, the author screen treats Generate as a regenerate of this project. */
  regenerateOf: string | null

  setScreen: (s: Screen) => void
  setActive: (p: ProjectMeta | null) => void
  setSelectedStepId: (id: string | null) => void
  setUnconfiguredMcps: (ids: string[]) => void
  setRegenerateOf: (name: string | null) => void
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
  unconfiguredMcps: [],
  missingSkillsByStep: {},
  projectsWithMissingSkills: new Set(),
  regenerateOf: null,

  setScreen: (s) => set({ screen: s }),
  setActive: (p) => {
    set({ active: p, screen: p ? 'project' : 'projectList', selectedStepId: null, steps: [], workflow: null })
    void window.trayline.settings.set('lastOpenedProject', p ? p.name : null)
  },
  setSelectedStepId: (id) => set({ selectedStepId: id }),
  setUnconfiguredMcps: (ids) => set({ unconfiguredMcps: ids }),
  setRegenerateOf: (name) => set({ regenerateOf: name }),

  refreshProjects: async () => {
    const all = await window.trayline.project.list()
    // Check all projects in parallel for missing skills (drives the list-screen badge).
    const checks = await Promise.all(
      all.map((p) => window.trayline.project.checkSkills(p.name).catch(() => [] as MissingSkillsEntry[])),
    )
    const projectsWithMissingSkills = new Set(
      all.filter((_, i) => checks[i].length > 0).map((p) => p.name),
    )
    set({ all, projectsWithMissingSkills })
  },

  refreshSteps: async () => {
    const active = get().active
    if (!active) {
      set({ workflow: null, steps: [], missingSkillsByStep: {} })
      return
    }
    const [workflows, skillEntries] = await Promise.all([
      window.trayline.project.listWorkflows(active.name),
      window.trayline.project.checkSkills(active.name).catch(() => [] as MissingSkillsEntry[]),
    ])
    const wf = workflows[0] ?? null
    if (!wf) {
      set({ workflow: null, steps: [], missingSkillsByStep: {} })
      return
    }
    const steps = await window.trayline.project.listSteps(active.name, wf.name)
    const missingSkillsByStep: Record<string, string[]> = {}
    for (const entry of skillEntries) {
      missingSkillsByStep[entry.stepId] = entry.missingSkillIds
    }
    set({ workflow: wf, steps, missingSkillsByStep })
    // If the previously selected step no longer exists, clear it.
    const sel = get().selectedStepId
    if (sel && !steps.some((s) => s.id === sel)) set({ selectedStepId: null })
  },
}))
