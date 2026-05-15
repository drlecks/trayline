import { create } from 'zustand'
import type { ProjectMeta, StepMeta, WorkflowMeta, InstalledMcpRow } from '../../shared/types'
import type { MissingSkillsEntry } from '../../shared/types'

type Screen = 'splash' | 'projectList' | 'author' | 'project' | 'settings' | 'skills' | 'mcps'

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
  /** MCPs referenced by worker steps that are not in Ready state. stepId → mcp IDs. */
  unconfiguredMcpsByStep: Record<string, string[]>
  /** Project names that have at least one worker with a missing skill. */
  projectsWithMissingSkills: Set<string>
  /** When set, the author screen treats Generate as a regenerate of this project. */
  regenerateOf: string | null
  /** When set, CardsTab opens this card directly after mounting. */
  jumpTarget: { stepId: string; cardId: string } | null

  setScreen: (s: Screen) => void
  setActive: (p: ProjectMeta | null) => void
  setSelectedStepId: (id: string | null) => void
  setUnconfiguredMcps: (ids: string[]) => void
  setRegenerateOf: (name: string | null) => void
  setJumpTarget: (target: { stepId: string; cardId: string } | null) => void
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
  unconfiguredMcpsByStep: {},
  projectsWithMissingSkills: new Set(),
  regenerateOf: null,
  jumpTarget: null,

  setScreen: (s) => set({ screen: s }),
  setActive: (p) => {
    set({ active: p, screen: p ? 'project' : 'projectList', selectedStepId: null, steps: [], workflow: null, unconfiguredMcps: [] })
    void window.trayline.settings.set('lastOpenedProject', p ? p.name : null)
  },
  setSelectedStepId: (id) => set({ selectedStepId: id }),
  setUnconfiguredMcps: (ids) => set({ unconfiguredMcps: ids }),
  setRegenerateOf: (name) => set({ regenerateOf: name }),
  setJumpTarget: (target) => set({ jumpTarget: target }),

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
      set({ workflow: null, steps: [], missingSkillsByStep: {}, unconfiguredMcpsByStep: {} })
      return
    }
    const [workflows, skillEntries, installedMcps] = await Promise.all([
      window.trayline.project.listWorkflows(active.name),
      window.trayline.project.checkSkills(active.name).catch(() => [] as MissingSkillsEntry[]),
      window.trayline.mcp.listInstalled().catch(() => [] as InstalledMcpRow[]),
    ])
    const wf = workflows[0] ?? null
    if (!wf) {
      set({ workflow: null, steps: [], missingSkillsByStep: {}, unconfiguredMcpsByStep: {} })
      return
    }
    const steps = await window.trayline.project.listSteps(active.name, wf.name)
    const missingSkillsByStep: Record<string, string[]> = {}
    for (const entry of skillEntries) {
      missingSkillsByStep[entry.stepId] = entry.missingSkillIds
    }
    const unconfiguredMcpsByStep: Record<string, string[]> = {}
    for (const step of steps) {
      if (step.kind !== 'worker') continue
      const stepMcps = (step.raw as { mcps?: string[] }).mcps ?? []
      const notReady = stepMcps.filter((id) => {
        const row = installedMcps.find((m) => m.manifest.id === id)
        return !row || row.healthState !== 'ready'
      })
      if (notReady.length > 0) unconfiguredMcpsByStep[step.id] = notReady
    }
    set({ workflow: wf, steps, missingSkillsByStep, unconfiguredMcpsByStep })
    // If the previously selected step no longer exists, clear it.
    const sel = get().selectedStepId
    if (sel && !steps.some((s) => s.id === sel)) set({ selectedStepId: null })
  },
}))
