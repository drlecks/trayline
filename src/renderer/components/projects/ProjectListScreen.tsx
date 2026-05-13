import { useEffect } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { ProjectMeta, ProjectStatus } from '../../../shared/types'

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

export default function ProjectListScreen() {
  const all = useProjectStore((s) => s.all)
  const projectsWithMissingSkills = useProjectStore((s) => s.projectsWithMissingSkills)
  const setActive = useProjectStore((s) => s.setActive)
  const setScreen = useProjectStore((s) => s.setScreen)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)

  useEffect(() => {
    void refreshProjects()
  }, [refreshProjects])

  async function toggleStatus(p: ProjectMeta) {
    const next: ProjectStatus = p.status === 'active' ? 'inactive' : 'active'
    await window.trayline.project.setStatus(p.name, next)
    await refreshProjects()
  }

  async function handleDelete(p: ProjectMeta) {
    if (!confirm(`Delete project "${p.display_name}"? This cannot be undone.`)) return
    await window.trayline.project.delete(p.name)
    await refreshProjects()
  }

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">Your projects</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center max-w-md mb-8 leading-relaxed">
        Pick a project to open, or create a new one. Click the status dot to toggle a project active or inactive.
      </p>

      <ul className="w-full space-y-2">
        <li>
          <button
            onClick={() => setScreen('author')}
            className="
              group w-full flex items-center gap-3
              rounded-full border border-dashed
              border-neutral-300 dark:border-neutral-700
              hover:border-neutral-400 dark:hover:border-neutral-600
              bg-transparent
              px-4 py-3
              text-left
              transition-colors
            "
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400">
              <Plus size={14} strokeWidth={2} />
            </span>
            <span className="flex-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Create new project
            </span>
          </button>
        </li>

        {all.map((p) => (
          <li key={p.name}>
            <div
              className="
                group w-full flex items-center gap-3
                rounded-full border
                border-neutral-200 dark:border-neutral-800
                bg-white dark:bg-neutral-950
                hover:bg-neutral-50 dark:hover:bg-neutral-900
                px-4 py-3
                transition-colors
              "
            >
              <button
                onClick={(e) => { e.stopPropagation(); void toggleStatus(p) }}
                title={p.status === 'active' ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                className="shrink-0 p-1 -m-1 rounded-full"
              >
                <span
                  className={`
                    block w-2.5 h-2.5 rounded-full
                    ${p.status === 'active'
                      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
                      : 'bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'}
                  `}
                />
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
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {projectsWithMissingSkills.has(p.name) && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                      <AlertTriangle size={10} strokeWidth={2} />
                      Missing skills
                    </span>
                  )}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    {formatRelative(p.updated_at)}
                  </span>
                </div>
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
        ))}
      </ul>
    </div>
  )
}
