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
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'card_created'
  | 'card_marked_ready'
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

export interface ProjectMeta {
  id: string
  name: string
  display_name: string
  description: string
  created_at: string
}

export interface WorkflowMeta {
  id: string
  name: string
  display_name: string
  step_ids: string[]
}

export type StepKind = 'tray' | 'worker'

export interface StepMeta {
  id: string
  kind: StepKind
  name: string
  description?: string
  raw: Record<string, unknown>
}

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
}
