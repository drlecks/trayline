import { useEffect, useState, useCallback } from 'react'
import { Rss, Play, Pause, RotateCcw, AlertTriangle, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CopyButton } from '@/components/ui/copy-button'
import SchedulePicker from '@/components/shared/SchedulePicker'
import { useProjectStore } from '@/stores/project-store'
import { useProviderGuard } from '@/stores/provider-guard-store'
import type { StepMeta, SourceState, SourceRunMeta, SourceRunEvent, SourceStepConfig, CredentialSummary } from '../../../shared/types'

type Tab = 'config' | 'runs'

interface SourceDetailPanelProps {
  step: StepMeta
}

export default function SourceDetailPanel({ step }: SourceDetailPanelProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const setScreen = useProjectStore((s) => s.setScreen)
  const [tab, setTab] = useState<Tab>('config')
  const [sourceState, setSourceState] = useState<SourceState | null>(null)
  const [runNowBusy, setRunNowBusy] = useState(false)
  const [runTriggerError, setRunTriggerError] = useState<string | null>(null)

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

  // Refresh source state every 60 s so the next-run countdown stays accurate
  useEffect(() => {
    const id = setInterval(() => void loadState(), 60_000)
    return () => clearInterval(id)
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
    setRunTriggerError(null)
    try {
      const ok = await useProviderGuard.getState().ensureReady()
      if (!ok) return
      await window.trayline.source.runNow(active.name, workflow.name, step.id)
    } catch (err) {
      setRunTriggerError(err instanceof Error ? err.message : String(err))
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
            <span><strong className="text-neutral-700 dark:text-neutral-300">{sourceState.counters.items_new}</strong> cards created</span>
            {(step.raw as { channel?: { type?: string } }).channel?.type === 'imap' && (
              <span><strong className="text-neutral-700 dark:text-neutral-300">{sourceState.seenCount}</strong> seen</span>
            )}
            {sourceState.nextRunAt && !sourceState.paused && (
              <NextRunCountdown nextRunAt={sourceState.nextRunAt} />
            )}
          </div>
        )}

        {runTriggerError && (
          <div className="
            flex items-start gap-2 mt-3 px-3 py-2.5 rounded-md
            border border-red-200 dark:border-red-800/60
            bg-red-50 dark:bg-red-950/30
            text-xs text-red-800 dark:text-red-300
          ">
            <XCircle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0 text-red-500" />
            <span className="flex-1">{runTriggerError}</span>
            <button
              className="shrink-0 text-red-600 dark:text-red-400 hover:underline font-medium"
              onClick={() => setScreen('settings')}
            >
              Go to Settings
            </button>
          </div>
        )}

        <div className="flex gap-1 mt-4 -mb-5">
          {(['config', 'runs'] as Tab[]).map((t) => (
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

// ── Config tab ────────────────────────────────────────────────────────────────

function SourceConfigTab({
  project, workflow, step, onStateChange,
}: {
  project: string
  workflow: string
  step: StepMeta
  onStateChange: () => Promise<void>
}) {
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)
  const setScreen = useProjectStore((s) => s.setScreen)
  const [config, setConfig] = useState<Partial<SourceStepConfig>>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [credentials, setCredentials] = useState<CredentialSummary[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const steps = await window.trayline.project.listSteps(project, workflow)
      if (cancelled) return
      const found = steps.find((s) => s.id === step.id)
      if (found) {
        const raw = found.raw as Partial<SourceStepConfig>
        setConfig(raw)
      }
      setLoaded(true)
      void window.trayline.credential.list().then(setCredentials)
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

  async function handleDelete() {
    if (!confirm(`Delete source "${step.name}"? This cannot be undone.`)) return
    setSaving(true)
    try {
      await window.trayline.step.delete({ project, workflow, stepId: step.id })
      setSelectedStepId(null)
      await refreshSteps()
    } catch (e) {
      setSaving(false)
      alert(e instanceof Error ? e.message : String(e))
    }
  }

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  const channelType = config.channel?.type ?? null

  return (
    <div className="p-6 flex flex-col gap-6 max-w-xl">

      {/* Channel — required, shown prominently first */}
      <div className={`flex flex-col gap-3 rounded-md border p-4 ${
        !channelType
          ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}>
        <div className="flex items-center gap-2">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">Data channel</div>
          {!channelType && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
              Required
            </span>
          )}
        </div>

        {!channelType && (
          <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            Choose a channel so this source knows where to fetch data from.
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Channel type</Label>
          <select
            value={channelType ?? ''}
            onChange={(e) => {
              const t = e.target.value
              if (!t) {
                void save({ channel: null })
              } else if (t === 'http_get') {
                void save({ channel: { type: 'http_get', credential_id: '', url_path: '' } })
              } else if (t === 'imap') {
                void save({ channel: { type: 'imap', credential_id: '', folder: 'INBOX', unseen_only: true, max_messages: 50 } })
              }
            }}
            className="h-8 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700"
          >
            <option value="">— Select channel —</option>
            <option value="http_get">HTTP GET</option>
            <option value="imap">IMAP inbox</option>
          </select>
        </div>

        {config.channel?.type === 'http_get' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">HTTP credential</Label>
              <select
                value={config.channel.credential_id}
                onChange={(e) => void save({ channel: { ...config.channel, credential_id: e.target.value } })}
                className="h-8 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 text-sm"
              >
                <option value="">— Select credential —</option>
                {credentials.filter((c) => c.type === 'http').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {credentials.filter((c) => c.type === 'http').length === 0 && (
                <p className="text-xs text-neutral-400">
                  No HTTP credentials —{' '}
                  <button className="text-emerald-600 hover:underline" onClick={() => setScreen('credentials')}>add one</button>
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">URL path</Label>
              <Input
                defaultValue={config.channel.url_path}
                onBlur={(e) => void save({ channel: { ...config.channel, url_path: e.target.value } })}
                className="h-8 text-sm font-mono"
                placeholder="/endpoint?since={{last_run_at}}"
              />
              <p className="text-xs text-neutral-500">Appended to the credential&apos;s base URL. Use <code className="font-mono">{'{{last_run_at}}'}</code> for incremental fetches. The full response text becomes <code className="font-mono">card.data.body</code> in the next tray.</p>
            </div>
          </>
        )}

        {config.channel?.type === 'imap' && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">IMAP credential</Label>
              <select
                value={config.channel.credential_id}
                onChange={(e) => void save({ channel: { ...config.channel, credential_id: e.target.value } })}
                className="h-8 w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 text-sm"
              >
                <option value="">— Select credential —</option>
                {credentials.filter((c) => c.type === 'imap').map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {credentials.filter((c) => c.type === 'imap').length === 0 && (
                <p className="text-xs text-neutral-400">
                  No IMAP credentials —{' '}
                  <button className="text-emerald-600 hover:underline" onClick={() => setScreen('credentials')}>add one</button>
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label className="text-xs">Folder</Label>
                <Input
                  defaultValue={config.channel.folder ?? 'INBOX'}
                  onBlur={(e) => void save({ channel: { ...config.channel, folder: e.target.value } })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5 w-28">
                <Label className="text-xs">Max messages</Label>
                <Input
                  type="number"
                  defaultValue={config.channel.max_messages ?? 50}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value, 10)
                    if (!isNaN(n) && n > 0) void save({ channel: { ...config.channel, max_messages: n } })
                  }}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="unseen-only"
                checked={config.channel.unseen_only ?? true}
                onChange={(e) => void save({ channel: { ...config.channel, unseen_only: e.target.checked } })}
                className="rounded"
              />
              <label htmlFor="unseen-only" className="text-xs">Unread messages only</label>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1.5 flex-1">
                <Label className="text-xs">Subject contains (optional)</Label>
                <Input
                  defaultValue={config.channel.subject_contains ?? ''}
                  onBlur={(e) => void save({ channel: { ...config.channel, subject_contains: e.target.value } })}
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <Label className="text-xs">From contains (optional)</Label>
                <Input
                  defaultValue={config.channel.from_contains ?? ''}
                  onBlur={(e) => void save({ channel: { ...config.channel, from_contains: e.target.value } })}
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </>
        )}
      </div>

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

      {channelType === 'imap' && (
        <div className="flex flex-col gap-3 rounded-md border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="text-[11px] uppercase tracking-wider text-neutral-400">Deduplication</div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Dedup key</Label>
            <Input
              defaultValue={config.dedup?.key ?? 'message_id'}
              onBlur={(e) => { void save({ dedup: { ...config.dedup, key: e.target.value } }) }}
              className="h-8 text-sm font-mono"
              placeholder="message_id"
            />
            <p className="text-xs text-neutral-500">JSON field used to identify unique emails</p>
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
            <p className="text-xs text-neutral-500">Maximum number of message IDs to remember</p>
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
              <option value="process_last_n">Process last N emails</option>
            </select>
          </div>

          {config.dedup?.first_run === 'process_last_n' && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">N (last N emails on first run)</Label>
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

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-neutral-500">Reset seen-IDs so the next run processes all emails as new.</p>
            <Button
              size="sm"
              variant="outline"
              disabled={resetting || saving}
              onClick={async () => {
                setResetting(true)
                try {
                  await window.trayline.source.resetDedup(project, workflow, step.id)
                  await onStateChange()
                } finally {
                  setResetting(false)
                }
              }}
              className="shrink-0 ml-3 text-amber-600 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-700 dark:hover:bg-amber-950/40"
            >
              <RotateCcw size={13} strokeWidth={1.75} />
              {resetting ? 'Resetting…' : 'Reset dedup'}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button size="sm" variant="ghost" onClick={handleDelete} disabled={saving} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40">
          <Trash2 size={13} strokeWidth={1.75} /> Delete source
        </Button>
        {saving && <p className="text-xs text-neutral-500">Saving…</p>}
      </div>
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
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-500" />
                            <pre className="flex-1 min-w-0 text-[11px] font-mono text-red-700 dark:text-red-400 whitespace-pre-wrap break-all leading-relaxed">
                              {run.error}
                            </pre>
                            <CopyButton
                              value={() => {
                                if (!run.http_error) return run.error!
                                const { url, status, statusText, responseBody } = run.http_error
                                return `${run.error}\n\nURL: ${url}\nStatus: ${status} ${statusText}\n\n--- Response body ---\n${responseBody}`
                              }}
                              title="Copy error details"
                              className="shrink-0 text-red-600 dark:text-red-400"
                            />
                          </div>
                          {run.http_error && (
                            <div className="ml-4 flex flex-col gap-1.5 text-[11px]">
                              <div className="font-mono text-neutral-500 dark:text-neutral-400 break-all">
                                <span className="text-neutral-400 dark:text-neutral-500 select-none">URL  </span>
                                {run.http_error.url}
                              </div>
                              <details>
                                <summary className="cursor-pointer text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 select-none">
                                  Response body ({run.http_error.status} {run.http_error.statusText})
                                </summary>
                                <pre className="mt-1 font-mono text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto border-t border-neutral-200 dark:border-neutral-700 pt-1">
                                  {run.http_error.responseBody || '(empty)'}
                                </pre>
                              </details>
                            </div>
                          )}
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

