import { useEffect, useState } from 'react'
import { Inbox, Cpu, AlertTriangle, RefreshCw, Plus, FileText, Settings, ChevronDown, ChevronRight, Rss, Layers, Send, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import AddTrayDialog from './AddTrayDialog'
import AddWorkerDialog from './AddWorkerDialog'
import AddSourceDialog from './AddSourceDialog'
import AddOutletDialog from './AddOutletDialog'
import AddStepDialog from './AddStepDialog'
import TrayDetailPanel from './TrayDetailPanel'
import WorkerDetailPanel from './WorkerDetailPanel'
import SourceDetailPanel from './SourceDetailPanel'
import OutletDetailPanel from './OutletDetailPanel'
import ContextPackEditor from './ContextPackEditor'
import ProjectSettingsPanel from './ProjectSettingsPanel'
import FirstProjectGuide from '../onboarding/FirstProjectGuide'
import type { StepMeta, SourceRunEvent } from '../../../shared/types'
import type { CardCounts } from '../../../shared/card'
import type { WorkerRunEvent, WorkerRunStatus } from '../../../shared/worker-run'

export default function ProjectScreen() {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const steps = useProjectStore((s) => s.steps)
  const selectedStepId = useProjectStore((s) => s.selectedStepId)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)
  const justCreatedProject = useProjectStore((s) => s.justCreatedProject)
  const setJustCreatedProject = useProjectStore((s) => s.setJustCreatedProject)
  const setScreen = useProjectStore((s) => s.setScreen)
  const setRegenerateOf = useProjectStore((s) => s.setRegenerateOf)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)

  const [pickOpen, setPickOpen] = useState(false)
  const [addTrayOpen, setAddTrayOpen] = useState(false)
  const [addWorkerOpen, setAddWorkerOpen] = useState(false)
  const [addSourceOpen, setAddSourceOpen] = useState(false)
  const [addOutletOpen, setAddOutletOpen] = useState(false)
  const [showContextEditor, setShowContextEditor] = useState(false)
  const [showProjectSettings, setShowProjectSettings] = useState(false)
  const [errorsExpanded, setErrorsExpanded] = useState(false)

  // Refresh steps whenever the active project changes
  useEffect(() => {
    void refreshSteps()
  }, [active, refreshSteps])

  if (!active) return null

  const selectedStep = steps.find((s) => s.id === selectedStepId) ?? null

  async function handleMoveUp(stepId: string) {
    if (!active || !workflow) return
    try {
      const { newStepId } = await window.trayline.step.moveUp({ project: active.name, workflow: workflow.name, stepId })
      await refreshSteps()
      setSelectedStepId(newStepId)
    } catch {
      // service guards reject invalid moves silently; nothing to surface here
    }
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-1 min-h-0">
        {/* Left rail */}
        <aside data-tour="left-rail" className="w-72 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto py-5 px-3 flex flex-col">
          <div className="px-2 mb-5">
            <div className="text-sm font-semibold tracking-tight">{active.display_name}</div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              {workflow?.display_name ?? 'No workflow'}
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-1">
            {steps.filter((s) => s.id !== '99-errors').map((step, idx, arr) => {
              // Up-arrow: trays and workers, not if already first, not if the step above is a source or outlet
              const canMoveUp = (step.kind === 'tray' || step.kind === 'worker')
                && idx > 0
                && arr[idx - 1].kind !== 'source'
                && arr[idx - 1].kind !== 'outlet'
              return (
                <div key={step.id} className="relative group/rail-item">
                  <StepCard
                    step={step}
                    selected={step.id === selectedStepId && !showContextEditor}
                    onClick={() => { setSelectedStepId(step.id); setShowContextEditor(false); setShowProjectSettings(false) }}
                  />
                  {canMoveUp && (
                    <button
                      type="button"
                      title="Move up"
                      onClick={(e) => { e.stopPropagation(); void handleMoveUp(step.id) }}
                      className="
                        absolute top-1.5 right-1.5 z-10
                        w-5 h-5 flex items-center justify-center
                        rounded border border-neutral-200 dark:border-neutral-700
                        bg-white/90 dark:bg-neutral-900/90 shadow-sm
                        text-neutral-500 dark:text-neutral-400
                        hover:bg-neutral-100 dark:hover:bg-neutral-800
                        hover:text-neutral-800 dark:hover:text-neutral-200
                        opacity-0 group-hover/rail-item:opacity-100
                        transition-opacity
                      "
                    >
                      <ArrowUp size={10} strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              )
            })}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickOpen(true)}
              className="justify-start gap-2 text-[13px] text-neutral-500 mt-2"
            >
              <Plus size={14} strokeWidth={1.75} />
              Add step
            </Button>

            {/* Error tray — collapsible, hidden by default */}
            {steps.find((s) => s.id === '99-errors') && (
              <ErrorTraySection
                step={steps.find((s) => s.id === '99-errors')!}
                expanded={errorsExpanded}
                selected={selectedStepId === '99-errors' && !showContextEditor}
                onToggle={() => setErrorsExpanded((v) => !v)}
                onSelect={() => { setSelectedStepId('99-errors'); setShowContextEditor(false); setShowProjectSettings(false) }}
              />
            )}
          </div>

          <div className="mt-auto pt-4 border-t border-black/[0.06] dark:border-white/[0.06] px-2 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => { setShowProjectSettings(true); setShowContextEditor(false); setSelectedStepId(null) }}
              className={`
                flex items-center gap-2 w-full px-2 py-1.5 rounded text-[13px] text-left transition-colors
                ${showProjectSettings
                  ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
              `}
            >
              <Settings size={14} strokeWidth={1.75} />
              Project settings
            </button>
            <button
              type="button"
              onClick={() => { setShowContextEditor(true); setShowProjectSettings(false); setSelectedStepId(null) }}
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
        <section data-tour="detail-panel" className="flex-1 min-w-0 overflow-hidden">
          {showProjectSettings ? (
            <ProjectSettingsPanel />
          ) : showContextEditor && active ? (
            <ContextPackEditor project={active.name} />
          ) : selectedStep
            ? (selectedStep.kind === 'worker'
                ? <WorkerDetailPanel step={selectedStep} />
                : selectedStep.kind === 'source'
                  ? <SourceDetailPanel step={selectedStep} />
                  : selectedStep.kind === 'outlet'
                    ? <OutletDetailPanel step={selectedStep} />
                    : <TrayDetailPanel step={selectedStep} />)
            : active?.name === justCreatedProject
              ? (
                <FirstProjectGuide
                  hasSourceStep={steps.some((s) => s.kind === 'source')}
                  sourceStepId={steps.find((s) => s.kind === 'source')?.id}
                  firstTrayId={steps.find((s) => s.kind === 'tray')?.id}
                  onSelectStep={(id) => { setSelectedStepId(id); setShowContextEditor(false); setShowProjectSettings(false) }}
                  onDismiss={() => setJustCreatedProject(null)}
                  onTour={() => window.dispatchEvent(new Event('trayline:open-tour'))}
                />
              )
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
          else if (kind === 'worker') setAddWorkerOpen(true)
          else if (kind === 'outlet') setAddOutletOpen(true)
          else setAddSourceOpen(true)
        }}
      />
      <AddTrayDialog open={addTrayOpen} onOpenChange={setAddTrayOpen} />
      <AddWorkerDialog open={addWorkerOpen} onOpenChange={setAddWorkerOpen} />
      <AddSourceDialog open={addSourceOpen} onOpenChange={setAddSourceOpen} />
      <AddOutletDialog open={addOutletOpen} onOpenChange={setAddOutletOpen} />
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

function ErrorTraySection({
  step, expanded, selected, onToggle, onSelect,
}: {
  step: StepMeta
  expanded: boolean
  selected: boolean
  onToggle: () => void
  onSelect: () => void
}) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    if (!active || !workflow) return
    let cancelled = false
    async function tick() {
      const c = await window.trayline.card.counts(active!.name, workflow!.name, '99-errors')
      if (!cancelled) setPendingCount(c.pending)
    }
    void tick()
    const id = setInterval(tick, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [active, workflow])

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[12px] text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
      >
        {expanded
          ? <ChevronDown size={12} strokeWidth={2} />
          : <ChevronRight size={12} strokeWidth={2} />}
        <span>
          {pendingCount > 0
            ? `View errors (${pendingCount})`
            : 'View errors'}
        </span>
        {pendingCount > 0 && (
          <span className="ml-auto shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 text-[10px] font-semibold">
            {pendingCount}
          </span>
        )}
      </button>
      {expanded && (
        <div className="mt-1">
          <StepCard
            step={step}
            selected={selected}
            onClick={onSelect}
          />
        </div>
      )}
    </div>
  )
}

