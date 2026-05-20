import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { runOutlet, listOutletRuns } from './outlet-runner'
import type { OutletStepConfig, OutletRunMeta, SmtpCredential, HttpCredential } from '../../shared/types'
import type { Card } from '../../shared/card'

vi.mock('./credential-service', () => ({
  credentialService: { get: vi.fn() },
}))
vi.mock('./smtp-channel', () => ({
  sendEmail: vi.fn(),
}))
vi.mock('./http-channel', () => ({
  postHttp: vi.fn(),
}))
import { credentialService } from './credential-service'
import * as smtpChannel from './smtp-channel'
import * as httpChannel from './http-channel'

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await fs.readFile(path, 'utf-8')) as T
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

const SMTP_CRED: SmtpCredential = {
  id: 'cred-smtp', type: 'smtp', name: 'Test SMTP',
  host: 'smtp.example.com', port: 587, secure: false,
  username: 'user@example.com', from_name: 'Test', from_address: 'test@example.com',
}

const HTTP_CRED: HttpCredential = {
  id: 'cred-http', type: 'http', name: 'Test HTTP',
  base_url: 'https://example.com', headers: [], timeout_ms: 5000,
}

function makeSmtpConfig(overrides: Partial<OutletStepConfig['channel']> = {}): OutletStepConfig {
  return {
    id: '03-outlet', kind: 'outlet', name: 'Outlet', description: '', color: '#8B5CF6', icon: 'send',
    channel: {
      type: 'smtp', credential_id: 'cred-smtp',
      to: '{{card.data.email}}', subject: 'Hello {{card.data.name}}', body: '{{card.data}}',
      ...overrides,
    } as OutletStepConfig['channel'],
    on_failure: 'send_to_errors',
  }
}

function makeHttpConfig(): OutletStepConfig {
  return {
    id: '03-outlet', kind: 'outlet', name: 'Outlet', description: '', color: '#8B5CF6', icon: 'send',
    channel: { type: 'http_post', credential_id: 'cred-http', url_path: '/hook/{{card.data.id}}', method: 'POST', body: '{}' },
    on_failure: 'send_to_errors',
  }
}


async function setupStep(project: string, workflow: string, prevStepId: string, stepId: string) {
  const base = join(Paths.projects, project, 'workflows', workflow)
  await fs.mkdir(join(base, 'steps', prevStepId, 'cards', 'ready'), { recursive: true })
  await fs.mkdir(join(base, 'steps', stepId, 'runs'), { recursive: true })
  await writeJson(join(base, 'workflow.json'), {
    id: workflow, name: workflow, display_name: workflow, step_ids: [prevStepId, stepId, '99-errors'],
  })
  await writeJson(join(Paths.projects, project, 'project.json'), {
    id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
  })
}

async function placeCard(project: string, workflow: string, stepId: string, card: Card) {
  const cardPath = join(Paths.projects, project, 'workflows', workflow, 'steps', stepId, 'cards', 'ready', `${card.id}.json`)
  await writeJson(cardPath, card)
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: `card-${Date.now()}`,
    created_at: new Date().toISOString(),
    created_by: 'source',
    source_step: '00-source',
    data: { email: 'a@b.com', name: 'Alice', id: '42' },
    history: [],
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await fs.mkdir(Paths.projects, { recursive: true })
  await fs.mkdir(Paths.appData, { recursive: true })
  auditDb.init()
})

beforeEach(async () => {
  await fs.rm(Paths.projects, { recursive: true, force: true })
  await fs.mkdir(Paths.projects, { recursive: true })
  vi.clearAllMocks()
})

describe('runOutlet — SMTP', () => {
  it('sends email, archives card, writes completed meta', async () => {
    const project = `or-smtp-ok-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(SMTP_CRED)
    vi.mocked(smtpChannel.sendEmail).mockResolvedValue(undefined)

    await runOutlet(project, 'wf', stepId, makeSmtpConfig(), card.id, prevId)

    expect(smtpChannel.sendEmail).toHaveBeenCalledOnce()
    const call = vi.mocked(smtpChannel.sendEmail).mock.calls[0]
    expect(call[0]).toMatchObject({ id: 'cred-smtp' })
    expect(call[1].to).toBe('a@b.com')
    expect(call[1].subject).toBe('Hello Alice')

    // Card archived
    const archivedPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', prevId, 'cards', 'archived', `${card.id}.json`)
    expect(await pathExists(archivedPath)).toBe(true)

    // ready/ no longer has the card
    const readyPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', prevId, 'cards', 'ready', `${card.id}.json`)
    expect(await pathExists(readyPath)).toBe(false)

    // Run meta shows completed
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('completed')
    expect(meta.card_id).toBe(card.id)
  })

  it('moves card to 99-errors and writes failed meta when sendEmail throws', async () => {
    const project = `or-smtp-fail-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(SMTP_CRED)
    vi.mocked(smtpChannel.sendEmail).mockRejectedValue(new Error('SMTP auth failed'))

    await runOutlet(project, 'wf', stepId, makeSmtpConfig(), card.id, prevId)

    // Card moved to 99-errors/pending (not ready) so retryFromErrors and live-stats can find it
    const errPending = join(Paths.projects, project, 'workflows', 'wf', 'steps', '99-errors', 'cards', 'pending', `${card.id}.json`)
    expect(await pathExists(errPending)).toBe(true)

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/SMTP auth failed/)
  })

  it('fails gracefully when credential is not found', async () => {
    const project = `or-no-cred-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(null)

    await runOutlet(project, 'wf', stepId, makeSmtpConfig(), card.id, prevId)

    expect(smtpChannel.sendEmail).not.toHaveBeenCalled()
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/Credential not found/)
  })

  it('fails gracefully when card file is missing', async () => {
    const project = `or-no-card-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    await setupStep(project, 'wf', prevId, stepId)
    vi.mocked(credentialService.get).mockResolvedValue(SMTP_CRED)

    await runOutlet(project, 'wf', stepId, makeSmtpConfig(), 'ghost-card', prevId)

    expect(smtpChannel.sendEmail).not.toHaveBeenCalled()
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/Card file not found/)
  })
})

