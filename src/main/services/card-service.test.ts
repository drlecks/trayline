import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { cardService } from './card-service'

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function buildTray(project: string, workflow: string, stepId: string) {
  const stepDir = join(Paths.projects, project, 'workflows', workflow, 'steps', stepId)
  for (const sub of ['pending', 'ready', 'archived']) {
    await fs.mkdir(join(stepDir, 'cards', sub), { recursive: true })
  }
  await fs.mkdir(join(stepDir, 'state'), { recursive: true })
  await writeJson(join(stepDir, 'step.json'), {
    id: stepId, kind: 'tray', name: stepId, approval_mode: 'manual',
    input_schema: { fields: [] }, allow_manual_create: true,
  })
  return stepDir
}

async function buildWorkflow(project: string, workflow: string, stepIds: string[]) {
  const wfDir = join(Paths.projects, project, 'workflows', workflow)
  await writeJson(join(wfDir, 'workflow.json'), {
    id: workflow, name: workflow, display_name: workflow, step_ids: stepIds,
  })
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
  return wfDir
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

describe('cardService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.projects, { recursive: true })
    await fs.mkdir(Paths.appData, { recursive: true })
    auditDb.init()
  })

  beforeEach(async () => {
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  it('createCard writes to pending/ with a sequential id and bumps counters', async () => {
    const project = `cards-create-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const c1 = await cardService.createCard(project, 'wf', '01-tray', { foo: 'a' })
    const c2 = await cardService.createCard(project, 'wf', '01-tray', { foo: 'b' })

    expect(c1.id).toMatch(/^card_\d{4}-\d{2}-\d{2}_001$/)
    expect(c2.id).toMatch(/^card_\d{4}-\d{2}-\d{2}_002$/)
    expect(c1.created_by).toBe('manual')
    expect(c1.history[0].event).toBe('created')

    expect(await pathExists(join(stepDir, 'cards', 'pending', `${c1.id}.json`))).toBe(true)

    const counters = await cardService.readCounters(project, 'wf', '01-tray')
    expect(counters.received_total).toBe(2)
    expect(counters.today).toBe(2)
  })

  it('listCards returns newest-first and ignores .tmp files', async () => {
    const project = `cards-list-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const older = await cardService.createCard(project, 'wf', '01-tray', { n: 1 })
    // Backdate the older card so the sort is deterministic regardless of clock skew.
    const olderPath = join(stepDir, 'cards', 'pending', `${older.id}.json`)
    const raw = JSON.parse(await fs.readFile(olderPath, 'utf-8'))
    raw.created_at = '2000-01-01T00:00:00.000Z'
    await fs.writeFile(olderPath, JSON.stringify(raw), 'utf-8')

    const newer = await cardService.createCard(project, 'wf', '01-tray', { n: 2 })

    // Drop a stray .tmp file that should be ignored
    await fs.writeFile(join(stepDir, 'cards', 'pending', 'card_x.json.tmp'), '{}', 'utf-8')

    const list = await cardService.listCards(project, 'wf', '01-tray', 'pending')
    expect(list.map((c) => c.id)).toEqual([newer.id, older.id])
  })

  it('listCards skips malformed JSON instead of throwing', async () => {
    const project = `cards-malformed-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')
    await cardService.createCard(project, 'wf', '01-tray', { ok: true })
    await fs.writeFile(join(stepDir, 'cards', 'pending', 'card_broken.json'), '{not json', 'utf-8')

    const list = await cardService.listCards(project, 'wf', '01-tray', 'pending')
    expect(list).toHaveLength(1)
  })

  it('getCard finds a card across status folders', async () => {
    const project = `cards-get-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    await buildTray(project, 'wf', '01-tray')

    const created = await cardService.createCard(project, 'wf', '01-tray', { foo: 1 })
    const got = await cardService.getCard(project, 'wf', '01-tray', created.id)
    expect(got?.status).toBe('pending')
    expect(got?.card.id).toBe(created.id)

    await cardService.markReady(project, 'wf', '01-tray', created.id)
    const got2 = await cardService.getCard(project, 'wf', '01-tray', created.id)
    expect(got2?.status).toBe('ready')

    expect(await cardService.getCard(project, 'wf', '01-tray', 'missing')).toBeNull()
  })

  it('getCounts counts only .json files per status', async () => {
    const project = `cards-counts-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    await cardService.createCard(project, 'wf', '01-tray', {})
    await cardService.createCard(project, 'wf', '01-tray', {})
    await fs.writeFile(join(stepDir, 'cards', 'pending', 'noise.txt'), 'x', 'utf-8')
    await fs.writeFile(join(stepDir, 'cards', 'pending', 'half.json.tmp'), '{}', 'utf-8')

    const counts = await cardService.getCounts(project, 'wf', '01-tray')
    expect(counts).toEqual({ pending: 2, ready: 0, archived: 0 })
  })

  it('markReady moves pending → ready, appends history, and audits', async () => {
    const project = `cards-mark-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const created = await cardService.createCard(project, 'wf', '01-tray', {})
    const updated = await cardService.markReady(project, 'wf', '01-tray', created.id)

    expect(await pathExists(join(stepDir, 'cards', 'pending', `${created.id}.json`))).toBe(false)
    expect(await pathExists(join(stepDir, 'cards', 'ready', `${created.id}.json`))).toBe(true)
    expect(updated.history.at(-1)?.event).toBe('marked_ready')

    const rows = auditDb.query({ project_id: project, event: 'card_marked_ready' })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('markReady throws when the source file is missing', async () => {
    const project = `cards-mark-missing-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    await buildTray(project, 'wf', '01-tray')
    await expect(
      cardService.markReady(project, 'wf', '01-tray', 'card_nope_001'),
    ).rejects.toThrow(/Card not found in pending/)
  })

  it('archiveCard moves to archived/', async () => {
    const project = `cards-arch-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const created = await cardService.createCard(project, 'wf', '01-tray', {})
    await cardService.archiveCard(project, 'wf', '01-tray', created.id, 'pending')
    expect(await pathExists(join(stepDir, 'cards', 'archived', `${created.id}.json`))).toBe(true)
  })

  it('retryFromErrors moves a card from 99-errors back to the failed worker\'s preceding tray', async () => {
    const project = `cards-retry-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-src', '02-worker', '03-next', '99-errors'])
    await buildTray(project, 'wf', '01-src')
    await buildTray(project, 'wf', '03-next')
    const errDir = await buildTray(project, 'wf', '99-errors')

    // Seed a card directly in 99-errors/pending with a run_failed history pointing at 02-worker
    const cardId = 'card_err_001'
    await writeJson(join(errDir, 'cards', 'pending', `${cardId}.json`), {
      id: cardId,
      created_at: new Date().toISOString(),
      created_by: 'worker',
      source_step: '02-worker',
      data: { ok: false },
      history: [
        { at: new Date().toISOString(), step: '02-worker', event: 'run_failed', by: 'system' },
      ],
    })

    const { card, targetStepId } = await cardService.retryFromErrors(project, 'wf', cardId)
    expect(targetStepId).toBe('01-src')
    expect(card.history.at(-1)?.event).toBe('sent_back')
    expect(await pathExists(join(errDir, 'cards', 'pending', `${cardId}.json`))).toBe(false)
    expect(
      await pathExists(join(Paths.projects, project, 'workflows', 'wf', 'steps', '01-src', 'cards', 'ready', `${cardId}.json`)),
    ).toBe(true)

    const rows = auditDb.query({ project_id: project, event: 'card_retried' })
    expect(rows.length).toBeGreaterThan(0)
  })

  it('retryFromErrors falls back to the step before 99-errors when history has no run_failed entry', async () => {
    const project = `cards-retry-fb-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-src', '02-worker', '03-next', '99-errors'])
    await buildTray(project, 'wf', '03-next')
    const errDir = await buildTray(project, 'wf', '99-errors')

    const cardId = 'card_err_002'
    await writeJson(join(errDir, 'cards', 'pending', `${cardId}.json`), {
      id: cardId,
      created_at: new Date().toISOString(),
      created_by: 'manual',
      source_step: '01-src',
      data: {},
      history: [],
    })

    const { targetStepId } = await cardService.retryFromErrors(project, 'wf', cardId)
    expect(targetStepId).toBe('03-next')
  })

  it('retryFromErrors throws when the card is not in the error tray', async () => {
    const project = `cards-retry-miss-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-src', '99-errors'])
    await buildTray(project, 'wf', '99-errors')
    await expect(
      cardService.retryFromErrors(project, 'wf', 'card_ghost'),
    ).rejects.toThrow(/not found in error tray/)
  })

  it('editCard updates data and appends edited history without changing status', async () => {
    const project = `cards-edit-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const created = await cardService.createCard(project, 'wf', '01-tray', { foo: 'original' })
    const updated = await cardService.editCard(project, 'wf', '01-tray', created.id, { foo: 'updated' })

    expect(updated.data).toEqual({ foo: 'updated' })
    expect(updated.history.at(-1)?.event).toBe('edited')
    // Card should still be in pending/
    expect(await pathExists(join(stepDir, 'cards', 'pending', `${created.id}.json`))).toBe(true)
    expect(await pathExists(join(stepDir, 'cards', 'ready', `${created.id}.json`))).toBe(false)
  })

  it('editCard with andMarkReady moves card to ready/ and appends both edited and marked_ready history', async () => {
    const project = `cards-edit-ready-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    const stepDir = await buildTray(project, 'wf', '01-tray')

    const created = await cardService.createCard(project, 'wf', '01-tray', { x: 1 })
    const updated = await cardService.editCard(project, 'wf', '01-tray', created.id, { x: 2 }, { andMarkReady: true })

    expect(updated.data).toEqual({ x: 2 })
    const events = updated.history.map((h) => h.event)
    expect(events).toContain('edited')
    expect(events).toContain('marked_ready')
    expect(await pathExists(join(stepDir, 'cards', 'pending', `${created.id}.json`))).toBe(false)
    expect(await pathExists(join(stepDir, 'cards', 'ready', `${created.id}.json`))).toBe(true)
  })

  it('editCard throws when the card is not found', async () => {
    const project = `cards-edit-miss-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-tray'])
    await buildTray(project, 'wf', '01-tray')
    await expect(
      cardService.editCard(project, 'wf', '01-tray', 'card_ghost_001', {}),
    ).rejects.toThrow(/Card not found/)
  })

  it('sendBackCard moves card to the previous step pending/ and appends sent_back history', async () => {
    const project = `cards-sendback-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-intake', '02-review'])
    const intakeDir = await buildTray(project, 'wf', '01-intake')
    const reviewDir = await buildTray(project, 'wf', '02-review')

    // Seed a card in 02-review/pending/
    const cardId = 'card_test_001'
    await writeJson(join(reviewDir, 'cards', 'pending', `${cardId}.json`), {
      id: cardId,
      created_at: new Date().toISOString(),
      created_by: 'manual',
      source_step: '01-intake',
      data: { note: 'hello' },
      history: [{ at: new Date().toISOString(), step: '01-intake', event: 'created', by: 'user' }],
    })

    const { card, targetStepId } = await cardService.sendBackCard(project, 'wf', '02-review', cardId, 'Needs more work')
    expect(targetStepId).toBe('01-intake')
    expect(card.history.at(-1)?.event).toBe('sent_back')
    expect(card.history.at(-1)?.note).toBe('Needs more work')
    // Moved out of 02-review
    expect(await pathExists(join(reviewDir, 'cards', 'pending', `${cardId}.json`))).toBe(false)
    // Arrived in 01-intake/pending/
    expect(await pathExists(join(intakeDir, 'cards', 'pending', `${cardId}.json`))).toBe(true)
  })

  it('sendBackCard throws when card is not in pending/', async () => {
    const project = `cards-sendback-miss-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-intake', '02-review'])
    await buildTray(project, 'wf', '02-review')
    await expect(
      cardService.sendBackCard(project, 'wf', '02-review', 'card_ghost_001'),
    ).rejects.toThrow(/Card not found in pending/)
  })

  it('sendBackCard throws when there is no previous step', async () => {
    const project = `cards-sendback-first-${Date.now()}`
    await buildWorkflow(project, 'wf', ['01-only'])
    const stepDir = await buildTray(project, 'wf', '01-only')
    const created = await cardService.createCard(project, 'wf', '01-only', { x: 1 })
    // Make sure card exists in pending
    expect(await pathExists(join(stepDir, 'cards', 'pending', `${created.id}.json`))).toBe(true)
    await expect(
      cardService.sendBackCard(project, 'wf', '01-only', created.id),
    ).rejects.toThrow(/No previous step/)
  })
})
