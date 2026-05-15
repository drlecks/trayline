// Worker run shapes shared between main and renderer.

export type WorkerRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting_input'
  | 'succeeded'
  | 'failed'
  | 'interrupted'

export interface WorkerRunMeta {
  run_id: string
  worker_id: string
  /** The source card id for single-card runs; `'batch'` for batch runs. */
  card_id: string
  project: string
  workflow: string
  /** ISO timestamp when the run was created. */
  started_at: string
  /** ISO timestamp when the run finished. Absent while in-flight. */
  ended_at?: string
  status: WorkerRunStatus
  exit_code?: number
  /** Free-form error message when status is failed. */
  error?: string
  /** Recorded duration in ms. */
  elapsed_ms?: number
  /** Planned destination tray id for the produced card (so a crashed move can be replayed). */
  next_step_id?: string
  /** Planned destination card id (so a crashed write can be replayed). */
  next_card_id?: string
  /** For batch runs: number of input cards consumed. */
  batch_card_count?: number
  /** MCP ids that were active during this run. */
  mcps_active?: string[]
}

export type WorkerRun = WorkerRunMeta

export type WorkerRunEvent =
  | { type: 'started'; project: string; workflow: string; stepId: string; runId: string; cardId: string }
  | { type: 'log'; project: string; workflow: string; stepId: string; runId: string; chunk: string }
  | { type: 'awaiting_input'; project: string; workflow: string; stepId: string; runId: string; awaiting: boolean }
  | { type: 'finished'; project: string; workflow: string; stepId: string; runId: string; status: WorkerRunStatus; error?: string; batchCardCount?: number }
