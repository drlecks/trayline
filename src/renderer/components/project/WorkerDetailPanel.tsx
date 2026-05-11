import { useEffect, useMemo, useState } from 'react'
import { Cpu, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta } from '../../../shared/types'
import type { WorkerRun, WorkerRunEvent, WorkerRunStatus } from '../../../shared/worker-run'

type Tab = 'instructions' | 'config' | 'runs'

interface WorkerDetailPanelProps {
  step: StepMeta
}

export default function WorkerDetailPanel({ step }: WorkerDetailPanelProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [tab, setTab] = useState<Tab>('instructions')

  const status = useLatestRunStatus(step.id)

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md flex items-center justify-center bg-worker-light text-worker">
            <Cpu size={16} strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold tracking-tight truncate">{step.name}</h1>
              <StatusPill status={status} />
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              Worker
              {step.description && <> · {step.description}</>}
            </div>
          </div>
        </div>

        <div className="flex gap-1 mt-4 -mb-4">
          {(['instructions', 'config', 'runs'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                px-3 py-1.5 text-xs font-medium capitalize border-b-2 transition-colors
                ${tab === t
                  ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}
              `}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'instructions' && active && workflow && (
          <InstructionsTab project={active.name} workflow={workflow.name} stepId={step.id} />
        )}
        {tab === 'config' && active && workflow && (
          <ConfigTab project={active.name} workflow={workflow.name} step={step} />
        )}
        {tab === 'runs' && active && workflow && (
          <RunsTab project={active.name} workflow={workflow.name} stepId={step.id} />
        )}
      </div>
    </div>
  )
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: WorkerRunStatus | 'idle' }) {
  const cls = STATUS_CLASS[status]
  const label = STATUS_LABEL[status]
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}

const STATUS_CLASS: Record<WorkerRunStatus | 'idle', string> = {
  idle: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  pending: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400',
  running: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  awaiting_input: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
  succeeded: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
  interrupted: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300',
}

const STATUS_LABEL: Record<WorkerRunStatus | 'idle', string> = {
  idle: 'Idle',
  pending: 'Pending',
  running: 'Running',
  awaiting_input: 'Awaiting input',
  succeeded: 'Done',
  failed: 'Failed',
  interrupted: 'Interrupted',
}

function useLatestRunStatus(stepId: string): WorkerRunStatus | 'idle' {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [status, setStatus] = useState<WorkerRunStatus | 'idle'>('idle')

  useEffect(() => {
    if (!active || !workflow) return
    let cancelled = false
    async function load() {
      const runs = await window.trayline.worker.listRuns(active!.name, workflow!.name, stepId)
      if (cancelled) return
      setStatus(runs[0]?.status ?? 'idle')
    }
    void load()
    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.stepId !== stepId) return
      if (ev.type === 'started') setStatus('running')
      if (ev.type === 'finished') setStatus(ev.status)
    })
    return () => { cancelled = true; off() }
  }, [active, workflow, stepId])

  return status
}

// ─── Instructions tab (process.md) ────────────────────────────────────────────

function InstructionsTab({ project, workflow, stepId }: { project: string; workflow: string; stepId: string }) {
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const md = await window.trayline.step.readProcess(project, workflow, stepId)
      if (cancelled) return
      setBody(md)
      setSaved(md)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [project, workflow, stepId])

  const dirty = body !== saved

  async function save() {
    setBusy(true)
    try {
      await window.trayline.step.updateProcess({ project, workflow, stepId, processMd: body })
      setSaved(body)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  return (
    <div className="p-6 flex flex-col gap-3 h-full">
      <div className="text-[11px] uppercase tracking-wider text-neutral-400">Worker instructions (process.md)</div>
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="
            w-full h-full rounded-md border border-neutral-200 dark:border-neutral-800
            bg-white dark:bg-neutral-950 px-3 py-2 text-xs font-mono
            focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
            resize-none
          "
        />
        <div className="
          w-full h-full overflow-auto rounded-md border border-neutral-200 dark:border-neutral-800
          bg-neutral-50 dark:bg-neutral-900/40 px-4 py-3 text-xs leading-relaxed
        ">
          <MarkdownPreview source={body} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={!dirty || busy} onClick={() => setBody(saved)}>
          Reset
        </Button>
        <Button size="sm" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Bare-bones markdown preview — headings, code fences, inline code, paragraphs.
 * A full renderer can be swapped in (Phase 6/13 polish) without changing callers.
 */
function MarkdownPreview({ source }: { source: string }) {
  const blocks = useMemo(() => renderMarkdown(source), [source])
  return <div className="prose-sm dark:prose-invert max-w-none">{blocks}</div>
}

function renderMarkdown(src: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  const lines = src.split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++ }
      i++
      out.push(<pre key={key++} className="bg-neutral-100 dark:bg-neutral-800 rounded p-2 my-2 overflow-auto text-[11px]"><code>{buf.join('\n')}</code></pre>)
      continue
    }
    if (line.startsWith('### ')) { out.push(<h3 key={key++} className="text-sm font-semibold mt-3 mb-1">{line.slice(4)}</h3>); i++; continue }
    if (line.startsWith('## ')) { out.push(<h2 key={key++} className="text-sm font-semibold mt-3 mb-1">{line.slice(3)}</h2>); i++; continue }
    if (line.startsWith('# ')) { out.push(<h1 key={key++} className="text-base font-semibold mt-3 mb-1">{line.slice(2)}</h1>); i++; continue }
    if (line.trim() === '') { out.push(<div key={key++} className="h-2" />); i++; continue }
    out.push(<p key={key++} className="text-xs text-neutral-700 dark:text-neutral-300 my-1">{line}</p>)
    i++
  }
  return out
}

// ─── Config tab ───────────────────────────────────────────────────────────────

interface WorkerStepRaw {
  skills?: string[]
  mcps?: string[]
  context_packs?: string[]
  execution?: { command?: string; args?: string[]; timeout_seconds?: number; retry_attempts?: number; adapter?: string }
  trigger?: { mode?: 'on_ready' | 'scheduled' | 'manual'; schedule_cron?: string | null }
}

function ConfigTab({ project, workflow, step }: { project: string; workflow: string; step: StepMeta }) {
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const raw = step.raw as WorkerStepRaw
  const exec = raw.execution ?? {}
  const trigger = raw.trigger ?? {}

  const [command, setCommand] = useState(exec.command ?? 'claude')
  const [timeoutSec, setTimeoutSec] = useState(exec.timeout_seconds ?? 180)
  const [retries, setRetries] = useState(exec.retry_attempts ?? 1)
  const [triggerMode, setTriggerMode] = useState<'on_ready' | 'manual'>(
    (trigger.mode === 'manual' ? 'manual' : 'on_ready'),
  )
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await window.trayline.step.update({
        project, workflow, stepId: step.id,
        patch: {
          execution: { ...exec, command, timeout_seconds: timeoutSec, retry_attempts: retries },
          trigger: { ...trigger, mode: triggerMode },
        } as Record<string, unknown>,
      })
      await refreshSteps()
    } finally { setBusy(false) }
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-xl">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-neutral-500">Command</label>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 text-xs"
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-xs text-neutral-500">Timeout (seconds)</label>
          <input
            type="number" min={5}
            value={timeoutSec}
            onChange={(e) => setTimeoutSec(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 text-xs"
          />
        </div>
        <div className="flex flex-col gap-1.5 flex-1">
          <label className="text-xs text-neutral-500">Retry attempts</label>
          <input
            type="number" min={0}
            value={retries}
            onChange={(e) => setRetries(parseInt(e.target.value, 10) || 0)}
            className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 text-xs"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs text-neutral-500">Trigger mode</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTriggerMode('on_ready')}
            className={`flex-1 px-3 py-2 rounded-md border text-left text-xs ${
              triggerMode === 'on_ready'
                ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
            }`}
          >
            <div className="font-medium">On ready</div>
            <div className="text-neutral-500 mt-0.5">Run when a card is marked ready in the previous tray.</div>
          </button>
          <button
            type="button"
            onClick={() => setTriggerMode('manual')}
            className={`flex-1 px-3 py-2 rounded-md border text-left text-xs ${
              triggerMode === 'manual'
                ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
            }`}
          >
            <div className="font-medium">Manual</div>
            <div className="text-neutral-500 mt-0.5">Only runs when you click "Run now".</div>
          </button>
        </div>
      </div>
      {(raw.skills?.length ?? 0) > 0 && (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-neutral-500">Skills</label>
          <div className="flex flex-wrap gap-1.5">
            {raw.skills!.map((s) => (
              <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800">{s}</span>
            ))}
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
  )
}

// ─── Runs tab ─────────────────────────────────────────────────────────────────

function RunsTab({ project, workflow, stepId }: { project: string; workflow: string; stepId: string }) {
  const [runs, setRuns] = useState<WorkerRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  async function refresh() {
    const r = await window.trayline.worker.listRuns(project, workflow, stepId)
    setRuns(r)
    if (!selectedRunId && r[0]) setSelectedRunId(r[0].run_id)
  }

  useEffect(() => {
    void refresh()
    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.stepId !== stepId) return
      void refresh()
    })
    return () => off()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, workflow, stepId])

  const selected = runs.find((r) => r.run_id === selectedRunId) ?? null

  if (runs.length === 0) {
    return (
      <div className="p-6 text-xs text-neutral-500 dark:text-neutral-400">
        No runs yet. The worker will run automatically when a card is marked ready in the preceding tray.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] overflow-y-auto py-2">
        {runs.map((r) => (
          <button
            key={r.run_id}
            onClick={() => setSelectedRunId(r.run_id)}
            className={`
              w-full text-left px-4 py-2 text-xs border-l-2
              ${r.run_id === selectedRunId
                ? 'border-l-neutral-900 dark:border-l-neutral-100 bg-neutral-50 dark:bg-neutral-900/50'
                : 'border-l-transparent hover:bg-neutral-50 dark:hover:bg-neutral-900/30'}
            `}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-mono">{r.run_id}</span>
              <StatusPill status={r.status} />
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              {new Date(r.started_at).toLocaleString()}
            </div>
          </button>
        ))}
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selected && (
          <RunSummary project={project} workflow={workflow} stepId={stepId} run={selected} />
        )}
      </div>
    </div>
  )
}

function RunSummary({ project, workflow, stepId, run }: { project: string; workflow: string; stepId: string; run: WorkerRun }) {
  const [showTerminal, setShowTerminal] = useState(false)
  const [log, setLog] = useState('')

  useEffect(() => {
    setShowTerminal(false)
    setLog('')
  }, [run.run_id])

  useEffect(() => {
    if (!showTerminal) return
    let cancelled = false
    void (async () => {
      const t = await window.trayline.worker.readTerminalLog(project, workflow, stepId, run.run_id)
      if (!cancelled) setLog(t)
    })()
    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.runId !== run.run_id) return
      if (ev.type === 'log') setLog((prev) => prev + ev.chunk)
    })
    return () => { cancelled = true; off() }
  }, [showTerminal, project, workflow, stepId, run.run_id])

  return (
    <div className="p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{run.run_id}</div>
          <div className="text-xs text-neutral-500">Card: <span className="font-mono">{run.card_id}</span></div>
        </div>
        <StatusPill status={run.status} />
      </div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400">
        Started: {new Date(run.started_at).toLocaleString()}
        {run.ended_at && <> · Elapsed: {((run.elapsed_ms ?? 0) / 1000).toFixed(1)}s</>}
        {run.exit_code !== undefined && <> · Exit: {run.exit_code}</>}
      </div>
      {run.error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-300">
          {run.error}
        </div>
      )}
      <div>
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal((v) => !v)}>
          {showTerminal ? 'Hide terminal' : 'Show terminal'}
        </Button>
      </div>
      {showTerminal && (
        <pre className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-950 text-neutral-200 p-3 text-[11px] font-mono max-h-96 overflow-auto whitespace-pre-wrap">
          {log || <span className="text-neutral-500">(empty)</span>}
        </pre>
      )}
    </div>
  )
}

// ─── Manual run button (exported for ProjectScreen card actions, future) ─────

export function ManualRunButton({ project, workflow, stepId, cardId, onTriggered }: {
  project: string; workflow: string; stepId: string; cardId: string; onTriggered?: () => void
}) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await window.trayline.worker.triggerRun(project, workflow, stepId, cardId)
          onTriggered?.()
        } finally { setBusy(false) }
      }}
    >
      <Play size={12} strokeWidth={1.75} />
      Run
    </Button>
  )
}
