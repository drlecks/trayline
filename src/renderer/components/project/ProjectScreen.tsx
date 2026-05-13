import { useEffect, useState } from 'react'
import { Inbox, Cpu, AlertTriangle, RefreshCw, AlertCircle, Plus, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import AddTrayDialog from './AddTrayDialog'
import AddWorkerDialog from './AddWorkerDialog'
import AddStepDialog from './AddStepDialog'
import TrayDetailPanel from './TrayDetailPanel'
import WorkerDetailPanel from './WorkerDetailPanel'
import ContextPackEditor from './ContextPackEditor'
import type { StepMeta } from '../../../shared/types'
import type { CardCounts } from '../../../shared/card'
import type { WorkerRunEvent, WorkerRunStatus } from '../../../shared/worker-run'

export default function ProjectScreen() {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const steps = useProjectStore((s) => s.steps)
  const selectedStepId = useProjectStore((s) => s.selectedStepId)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)
  const unconfiguredMcps = useProjectStore((s) => s.unconfiguredMcps)
  const setScreen = useProjectStore((s) => s.setScreen)
  const setRegenerateOf = useProjectStore((s) => s.setRegenerateOf)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)

  const [pickOpen, setPickOpen] = useState(false)
  const [addTrayOpen, setAddTrayOpen] = useState(false)
  const [addWorkerOpen, setAddWorkerOpen] = useState(false)
  const [showContextEditor, setShowContextEditor] = useState(false)

  // Refresh steps whenever the active project changes
  useEffect(() => {
    void refreshSteps()
  }, [active, refreshSteps])

  if (!active) return null

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

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
        <aside className="w-72 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto py-5 px-3 flex flex-col">
          <div className="px-2 mb-5">
            <div className="text-sm font-semibold tracking-tight">{active.display_name}</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {workflow?.display_name ?? 'No workflow'}
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            {steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                selected={step.id === selectedStepId && !showContextEditor}
                onClick={() => { setSelectedStepId(step.id); setShowContextEditor(false) }}
              />
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickOpen(true)}
              className="justify-start gap-2 text-[13px] text-neutral-500 mt-2"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add step
            </Button>
          </div>

          <div className="mt-auto pt-4 border-t border-black/[0.06] dark:border-white/[0.06] px-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => { setShowContextEditor(true); setSelectedStepId(null) }}
              className={`
                flex items-center gap-2 w-full px-2 py-1.5 rounded text-[13px] text-left transition-colors
                ${showContextEditor
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
              `}
            >
              <FileText size={14} strokeWidth={1.75} />
              Context files
            </button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-[13px] text-neutral-500"
              onClick={() => { setRegenerateOf(active.name); setScreen('author') }}
            >
              <RefreshCw size={14} strokeWidth={1.75} />
              Regenerate workflow
            </Button>
          </div>
        </aside>

        {/* Right canvas */}
        <section className="flex-1 min-w-0 overflow-hidden">
          {showContextEditor && active ? (
            <ContextPackEditor project={active.name} />
          ) : selectedStep
            ? (selectedStep.kind === 'worker'
                ? <WorkerDetailPanel step={selectedStep} />
                : <TrayDetailPanel step={selectedStep} />)
            : (
              <div className="h-full flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
                Select a step on the left to see details
              </div>
            )}
        </section>
      </div>

      <AddStepDialog
        open={pickOpen}
        onOpenChange={setPickOpen}
        onPick={(kind) => {
          setPickOpen(false)
          if (kind === 'tray') setAddTrayOpen(true)
          else setAddWorkerOpen(true)
        }}
      />
      <AddTrayDialog open={addTrayOpen} onOpenChange={setAddTrayOpen} />
      <AddWorkerDialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen} />
    </div>
  )
}

const RAIL_PILL_CLASS: Record<WorkerRunStatus, string> = {
  pending: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  awaiting_input: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  succeeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  interrupted: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
}

const RAIL_PILL_LABEL: Record<WorkerRunStatus, string> = {
  pending: '·',
  running: 'Running',
  awaiting_input: 'Waiting',
  succeeded: 'Done',
  failed: 'Failed',
  interrupted: 'Stopped',
}

