import { create } from 'zustand'
import type { WorkerRunEvent } from '../../shared/worker-run'
import type { SourceRunEvent } from '../../shared/types'
import { useProjectStore } from './project-store'

export interface ActiveRun {
  runId: string
  project: string
  workflow: string
  stepId: string
  /** Human-readable "Project Name / Step Name" — resolved asynchronously after add. */
  displayName: string
  startedAt: number
  kind: 'worker' | 'source'
}

interface ActiveRunsState {
  runs: Map<string, ActiveRun>
  activeRuns: ActiveRun[]
  /** Call once from the app root. Returns a cleanup function. */
  init: () => () => void
}

function sortedRuns(runs: Map<string, ActiveRun>): ActiveRun[] {
  return [...runs.values()].sort((a, b) => b.startedAt - a.startedAt)
}

export const useActiveRunsStore = create<ActiveRunsState>((set) => ({
  runs: new Map(),
  activeRuns: [],

  init: () => {
    async function resolveDisplayName(runId: string, project: string, workflow: string, stepId: string) {
      try {
        const steps = await window.trayline.project.listSteps(project, workflow)
        const allProjects = useProjectStore.getState().all
        const step = steps.find((s) => s.id === stepId)
        const proj = allProjects.find((p) => p.name === project)
        const displayName = `${proj?.display_name ?? project} / ${step?.name ?? stepId}`
        set((state) => {
          const runs = new Map(state.runs)
          const run = runs.get(runId)
          if (!run) return state
          runs.set(runId, { ...run, displayName })
          return { runs, activeRuns: sortedRuns(runs) }
        })
      } catch { /* ignore */ }
    }

    function addRun(runId: string, project: string, workflow: string, stepId: string, kind: 'worker' | 'source') {
      const allProjects = useProjectStore.getState().all
      const proj = allProjects.find((p) => p.name === project)
      const displayName = `${proj?.display_name ?? project} / ${stepId}`
      const run: ActiveRun = { runId, project, workflow, stepId, displayName, startedAt: Date.now(), kind }
      set((state) => {
        const runs = new Map(state.runs)
        runs.set(runId, run)
        return { runs, activeRuns: sortedRuns(runs) }
      })
      void resolveDisplayName(runId, project, workflow, stepId)
    }

    function removeRun(runId: string) {
      set((state) => {
        if (!state.runs.has(runId)) return state
        const runs = new Map(state.runs)
        runs.delete(runId)
        return { runs, activeRuns: sortedRuns(runs) }
      })
    }

    const offWorker = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.type === 'started') addRun(ev.runId, ev.project, ev.workflow, ev.stepId, 'worker')
      else if (ev.type === 'finished') removeRun(ev.runId)
    })

    const offSource = window.trayline.source.onRunEvent((ev: SourceRunEvent) => {
      if (ev.type === 'started') addRun(ev.runId, ev.project, ev.workflow, ev.stepId, 'source')
      else if (ev.type === 'completed' || ev.type === 'failed') removeRun(ev.runId)
    })

    return () => {
      offWorker()
      offSource()
    }
  },
}))
