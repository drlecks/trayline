import { useEffect, useRef, useState } from 'react'
import { Bell, ChevronRight } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { QueueEntry } from '../../../shared/queue'

function groupByProject(entries: QueueEntry[]): { project: string; displayName: string; entries: QueueEntry[] }[] {
  const map = new Map<string, { project: string; displayName: string; entries: QueueEntry[] }>()
  for (const e of entries) {
    if (!map.has(e.project)) {
      map.set(e.project, { project: e.project, displayName: e.projectDisplayName, entries: [] })
    }
    map.get(e.project)!.entries.push(e)
  }
  return [...map.values()]
}

export default function QueueBadge() {
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const setActive = useProjectStore((s) => s.setActive)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)
  const setJumpTarget = useProjectStore((s) => s.setJumpTarget)
  const allProjects = useProjectStore((s) => s.all)

  useEffect(() => {
    let cancelled = false
    window.trayline.queue.getPending().then((e) => {
      if (!cancelled) setEntries(e)
    }).catch(() => {})

    const unsub = window.trayline.queue.onUpdate((e) => {
      if (!cancelled) setEntries(e)
    })
    return () => { cancelled = true; unsub() }
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function jumpToCard(entry: QueueEntry) {
    setOpen(false)
    const project = allProjects.find((p) => p.name === entry.project) ?? null
    if (!project) return
    setActive(project)
    // refreshSteps is triggered by setActive via the project screen mounting,
    // so we set the jump target which CardsTab will pick up after steps load.
    setJumpTarget({ stepId: entry.stepId, cardId: entry.cardId })
    setSelectedStepId(entry.stepId)
  }

  const count = entries.length
  const groups = groupByProject(entries)

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="My Queue"
        className={`
          relative p-1.5 rounded-md transition-colors duration-150
          text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100
          hover:bg-black/[0.05] dark:hover:bg-white/[0.05]
          ${open ? 'bg-black/[0.05] dark:bg-white/[0.05]' : ''}
        `}
      >
        <Bell size={15} strokeWidth={1.75} />
        {count > 0 && (
          <span className="
            absolute -top-0.5 -right-0.5
            min-w-[14px] h-[14px] px-0.5
            flex items-center justify-center
            rounded-full text-[9px] font-semibold leading-none
            bg-amber-500 text-white
          ">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="
          absolute right-0 top-full mt-2 z-50
          w-72 max-h-96 overflow-y-auto
          rounded-lg border border-black/[0.08] dark:border-white/[0.08]
          bg-white dark:bg-neutral-950
          shadow-lg shadow-black/10 dark:shadow-black/40
        ">
          <div className="px-3 py-2.5 border-b border-black/[0.06] dark:border-white/[0.06]">
            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">My Queue</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {count === 0 ? 'No cards waiting for review' : `${count} card${count === 1 ? '' : 's'} waiting`}
            </div>
          </div>

          {count === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-neutral-400">All clear.</div>
          ) : (
            <div className="py-1">
              {groups.map((g) => (
                <div key={g.project}>
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 font-medium">
                    {g.displayName}
                  </div>
                  {g.entries.map((e) => (
                    <button
                      key={`${e.stepId}/${e.cardId}`}
                      onClick={() => void jumpToCard(e)}
                      className="
                        w-full flex items-center gap-2 px-3 py-2
                        hover:bg-neutral-50 dark:hover:bg-neutral-900
                        text-left transition-colors
                      "
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate text-neutral-900 dark:text-neutral-100">
                          {e.stepName}
                        </div>
                        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono truncate">
                          {e.cardId} · {timeAgo(e.cardCreatedAt)}
                        </div>
                      </div>
                      <ChevronRight size={12} className="text-neutral-300 shrink-0" strokeWidth={1.75} />
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}
