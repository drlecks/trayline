import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'

// Test the audit DB logic in isolation using an in-memory SQLite db
// (avoids needing Electron's app.getPath at test time)

function buildTestDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE audit_log (
      id           TEXT PRIMARY KEY,
      timestamp    TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      workflow_id  TEXT NOT NULL,
      step_id      TEXT NOT NULL,
      card_id      TEXT NOT NULL,
      event        TEXT NOT NULL,
      actor        TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}'
    )
  `)
  return db
}

describe('audit_log', () => {
  let db: ReturnType<typeof buildTestDb>

  beforeAll(() => {
    db = buildTestDb()
  })

  it('inserts and retrieves a row', () => {
    db.prepare(`
      INSERT INTO audit_log (id, timestamp, project_id, workflow_id, step_id, card_id, event, actor, details_json)
      VALUES ('row-1', '2026-05-08T10:00:00Z', 'proj-1', 'wf-1', 'step-1', 'card-1', 'card_created', 'user', '{}')
    `).run()

    const rows = db.prepare('SELECT * FROM audit_log WHERE id = ?').all('row-1')
    expect(rows).toHaveLength(1)
    expect((rows[0] as { event: string }).event).toBe('card_created')
  })

  it('filters by project_id', () => {
    db.prepare(`
      INSERT INTO audit_log (id, timestamp, project_id, workflow_id, step_id, card_id, event, actor, details_json)
      VALUES ('row-2', '2026-05-08T10:01:00Z', 'proj-2', 'wf-1', 'step-1', 'card-2', 'run_started', 'system', '{}')
    `).run()

    const rows = db.prepare('SELECT * FROM audit_log WHERE project_id = ?').all('proj-2')
    expect(rows).toHaveLength(1)
    expect((rows[0] as { id: string }).id).toBe('row-2')
  })
})
