// CRUD + atomic transitions for cards. Each tray step has cards/{pending,ready,archived}/
// subfolders. Cards move between them by file rename (atomic on the same filesystem).
// All movement is logged to the audit DB *before* the file move so the move is replayable
// after a crash.

import { join } from 'path'
import fs from 'fs/promises'
import { fsService } from './fs-service'
import { auditDb } from './audit-db'
import { projectService } from './project-service'
import type { Card, CardCounts, CardStatus, TrayCounters, CardHistoryEntry } from '../../shared/card'

function stepPath(project: string, workflow: string, stepId: string): string {
  return projectService.paths.stepDir(project, workflow, stepId)
}

function statusDir(project: string, workflow: string, stepId: string, status: CardStatus): string {
  return join(stepPath(project, workflow, stepId), 'cards', status)
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function todayDate(): string {
  // YYYY-MM-DD in local time
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Card IDs ──────────────────────────────────────────────────────────────────
// Format: card_<YYYY-MM-DD>_<NNN> where NNN is a per-day sequence number.
// We pick the next NNN by scanning the step's cards/* dirs for files that
// already match today's date. That way IDs stay readable and never collide.

async function nextCardId(project: string, workflow: string, stepId: string): Promise<string> {
  const date = todayDate()
  let max = 0
  for (const status of ['pending', 'ready', 'archived'] as CardStatus[]) {
    const dir = statusDir(project, workflow, stepId, status)
    if (!(await pathExists(dir))) continue
    const files = await fs.readdir(dir)
    for (const f of files) {
      const match = f.match(new RegExp(`^card_${date}_(\\d{3})\\.json$`))
      if (match) {
        const n = parseInt(match[1], 10)
        if (n > max) max = n
      }
    }
  }
  return `card_${date}_${String(max + 1).padStart(3, '0')}`
}

// ── Counters ──────────────────────────────────────────────────────────────────

async function readCounters(project: string, workflow: string, stepId: string): Promise<TrayCounters> {
  const path = join(stepPath(project, workflow, stepId), 'state', 'counters.json')
  if (!(await pathExists(path))) return { received_total: 0, today: 0 }
  try {
    return await fsService.readJson<TrayCounters>(path)
  } catch {
    return { received_total: 0, today: 0 }
  }
}

async function bumpReceivedCounter(project: string, workflow: string, stepId: string): Promise<void> {
  const path = join(stepPath(project, workflow, stepId), 'state', 'counters.json')
  await fs.mkdir(join(stepPath(project, workflow, stepId), 'state'), { recursive: true })
  const current = await readCounters(project, workflow, stepId)
  const today = todayDate()
  const isNewDay = current.today_date !== today
  const next: TrayCounters = {
    received_total: current.received_total + 1,
    today: isNewDay ? 1 : current.today + 1,
    today_date: today,
  }
  await fsService.writeJsonAtomic(path, next)
}

// ── Reads ─────────────────────────────────────────────────────────────────────

async function listCards(
  project: string,
  workflow: string,
  stepId: string,
  status: CardStatus,
): Promise<Card[]> {
  const dir = statusDir(project, workflow, stepId, status)
  if (!(await pathExists(dir))) return []
  const files = await fs.readdir(dir)
  const out: Card[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    if (f.endsWith('.tmp')) continue
    try {
      const card = await fsService.readJson<Card>(join(dir, f))
      out.push(card)
    } catch {
      // Skip malformed cards rather than failing the whole list. They'll
      // surface as missing entries in the UI; the user can fix them by hand.
    }
  }
  // Newest first for human-friendly listings (created_at descending)
  out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  return out
}

async function getCard(
  project: string,
  workflow: string,
  stepId: string,
  cardId: string,
): Promise<{ card: Card; status: CardStatus } | null> {
  for (const status of ['pending', 'ready', 'archived'] as CardStatus[]) {
    const path = join(statusDir(project, workflow, stepId, status), `${cardId}.json`)
    if (await pathExists(path)) {
      const card = await fsService.readJson<Card>(path)
      return { card, status }
    }
  }
  return null
}

async function getCounts(project: string, workflow: string, stepId: string): Promise<CardCounts> {
  async function countDir(status: CardStatus): Promise<number> {
    const dir = statusDir(project, workflow, stepId, status)
    if (!(await pathExists(dir))) return 0
    const files = await fs.readdir(dir)
    return files.filter((f) => f.endsWith('.json') && !f.endsWith('.tmp')).length
  }
  const [pending, ready, archived] = await Promise.all([
    countDir('pending'),
    countDir('ready'),
    countDir('archived'),
  ])
  return { pending, ready, archived }
}

// ── Mutations ─────────────────────────────────────────────────────────────────

async function createCard(
  project: string,
  workflow: string,
  stepId: string,
  data: Record<string, unknown>,
  opts: { createdBy?: Card['created_by'] } = {},
): Promise<Card> {
  const id = await nextCardId(project, workflow, stepId)
  const now = new Date().toISOString()
  const card: Card = {
    id,
    created_at: now,
    created_by: opts.createdBy ?? 'manual',
    source_step: stepId,
    data,
    history: [{ at: now, step: stepId, event: 'created', by: opts.createdBy === 'manual' ? 'user' : 'system' }],
  }

  const dir = statusDir(project, workflow, stepId, 'pending')
  await fs.mkdir(dir, { recursive: true })
  await fsService.writeJsonAtomic(join(dir, `${id}.json`), card)

  await bumpReceivedCounter(project, workflow, stepId)

  auditDb.insert({
    project_id: project,
    workflow_id: workflow,
    step_id: stepId,
    card_id: id,
    event: 'card_created',
    actor: opts.createdBy === 'manual' ? 'user' : 'system',
    details_json: JSON.stringify({ source: opts.createdBy ?? 'manual' }),
  })

  return card
}

async function moveCard(
  project: string,
  workflow: string,
  stepId: string,
  cardId: string,
  from: CardStatus,
  to: CardStatus,
  history: CardHistoryEntry,
): Promise<Card> {
  const fromPath = join(statusDir(project, workflow, stepId, from), `${cardId}.json`)
  const toPath = join(statusDir(project, workflow, stepId, to), `${cardId}.json`)

  if (!(await pathExists(fromPath))) {
    throw new Error(`Card not found in ${from}: ${cardId}`)
  }
  await fs.mkdir(statusDir(project, workflow, stepId, to), { recursive: true })

  // Read, append history, write to new location, then unlink old. The audit
  // log entry is written *before* the move so it can be replayed on crash.
  const card = await fsService.readJson<Card>(fromPath)
  const updated: Card = {
    ...card,
    history: [...card.history, history],
  }

  // Audit log first (durable record of intent), then file move
  if (history.event === 'marked_ready') {
    auditDb.insert({
      project_id: project,
      workflow_id: workflow,
      step_id: stepId,
      card_id: cardId,
      event: 'card_marked_ready',
      actor: history.by === 'user' ? 'user' : 'system',
      details_json: JSON.stringify({ from, to }),
    })
  }

  await fsService.writeJsonAtomic(toPath, updated)
  await fs.unlink(fromPath)

  return updated
}

async function markReady(
  project: string,
  workflow: string,
  stepId: string,
  cardId: string,
): Promise<Card> {
  return moveCard(project, workflow, stepId, cardId, 'pending', 'ready', {
    at: new Date().toISOString(),
    step: stepId,
    event: 'marked_ready',
    by: 'user',
  })
}

async function archiveCard(
  project: string,
  workflow: string,
  stepId: string,
  cardId: string,
  fromStatus: CardStatus,
): Promise<Card> {
  return moveCard(project, workflow, stepId, cardId, fromStatus, 'archived', {
    at: new Date().toISOString(),
    step: stepId,
    event: 'archived',
    by: 'user',
  })
}

export const cardService = {
  listCards,
  getCard,
  getCounts,
  readCounters,
  createCard,
  markReady,
  archiveCard,
}
