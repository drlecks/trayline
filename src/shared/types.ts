// Cross-process types — imported by both the main process and the renderer.
// Live in `src/shared` so they don't pull main-only modules (electron, fs, etc.)
// into the renderer's TypeScript program.

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  defaultCliCommand: string
  defaultAdapterId: string
  /** Per-adapter chosen model id. Keyed by adapter id; null when not yet set. */
  defaultModelByAdapter: Record<string, string | null>
  /** Per-adapter chosen effort id. Keyed by adapter id; null when not set or N/A. */
  defaultEffortByAdapter: Record<string, string | null>
  notificationsEnabled: boolean
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
  | 'run_aborted_mcp_not_ready'
  | 'mcp_installed'
  | 'mcp_uninstalled'
  | 'mcp_configured'
  | 'mcp_credentials_reset'
  | 'mcp_health_check_failed'
  | 'ai_terminal_clear_failed'
  | 'source_run_started'
  | 'source_run_completed'
  | 'source_run_failed'
  | 'source_item_new'
  | 'skill_installed'
  | 'skill_updated'
  | 'skill_uninstalled'
  | 'skill_quarantined'

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
  systemSkillsRestored: string[]
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
   * Workflow status. Hooks for future features (scheduling, watchers, etc.)
   * may gate themselves on this. Defaults to 'active' on read when absent.
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
  /** MCP ids referenced by the new project that aren't installed/configured yet. */
  unconfiguredMcps: string[]
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

export interface SkillManifest {
  id: string
  name: string
  version: string
  description: string
  tags?: string[]
  tools?: string[]
  /** Additional files bundled with this skill (relative paths under the skill directory). */
  files?: string[]
  _trayline?: Record<string, unknown>
}

// ── Skill catalog (Phase 8 — Skill Finder) ────────────────────────────────────

export interface SkillCatalogEntry {
  id: string
  name: string
  version: string
  description: string
  author?: string
  tags?: string[]
  /** Directory URL where the skill's files live (must end with `/`). */
  base_url: string
  /** Relative paths to fetch under base_url. Defaults to ["skill.json", "skill.md"]. */
  files?: string[]
}

export interface SkillCatalogIndex {
  schema_version?: number
  generated_at?: string
  skills: SkillCatalogEntry[]
}

export interface SkillCatalogFetchResult {
  index: SkillCatalogIndex
  source: 'remote' | 'cache'
  /** Populated when source === 'cache' — why the remote attempt failed. */
  remoteError?: string
}

export interface InstalledSkillRow {
  manifest: SkillManifest
  source: 'catalog' | 'url' | 'local' | 'system'
  sourceUrl?: string
  installedAt?: string
  usedBy: { project: string; workflow: string; stepId: string }[]
  /** Version available in the cached catalog when newer than installed. */
  updateAvailable?: string
  /** True when on-disk revalidation at launch found the skill tampered or invalid. */
  quarantined?: boolean
}

// ── Skill validation (N2.1) ───────────────────────────────────────────────────

export interface ValidationCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'warn'
  /** Human-readable description for fail/warn status. */
  message?: string
  /** For skill.md safety scan: each matched line as "line N: [pattern] text". */
  matches?: string[]
}

export interface SkillValidationResult {
  checks: ValidationCheck[]
  /** Parsed and validated manifest, or null if skill.json was invalid. */
  manifest: {
    id: string
    name: string
    version: string
    description: string
    tags?: string[]
  } | null
  /** Every file found in the bundle with its byte size. */
  fileList: { name: string; sizeBytes: number }[]
  /** True when at least one check has status === 'fail'. */
  hasFail: boolean
  /** Populated only when hasFail === false; the temp dir where files are staged. */
  pendingTempDir?: string
  /** The source URL used for this validation. */
  sourceUrl?: string
}

export interface MissingSkillsEntry {
  stepId: string
  workflowId: string
  missingSkillIds: string[]
}

// ── MCP system ────────────────────────────────────────────────────────────────

export type McpInstallMethod = 'npm' | 'binary' | 'docker' | 'local'

export interface McpCredentialSchemaEntry {
  id: string
  label: string
  description?: string
  /** api_key → masked input; text_field → plain text input. Both stored in OS keychain. */
  kind: 'api_key' | 'text_field'
}

export interface McpManifest {
  id: string
  name: string
  version: string
  description: string
  install_method: McpInstallMethod
  command_template: string
  /** Human-readable setup instructions shown before the credential inputs. */
  instructions?: string
  credentials_schema: McpCredentialSchemaEntry[]
  /** When true the setup wizard appends a live connection-test step at the end. */
  has_test?: boolean
  tags?: string[]
  homepage?: string
}

export type McpHealthState = 'ready' | 'unconfigured' | 'error' | 'unknown' | 'disabled'

export interface McpStatus {
  /** True when all required credentials are confirmed present in the keychain. */
  configured: boolean
  /** Result of last health check. null if never run. */
  health: 'ok' | 'failed' | null
  healthCheckedAt: string | null
  lastError?: string
  /** When true, MCP won't auto-start even if a worker has it marked. */
  disabled?: boolean
}

export interface InstalledMcpRow {
  manifest: McpManifest
  status: McpStatus
  healthState: McpHealthState
  installedAt: string
}

export interface McpCatalogEntry {
  id: string
  name: string
  version: string
  description: string
  install_method: McpInstallMethod
  command_template: string
  instructions?: string
  credentials_schema: McpCredentialSchemaEntry[]
  has_test?: boolean
  tags?: string[]
  homepage?: string
}

export interface McpCatalogIndex {
  schema_version?: number
  generated_at?: string
  mcps: McpCatalogEntry[]
}

// ── Import / Export (Phase 11) ────────────────────────────────────────────────

export interface ExportOptions {
  /** When true, card files (pending/ready/archived) are included. Default: false. */
  includeCards: boolean
}

export interface ExportManifest {
  trayline_version: string
  exported_at: string
  skills: Array<{ id: string; version: string }>
  mcps: string[]
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
  skillsRequired: string[]
  /** First 300 chars of process.md per worker step. */
  workerPreviews: Array<{ name: string; excerpt: string }>
}

/** Import completed — project is on disk and watchers are mounted. */
export interface ImportSuccess {
  ok: true
  projectName: string
  missingSkills: Array<{ id: string; version: string }>
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
