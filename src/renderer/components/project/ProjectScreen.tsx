import { useEffect, useState } from 'react'
import { Inbox, Cpu, AlertTriangle, RefreshCw, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta, WorkflowMeta } from '../../../shared/types'

export default function ProjectScreen() {
  const active = useProjectStore((s) => s.active)
  const unconfiguredMcps = useProjectStore((s) => s.unconfiguredMcps)
  const setScreen = useProjectStore((s) => s.setScreen)
  const setRegenerateOf = useProjectStore((s) => s.setRegenerateOf)

  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([])
  const [steps, setSteps] = useState<StepMeta[]>([])

  useEffect(() => {
    if (!active) return
    let cancelled = false
    ;(async () => {
      const wf = await window.trayline.project.listWorkflows(active.name)
      if (cancelled) return
      setWorkflows(wf)
      if (wf[0]) {
        const s = await window.trayline.project.listSteps(active.name, wf[0].name)
        if (!cancelled) setSteps(s)
      }
    })()
    return () => { cancelled = true }
  }, [active])

  if (!active) return null

  return (
    <div className="flex flex-col w-full h-full">
      {unconfiguredMcps.length > 0 && (
        <div className="
          flex items-center gap-2 px-6 py-2.5 shrink-0
          bg-amber-50 dark:bg-amber-950/30
          border-b border-amber-200/60 dark:border-amber-900/40
          text-xs text-amber-900 dark:text-amber-300
        ">
          <AlertCircle size={13} strokeWidth={1.75} />
          <span>
            Here's a starting point. To run it, set up{' '}
            <strong>{unconfiguredMcps.join(', ')}</strong> — click any worker with a ⚠ to start.
          </span>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <aside className="w-64 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto py-4 px-3">
          <div className="px-2 mb-4">
            <div className="text-xs font-semibold tracking-tight">{active.display_name}</div>
            <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {workflows[0]?.display_name ?? 'No workflow'}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-black/[0.06] dark:border-white/[0.06] px-2 flex flex-col gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-xs text-neutral-500"
              onClick={() => { setRegenerateOf(active.name); setScreen('author') }}
            >
              <RefreshCw size={12} strokeWidth={1.75} />
              Regenerate workflow
            </Button>
          </div>
        </aside>

        {/* Right canvas — placeholder until Phase 3 wires step detail views */}
        <section className="flex-1 flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
          Select a step on the left to see details
        </section>
      </div>
    </div>
  )
}

function StepCard({ step }: { step: StepMeta }) {
  const Icon = step.kind === 'tray'
    ? (step.id === '99-errors' ? AlertTriangle : Inbox)
    : Cpu
  const isError = step.id === '99-errors'

  return (
    <div className={`
      group rounded-md border px-3 py-2.5 cursor-pointer
      ${isError
        ? 'border-dashed border-neutral-200 dark:border-neutral-800 opacity-60 hover:opacity-100'
        : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'}
      bg-white dark:bg-neutral-950 transition-colors
    `}>
      <div className="flex items-start gap-2">
        <div className={`
          shrink-0 w-7 h-7 rounded-md flex items-center justify-center
          ${step.kind === 'tray' ? 'bg-tray-light text-tray' : 'bg-worker-light text-worker'}
          ${isError ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : ''}
        `}>
          <Icon size={14} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{step.name}</div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
            {step.kind === 'tray' ? 'Tray' : 'Worker'}
          </div>
        </div>
      </div>
    </div>
  )
}
