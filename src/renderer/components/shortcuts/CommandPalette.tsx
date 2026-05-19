import { useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, Inbox, AlertTriangle, FolderOpen, Settings, HelpCircle } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/project-store'

interface CommandItem {
  id: string
  label: string
  hint?: string
  icon: typeof Cpu
  run: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenShortcuts: () => void
}

export default function CommandPalette({ open, onOpenChange, onOpenShortcuts }: CommandPaletteProps) {
  const steps = useProjectStore((s) => s.steps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)
  const setScreen = useProjectStore((s) => s.setScreen)
  const active = useProjectStore((s) => s.active)
  const all = useProjectStore((s) => s.all)
  const setActive = useProjectStore((s) => s.setActive)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const items = useMemo<CommandItem[]>(() => {
    const out: CommandItem[] = []
    for (const step of steps) {
      const isError = step.id === '99-errors'
      out.push({
        id: `step:${step.id}`,
        label: step.name,
        hint: isError ? 'Error tray' : step.kind === 'worker' ? 'Worker' : 'Tray',
        icon: isError ? AlertTriangle : step.kind === 'worker' ? Cpu : Inbox,
        run: () => { setSelectedStepId(step.id); setScreen('project'); onOpenChange(false) },
      })
    }
    for (const p of all) {
      if (active && p.name === active.name) continue
      out.push({
        id: `project:${p.name}`,
        label: p.display_name,
        hint: 'Switch to project',
        icon: FolderOpen,
        run: () => { setActive(p); onOpenChange(false) },
      })
    }
    out.push({
      id: 'nav:settings',
      label: 'Settings',
      icon: Settings,
      run: () => { setScreen('settings'); onOpenChange(false) },
    })
    out.push({
      id: 'help:shortcuts',
      label: 'Keyboard shortcuts',
      icon: HelpCircle,
      run: () => { onOpenChange(false); onOpenShortcuts() },
    })
    return out
  }, [steps, all, active, setActive, setScreen, setSelectedStepId, onOpenChange, onOpenShortcuts])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) =>
      it.label.toLowerCase().includes(q) || (it.hint?.toLowerCase().includes(q) ?? false),
    )
  }, [items, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => { setCursor(0) }, [query])

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[cursor]?.run()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="border-b border-neutral-200 dark:border-neutral-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a step, project, or screen…"
            className="w-full bg-transparent px-4 py-3 text-sm focus:outline-none"
          />
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
              Nothing matches.
            </div>
          )}
          {filtered.map((it, idx) => {
            const Icon = it.icon
            const sel = idx === cursor
            return (
              <button
                key={it.id}
                onMouseEnter={() => setCursor(idx)}
                onClick={() => it.run()}
                className={`
                  w-full flex items-center gap-3 px-4 py-2 text-left
                  ${sel ? 'bg-neutral-100 dark:bg-neutral-900' : ''}
                `}
              >
                <Icon size={14} strokeWidth={1.75} className="text-neutral-500 shrink-0" />
                <span className="text-xs flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[10px] uppercase tracking-wide text-neutral-400">{it.hint}</span>}
              </button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
