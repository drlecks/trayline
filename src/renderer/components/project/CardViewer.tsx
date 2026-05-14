import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Archive, FileText, RotateCcw, Pencil, CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useProviderGuard } from '@/stores/provider-guard-store'
import DynamicForm from '../card/DynamicForm'
import type { Card, CardStatus, CardEvent } from '../../../shared/card'
import type { StepMeta } from '../../../shared/types'
import type { PlanFieldDef } from '../../../shared/workflow-plan'

type EventTone = 'error' | 'warning' | 'success' | 'neutral'

function eventTone(event: CardEvent): EventTone {
  switch (event) {
    case 'run_failed':
      return 'error'
    case 'sent_back':
      return 'warning'
    case 'run_completed':
    case 'marked_ready':
      return 'success'
    default:
      return 'neutral'
  }
}

const TONE_STYLES: Record<EventTone, { dot: string; text: string }> = {
  error: {
    dot: 'bg-red-500 dark:bg-red-400',
    text: 'text-red-700 dark:text-red-400',
  },
  warning: {
    dot: 'bg-amber-500 dark:bg-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
  },
  success: {
    dot: 'bg-green-500 dark:bg-green-400',
    text: 'text-green-700 dark:text-green-400',
  },
  neutral: {
    dot: 'bg-neutral-400 dark:bg-neutral-600',
    text: 'text-neutral-700 dark:text-neutral-300',
  },
}

interface CardViewerProps {
  project: string
  workflow: string
  stepId: string
  cardId: string
  step?: StepMeta
  onBack: () => void
}