function RailStatusPill({ status }: { status: WorkerRunStatus }) {
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0 rounded-full ${RAIL_PILL_CLASS[status]}`}>
      {RAIL_PILL_LABEL[status]}
    </span>
  )
}

// Right-aligned status bubble for worker rows, mirroring the tray pending-count
// bubble. Only renders for states that warrant attention; succeeded/interrupted
// fall back to the inline text pill alone.
const BUBBLE_CLASS: Partial<Record<WorkerRunStatus, string>> = {
  running: 'bg-amber-500 animate-pulse',
  awaiting_input: 'bg-blue-500 animate-pulse',
  failed: 'bg-red-500',
}
const BUBBLE_TITLE: Partial<Record<WorkerRunStatus, string>> = {
  running: 'Running',
  awaiting_input: 'Waiting for input',
  failed: 'Last run failed',
}
function WorkerStatusBubble({ status }: { status: WorkerRunStatus | 'idle' }) {
  if (status === 'idle') return null
  const cls = BUBBLE_CLASS[status as WorkerRunStatus]
  if (!cls) return null
  return (
    <span
      title={BUBBLE_TITLE[status as WorkerRunStatus]}
      className={`shrink-0 inline-block w-[11px] h-[11px] mt-1 rounded-full ${cls}`}
    />
  )
}

function StepCard({ step, selected, onClick }: { step: StepMeta; selected: boolean; onClick: () => void }) {
  const Icon = step.kind === 'tray'
    ? (step.id === '99-errors' ? AlertTriangle : Inbox)
    : Cpu
  const isError = step.id === '99-errors'

  const [counts, setCounts] = useState<CardCounts | null>(null)
  const [workerStatus, setWorkerStatus] = useState<WorkerRunStatus | 'idle'>('idle')
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)

  // Live count, polled when this card is mounted. Cheap (FS readdir of three
  // small folders); refresh on a 3 s tick so newly created cards appear soon.
  useEffect(() => {
    if (!active || !workflow || step.kind !== 'tray') return
    let cancelled = false
    async function tick() {
      const c = await window.trayline.card.counts(active!.name, workflow!.name, step.id)
      if (!cancelled) setCounts(c)
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [active, workflow, step.id, step.kind])

  // Worker status pill — read latest run + listen for live events.
  useEffect(() => {
    if (!active || !workflow || step.kind !== 'worker') return
    let cancelled = false
    void (async () => {
      const runs = await window.trayline.worker.listRuns(active!.name, workflow!.name, step.id)
      if (!cancelled) setWorkerStatus(runs[0]?.status ?? 'idle')
    })()
    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.stepId !== step.id) return
      if (ev.type === 'started') setWorkerStatus('running')
      if (ev.type === 'finished') setWorkerStatus(ev.status)
    })
    return () => { cancelled = true; off() }
  }, [active, workflow, step.id, step.kind])

  const total = counts ? counts.pending + counts.ready : 0

  // Per-type color tokens. Source isn't wired yet but the palette is ready.
  // strip = full-height colored band on the left; tint = card background wash.
  const palette = isError
    ? {
        strip: 'bg-error-strip',
        stripText: 'text-white',
        tint: 'bg-error-light/40 dark:bg-red-950/20',
        ring: 'ring-error/40',
        label: 'Error tray',
      }
    : step.kind === 'worker'
    ? {
        strip: 'bg-worker-strip',
        stripText: 'text-white',
        tint: 'bg-worker-light/50 dark:bg-violet-950/15',
        ring: 'ring-worker/40',
        label: 'Worker',
      }
    : {
        strip: 'bg-tray-strip',
        stripText: 'text-white',
        tint: 'bg-tray-light/50 dark:bg-blue-950/15',
        ring: 'ring-tray/40',
        label: 'Tray',
      }

  return (
    <button
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-lg border text-left
        transition-all duration-150
        ${isError
          ? 'border-dashed border-neutral-200 dark:border-neutral-800 opacity-80 hover:opacity-100'
          : 'border-neutral-200 dark:border-neutral-800 hover:border-neutral-300 dark:hover:border-neutral-700'}
        ${selected
          ? `ring-2 ${palette.ring} shadow-sm`
          : ''}
      `}
    >
      <div className={`flex items-stretch min-h-[60px] ${palette.tint}`}>
        {/* Full-height colored strip with the type icon */}
        <div className={`
          shrink-0 w-11 flex items-center justify-center
          ${palette.strip} ${palette.stripText}
        `}>
          <Icon size={18} strokeWidth={2} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex items-start gap-2 px-3 py-2.5 bg-white/70 dark:bg-neutral-950/60">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate leading-tight">{step.name}</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1.5 mt-0.5">
              <span>{palette.label}</span>
              {counts && total > 0 && (
                <span>· {total} card{total === 1 ? '' : 's'}</span>
              )}
              {step.kind === 'worker' && workerStatus !== 'idle' && (
                <RailStatusPill status={workerStatus} />
              )}
            </div>
          </div>
          {counts && counts.pending > 0 && step.kind === 'tray' && !isError && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 text-[11px] font-semibold">
              {counts.pending}
            </span>
          )}
          {step.kind === 'worker' && <WorkerStatusBubble status={workerStatus} />}
        </div>
      </div>
    </button>
  )
}
