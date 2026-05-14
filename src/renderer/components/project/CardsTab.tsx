import { useEffect, useState, useCallback } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import NewCardDialog from './NewCardDialog'
import CardViewer from './CardViewer'
import type { StepMeta } from '../../../shared/types'
import type { Card, CardStatus } from '../../../shared/card'

const STATUS_TABS: { id: CardStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'ready', label: 'Ready' },
  { id: 'archived', label: 'Archived' },
]
// The error tray never holds "ready" cards — they're either waiting for the
// user to retry/archive (pending) or they've been parked permanently (archived).
const ERROR_STATUS_TABS: { id: CardStatus; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'archived', label: 'Archived' },
]

export default function CardsTab({ step }: { step: StepMeta }) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)

  const isErrors = step.id === '99-errors'
  const tabs = isErrors ? ERROR_STATUS_TABS : STATUS_TABS
  const [status, setStatus] = useState<CardStatus>('pending')
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [openCardId, setOpenCardId] = useState<string | null>(null)
  const jumpTarget = useProjectStore((s) => s.jumpTarget)
  const setJumpTarget = useProjectStore((s) => s.setJumpTarget)

  // If a jump target matches this step, auto-open the card and clear the target.
  useEffect(() => {
    if (jumpTarget && jumpTarget.stepId === step.id) {
      setStatus('pending')
      setOpenCardId(jumpTarget.cardId)
      setJumpTarget(null)
    }
  }, [jumpTarget, step.id, setJumpTarget])

  const refresh = useCallback(async () => {
    if (!active || !workflow) return
    setLoading(true)
    const list = await window.trayline.card.list(active.name, workflow.name, step.id, status)
    setCards(list)
    setLoading(false)
  }, [active, workflow, step.id, status])

  useEffect(() => { void refresh() }, [refresh])

  const allowManualCreate = (step.raw.allow_manual_create as boolean | undefined) ?? true
  const fields = (step.raw.input_schema as { fields?: unknown[] } | undefined)?.fields ?? []
  const hasSchema = fields.length > 0

  if (openCardId && active && workflow) {
    return (
      <CardViewer
        project={active.name}
        workflow={workflow.name}
        stepId={step.id}
        cardId={openCardId}
        step={step}
        onBack={() => { setOpenCardId(null); void refresh() }}
      />
    )
  }

  return (
    <div className="px-6 py-4">
      {/* Status filter + new card */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setStatus(t.id)}
              className={`
                text-xs px-2.5 py-1 rounded
                ${status === t.id
                  ? 'bg-neutral-100 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'}
              `}
            >
              {t.label}
            </button>
          ))}
        </div>

        {allowManualCreate && !isErrors && (
          <Button size="sm" onClick={() => setShowNew(true)} disabled={!hasSchema} title={!hasSchema ? 'Define fields in the Schema tab first' : undefined}>
            <Plus size={13} strokeWidth={1.75} /> New card
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-xs text-neutral-400">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="text-sm text-neutral-500 dark:text-neutral-400 py-12 text-center">
          {status === 'pending' && (isErrors ? 'No failed cards. All clear.' : 'No cards waiting. Create one to get started.')}
          {status === 'ready' && 'No cards are ready yet.'}
          {status === 'archived' && 'No archived cards yet.'}
        </div>
      ) : (
        <div className="flex flex-col -mx-3 rounded-md overflow-hidden border border-neutral-200/70 dark:border-neutral-800/70">
          {cards.map((c) => (
            <button
              key={c.id}
              onClick={() => setOpenCardId(c.id)}
              className="
                group flex items-center gap-3 py-2.5 px-3
                odd:bg-white even:bg-neutral-50/80
                dark:odd:bg-neutral-950 dark:even:bg-neutral-900/40
                hover:!bg-neutral-100 dark:hover:!bg-neutral-800/60
                text-left transition-colors
                border-b border-neutral-100 dark:border-neutral-900/60 last:border-b-0
              "
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {previewText(c)}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 font-mono">
                  {c.id} · {timeAgo(c.created_at)}
                </div>
              </div>
              <ChevronRight size={14} className="text-neutral-300 group-hover:text-neutral-500" strokeWidth={1.75} />
            </button>
          ))}
        </div>
      )}

      {showNew && (
        <NewCardDialog
          step={step}
          open={showNew}
          onOpenChange={setShowNew}
          onCreated={refresh}
        />
      )}
    </div>
  )
}

function previewText(card: Card): string {
  // Pick the first non-empty string-ish field as the summary
  for (const [, v] of Object.entries(card.data)) {
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.length > 80 ? v.slice(0, 80) + '…' : v
    }
    if (typeof v === 'number') return String(v)
  }
  return '(empty card)'
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