function stepConfigWarning(step: StepMeta): string | null {
  if (step.kind === 'source') {
    const ch = (step.raw as { channel?: { type?: string; credential_id?: string } }).channel
    if (ch?.type === 'imap' && !ch.credential_id) return 'IMAP credential not configured'
  }
  if (step.kind === 'outlet') {
    const ch = (step.raw as { channel?: { type?: string; credential_id?: string; to?: string } }).channel
    if (ch?.type === 'smtp') {
      if (!ch.credential_id) return 'SMTP credential not configured'
      if (!ch.to) return '"To" address not configured'
    }
  }
  return null
}

function StepCard({ step, selected, onClick }: { step: StepMeta; selected: boolean; onClick: () => void }) {
  const isBatch = step.kind === 'worker' && !!(step.raw as { batch_mode?: boolean }).batch_mode
  const Icon = step.kind === 'source'
    ? Rss
    : step.kind === 'outlet'
      ? Send
      : step.kind === 'tray'
        ? (step.id === '99-errors' ? AlertTriangle : Inbox)
        : isBatch ? Layers : Cpu
  const isError = step.id === '99-errors'
  const configWarning = stepConfigWarning(step)

  const [counts, setCounts] = useState<CardCounts | null>(null)
  const [workerStatus, setWorkerStatus] = useState<WorkerRunStatus | 'idle'>('idle')
  const [lastBatchCount, setLastBatchCount] = useState<number | null>(null)
  const [sourceRunning, setSourceRunning] = useState(false)
  const [sourceCardCount, setSourceCardCount] = useState<number | null>(null)
  const [outletStatus, setOutletStatus] = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)

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
      if (ev.type === 'finished') {
        setWorkerStatus(ev.status)
        if (ev.batchCardCount != null) setLastBatchCount(ev.batchCardCount)
      }
    })
    return () => { cancelled = true; off() }
  }, [active, workflow, step.id, step.kind])

  // Outlet: listen for run events
  useEffect(() => {
    if (!active || !workflow || step.kind !== 'outlet') return
    const offStarted = window.trayline.outlet.onStarted((ev) => {
      if (ev.stepId !== step.id) return
      setOutletStatus('running')
    })
    const offCompleted = window.trayline.outlet.onCompleted((ev) => {
      if (ev.stepId !== step.id) return
      setOutletStatus('done')
      setTimeout(() => setOutletStatus('idle'), 30000)
    })
    const offFailed = window.trayline.outlet.onFailed((ev) => {
      if (ev.stepId !== step.id) return
      setOutletStatus('failed')
    })
    return () => { offStarted(); offCompleted(); offFailed() }
  }, [active, workflow, step.id, step.kind])

  // Source: poll card count + listen for run events
  useEffect(() => {
    if (!active || !workflow || step.kind !== 'source') return
    let cancelled = false
    async function tick() {
      const c = await window.trayline.card.counts(active!.name, workflow!.name, step.id)
      if (!cancelled) setSourceCardCount(c.ready)
    }
    void tick()
    const id = setInterval(tick, 3000)
    const off = window.trayline.source.onRunEvent((ev: SourceRunEvent) => {
      if (ev.stepId !== step.id) return
      if (ev.type === 'started') setSourceRunning(true)
      if (ev.type === 'completed' || ev.type === 'failed') { setSourceRunning(false); void tick() }
    })
    return () => { cancelled = true; clearInterval(id); off() }
  }, [active, workflow, step.id, step.kind])

  const total = counts ? counts.pending + counts.ready : 0

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
    : step.kind === 'outlet'
    ? {
        strip: 'bg-teal-500',
        stripText: 'text-white',
        tint: 'bg-teal-50/50 dark:bg-teal-950/15',
        ring: 'ring-teal-400/40',
        label: 'Outlet',
      }
    : step.kind === 'source'
    ? {
        strip: 'bg-emerald-500',
        stripText: 'text-white',
        tint: 'bg-emerald-50/50 dark:bg-emerald-950/15',
        ring: 'ring-emerald-400/40',
        label: 'Source',
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
        group relative overflow-hidden rounded-lg border text-left w-full
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
        <div className={`
          shrink-0 w-11 flex items-center justify-center
          ${palette.strip} ${palette.stripText}
        `}>
          <Icon size={18} strokeWidth={2} />
        </div>

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
              {isBatch && workerStatus === 'succeeded' && lastBatchCount !== null && (
                <span className="text-[10px] text-neutral-400">batch: {lastBatchCount}</span>
              )}
              {step.kind === 'source' && sourceRunning && (
                <span className="text-[10px] font-medium px-1.5 py-0 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 animate-pulse">
                  Fetching
                </span>
              )}
              {step.kind === 'source' && !sourceRunning && sourceCardCount !== null && sourceCardCount > 0 && (
                <span>· {sourceCardCount} ready</span>
              )}
              {step.kind === 'outlet' && outletStatus === 'running' && (
                <span className="text-[10px] font-medium px-1.5 py-0 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 animate-pulse">
                  Sending…
                </span>
              )}
              {step.kind === 'outlet' && outletStatus === 'done' && (
                <span className="text-[10px] font-medium px-1.5 py-0 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Sent
                </span>
              )}
              {step.kind === 'outlet' && outletStatus === 'failed' && (
                <span className="text-[10px] font-medium px-1.5 py-0 rounded-full bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300">
                  Failed
                </span>
              )}
            </div>
          </div>
          {counts && counts.pending > 0 && step.kind === 'tray' && !isError && (
            <span className="shrink-0 inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 text-[11px] font-semibold">
              {counts.pending}
            </span>
          )}
          {step.kind === 'worker' && <WorkerStatusBubble status={workerStatus} />}
          {step.kind === 'source' && sourceRunning && (
            <span className="shrink-0 inline-block w-[11px] h-[11px] mt-1 rounded-full bg-emerald-500 animate-pulse" />
          )}
          {step.kind === 'outlet' && outletStatus === 'running' && (
            <span className="shrink-0 inline-block w-[11px] h-[11px] mt-1 rounded-full bg-teal-500 animate-pulse" />
          )}
          {step.kind === 'outlet' && outletStatus === 'failed' && (
            <span className="shrink-0 inline-block w-[11px] h-[11px] mt-1 rounded-full bg-red-500" />
          )}
          {configWarning && (
            <span title={configWarning} className="shrink-0 flex items-center justify-center w-[18px] h-[18px] mt-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60">
              <AlertTriangle size={11} className="text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
