// Cross-process types — imported by both the main process and the renderer.
// Live in `src/shared` so they don't pull main-only modules (electron, fs, etc.)
// into the renderer's TypeScript program.

// ── Settings ──────────────────────────────────────────────────────────────────

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  defaultCliCommand: string
  defaultAdapterId: string
  notificationsEnabled: boolean
}

// ── Audit log ─────────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'card_created'
  | 'card_marked_ready'
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

export interface SkillManifest {
  id: string
  name: string
  version: string
  description: string
  tags?: string[]
  tools?: string[]
  _trayline?: Record<string, unknown>
}