export default function CardViewer({ project, workflow, stepId, cardId, step, onBack }: CardViewerProps) {
  const [data, setData] = useState<{ card: Card; status: CardStatus } | null>(null)
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'view' | 'edit' | 'sendBack'>('view')
  const [sendBackNote, setSendBackNote] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const result = await window.trayline.card.get(project, workflow, stepId, cardId)
      if (!cancelled) setData(result)
    })()
    return () => { cancelled = true }
  }, [project, workflow, stepId, cardId])

  async function handleMarkReady() {
    if (!data) return
    setActing(true); setError(null)
    try {
      await window.trayline.card.markReady(project, workflow, stepId, cardId)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActing(false)
    }
  }

  async function handleArchive() {
    if (!data) return
    setActing(true); setError(null)
    try {
      await window.trayline.card.archive(project, workflow, stepId, cardId, data.status)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActing(false)
    }
  }

  async function handleRetry() {
    if (!data) return
    setActing(true); setError(null)
    try {
      const ok = await useProviderGuard.getState().ensureReady()
      if (!ok) { setActing(false); return }
      await window.trayline.card.retry(project, workflow, cardId)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActing(false)
    }
  }

  async function handleEdit(values: Record<string, unknown>, andMarkReady: boolean) {
    setActing(true); setError(null)
    try {
      await window.trayline.card.edit(project, workflow, stepId, cardId, values, andMarkReady)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActing(false)
    }
  }

  async function handleSendBack() {
    setActing(true); setError(null)
    try {
      await window.trayline.card.sendBack(project, workflow, stepId, cardId, sendBackNote.trim() || undefined)
      onBack()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setActing(false)
    }
  }

  if (!data) {
    return <div className="px-6 py-8 text-xs text-neutral-400">Loading card…</div>
  }

  const { card, status } = data
  const isErrorTray = stepId === '99-errors'
  const fields = (step?.raw?.input_schema as { fields?: PlanFieldDef[] } | undefined)?.fields ?? []
  const hasFields = fields.length > 0
  const isManual = !isErrorTray && ((step?.raw?.approval_mode as string | undefined) ?? 'manual') === 'manual'

  // ── Edit mode ──────────────────────────────────────────────────────────────

  if (mode === 'edit' && hasFields) {
    return (
      <div className="px-6 py-4 max-w-3xl">
        <button
          onClick={() => setMode('view')}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-4"
        >
          <ArrowLeft size={13} strokeWidth={1.75} /> Back
        </button>
        <h2 className="text-sm font-semibold mb-4">Edit card</h2>
        {error && <div className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</div>}
        <DynamicForm
          fields={fields}
          defaultValues={card.data as Record<string, unknown>}
          submitting={acting}
          submitLabel="Save"
          onCancel={() => setMode('view')}
          onSubmit={(values) => void handleEdit(values, false)}
          secondarySubmit={status === 'pending' && !isErrorTray ? {
            label: 'Save & mark ready',
            onSubmit: (values) => void handleEdit(values, true),
          } : undefined}
        />
      </div>
    )
  }

  // ── Send-back mode ─────────────────────────────────────────────────────────

  if (mode === 'sendBack') {
    return (
      <div className="px-6 py-4 max-w-3xl">
        <button
          onClick={() => setMode('view')}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-4"
        >
          <ArrowLeft size={13} strokeWidth={1.75} /> Back
        </button>
        <h2 className="text-sm font-semibold mb-1">Send card back</h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">
          The card will be moved to the previous step's pending queue with this note appended to its history.
        </p>
        {error && <div className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</div>}
        <div className="flex flex-col gap-3">
          <Textarea
            rows={3}
            placeholder="Add a note (optional)…"
            value={sendBackNote}
            onChange={(e) => setSendBackNote(e.target.value)}
            disabled={acting}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setMode('view')} disabled={acting}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSendBack} disabled={acting}>
              <CornerDownLeft size={13} strokeWidth={1.75} /> {acting ? 'Sending…' : 'Send back'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── View mode (default) ────────────────────────────────────────────────────

  return (
    <div className="px-6 py-4 max-w-3xl">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back to list
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono mb-1">{card.id}</div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              · created {new Date(card.created_at).toLocaleString()}
            </span>
          </div>
        </div>
        {hasFields && !isErrorTray && (
          <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
            <Pencil size={13} strokeWidth={1.75} /> Edit
          </Button>
        )}
      </div>

      {/* Fields */}
      <Section title="Fields">
        <dl className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900">
          {Object.entries(card.data).length === 0 && (
            <div className="text-xs text-neutral-400 italic py-2">No fields.</div>
          )}
          {Object.entries(card.data).map(([key, value]) => (
            <div key={key} className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-xs text-neutral-500 dark:text-neutral-400 font-medium truncate">{key}</dt>
              <dd className="col-span-2 text-sm break-words" data-selectable>
                {renderValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      {card.worker_output && (
        <Section title="Worker output">
          <pre className="text-xs font-mono bg-neutral-50 dark:bg-neutral-900/50 rounded p-3 overflow-auto" data-selectable>
{JSON.stringify(card.worker_output, null, 2)}
          </pre>
        </Section>
      )}

      {/* History */}
      <Section title="History">
        <ol className="flex flex-col gap-3">
          {card.history.map((h, i) => {
            const tone = TONE_STYLES[eventTone(h.event)]
            return (
              <li key={i} className="flex items-start gap-3">
                <div className="flex flex-col items-center pt-1">
                  <div className={`w-2 h-2 rounded-full ${tone.dot}`} />
                  {i < card.history.length - 1 && (
                    <div className="w-px h-6 bg-neutral-200 dark:bg-neutral-800 mt-1" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">
                    <span className={`font-medium ${tone.text}`}>{eventLabel(h.event)}</span>
                    <span className="text-neutral-500 dark:text-neutral-400"> · {h.step}</span>
                    {h.by && <span className="text-neutral-500 dark:text-neutral-400"> · by {h.by}</span>}
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono">
                    {new Date(h.at).toLocaleString()}
                  </div>
                  {h.note && <div className={`text-xs mt-1 ${tone.text}`}>{h.note}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      </Section>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</div>
      )}

      {/* Action bar */}
      <div className="flex items-center justify-end gap-2 sticky bottom-0 pt-4 mt-4 -mx-6 px-6 bg-[var(--bg)] border-t border-black/[0.06] dark:border-white/[0.06]">
        {isErrorTray && status === 'pending' && (
          <>
            <Button size="sm" variant="ghost" onClick={handleArchive} disabled={acting}>
              <Archive size={13} strokeWidth={1.75} /> Archive
            </Button>
            <Button size="sm" onClick={handleRetry} disabled={acting}>
              <RotateCcw size={13} strokeWidth={1.75} /> {acting ? 'Working…' : 'Retry'}
            </Button>
          </>
        )}
        {!isErrorTray && status === 'pending' && (
          <>
            <Button size="sm" variant="ghost" onClick={handleArchive} disabled={acting}>
              <Archive size={13} strokeWidth={1.75} /> Archive
            </Button>
            {isManual && (
              <Button size="sm" variant="ghost" onClick={() => { setSendBackNote(''); setMode('sendBack') }} disabled={acting}>
                <CornerDownLeft size={13} strokeWidth={1.75} /> Send back
              </Button>
            )}
            <Button size="sm" onClick={handleMarkReady} disabled={acting}>
              <Check size={13} strokeWidth={1.75} /> {acting ? 'Working…' : 'Mark ready'}
            </Button>
          </>
        )}
        {status === 'ready' && (
          <Button size="sm" variant="ghost" onClick={handleArchive} disabled={acting}>
            <Archive size={13} strokeWidth={1.75} /> Archive
          </Button>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-[11px] uppercase tracking-wider text-neutral-400 dark:text-neutral-500 mb-2 flex items-center gap-1.5">
        <FileText size={11} strokeWidth={1.75} /> {title}
      </h2>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: CardStatus }) {
  const styles = {
    pending: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-900/50',
    ready: 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900/50',
    archived: 'bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-800',
  }[status]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border ${styles}`}>
      {status}
    </span>
  )
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === '') {
    return <span className="text-neutral-400 italic">empty</span>
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return value
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-neutral-400 italic">empty</span>
    return value.join(', ')
  }
  return <pre className="text-xs font-mono">{JSON.stringify(value, null, 2)}</pre>
}

function eventLabel(event: CardEvent): string {
  switch (event) {
    case 'created': return 'Created'
    case 'marked_ready': return 'Marked ready'
    case 'sent_back': return 'Sent back'
    case 'archived': return 'Archived'
    case 'edited': return 'Edited'
    case 'run_started': return 'Run started'
    case 'run_completed': return 'Run completed'
    case 'run_failed': return 'Run failed'
    default: return event
  }
}
