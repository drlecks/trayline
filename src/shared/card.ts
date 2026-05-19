// Card schemas — shared between renderer and main so the dynamic form
// renderer and the card service speak the same language.

import type { PlanFieldDef } from './workflow-plan'

export type CardStatus = 'pending' | 'ready' | 'archived'

export type CardCreatedBy = 'manual' | 'webhook' | 'worker' | 'source'

export type CardEvent =
  | 'created'
  | 'marked_ready'
  | 'sent_back'
  | 'archived'
  | 'edited'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'

export interface CardHistoryEntry {
  at: string
  step: string
  event: CardEvent
  by?: 'user' | 'system' | 'worker' | 'source'
  note?: string
}

export interface Card {
  id: string
  created_at: string
  created_by: CardCreatedBy
  source_step: string
  data: Record<string, unknown>
  history: CardHistoryEntry[]
  /** Set on cards produced by a worker run so the viewer can show output details. */
  worker_output?: Record<string, unknown>
}

export interface CardCounts {
  pending: number
  ready: number
  archived: number
}

export interface TrayCounters {
  received_total: number
  today: number
  /** ISO date (YYYY-MM-DD) of the last increment to `today`. Used to roll over at midnight. */
  today_date?: string
}

/**
 * Returns a display name for a card by scanning its data fields in priority order:
 * text → textarea → date → number. Falls back to a heuristic scan when no field
 * definitions are provided (e.g. cards produced by workers with free-form output).
 * Result is capped at 100 characters.
 */
export function getCardDisplayName(card: Card, fields?: PlanFieldDef[]): string {
  const LIMIT = 100
  const trim = (s: string) => (s.length > LIMIT ? s.slice(0, LIMIT) + '…' : s)

  if (fields && fields.length > 0) {
    const order: PlanFieldDef['type'][] = ['text', 'textarea', 'date', 'number']
    for (const type of order) {
      for (const f of fields) {
        if (f.type !== type) continue
        const v = card.data[f.id]
        if (typeof v === 'string' && v.trim().length > 0) return trim(v.trim())
        if (type === 'number' && typeof v === 'number') return String(v)
      }
    }
  } else {
    // No schema — scan all values: strings first, then numbers
    for (const v of Object.values(card.data)) {
      if (typeof v === 'string' && v.trim().length > 0) return trim(v.trim())
    }
    for (const v of Object.values(card.data)) {
      if (typeof v === 'number') return String(v)
    }
  }

  return '(empty card)'
}
