import { useEffect, useState, useCallback, useRef } from 'react'
import { AlertTriangle, Plus, Trash2, Upload, Download, PauseCircle, PlayCircle } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { ProjectMeta, ProjectStatus, ProjectLiveStats, ProjectReadiness } from '../../../shared/types'
import GlobalActivityBar from './GlobalActivityBar'
import ExportProjectDialog from './ExportProjectDialog'
import iconUrl from '../../../../resources/icon-128.png'

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = 60_000, hr = 60 * min, day = 24 * hr
  if (diff < min) return 'just now'
  if (diff < hr) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(iso).toLocaleDateString()
}

interface PillData {
  mounted: boolean
  stats: ProjectLiveStats | null
  readiness: ProjectReadiness | null
  toggling: boolean
}

export default function ProjectListScreen() {
  const all = useProjectStore((s) => s.all)
  const setActive = useProjectStore((s) => s.setActive)
  const setScreen = useProjectStore((s) => s.setScreen)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)

  const [exportTarget, setExportTarget] = useState<ProjectMeta | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [bulkToggling, setBulkToggling] = useState(false)

  // Per-pill orchestration state — keyed by project name
  const [pillData, setPillData] = useState<Record<string, PillData>>({})

  function setPill(name: string, patch: Partial<PillData>) {
    setPillData((prev) => ({ ...prev, [name]: { ...(prev[name] ?? { mounted: true, stats: null, readiness: null, toggling: false }), ...patch } }))
  }

  // Stable ref so event handlers can read current pillData without stale closures
  const pillDataRef = useRef(pillData)
  useEffect(() => { pillDataRef.current = pillData }, [pillData])

  // Load stats + readiness + mounted state for all projects whenever the list changes
  useEffect(() => {
    if (all.length === 0) return
    for (const p of all) {
      // Optimistic mounted from status (corrected by getOrchestration)
      setPill(p.name, { mounted: p.status === 'active' })
      void window.trayline.project.getOrchestration(p.name)
        .then(({ mounted }) => setPill(p.name, { mounted }))
      void window.trayline.project.liveStats(p.name)
        .then((stats) => setPill(p.name, { stats }))
      void window.trayline.project.checkReadiness(p.name)
        .then((readiness) => setPill(p.name, { readiness }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all])

  // Subscribe to orchestration status-changed push events
  useEffect(() => {
    return window.trayline.project.onStatusChanged(({ name, mounted }) => {
      setPill(name, { mounted, toggling: false })
    })
  }, [])

  // Subscribe to worker run events — update running count reactively
  useEffect(() => {
    return window.trayline.worker.onRunEvent((ev) => {
      const { project } = ev
      if (ev.type === 'started') {
        setPillData((prev) => {
          const pd = prev[project]
          if (!pd?.stats) return prev
          return { ...prev, [project]: { ...pd, stats: { ...pd.stats, runningWorkers: pd.stats.runningWorkers + 1 } } }
        })
      } else if (ev.type === 'finished') {
        setPillData((prev) => {
          const pd = prev[project]
          if (!pd?.stats) return prev
          return { ...prev, [project]: { ...pd, stats: { ...pd.stats, runningWorkers: Math.max(0, pd.stats.runningWorkers - 1) } } }
        })
        // Re-fetch full stats so pending/error counts are accurate
        void window.trayline.project.liveStats(project).then((stats) => setPill(project, { stats }))
      }
    })
  }, [])

  // Subscribe to source run events
  useEffect(() => {
    return window.trayline.source.onRunEvent((ev) => {
      const { project } = ev
      if (ev.type === 'started') {
        setPillData((prev) => {
          const pd = prev[project]
          if (!pd?.stats) return prev
          return { ...prev, [project]: { ...pd, stats: { ...pd.stats, runningSources: pd.stats.runningSources + 1 } } }
        })
      } else if (ev.type === 'completed' || ev.type === 'failed') {
        setPillData((prev) => {
          const pd = prev[project]
          if (!pd?.stats) return prev
          return { ...prev, [project]: { ...pd, stats: { ...pd.stats, runningSources: Math.max(0, pd.stats.runningSources - 1) } } }
        })
        void window.trayline.project.liveStats(project).then((stats) => setPill(project, { stats }))
      }
    })
  }, [])

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  const toggleStatus = useCallback(async (p: ProjectMeta) => {
    const pd = pillDataRef.current[p.name]
    const currentlyMounted = pd?.mounted ?? p.status === 'active'
    const next: ProjectStatus = currentlyMounted ? 'inactive' : 'active'
    setPill(p.name, { toggling: true })
    try {
      await window.trayline.project.setStatus(p.name, next)
      // onStatusChanged event sets mounted + clears toggling
    } catch {
      setPill(p.name, { toggling: false })
    }
  }, [])

  async function handlePauseAll() {
    setBulkToggling(true)
    const targets = all.filter((p) => pillData[p.name]?.mounted ?? p.status === 'active')
    await Promise.all(targets.map((p) => window.trayline.project.setStatus(p.name, 'inactive').catch(() => {})))
    setBulkToggling(false)
  }

  async function handleResumeAll() {
    setBulkToggling(true)
    const targets = all.filter((p) => !(pillData[p.name]?.mounted ?? p.status === 'active'))
    await Promise.all(targets.map((p) => window.trayline.project.setStatus(p.name, 'active').catch(() => {})))
    setBulkToggling(false)
  }

  async function handleDelete(p: ProjectMeta) {
    if (!confirm(`Delete project "${p.display_name}"? This cannot be undone.`)) return
    await window.trayline.project.delete(p.name)
    await refreshProjects()
  }

  async function handleImport() {
    setImportError(null)
    setImporting(true)
    try {
      const result = await window.trayline.project.import()
      if ('canceled' in result) return
      await refreshProjects()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImporting(false)
    }
  }

  const anyActive = all.some((p) => pillData[p.name]?.mounted ?? p.status === 'active')
  const anyInactive = all.some((p) => !(pillData[p.name]?.mounted ?? p.status === 'active'))
  const anyToggling = bulkToggling || Object.values(pillData).some((pd) => pd.toggling)

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-8">
      <img
        src={iconUrl}
        alt=""
        className="w-16 h-16 mb-4 select-none"
        draggable={false}
      />
      <div className="w-full flex items-end justify-between mb-2">
        <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
        {all.length > 0 && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <button
              onClick={() => void handlePauseAll()}
              disabled={!anyActive || anyToggling}
              title="Pause all active projects"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <PauseCircle size={13} strokeWidth={1.75} />
              Pause all
            </button>
            <button
              onClick={() => void handleResumeAll()}
              disabled={!anyInactive || anyToggling}
              title="Resume all inactive projects"
              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <PlayCircle size={13} strokeWidth={1.75} />
              Resume all
            </button>
          </div>
        )}
      </div>
      {importError && (
        <div className="w-full mb-4 flex gap-2 px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40">
          <AlertTriangle size={14} strokeWidth={1.75} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700 dark:text-red-300">{importError}</p>
        </div>
      )}

      <ul className="w-full space-y-2">
        <li>
          <div className="flex gap-2">
            <button
              onClick={() => setScreen('author')}
              className="
                group flex-1 flex items-center gap-3
                rounded-full border border-dashed
                border-neutral-300 dark:border-neutral-700
                hover:border-neutral-400 dark:hover:border-neutral-600
                bg-transparent px-4 py-3 text-left transition-colors
              "
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400">
                <Plus size={14} strokeWidth={2} />
              </span>
              <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Create new project
              </span>
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="
                group flex-1 flex items-center gap-3
                rounded-full border border-dashed
                border-neutral-300 dark:border-neutral-700
                hover:border-neutral-400 dark:hover:border-neutral-600
                bg-transparent px-4 py-3 text-left transition-colors
                disabled:opacity-50
              "
            >
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400">
                <Download size={14} strokeWidth={2} />
              </span>
              <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                {importing ? 'Scanning…' : 'Import project from zip'}
              </span>
            </button>
          </div>
        </li>

        {all.map((p) => {
          const pd = pillData[p.name]
          const mounted = pd?.mounted ?? p.status === 'active'
          const stats = pd?.stats
          const readiness = pd?.readiness
          const toggling = pd?.toggling ?? false
          const isRunning = ((stats?.runningWorkers ?? 0) + (stats?.runningSources ?? 0)) > 0
          const isBlocked = mounted && readiness != null && !readiness.ready

          const dotColor = !mounted
            ? 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
            : isBlocked
              ? 'bg-amber-500 shadow-[0_0_0_3px_rgba(245,158,11,0.15)]'
              : 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'

          const dotTitle = !mounted
            ? 'Inactive — click to activate'
            : isBlocked
              ? `Active but blocked: ${readiness.blockers.join(', ')}`
              : isRunning
                ? 'Active and running — click to deactivate'
                : 'Active — click to deactivate'

          const runningCount = (stats?.runningWorkers ?? 0) + (stats?.runningSources ?? 0)
          const errorCount = stats?.errorCards ?? 0
          const statParts: string[] = []
          if (runningCount > 0) statParts.push(`⚙ ${runningCount} running`)
          if ((stats?.pendingCards ?? 0) > 0) statParts.push(`${stats!.pendingCards} pending`)

          return (
            <li key={p.name}>
              <div className="
                group w-full flex items-center gap-3
                rounded-full border
                border-neutral-200 dark:border-neutral-800
                bg-white dark:bg-neutral-950
                hover:bg-neutral-50 dark:hover:bg-neutral-900
                px-4 py-3 transition-colors
              ">
                <button
                  onClick={(e) => { e.stopPropagation(); void toggleStatus(p) }}
                  title={dotTitle}
                  disabled={toggling}
                  className="shrink-0 p-1 -m-1 rounded-full disabled:cursor-wait"
                >
                  <span className={`block w-2.5 h-2.5 rounded-full transition-colors ${dotColor} ${isRunning && mounted && !isBlocked ? 'animate-pulse' : ''}`} />
                </button>

                <button
                  onClick={() => setActive(p)}
                  className="flex-1 min-w-0 flex items-center gap-3 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate text-neutral-900 dark:text-neutral-100">
                      {p.display_name}
                    </div>
                    {p.description && (
                      <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                        {p.description}
                      </div>
                    )}
                    {(statParts.length > 0 || errorCount > 0) && (
                      <div className="text-xs text-neutral-400 dark:text-neutral-500 truncate mt-0.5 flex items-center gap-1">
                        {statParts.join('  •  ')}
                        {statParts.length > 0 && errorCount > 0 && <span>•</span>}
                        {errorCount > 0 && (
                          <span className="text-red-500 dark:text-red-400">
                            ⚠ {errorCount} error{errorCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">
                      {formatRelative(p.updated_at)}
                    </span>
                  </div>
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); setExportTarget(p) }}
                  className="
                    shrink-0 opacity-0 group-hover:opacity-100
                    p-1.5 rounded-full
                    text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200
                    hover:bg-neutral-100 dark:hover:bg-neutral-800
                    transition-opacity
                  "
                  title="Export project"
                >
                  <Upload size={14} strokeWidth={1.75} />
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); void handleDelete(p) }}
                  className="
                    shrink-0 opacity-0 group-hover:opacity-100
                    p-1.5 rounded-full
                    text-neutral-400 hover:text-red-600
                    hover:bg-red-50 dark:hover:bg-red-950/40
                    transition-opacity
                  "
                  title="Delete project"
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <GlobalActivityBar />

      {exportTarget && (
        <ExportProjectDialog
          projectName={exportTarget.name}
          displayName={exportTarget.display_name}
          open={!!exportTarget}
          onOpenChange={(o) => { if (!o) setExportTarget(null) }}
        />
      )}

    </div>
  )
}
