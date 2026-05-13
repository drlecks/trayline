import { useEffect, useMemo, useState, useCallback } from 'react'
import cronParser from 'cron-parser'
import { AlertTriangle, Cpu, Play, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/project-store'
import { useProviderGuard } from '@/stores/provider-guard-store'
import TerminalPanel, { OpenExternalTerminalButton } from './TerminalPanel'
import type { StepMeta, SkillManifest } from '../../../shared/types'
import type { WorkerRun, WorkerRunEvent, WorkerRunStatus } from '../../../shared/worker-run'

type Tab = 'instructions' | 'config' | 'runs'

interface WorkerDetailPanelProps {
  step: StepMeta
}

export default function WorkerDetailPanel({ step }: WorkerDetailPanelProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const missingSkillsByStep = useProjectStore((s) => s.missingSkillsByStep)
  const [tab, setTab] = useState<Tab>('instructions')
  const [runNowBusy, setRunNowBusy] = useState(false)
  const [runNowFeedback, setRunNowFeedback] = useState<string | null>(null)

  const status = useLatestRunStatus(step.id)

  async function handleRunNow() {
    if (!active || !workflow || !window.trayline) return
    setRunNowBusy(true)
    setRunNowFeedback(null)
    try {
      const ok = await useProviderGuard.getState().ensureReady()
      if (!ok) return
      const { triggered } = await window.trayline.worker.runNow(active.name, workflow.name, step.id)
      setRunNowFeedback(triggered > 0 ? `Started ${triggered} run${triggered > 1 ? 's' : ''}` : 'No ready cards')
    } finally {
      setRunNowBusy(false)
      setTimeout(() => setRunNowFeedback(null), 3000)
    }
  }

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center bg-worker-strip text-white">
            <Cpu size={20} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight truncate">{step.name}</h1>
              <StatusPill status={status} />
            </div>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400 truncate">
              Worker
              {step.description && <> · {step.description}</>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {runNowFeedback && (
              <span className="text-[12px] text-neutral-500">{runNowFeedback}</span>
            )}
            <Button size="sm" variant="outline" onClick={handleRunNow} disabled={runNowBusy}>
              <Play size={14} strokeWidth={2} className="mr-1" />
              {runNowBusy ? 'Starting…' : 'Run now'}
            </Button>
          </div>
        </div>

        <div className="flex gap-1 mt-4 -mb-5">
          {(['instructions', 'config', 'runs'] as Tab[]).map((t) => (
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

      {(missingSkillsByStep[step.id]?.length ?? 0) > 0 && (
        <div className="
          flex items-start gap-2 px-6 py-2.5 shrink-0
          bg-amber-50 dark:bg-amber-950/30
          border-b border-amber-200/60 dark:border-amber-900/40
          text-xs text-amber-900 dark:text-amber-300
        ">
          <AlertTriangle size={13} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>
            Missing skill{missingSkillsByStep[step.id].length > 1 ? 's' : ''}:{' '}
            <strong>{missingSkillsByStep[step.id].join(', ')}</strong>. Install them in the Skills screen before running this worker.
          </span>
        </div>
      )}

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
      if (ev.type === 'awaiting_input') setStatus(ev.awaiting ? 'awaiting_input' : 'running')
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
  const [contextFiles, setContextFiles] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [md, files] = await Promise.all([
        window.trayline!.step.readProcess(project, workflow, stepId),
        window.trayline!.project.listContextFiles(project),
      ])
      if (cancelled) return
      setBody(md)
      setSaved(md)
      setLoaded(true)
      setContextFiles(files)
    })()
    return () => { cancelled = true }
  }, [project, workflow, stepId])

  const dirty = body !== saved

  async function save() {
    setBusy(true)
    try {
      await window.trayline!.step.updateProcess({ project, workflow, stepId, processMd: body })
      setSaved(body)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded) return <div className="p-6 text-xs text-neutral-500">Loading…</div>

  const contextVars = contextFiles.map((f) => `{{context.${f.replace(/\.md$/, '')}}}`)
  const allVars = ['{{card.data}}', ...contextVars]

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
      {allVars.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-neutral-400">Variables:</span>
          {allVars.map((v) => (
            <button
              key={v}
              type="button"
              title="Click to copy"
              onClick={() => void navigator.clipboard.writeText(v)}
              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      )}
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
  const [triggerMode, setTriggerMode] = useState<'on_ready' | 'scheduled' | 'manual'>(
    trigger.mode === 'scheduled' ? 'scheduled' : trigger.mode === 'manual' ? 'manual' : 'on_ready',
  )
  const [scheduleCron, setScheduleCron] = useState<string>(trigger.schedule_cron ?? '0 * * * *')
  const [busy, setBusy] = useState(false)

  // Skills + context packs
  const [installedSkills, setInstalledSkills] = useState<SkillManifest[]>([])
  const [selectedSkills, setSelectedSkills] = useState<string[]>(raw.skills ?? [])
  const [contextFiles, setContextFiles] = useState<string[]>([])
  const [selectedContextPacks, setSelectedContextPacks] = useState<string[]>(raw.context_packs ?? [])

  // Removal confirmation modal state
  const [removeSkillId, setRemoveSkillId] = useState<string | null>(null)
  const [removeContextPack, setRemoveContextPack] = useState<string | null>(null)

  useEffect(() => {
    void window.trayline!.project.listSkills().then(setInstalledSkills)
    void window.trayline!.project.listContextFiles(project).then(setContextFiles)
  }, [project])

  // Re-sync picker state when the step changes (e.g. user picks a different worker)
  useEffect(() => {
    setSelectedSkills(raw.skills ?? [])
    setSelectedContextPacks(raw.context_packs ?? [])
    setCommand(exec.command ?? 'claude')
    setTimeoutSec(exec.timeout_seconds ?? 180)
    setRetries(exec.retry_attempts ?? 1)
    setTriggerMode(trigger.mode === 'scheduled' ? 'scheduled' : trigger.mode === 'manual' ? 'manual' : 'on_ready')
    setScheduleCron(trigger.schedule_cron ?? '0 * * * *')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  function addSkill(id: string) {
    if (!id || selectedSkills.includes(id)) return
    setSelectedSkills((prev) => [...prev, id])
  }

  function confirmRemoveSkill() {
    if (!removeSkillId) return
    setSelectedSkills((prev) => prev.filter((s) => s !== removeSkillId))
    setRemoveSkillId(null)
  }

  function addContextPack(file: string) {
    if (!file || selectedContextPacks.includes(file)) return
    setSelectedContextPacks((prev) => [...prev, file])
  }

  function confirmRemoveContextPack() {
    if (!removeContextPack) return
    setSelectedContextPacks((prev) => prev.filter((f) => f !== removeContextPack))
    setRemoveContextPack(null)
  }

  async function save() {
    setBusy(true)
    try {
      await window.trayline!.step.update({
        project, workflow, stepId: step.id,
        patch: {
          execution: { ...exec, command, timeout_seconds: timeoutSec, retry_attempts: retries },
          trigger: {
            ...trigger,
            mode: triggerMode,
            schedule_cron: triggerMode === 'scheduled' ? scheduleCron : null,
          },
          skills: selectedSkills,
          context_packs: selectedContextPacks,
        } as Record<string, unknown>,
      })
      await refreshSteps()
    } finally { setBusy(false) }
  }

  const TRIGGER_OPTIONS: { value: 'on_ready' | 'scheduled' | 'manual'; label: string; desc: string }[] = [
    { value: 'on_ready', label: 'On ready', desc: 'Run when a card is marked ready in the previous tray.' },
    { value: 'scheduled', label: 'Scheduled', desc: 'Run on a cron schedule, processing any waiting cards.' },
    { value: 'manual', label: 'Manual only', desc: 'Never fires automatically — only via "Run now".' },
  ]

  // Skills available to add (installed user skills not yet selected)
  const skillsToAdd = installedSkills.filter((s) => !selectedSkills.includes(s.id))
  // Resolve selected IDs — keep missing ones as ghost entries so they stay visible
  const selectedSkillEntries = selectedSkills.map((id) => {
    const manifest = installedSkills.find((s) => s.id === id)
    return manifest
      ? { found: true as const, id, manifest }
      : { found: false as const, id }
  })

  // Base context files (prefix '_') are auto-included in every run — hide from selector
  const baseContextFiles = contextFiles.filter((f) => f.startsWith('_'))
  // Context files available to add (non-base, not yet selected)
  const contextToAdd = contextFiles.filter((f) => !f.startsWith('_') && !selectedContextPacks.includes(f))

  return (
    <>
      <div className="p-6 flex flex-col gap-5 max-w-xl">
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
            {TRIGGER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTriggerMode(opt.value)}
                className={`flex-1 px-3 py-2 rounded-md border text-left text-xs ${
                  triggerMode === opt.value
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                <div className="text-neutral-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {triggerMode === 'scheduled' && (
          <>
            <CronPicker value={scheduleCron} onChange={setScheduleCron} />
            <NextRunTime expr={scheduleCron} />
          </>
        )}

        {/* Skills */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-500">Skills</label>
          {skillsToAdd.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => { addSkill(e.target.value); e.target.value = '' }}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 text-xs"
            >
              <option value="" disabled>Add a skill…</option>
              {skillsToAdd.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {selectedSkillEntries.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {selectedSkillEntries.map((entry) => (
                <li
                  key={entry.id}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border bg-white dark:bg-neutral-950 ${
                    entry.found
                      ? 'border-neutral-200 dark:border-neutral-800'
                      : 'border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20'
                  }`}
                >
                  {!entry.found && (
                    <AlertTriangle size={13} strokeWidth={1.75} className="shrink-0 text-amber-500 dark:text-amber-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    {entry.found ? (
                      <>
                        <span className="text-xs font-medium">{entry.manifest.name}</span>
                        {entry.manifest.description && (
                          <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1.5 truncate">{entry.manifest.description}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium font-mono">{entry.id}</span>
                        <span className="text-xs text-amber-600 dark:text-amber-400 ml-1.5">Not installed</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveSkillId(entry.id)}
                    className="shrink-0 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            skillsToAdd.length === 0 && installedSkills.length === 0 && (
              <p className="text-xs text-neutral-400 dark:text-neutral-600 italic">
                No skills installed — visit the Skills screen to add some.
              </p>
            )
          )}
        </div>

        {/* Context packs */}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-neutral-500">Context packs</label>

          {/* Base context files — always auto-included, read-only */}
          {baseContextFiles.length > 0 && (
            <ul className="flex flex-col gap-1">
              {baseContextFiles.map((f) => (
                <li key={f} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-neutral-100 dark:border-neutral-800/60 bg-neutral-50 dark:bg-neutral-900/40">
                  <span className="flex-1 text-xs font-mono text-neutral-500 dark:text-neutral-500 truncate">{f}</span>
                  <span className="text-[10px] text-neutral-400 dark:text-neutral-600 italic shrink-0">always included</span>
                </li>
              ))}
            </ul>
          )}

          {contextToAdd.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => { addContextPack(e.target.value); e.target.value = '' }}
              className="rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-3 py-1.5 text-xs font-mono"
            >
              <option value="" disabled>Add a context file…</option>
              {contextToAdd.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
          {selectedContextPacks.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {selectedContextPacks.map((file) => (
                <li key={file} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
                  <span className="flex-1 text-xs font-mono truncate">{file}</span>
                  <button
                    type="button"
                    onClick={() => setRemoveContextPack(file)}
                    className="shrink-0 text-neutral-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            contextFiles.filter((f) => !f.startsWith('_')).length === 0 && (
              <p className="text-xs text-neutral-400 dark:text-neutral-600 italic">
                No context files yet — add them under Context files in the sidebar.
              </p>
            )
          )}
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>

      {/* Remove skill confirmation */}
      {(() => {
        const entry = removeSkillId ? selectedSkillEntries.find((e) => e.id === removeSkillId) : null
        const label = entry?.found ? entry.manifest.name : removeSkillId
        return (
          <Dialog open={removeSkillId !== null} onOpenChange={(open) => { if (!open) setRemoveSkillId(null) }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Remove skill</DialogTitle>
                <DialogDescription>
                  Are you sure you want to remove <strong>{label}</strong> from this worker?
                  {entry?.found
                    ? ' The skill will remain installed — you can re-add it at any time.'
                    : ' This skill is not currently installed.'}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => setRemoveSkillId(null)}>Cancel</Button>
                <Button size="sm" variant="destructive" onClick={confirmRemoveSkill}>Remove</Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* Remove context pack confirmation */}
      <Dialog open={removeContextPack !== null} onOpenChange={(open) => { if (!open) setRemoveContextPack(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove context pack</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{removeContextPack}</strong> from this worker?
              The file will remain in the project — you can re-add it at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setRemoveContextPack(null)}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={confirmRemoveContextPack}>Remove</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Next scheduled run time ─────────────────────────────────────────────────

function getNextRunDate(expr: string): Date | null {
  try {
    const interval = cronParser.parseExpression(expr)
    return interval.next().toDate()
  } catch {
    return null
  }
}

function formatRelative(date: Date): string {
  const diff = date.getTime() - Date.now()
  if (diff < 0) return 'now'
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `in ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `in ${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `in ${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `in ${days}d ${hours % 24}h`
}

function NextRunTime({ expr }: { expr: string }) {
  const computeNext = useCallback(() => getNextRunDate(expr), [expr])
  const [next, setNext] = useState<Date | null>(computeNext)

  // Recompute once a minute so the display stays fresh
  useEffect(() => {
    setNext(computeNext())
    const id = setInterval(() => setNext(computeNext()), 60_000)
    return () => clearInterval(id)
  }, [computeNext])

  if (!next) return null

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
      <span>Next run:</span>
      <span className="font-medium text-neutral-700 dark:text-neutral-300">
        {next.toLocaleString()}
      </span>
      <span>({formatRelative(next)})</span>
    </div>
  )
}

// ─── Cron picker ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: 'Every 15 minutes', value: '*/15 * * * *' },
  { label: 'Every hour',       value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every weekday at 9am', value: '0 9 * * 1-5' },
] as const

/** Validate a cron expression without importing node-cron into the renderer.
 *  Accepts standard 5-field POSIX cron: min hour dom month dow.
 *  Allows * /N  N  N-M  N,M in each field.  */
function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const field = /^(\*|\d+(-\d+)?(,\d+(-\d+)?)*)$|^\*\/\d+$/
  return parts.every((p) => field.test(p))
}

interface CronPickerProps {
  value: string
  onChange: (v: string) => void
}

function CronPicker({ value, onChange }: CronPickerProps) {
  const preset = CRON_PRESETS.find((p) => p.value === value)
  const [custom, setCustom] = useState(!preset)
  const [draft, setDraft] = useState(value)
  const valid = isValidCron(draft)

  // Sync draft when parent changes value (e.g. on step switch)
  useEffect(() => {
    setDraft(value)
    setCustom(!CRON_PRESETS.find((p) => p.value === value))
  }, [value])

  function pickPreset(v: string) {
    setCustom(false)
    setDraft(v)
    onChange(v)
  }

  function handleCustomChange(v: string) {
    setDraft(v)
    if (isValidCron(v)) onChange(v)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-neutral-500">Schedule</label>
      <div className="grid grid-cols-2 gap-1.5">
        {CRON_PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => pickPreset(p.value)}
            className={`px-3 py-2 rounded-md border text-left text-xs ${
              !custom && value === p.value
                ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
            }`}
          >
            {p.label}
            <span className="block text-[10px] text-neutral-400 font-mono mt-0.5">{p.value}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustom(true)}
          className={`px-3 py-2 rounded-md border text-left text-xs ${
            custom
              ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
              : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
          }`}
        >
          Custom expression
          <span className="block text-[10px] text-neutral-400 font-mono mt-0.5">cron syntax</span>
        </button>
      </div>
      {custom && (
        <div className="flex flex-col gap-1">
          <input
            value={draft}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder="*/30 9-17 * * 1-5"
            className={`rounded-md border px-3 py-1.5 text-xs font-mono ${
              valid
                ? 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950'
                : 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30'
            }`}
          />
          {!valid && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              Invalid cron expression — use 5 fields: minute hour day month weekday
            </p>
          )}
          {valid && (
            <p className="text-[11px] text-neutral-400 font-mono">{draft}</p>
          )}
        </div>
      )}
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
  // Track live status (the row may say `succeeded` but a re-run can flip it).
  const [liveStatus, setLiveStatus] = useState<WorkerRunStatus | 'idle'>(run.status)

  useEffect(() => {
    setShowTerminal(false)
    setLiveStatus(run.status)
  }, [run.run_id, run.status])

  useEffect(() => {
    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.runId !== run.run_id) return
      if (ev.type === 'awaiting_input') setLiveStatus(ev.awaiting ? 'awaiting_input' : 'running')
      if (ev.type === 'finished') setLiveStatus(ev.status)
    })
    return () => off()
  }, [run.run_id])

  const tokenEstimate = useMemo(() => estimateTokens(run), [run])

  return (
    <div className="p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{run.run_id}</div>
          <div className="text-xs text-neutral-500">Card: <span className="font-mono">{run.card_id}</span></div>
        </div>
        <StatusPill status={liveStatus} />
      </div>
      <div className="text-xs text-neutral-600 dark:text-neutral-400">
        Started: {new Date(run.started_at).toLocaleString()}
        {run.ended_at && <> · Elapsed: {((run.elapsed_ms ?? 0) / 1000).toFixed(1)}s</>}
        {run.exit_code !== undefined && <> · Exit: {run.exit_code}</>}
        {tokenEstimate !== null && <> · ~{tokenEstimate.toLocaleString()} tokens</>}
      </div>
      {run.error && (
        <div className="rounded-md border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/40 p-3 text-xs text-red-800 dark:text-red-300 flex items-start gap-2">
          <div className="flex-1 whitespace-pre-wrap">{run.error}</div>
          <CopyButton value={run.error} title="Copy error" className="-mt-1 -mr-1 text-red-700 dark:text-red-300" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => setShowTerminal((v) => !v)}>
          {showTerminal ? 'Hide terminal ↑' : 'Show terminal ↓'}
        </Button>
        {showTerminal && (
          <OpenExternalTerminalButton
            project={project} workflow={workflow} stepId={stepId} runId={run.run_id}
          />
        )}
      </div>
      {showTerminal && (
        <TerminalPanel
          project={project}
          workflow={workflow}
          stepId={stepId}
          runId={run.run_id}
          status={liveStatus}
        />
      )}
    </div>
  )
}

/**
 * Best-effort token estimate from a run. We don't have a usage API hook
 * yet — Claude Code doesn't emit a structured usage line in `-p` mode.
 * Approximate from the terminal log length using the classic ~4 chars/token
 * rule. Surfacing this as `~N tokens` keeps the contract honest.
 */
function estimateTokens(run: WorkerRun): number | null {
  if (run.status === 'running' || run.status === 'pending') return null
  // We don't have direct access to terminalLog here without an extra IPC call.
  // Use elapsed_ms as a weak proxy guard against showing 0 for empty runs.
  if (!run.elapsed_ms) return null
  // Worker-runner doesn't track tokens yet; surface null until the adapter
  // wires a real `usage` reading. Display logic is in place for when it does.
  return null
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
          const ok = await useProviderGuard.getState().ensureReady()
          if (!ok) return
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
