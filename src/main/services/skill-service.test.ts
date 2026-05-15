import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { skillService, type CatalogIndex } from './skill-service'

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

/**
 * Build a fake fetch that resolves a small in-memory URL → response map.
 * Anything not in the map produces a 404. Set `error` on a key to throw
 * (simulates offline / DNS failure).
 */
function makeFakeFetch(map: Record<string, { body?: string; status?: number; error?: string }>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const entry = map[url]
    if (!entry) {
      return new Response('not found', { status: 404 }) as unknown as Response
    }
    if (entry.error) throw new Error(entry.error)
    return new Response(entry.body ?? '', { status: entry.status ?? 200 }) as unknown as Response
  })
}

// Must match the CATALOG_URL constant inside skill-service.ts
const REAL_CATALOG_URL = 'https://raw.githubusercontent.com/drlecks/trayline/develop/catalog/index.json'

const SAMPLE_INDEX: CatalogIndex = {
  schema_version: 1,
  skills: [
    {
      id: 'demo-skill',
      name: 'Demo Skill',
      version: '1.2.0',
      description: 'A test skill',
      base_url: 'https://example.test/skills/demo-skill/',
    },
    {
      id: 'other-skill',
      name: 'Other',
      version: '0.1.0',
      description: 'Other',
      base_url: 'https://example.test/skills/other/',
    },
  ],
}

const DEMO_MANIFEST = JSON.stringify({
  id: 'demo-skill',
  name: 'Demo Skill',
  version: '1.2.0',
  description: 'A test skill',
})
const DEMO_MD = '# Demo\nInstructions\n'

