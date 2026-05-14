// Card schemas — shared between renderer and main so the dynamic form
// renderer and the card service speak the same language.

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
  by?: 'user' | 'system' | 'worker'
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
