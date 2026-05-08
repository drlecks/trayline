import Database from 'better-sqlite3'
import { join } from 'path'
import { Paths } from './fs-service'

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

let db: Database.Database

function init(): void {
  db = new Database(join(Paths.appData, 'audit.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id           TEXT PRIMARY KEY,
      timestamp    TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      workflow_id  TEXT NOT NULL,
      step_id      TEXT NOT NULL,
      card_id      TEXT NOT NULL,
      event        TEXT NOT NULL,
      actor        TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_audit_project   ON audit_log (project_id);
    CREATE INDEX IF NOT EXISTS idx_audit_card      ON audit_log (card_id);
    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log (timestamp);
  `)
}

function insert(row: Omit<AuditRow, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) {
  const stmt = db.prepare(`
    INSERT INTO audit_log (id, timestamp, project_id, workflow_id, step_id, card_id, event, actor, details_json)
    VALUES (@id, @timestamp, @project_id, @workflow_id, @step_id, @card_id, @event, @actor, @details_json)
  `)
  stmt.run({
    id: row.id ?? crypto.randomUUID(),
    timestamp: row.timestamp ?? new Date().toISOString(),
    project_id: row.project_id,
    workflow_id: row.workflow_id,
    step_id: row.step_id,
    card_id: row.card_id,
    event: row.event,
    actor: row.actor,
    details_json: row.details_json,
  })
}

function query(filters: Partial<Pick<AuditRow, 'project_id' | 'card_id' | 'step_id' | 'event'>>, limit = 200): AuditRow[] {
  const conditions: string[] = []
  const params: Record<string, string> = {}

  if (filters.project_id) { conditions.push('project_id = @project_id'); params.project_id = filters.project_id }
  if (filters.card_id)    { conditions.push('card_id = @card_id');       params.card_id = filters.card_id }
  if (filters.step_id)    { conditions.push('step_id = @step_id');       params.step_id = filters.step_id }
  if (filters.event)      { conditions.push('event = @event');           params.event = filters.event }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt = db.prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ${limit}`)
  return stmt.all(params) as AuditRow[]
}

export const auditDb = { init, insert, query }
