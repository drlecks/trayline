// Cross-process types — imported by both the main process and the renderer.
// Live in `src/shared` so they don't pull main-only modules (electron, fs, etc.)
// into the renderer's TypeScript program.

// ── Settings ──────────────────────────────────────────────────────────────────

export interface NotificationSettings {
  /** Global on/off switch — when false, no OS notifications are fired. Default: true. */
  enabled: boolean
  /** Project names (folder ids) for which notifications are suppressed. */
  disabledProjects: string[]
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  defaultCliCommand: string
  defaultAdapterId: string
  /** Per-adapter chosen model id. Keyed by adapter id; null when not yet set. */
  defaultModelByAdapter: Record<string, string | null>
  /** Per-adapter chosen effort id. Keyed by adapter id; null when not set or N/A. */
  defaultEffortByAdapter: Record<string, string | null>
  /** @deprecated Use notificationSettings.enabled instead. */
  notificationsEnabled: boolean
  notificationSettings: NotificationSettings
  /**
   * Name (folder id) of the last project the user had open. Restored on next
   * launch so the app comes back to where the user left it. null when the
   * user is on the welcome screen.
   */
  lastOpenedProject: string | null
  /**
   * True once the user has completed (or dismissed) the onboarding tour.
   * Drives auto-launch of the tour on first run; can be reset from the
   * Help menu to re-trigger.
   */
  onboardingComplete: boolean
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'card_created'
  | 'card_marked_ready'
  | 'card_edited'
  | 'card_sent_back'
  | 'card_retried'
  | 'card_approved'
  | 'card_rejected'
  | 'run_started'
  | 'run_completed'
  | 'run_failed'
  | 'ai_terminal_clear_failed'
  | 'source_run_started'
  | 'source_run_completed'
  | 'source_run_failed'
  | 'source_item_new'

export interface AuditRow {
  id: string
  timestamp: string
  project_id: string
  workflow_id: string
  step_id: string
  card_id: string
  event: AuditEvent
  actor: 'user' | 'system'
  details_json: string
}

// ── Bootstrap info ────────────────────────────────────────────────────────────

export interface BootstrapInfo {
  dataDir: string
  appVersion: string
}

// ── Project metadata ──────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'inactive'

export interface ProjectMeta {
  id: string
  name: string
  display_name: string
  description: string
  created_at: string
  /**
   * Orchestration gate: 'active' projects have their watchers and schedulers
   * mounted; 'inactive' projects do not run until re-activated.
   * Defaults to 'active' on read when absent.
   */
  status: ProjectStatus
  /**
   * ISO timestamp of the last write to this project (creation, status change,
   * regenerate, etc.). Drives the most-recent-first ordering of the project
   * list screen. Defaults to `created_at` on read when absent.
   */
  updated_at: string
}

export interface WorkflowMeta {
  id: string
  name: string
  display_name: string
  step_ids: string[]
}

export type StepKind = 'tray' | 'worker' | 'source'

export interface StepMeta {
  id: string
  kind: StepKind
  name: string
  description?: string
  raw: Record<string, unknown>
}

// ── Source step types ─────────────────────────────────────────────────────────

export type SourceFirstRunPolicy = 'skip_existing' | 'process_all' | 'process_last_n'

export interface SourceDedup {
  key: string
  max_memory: number
  first_run: SourceFirstRunPolicy
  first_run_n?: number
}

export interface SourceStepConfig {
  id: string
  kind: 'source'
  name: string
  description: string
  color: string
  icon: string
  schedule_cron: string
  dedup: SourceDedup
  execution: {
    timeout_seconds: number
    adapter: string
  }
  paused: boolean
}

export interface SeenIdsEntry {
  id: string
  seen_at: string
}

export interface SourceCounters {
  runs_total: number
  items_found: number
  items_new: number
  last_run_at: string | null
}

export interface SourceRunMeta {
  run_id: string
  step_id: string
  project: string
  workflow: string
  started_at: string
  ended_at?: string
  status: 'running' | 'completed' | 'failed'
  items_found?: number
  items_new?: number
  error?: string
  elapsed_ms?: number
}

export interface SourceState {
  counters: SourceCounters
  seenCount: number
  paused: boolean
  nextRunAt: string | null
  running: boolean
}

export type SourceRunEvent =
  | { type: 'started'; project: string; workflow: string; stepId: string; runId: string }
  | { type: 'completed'; project: string; workflow: string; stepId: string; runId: string; itemsFound: number; itemsNew: number }
  | { type: 'failed'; project: string; workflow: string; stepId: string; runId: string; error: string }

// ── Usage / rate-limit windows ────────────────────────────────────────────────

/** Snapshot of the active AI agent's rate-limit window consumption. */
export interface UsageSnapshot {
  /** 0–100, percentage of the 5-hour rolling window consumed. null if unknown. */
  fiveHourPct: number | null
  /** 0–100, percentage of the weekly window consumed. null if unknown. */
  weeklyPct: number | null
  /** Where the values came from. */
  source: 'placeholder' | 'claude-code' | 'unavailable'
  /** ISO timestamp of when this snapshot was produced. */
  updatedAt: string
}

// ── AI provider readiness ─────────────────────────────────────────────────────

export type AdapterBlockerKind =
  | 'not_installed'
  | 'model_not_downloaded'  // local-llm: runtime present but no GGUF model file on disk

export interface AdapterBlocker {
  kind: AdapterBlockerKind
  /** User-facing explanation in plain English. */
  message: string
  /** Link to install docs. */
  fixUrl?: string
  /** Shell command the user can run to fix this (e.g. an install command). */
  fixCommand?: string
}

export interface AdapterReadiness {
  adapterId: string
  /** CLI binary (or local server) is present and reachable. */
  installed: boolean
  /** CLI version string if installed, null otherwise. */
  version: string | null
  /** All current blockers. Empty array means ready to run. */
  blockers: AdapterBlocker[]
  checkedAt: number
}

export interface LocalModelEntry {
  id: string
  label: string
  description: string
  filename: string
  sizeMb: number
  sizeBytes: number
  recommended: boolean
  minRamMb: number
  /** True when the GGUF file is present in userData/trayline-models/. */
  downloaded: boolean
  /** ms timestamp of when the file was last modified (proxy for download time). */
  downloadedAt?: number
}

export interface ModelDownloadProgress {
  modelId: string
  downloadedBytes: number
  totalBytes: number
  /** 0–100 */
  percent: number
}

export interface ProviderInstallSuggestion {
  id: string
  displayName: string
  description: string
  installUrl: string
  /** True when this suggestion is actually wired up as an adapter today. */
  available: boolean
}

export interface ProviderReadyResult {
  /** True when at least one production adapter is installed on this machine. */
  ready: boolean
  /** Adapter ids that detected as installed and are production-kind. */
  installedIds: string[]
  /** Curated install suggestions to show the user when `ready` is false. */
  suggestions: ProviderInstallSuggestion[]
}

/**
 * Adapter-level usage telemetry surfaced in Settings + Footer.
 * Mirrors `AdapterUsageSnapshot` in `src/main/ai-terminals/adapter.ts` and
 * lives here so the renderer can import it without pulling in main-process
 * modules. Both windows are nullable so adapters can expose one and not the
 * other.
 */
export interface AdapterUsageSnapshot {
  fiveHour: { used: number; limit: number; resetsAt: string } | null
  weekly: { used: number; limit: number; resetsAt: string } | null
}

// ── Project creation (Workflow Author flow) ──────────────────────────────────

export interface ProjectCreateSuccess {
  ok: true
  project: ProjectMeta
  /** True when the generated plan includes at least one Source step. */
  hasSourceStep: boolean
}

export interface ProjectCreateError {
  ok: false
  stage: 'author' | 'scaffold'
  reason: string
  message: string
  /** Raw agent output, when available; useful for debugging parse failures. */
  raw?: string
}

export type ProjectCreateOutcome = ProjectCreateSuccess | ProjectCreateError

// ── Project live stats & readiness (N5.2) ────────────────────────────────────

export interface ProjectLiveStats {
  pendingCards: number
  readyCards: number
  errorCards: number
  runningWorkers: number
  runningSources: number
}

export interface ProjectReadiness {
  ready: boolean
  /** Human-readable reasons why the project cannot run. Empty when ready. */
  blockers: string[]
}

// ── Import / Export (Phase 11) ────────────────────────────────────────────────

export interface ExportOptions {
  /** When true, card files (pending/ready/archived) are included. Default: false. */
  includeCards: boolean
}

export interface ExportManifest {
  trayline_version: string
  exported_at: string
}

// ── Security audit ────────────────────────────────────────────────────────────

export type SecurityFindingCategory =
  | 'suspicious_file'
  | 'exfiltration'
  | 'system_access'
  | 'obfuscation'
  | 'prompt_injection'

export interface SecurityFinding {
  severity: 'critical' | 'warning'
  category: SecurityFindingCategory
  file: string
  description: string
  /** Truncated snippet of the offending text. */
  match?: string
}

export interface ImportProjectSummary {
  displayName: string
  description: string
  trays: number
  workers: number
  /** First 300 chars of process.md per worker step. */
  workerPreviews: Array<{ name: string; excerpt: string }>
}

/** Import completed — project is on disk and watchers are mounted. */
export interface ImportSuccess {
  ok: true
  projectName: string
}

/**
 * Security scan found issues — project is held in a temp location.
 * Call project:importCommit(token) to install or project:importAbort(token) to discard.
 */
export interface ImportNeedsReview {
  ok: 'needs_review'
  token: string
  projectName: string
  securityFindings: SecurityFinding[]
  projectSummary: ImportProjectSummary
}

export type ImportResult = ImportSuccess | ImportNeedsReview
