import { create } from 'zustand'
import type { ProjectMeta } from '../../shared/types'

type Screen = 'splash' | 'author' | 'project' | 'settings'

interface ProjectStoreState {
  /** The project currently open in the right canvas, or null on the splash. */
  active: ProjectMeta | null
  /** All projects on disk; populated by refreshProjects(). */
  all: ProjectMeta[]
  /** Which top-level screen is rendered. */
  screen: Screen
  /** MCPs referenced by the active project that aren't ready. Drives the banner. */
  unconfiguredMcps: string[]
  /** When set, the author screen treats Generate as a regenerate of this project. */
  regenerateOf: string | null

  setScreen: (s: Screen) => void
  setActive: (p: ProjectMeta | null) => void
  setUnconfiguredMcps: (ids: string[]) => void
  setRegenerateOf: (name: string | null) => void
  refreshProjects: () => Promise<void>
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  active: null,
  all: [],
  screen: 'splash',
  unconfiguredMcps: [],
  regenerateOf: null,

  setScreen: (s) => set({ screen: s }),
  setActive: (p) => {
    set({ active: p, screen: p ? 'project' : 'splash' })
    // Persist so the next launch reopens the same project. Fire-and-forget
    // — IPC errors here aren't worth interrupting the user for.
    void window.trayline.settings.set('lastOpenedProject', p ? p.name : null)
  },
  setUnconfiguredMcps: (ids) => set({ unconfiguredMcps: ids }),
  setRegenerateOf: (name) => set({ regenerateOf: name }),

  refreshProjects: async () => {
    const all = await window.trayline.project.list()
    set({ all })
  },
}))