describe('runOutlet — HTTP POST', () => {
  it('calls postHttp and archives card on success', async () => {
    const project = `or-http-ok-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(HTTP_CRED)
    vi.mocked(httpChannel.postHttp).mockResolvedValue(undefined)

    await runOutlet(project, 'wf', stepId, makeHttpConfig(), card.id, prevId)

    expect(httpChannel.postHttp).toHaveBeenCalledOnce()
    const archivedPath = join(Paths.projects, project, 'workflows', 'wf', 'steps', prevId, 'cards', 'archived', `${card.id}.json`)
    expect(await pathExists(archivedPath)).toBe(true)

    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('completed')
    expect(meta.channel_type).toBe('http_post')
  })

  it('moves card to 99-errors when postHttp throws', async () => {
    const project = `or-http-fail-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(HTTP_CRED)
    vi.mocked(httpChannel.postHttp).mockRejectedValue(new Error('Connection refused'))

    await runOutlet(project, 'wf', stepId, makeHttpConfig(), card.id, prevId)

    const errPending = join(Paths.projects, project, 'workflows', 'wf', 'steps', '99-errors', 'cards', 'pending', `${card.id}.json`)
    expect(await pathExists(errPending)).toBe(true)
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')
    const entries = await fs.readdir(runsDir)
    const meta = await readJson<OutletRunMeta>(join(runsDir, entries[0], 'meta.json'))
    expect(meta.status).toBe('failed')
    expect(meta.error).toMatch(/Connection refused/)
  })
})


describe('runOutlet — in-flight guard', () => {
  it('does not run twice for the same card simultaneously', async () => {
    const project = `or-inflight-${Date.now()}`
    const prevId = '02-tray'
    const stepId = '03-outlet'
    const card = makeCard()
    await setupStep(project, 'wf', prevId, stepId)
    await placeCard(project, 'wf', prevId, card)
    vi.mocked(credentialService.get).mockResolvedValue(SMTP_CRED)
    vi.mocked(smtpChannel.sendEmail).mockResolvedValue(undefined)

    await Promise.all([
      runOutlet(project, 'wf', stepId, makeSmtpConfig(), card.id, prevId),
      runOutlet(project, 'wf', stepId, makeSmtpConfig(), card.id, prevId),
    ])

    // sendEmail must have been called exactly once
    expect(smtpChannel.sendEmail).toHaveBeenCalledOnce()
  })
})

describe('listOutletRuns', () => {
  it('returns runs sorted newest first', async () => {
    const project = `or-list-${Date.now()}`
    const stepId = '03-outlet'
    const runsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps', stepId, 'runs')

    const run1: OutletRunMeta = { run_id: 'run_2026-01-01_001', status: 'completed', started_at: '2026-01-01T00:00:00.000Z', card_id: 'c1', channel_type: 'smtp' }
    const run2: OutletRunMeta = { run_id: 'run_2026-01-02_001', status: 'failed', started_at: '2026-01-02T00:00:00.000Z', card_id: 'c2', channel_type: 'smtp', error: 'oops' }
    await fs.mkdir(join(runsDir, run1.run_id), { recursive: true })
    await fs.mkdir(join(runsDir, run2.run_id), { recursive: true })
    await writeJson(join(runsDir, run1.run_id, 'meta.json'), run1)
    await writeJson(join(runsDir, run2.run_id, 'meta.json'), run2)

    const runs = await listOutletRuns(project, 'wf', stepId)
    expect(runs).toHaveLength(2)
    expect(runs[0].run_id).toBe(run2.run_id)
    expect(runs[1].run_id).toBe(run1.run_id)
  })

  it('returns empty array when runs dir does not exist', async () => {
    const runs = await listOutletRuns('ghost-project', 'wf', '03-outlet')
    expect(runs).toEqual([])
  })
})
