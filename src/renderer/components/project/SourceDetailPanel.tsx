import { useEffect, useState, useMemo, useCallback } from 'react'
import { Rss, Play, Pause, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SchedulePicker from '@/components/shared/SchedulePicker'
import { useProjectStore } from '@/stores/project-store'
import { useProviderGuard } from '@/stores/provider-guard-store'
import type { StepMeta, SourceState, SourceRunMeta, SourceRunEvent, SourceStepConfig } from '../../../shared/types'

type Tab = 'source' | 'config' | 'runs'

interface SourceDetailPanelProps {
  step: StepMeta
}

export default function SourceDetailPanel({ step }: SourceDetailPanelProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [tab, setTab] = useState<Tab>('source')
  const [sourceState, setSourceState] = useState<SourceState | null>(null)
  const [runNowBusy, setRunNowBusy] = useState(false)

  const loadState = useCallback(async () => {
    if (!active || !workflow) return
    try {
      const s = await window.trayline.source.getState(active.name, workflow.name, step.id)
      setSourceState(s)
    } catch { /* ignore */ }
  }, [active, workflow, step.id])

  useEffect(() => {
    void loadState()
  }, [loadState])

  // Subscribe to live run events
  useEffect(() => {
    const off = window.trayline.source.onRunEvent((ev: SourceRunEvent) => {
      if (ev.stepId !== step.id) return
      if (ev.type === 'started') {
        setSourceState((s) => s ? { ...s, running: true } : s)
      } else if (ev.type === 'completed') {
        void loadState()
      } else if (ev.type === 'failed') {
        setSourceState((s) => s ? { ...s, running: false } : s)
      }
    })
    return off
  }, [step.id, loadState])

  async function handleRunNow() {
    if (!active || !workflow) return
    setRunNowBusy(true)
    try {
      const ok = await useProviderGuard.getState().ensureReady()
      if (!ok) return
      await window.trayline.source.runNow(active.name, workflow.name, step.id)
    } finally {
      setRunNowBusy(false)
    }
  }

  async function handlePauseResume() {
    if (!active || !workflow || !sourceState) return
    if (sourceState.paused) {
      await window.trayline.source.resume(active.name, workflow.name, step.id)
      setSourceState((s) => s ? { ...s, paused: false } : s)
    } else {
      await window.trayline.source.pause(active.name, workflow.name, step.id)
      setSourceState((s) => s ? { ...s, paused: true } : s)
    }
  }

  const isRunning = sourceState?.running ?? false

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-emerald-500 text-white">
            <Rss size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight truncate">{step.name}</h1>
              <SourceStatusPill state={sourceState} />
            </div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 truncate">
              Source
              {step.description && <> · {step.description}</>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePauseResume}
              disabled={isRunning}
            >
              {sourceState?.paused
                ? <><RotateCcw size={14} strokeWidth={2} className="mr-1" />Resume</>
                : <><Pause size={14} strokeWidth={2} className="mr-1" />Pause</>}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRunNow} disabled={runNowBusy || isRunning}>
              <Play size={14} strokeWidth={2} className="mr-1" />
              {isRunning ? 'Running…' : 'Run now'}
            </Button>
          </div>
        </div>

        {sourceState && (
          <div className="mt-3 flex gap-6 text-[12px] text-neutral-500 dark:text-neutral-400">
            <span><strong className="text-neutral-700 dark:text-neutral-300">{sourceState.counters.runs_total}</strong> runs</span>
            <span><strong className="text-neutral-700 dark:text-neutral-300">{sourceState.counters.items_new}</strong> items created</span>
            <span><strong className="text-neutral-700 dark:text-neutral-300">{sourceState.seenCount}</strong> seen</span>
            {sourceState.nextRunAt && !sourceState.paused && (
              <NextRunCountdown nextRunAt={sourceState.nextRunAt} />
            )}
          </div>
        )}

        <div className="flex gap-1 mt-4 -mb-5">
          {(['source', 'config', 'runs'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                px-3 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors
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
        {tab === 'source' && active && workflow && (
          <SourceInstructionsTab project={active.name} workflow={workflow.name} stepId={step.id} />
        )}
        {tab === 'config' && active && workflow && (
          <SourceConfigTab project={active.name} workflow={workflow.name} step={step} onStateChange={loadState} />
        )}
        {tab === 'runs' && active && workflow && (
          <SourceRunsTab project={active.name} workflow={workflow.name} stepId={step.id} />
        )}
      </div>
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function SourceStatusPill({ state }: { state: SourceState | null }) {
  if (!state) return null
  if (state.running) {
    return (
      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 animate-pulse">
        Fetching
      </span>
    )
  }
  if (state.paused) {
    return (
      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Paused
      </span>
    )
  }
  if (state.counters.runs_total === 0) {
    return (
      <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        Not run yet
      </span>
    )
  }
  return (
    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
      Idle
    </span>
  )
}

// ── Next run countdown ────────────────────────────────────────────────────────

function NextRunCountdown({ nextRunAt }: { nextRunAt: string }) {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    function update() {
      const diff = Date.parse(nextRunAt) - Date.now()
      if (diff <= 0) { setDisplay('now'); return }
      const mins = Math.floor(diff / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      setDisplay(mins > 0 ? `${mins}m ${secs}s` : `${secs}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextRunAt])

  return <span>next in <strong className="text-neutral-700 dark:text-neutral-300">{display}</strong></span>
}

// ── Instructions tab ──────────────────────────────────────────────────────────

function SourceInstructionsTab({ project, workflow, stepId }: { project: string; workflow: string; stepId: string }) {
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const md = await window.trayline.source.readInstructions(project, workflow, stepId)
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
      await window.trayline.source.updateInstructions({ project, workflow, stepId, content: body })
      setSaved(body)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  const isEmpty = body.trim().length === 0

  return (
    <div className="p-6 flex flex-col gap-3 h-full">
      <div className="text-[11px] uppercase tracking-wider text-neutral-400">Source instructions (source.md)</div>
      {isEmpty && (
        <div className="flex items-start gap-2 rounded-md bg-neutral-50 dark:bg-neutral-900/40 border border-neutral-200 dark:border-neutral-800 px-4 py-3 text-xs text-neutral-500">
          <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0 mt-0.5" />
          Write instructions for what the AI should fetch. Specify the JSON output format and which field is the unique ID.
        </div>
      )}
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

// ── Config tab ────────────────────────────────────────────────────────────────

function SourceConfigTab({
  project, workflow, step, onStateChange,
}: {
  project: string
  workflow: string
  step: StepMeta
  onStateChange: () => Promise<void>
}) {
  const [config, setConfig] = useState<Partial<SourceStepConfig>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      // Read config via the step's raw data
      const steps = await window.trayline.project.listSteps(project, workflow)
      if (cancelled) return
      const found = steps.find((s) => s.id === step.id)
      if (found) setConfig(found.raw as Partial<SourceStepConfig>)
      setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [project, workflow, step.id])

  async function save(patch: Record<string, unknown>) {
    setSaving(true)
    try {
      await window.trayline.step.update({ project, workflow, stepId: step.id, patch })
      setConfig((c) => ({ ...c, ...patch }))
      await onStateChange()
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  return (
    <div className="p-6 flex flex-col gap-6 max-w-xl">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Name</Label>
        <Input
          defaultValue={config.name ?? ''}
          onBlur={(e) => { if (e.target.value !== config.name) void save({ name: e.target.value }) }}
          className="h-8 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Description</Label>
        <Input
          defaultValue={config.description ?? ''}
          onBlur={(e) => { if (e.target.value !== config.description) void save({ description: e.target.value }) }}
          className="h-8 text-sm"
        />
      </div>

      <SchedulePicker
        label="Schedule"
        value={config.schedule_cron ?? '0 * * * *'}
        onChange={(cron) => void save({ schedule_cron: cron })}
      />

      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400">Deduplication</div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Dedup key</Label>
          <Input
            defaultValue={config.dedup?.key ?? 'id'}
            onBlur={(e) => { void save({ dedup: { ...config.dedup, key: e.target.value } }) }}
            className="h-8 text-sm font-mono"
            placeholder="id"
          />
          <p className="text-xs text-neutral-500">JSON field used to identify unique items</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Max memory</Label>
          <Input
            type="number"
            defaultValue={config.dedup?.max_memory ?? 10000}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n) && n > 0) void save({ dedup: { ...config.dedup, max_memory: n } })
            }}
            className="h-8 text-sm"
          />
          <p className="text-xs text-neutral-500">Maximum number of item IDs to remember</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">First run policy</Label>
          <select
            value={config.dedup?.first_run ?? 'skip_existing'}
            onChange={(e) => void save({ dedup: { ...config.dedup, first_run: e.target.value } })}
            className="h-8 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700"
          >
            <option value="skip_existing">Skip existing (no cards on first run)</option>
            <option value="process_all">Process all (create cards for everything)</option>
            <option value="process_last_n">Process last N items</option>
          </select>
        </div>

        {config.dedup?.first_run === 'process_last_n' && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">N (last N items on first run)</Label>
            <Input
              type="number"
              defaultValue={config.dedup?.first_run_n ?? 10}
              onBlur={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!isNaN(n) && n > 0) void save({ dedup: { ...config.dedup, first_run_n: n } })
              }}
              className="h-8 text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400">Execution</div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Timeout (seconds)</Label>
          <Input
            type="number"
            defaultValue={config.execution?.timeout_seconds ?? 60}
            onBlur={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n) && n > 0) void save({ execution: { ...config.execution, timeout_seconds: n } })
            }}
            className="h-8 text-sm"
          />
        </div>
      </div>

      {saving && <p className="text-xs text-neutral-500">Saving…</p>}
    </div>
  )
}

// ── Runs tab ──────────────────────────────────────────────────────────────────

function SourceRunsTab({ project, workflow, stepId }: { project: string; workflow: string; stepId: string }) {
  const [runs, setRuns] = useState<SourceRunMeta[]>([])
  const [loaded, setLoaded] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const r = await window.trayline.source.listRuns(project, workflow, stepId)
      if (!cancelled) { setRuns(r); setLoaded(true) }
    })()
    const off = window.trayline.source.onRunEvent((ev) => {
      if (ev.stepId !== stepId) return
      if (ev.type === 'completed' || ev.type === 'failed') {
        // Refresh run list after a run finishes
        void window.trayline.source.listRuns(project, workflow, stepId).then((r) => {
          if (!cancelled) setRuns(r)
        })
      }
    })
    return () => { cancelled = true; off() }
  }, [project, workflow, stepId])

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  if (runs.length === 0) {
    return (
      <div className="p-6 text-sm text-neutral-500 dark:text-neutral-400">
        No runs yet. Click <strong>Run now</strong> to test.
      </div>
    )
  }

  return (
    <div className="p-6 flex flex-col gap-2">
      <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">Run history</div>
      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-neutral-50 dark:bg-neutral-900/40 border-b border-neutral-200 dark:border-neutral-800">
              <th className="text-left px-3 py-2 font-medium text-neutral-600 dark:text-neutral-400">Time</th>
              <th className="text-left px-3 py-2 font-medium text-neutral-600 dark:text-neutral-400">Duration</th>
              <th className="text-right px-3 py-2 font-medium text-neutral-600 dark:text-neutral-400">Found</th>
              <th className="text-right px-3 py-2 font-medium text-neutral-600 dark:text-neutral-400">New</th>
              <th className="text-center px-3 py-2 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <>
                <tr
                  key={run.run_id}
                  onClick={() => setExpandedId(expandedId === run.run_id ? null : run.run_id)}
                  className="border-b border-neutral-100 dark:border-neutral-800/60 hover:bg-neutral-50 dark:hover:bg-neutral-900/30 cursor-pointer"
                >
                  <td className="px-3 py-2 text-neutral-700 dark:text-neutral-300">
                    {new Date(run.started_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {run.elapsed_ms != null ? `${(run.elapsed_ms / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-700 dark:text-neutral-300">
                    {run.items_found ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-neutral-700 dark:text-neutral-300">
                    {run.items_new ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {run.status === 'completed'
                      ? <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                      : run.status === 'running'
                        ? <span className="text-amber-600 dark:text-amber-400 animate-pulse">⚙</span>
                        : <span className="text-red-600 dark:text-red-400">⚠</span>}
                  </td>
                </tr>
                {expandedId === run.run_id && (
                  <tr key={`${run.run_id}-detail`} className="bg-neutral-50 dark:bg-neutral-900/40">
                    <td colSpan={5} className="px-3 py-2">
                      {run.error && (
                        <div className="flex items-start gap-2 text-red-600 dark:text-red-400">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          <span>{run.error}</span>
                        </div>
                      )}
                      {!run.error && (
                        <span className="text-neutral-500">Run {run.run_id}</span>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Markdown preview (shared with WorkerDetailPanel) ──────────────────────────

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
    if (line.startsWith('## ')) { out.push(<h2 key={key++} className="text-sm font-bold mt-4 mb-1">{line.slice(3)}</h2>); i++; continue }
    if (line.startsWith('# ')) { out.push(<h1 key={key++} className="text-base font-bold mt-4 mb-2">{line.slice(2)}</h1>); i++; continue }
    if (line.trim() === '') { out.push(<br key={key++} />); i++; continue }
    out.push(<p key={key++} className="mb-1 leading-snug">{line}</p>)
    i++
  }
  return out
}
