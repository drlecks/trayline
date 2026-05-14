import { useEffect, useState } from 'react'
import { ChevronDown, Plus, Trash2, List } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { ProjectMeta } from '../../../shared/types'

export default function ProjectSwitcher() {
  const active = useProjectStore((s) => s.active)
  const all = useProjectStore((s) => s.all)
  const setActive = useProjectStore((s) => s.setActive)
  const setScreen = useProjectStore((s) => s.setScreen)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)

  const [open, setOpen] = useState(false)

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    if (!open) return
    const handler = () => setOpen(false)
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  async function handleDelete(p: ProjectMeta) {
    if (!confirm(`Delete project "${p.display_name}"? This cannot be undone.`)) return
    await window.trayline.project.delete(p.name)
    await refreshProjects()
    if (active?.name === p.name) setActive(null)
  }

  return (
    <div className="relative no-drag">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}
        className="
          flex items-center gap-1.5 px-2 py-1 rounded-md
          text-xs font-medium
          text-neutral-700 dark:text-neutral-300
          hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
          transition-colors
        "
      >
        <span>{active ? active.display_name : 'No project'}</span>
        <ChevronDown size={12} strokeWidth={1.75} className="text-neutral-400" />
      </button>

      {open && (
        <div
          onMouseDown={(e) => e.stopPropagation()}
          className="
            absolute left-0 top-full mt-1 z-50
            min-w-[260px] rounded-lg
            border border-neutral-200 dark:border-neutral-800
            bg-white dark:bg-neutral-950
            shadow-xl
            py-1
          "
        >
          {all.length === 0 && (
            <div className="px-3 py-2 text-xs text-neutral-400">No projects yet</div>
          )}
          {all.map((p) => (
            <div
              key={p.name}
              className={`
                group flex items-center gap-2 px-3 py-2 cursor-pointer text-xs
                ${active?.name === p.name ? 'bg-neutral-50 dark:bg-neutral-900' : 'hover:bg-neutral-50 dark:hover:bg-neutral-900'}
              `}
              onClick={() => { setActive(p); setOpen(false) }}
            >
              <span className="flex-1 truncate">{p.display_name}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(p) }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity"
                title="Delete project"
              >
                <Trash2 size={12} strokeWidth={1.75} />
              </button>
            </div>
          ))}

          <div className="border-t border-neutral-100 dark:border-neutral-900 mt-1 pt-1">
            <button
              onClick={() => { setActive(null); setScreen('projectList'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <List size={12} strokeWidth={1.75} />
              All projects
            </button>
            <button
              onClick={() => { setScreen('author'); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900"
            >
              <Plus size={12} strokeWidth={1.75} />
              New project
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