describe('skillService', () => {
  beforeAll(async () => {
    await fs.mkdir(Paths.skills, { recursive: true })
    await fs.mkdir(Paths.appData, { recursive: true })
    auditDb.init()
  })

  beforeEach(async () => {
    // Wipe installed user skills (keep _system if present)
    if (await pathExists(Paths.skills)) {
      for (const e of await fs.readdir(Paths.skills)) {
        if (e === '_system') continue
        await fs.rm(join(Paths.skills, e), { recursive: true, force: true })
      }
    }
    await fs.rm(join(Paths.appData, 'skills-index-cache.json'), { force: true })
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchCatalog returns remote when fetch succeeds and caches it', async () => {
    const fakeFetch = makeFakeFetch({
      [REAL_CATALOG_URL]: { body: JSON.stringify(SAMPLE_INDEX) },
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await skillService.fetchCatalog()
    expect(res.source).toBe('remote')
    expect(res.index.skills).toHaveLength(2)
    // Cache file written
    const cached = JSON.parse(
      await fs.readFile(join(Paths.appData, 'skills-index-cache.json'), 'utf-8'),
    )
    expect(cached.skills[0].id).toBe('demo-skill')
  })

  it('fetchCatalog falls back to cache when the network errors', async () => {
    await writeJson(join(Paths.appData, 'skills-index-cache.json'), SAMPLE_INDEX)

    vi.stubGlobal('fetch', makeFakeFetch({ [REAL_CATALOG_URL]: { error: 'offline' } }))
    const res = await skillService.fetchCatalog()
    expect(res.source).toBe('cache')
    expect(res.remoteError).toBeDefined()
    expect(res.index.skills.map((s) => s.id)).toContain('demo-skill')
  })

  it('fetchCatalog falls back to bundled catalog when offline and no cache exists', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({ [REAL_CATALOG_URL]: { error: 'offline' } }))
    const res = await skillService.fetchCatalog()
    expect(res.source).toBe('cache')
    // Falls back to the bundled resources/skills-catalog.json which is present in dev
    expect(res.index.skills.length).toBeGreaterThan(0)
  })

  it('installFromCatalog fetches files via GitHub API, writes manifest + md, and stamps _trayline metadata', async () => {
    const apiUrl = 'https://api.github.com/repos/test-owner/test-skills/contents/skills/demo-skill?ref=main'
    const rawMdUrl = 'https://raw.githubusercontent.com/test-owner/test-skills/main/skills/demo-skill/SKILL.md'

    // Catalog index using GitHub Contents API URL directly as base_url
    const githubIndex: CatalogIndex = {
      schema_version: 1,
      skills: [
        { ...SAMPLE_INDEX.skills[0]!, base_url: apiUrl },
        SAMPLE_INDEX.skills[1]!,
      ],
    }

    vi.stubGlobal('fetch', makeFakeFetch({
      [REAL_CATALOG_URL]: { body: JSON.stringify(githubIndex) },
      // GitHub Contents API returns a flat file listing
      [apiUrl]: {
        body: JSON.stringify([
          { name: 'SKILL.md', type: 'file', download_url: rawMdUrl, url: `${apiUrl}/SKILL.md` },
        ]),
      },
      [rawMdUrl]: { body: DEMO_MD },
    }))

    const installed = await skillService.installFromCatalog('demo-skill')
    expect(installed.manifest.id).toBe('demo-skill')
    expect(installed.source).toBe('catalog')

    const dir = join(Paths.skills, 'demo-skill')
    const manifest = JSON.parse(await fs.readFile(join(dir, 'skill.json'), 'utf-8'))
    expect(manifest._trayline.source).toBe('catalog')
    expect(manifest._trayline.source_url).toBe(apiUrl)
    expect(typeof manifest._trayline.installed_at).toBe('string')
    // File stored under its original GitHub name (SKILL.md), auto-detected as instruction file
    expect(await fs.readFile(join(dir, 'SKILL.md'), 'utf-8')).toBe(DEMO_MD)
  })

  it('installFromUrl validates the manifest and rejects bad ids', async () => {
    const base = 'https://example.test/raw/bad/'
    vi.stubGlobal('fetch', makeFakeFetch({
      [base + 'skill.json']: { body: JSON.stringify({ id: 'BAD ID!', name: 'X', version: '1', description: 'd' }) },
      [base + 'skill.md']: { body: '# X' },
    }))
    await expect(skillService.installFromUrl(base)).rejects.toThrow(/`id` must be/)
  })

  it('installFromUrl rejects non-http(s) URLs', async () => {
    await expect(skillService.installFromUrl('ftp://example.test/x')).rejects.toThrow(/http/)
  })

  it('listInstalled finds installed user skills and flags updates against the cached catalog', async () => {
    // Install an older version directly
    await writeJson(join(Paths.skills, 'demo-skill', 'skill.json'), {
      id: 'demo-skill', name: 'Demo', version: '1.0.0', description: '',
      _trayline: { source: 'catalog', source_url: 'https://example.test/skills/demo-skill/' },
    })
    await fs.writeFile(join(Paths.skills, 'demo-skill', 'skill.md'), '# old\n', 'utf-8')

    // Seed catalog cache with a newer version
    await writeJson(join(Paths.appData, 'skills-index-cache.json'), SAMPLE_INDEX)

    const installed = await skillService.listInstalled()
    const demo = installed.find((s) => s.manifest.id === 'demo-skill')
    expect(demo).toBeDefined()
    expect(demo!.updateAvailable).toBe('1.2.0')
    expect(demo!.source).toBe('catalog')
  })

  it('findUsage scans worker step.json files for the skill id', async () => {
    // Build a project with a worker that uses demo-skill
    const project = `usage-${Date.now()}`
    const stepsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps')
    await writeJson(join(Paths.projects, project, 'project.json'), {
      id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
    })
    await writeJson(join(Paths.projects, project, 'workflows', 'wf', 'workflow.json'), {
      id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-w'],
    })
    await writeJson(join(stepsDir, '01-w', 'step.json'), {
      id: '01-w', kind: 'worker', name: 'W', skills: ['demo-skill'], mcps: [], context_packs: [],
    })

    const usage = await skillService.findUsage('demo-skill')
    expect(usage).toEqual([{ project, workflow: 'wf', stepId: '01-w' }])
  })

  it('uninstall removes the folder when no workers reference the skill', async () => {
    await writeJson(join(Paths.skills, 'demo-skill', 'skill.json'), {
      id: 'demo-skill', name: 'Demo', version: '1.0.0', description: '',
    })
    await fs.writeFile(join(Paths.skills, 'demo-skill', 'skill.md'), '# x', 'utf-8')

    await skillService.uninstall('demo-skill')
    expect(await pathExists(join(Paths.skills, 'demo-skill'))).toBe(false)
  })

  it('uninstall refuses when at least one worker still references the skill', async () => {
    await writeJson(join(Paths.skills, 'demo-skill', 'skill.json'), {
      id: 'demo-skill', name: 'Demo', version: '1.0.0', description: '',
    })
    await fs.writeFile(join(Paths.skills, 'demo-skill', 'skill.md'), '# x', 'utf-8')

    // Build a project that uses it
    const project = `uninstall-blocked-${Date.now()}`
    const stepsDir = join(Paths.projects, project, 'workflows', 'wf', 'steps')
    await writeJson(join(Paths.projects, project, 'project.json'), {
      id: project, name: project, display_name: project, description: '', created_at: new Date().toISOString(),
    })
    await writeJson(join(Paths.projects, project, 'workflows', 'wf', 'workflow.json'), {
      id: 'wf', name: 'wf', display_name: 'wf', step_ids: ['01-w'],
    })
    await writeJson(join(stepsDir, '01-w', 'step.json'), {
      id: '01-w', kind: 'worker', name: 'W', skills: ['demo-skill'],
    })

    await expect(skillService.uninstall('demo-skill')).rejects.toThrow(/still used by/)
    // Folder is still there
    expect(await pathExists(join(Paths.skills, 'demo-skill'))).toBe(true)
  })
})
