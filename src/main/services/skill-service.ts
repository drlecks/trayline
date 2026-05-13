// Skill catalog + install/uninstall/update.
//
// Phase 8 scope:
//   - Fetch a remote skill index, cache it to app-data/skills-index-cache.json
//   - List installed skills (user skills under skills/, excluding _system)
//   - Install from the catalog or from a base URL
//   - Update / uninstall installed skills
//   - Block uninstall when a worker in any project still references the skill
//
// Skills in this phase are instruction-only: skill.json + skill.md. The phase
// brief delegates the full validation pipeline (executables rejection,
// signature checks, etc.) to N2.1; here we just refuse anything other than
// those two files and require a well-formed manifest.

import { join } from 'path'
import fs from 'fs/promises'
import { Paths, fsService } from './fs-service'
import { projectService } from './project-service'
import type { SkillManifest } from '../../shared/types'

const CATALOG_URL = process.env.TRAYLINE_CATALOG_URL ?? 'https://raw.githubusercontent.com/drlecks/trayline/develop/catalog/index.json'
const CACHE_PATH = join(Paths.appData, 'skills-index-cache.json')
const FETCH_TIMEOUT_MS = 8000

export interface CatalogEntry {
  id: string
  name: string
  version: string
  description: string
  author?: string
  tags?: string[]
  /** Directory URL where the skill's files live (must end with `/`). */
  base_url: string
  /** Instruction file name inside base_url. Defaults to "skill.md". Remote repos may use "SKILL.md". */
  skill_md?: string
}

export interface CatalogIndex {
  schema_version?: number
  generated_at?: string
  skills: CatalogEntry[]
}

export interface CatalogFetchResult {
  index: CatalogIndex
  /** Where the data came from on this call. */
  source: 'remote' | 'cache'
  /** Filled when source === 'cache' — why the remote failed. */
  remoteError?: string
}

export interface InstalledSkill {
  manifest: SkillManifest
  /** Absolute path to the skill folder on disk. */
  dir: string
  /** Origin if known. */
  source: 'catalog' | 'url' | 'local' | 'system'
  sourceUrl?: string
  installedAt?: string
  /** Workers in any project that still reference this skill. */
  usedBy: { project: string; workflow: string; stepId: string }[]
  /** Catalog version if newer than installed. */
  updateAvailable?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)
}

function validateManifest(raw: unknown): SkillManifest {
  if (!raw || typeof raw !== 'object') throw new Error('skill.json is not a JSON object')
  const m = raw as Record<string, unknown>
  if (!isValidId(m.id)) {
    throw new Error('skill.json: `id` must be lowercase alphanumeric with dashes/underscores')
  }
  if (typeof m.name !== 'string' || !m.name) throw new Error('skill.json: `name` is required')
  if (typeof m.version !== 'string' || !m.version) throw new Error('skill.json: `version` is required')
  if (typeof m.description !== 'string') throw new Error('skill.json: `description` is required')
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    tags: Array.isArray(m.tags) ? (m.tags as string[]) : undefined,
    tools: Array.isArray(m.tools) ? (m.tools as string[]) : undefined,
    _trayline: typeof m._trayline === 'object' && m._trayline ? (m._trayline as Record<string, unknown>) : undefined,
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = Number(pa[i] ?? '0')
    const nb = Number(pb[i] ?? '0')
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb
    if (Number.isNaN(na) || Number.isNaN(nb)) {
      const sa = pa[i] ?? ''
      const sb = pb[i] ?? ''
      if (sa !== sb) return sa < sb ? -1 : 1
    }
  }
  return 0
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ── Catalog fetch + cache ────────────────────────────────────────────────────

async function fetchCatalog(opts?: { forceRefresh?: boolean }): Promise<CatalogFetchResult> {
  // Always try the network first; fall back to cache only when offline / error.
  // forceRefresh just means "even if the network fails, don't pretend to have
  // succeeded by silently returning the cache without a remoteError set."
  let remoteError: string | undefined
  try {
    const res = await fetchWithTimeout(CATALOG_URL, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const text = await res.text()
    const parsed = JSON.parse(text) as CatalogIndex
    if (!parsed || !Array.isArray(parsed.skills)) throw new Error('catalog: missing `skills` array')
    await fs.mkdir(Paths.appData, { recursive: true })
    await fsService.writeJsonAtomic(CACHE_PATH, parsed)
    return { index: parsed, source: 'remote' }
  } catch (err) {
    remoteError = err instanceof Error ? err.message : String(err)
  }

  if (opts?.forceRefresh) {
    // Caller wants a definitive remote answer; return the error so the UI
    // can surface it instead of pretending nothing went wrong.
  }

  if (await pathExists(CACHE_PATH)) {
    const cached = await fsService.readJson<CatalogIndex>(CACHE_PATH)
    return { index: cached, source: 'cache', remoteError }
  }

  // No remote, no cache. Return an empty index so the UI renders cleanly.
  return { index: { skills: [] }, source: 'cache', remoteError }
}

// ── Installed skills ─────────────────────────────────────────────────────────

async function readInstalledManifest(skillId: string): Promise<{
  manifest: SkillManifest
  dir: string
} | null> {
  const dir = join(Paths.skills, skillId)
  const manifestPath = join(dir, 'skill.json')
  if (!(await pathExists(manifestPath))) return null
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest = validateManifest(JSON.parse(raw))
    return { manifest, dir }
  } catch {
    return null
  }
}

/**
 * Scan every workflow in every project and return workers whose step.json
 * lists `skillId` in their `skills` array.
 */
async function findUsage(skillId: string): Promise<{ project: string; workflow: string; stepId: string }[]> {
  const out: { project: string; workflow: string; stepId: string }[] = []
  const projects = await projectService.listProjects().catch(() => [])
  for (const proj of projects) {
    const workflows = await projectService.listWorkflows(proj.name).catch(() => [])
    for (const wf of workflows) {
      const steps = await projectService.listSteps(proj.name, wf.name).catch(() => [])
      for (const step of steps) {
        if (step.kind !== 'worker') continue
        const skills = Array.isArray(step.raw.skills) ? (step.raw.skills as unknown[]) : []
        if (skills.includes(skillId)) {
          out.push({ project: proj.name, workflow: wf.name, stepId: step.id })
        }
      }
    }
  }
  return out
}

async function listInstalled(): Promise<InstalledSkill[]> {
  if (!(await pathExists(Paths.skills))) return []
  const entries = await fs.readdir(Paths.skills, { withFileTypes: true })

  // Best-effort catalog load (cache only — listInstalled must be fast and
  // offline-clean). If the cache exists we use it to surface "update available"
  // flags; if not, we just omit them.
  let catalogById = new Map<string, CatalogEntry>()
  if (await pathExists(CACHE_PATH)) {
    try {
      const cached = await fsService.readJson<CatalogIndex>(CACHE_PATH)
      catalogById = new Map(cached.skills.map((s) => [s.id, s]))
    } catch { /* ignore corrupt cache */ }
  }

  const out: InstalledSkill[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === '_system') continue
    const loaded = await readInstalledManifest(e.name)
    if (!loaded) continue
    const tr = (loaded.manifest._trayline ?? {}) as Record<string, unknown>
    const source = (tr.source as InstalledSkill['source']) ?? 'local'
    const sourceUrl = typeof tr.source_url === 'string' ? tr.source_url : undefined
    const installedAt = typeof tr.installed_at === 'string' ? tr.installed_at : undefined
    const usedBy = await findUsage(loaded.manifest.id)
    const cat = catalogById.get(loaded.manifest.id)
    const updateAvailable = cat && compareVersions(cat.version, loaded.manifest.version) > 0
      ? cat.version
      : undefined
    out.push({ manifest: loaded.manifest, dir: loaded.dir, source, sourceUrl, installedAt, usedBy, updateAvailable })
  }
  out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  return out
}

// ── Install / update / uninstall ─────────────────────────────────────────────

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

async function fetchSkillFiles(
  baseUrl: string,
  files: string[],
): Promise<{ manifest: SkillManifest; manifestRaw: string; skillMd: string }> {
  const base = normalizeBaseUrl(baseUrl)
  if (!files.includes('skill.json')) {
    throw new Error('A skill must include `skill.json`')
  }
  if (!files.includes('skill.md')) {
    throw new Error('A skill must include `skill.md`')
  }

  // Phase 8 only accepts these two files. The full pipeline (N2.1) will
  // permit additional sibling files after scanning them for executables.
  const allowed = new Set(['skill.json', 'skill.md'])
  for (const f of files) {
    if (!allowed.has(f)) {
      throw new Error(`Phase 8 skills can only contain skill.json and skill.md (got "${f}")`)
    }
  }

  const manifestUrl = base + 'skill.json'
  const manifestRes = await fetchWithTimeout(manifestUrl, { headers: { Accept: 'application/json' } })
  if (!manifestRes.ok) throw new Error(`Failed to fetch skill.json: HTTP ${manifestRes.status}`)
  const manifestRaw = await manifestRes.text()
  const manifest = validateManifest(JSON.parse(manifestRaw))

  const skillMdUrl = base + 'skill.md'
  const mdRes = await fetchWithTimeout(skillMdUrl, { headers: { Accept: 'text/markdown,text/plain' } })
  if (!mdRes.ok) throw new Error(`Failed to fetch skill.md: HTTP ${mdRes.status}`)
  const skillMd = await mdRes.text()

  return { manifest, manifestRaw, skillMd }
}

async function writeSkillToDisk(
  manifest: SkillManifest,
  skillMd: string,
  origin: { source: 'catalog' | 'url'; sourceUrl: string },
): Promise<void> {
  const target = join(Paths.skills, manifest.id)
  // Write to a sibling .tmp directory then swap, so a half-written skill
  // never becomes "installed."
  const tmp = target + '.installing'
  if (await pathExists(tmp)) await fs.rm(tmp, { recursive: true, force: true })
  await fs.mkdir(tmp, { recursive: true })

  const enriched: SkillManifest = {
    ...manifest,
    _trayline: {
      ...(manifest._trayline ?? {}),
      source: origin.source,
      source_url: origin.sourceUrl,
      installed_at: new Date().toISOString(),
    },
  }
  await fs.writeFile(join(tmp, 'skill.json'), JSON.stringify(enriched, null, 2), 'utf-8')
  await fs.writeFile(join(tmp, 'skill.md'), skillMd, 'utf-8')

  if (await pathExists(target)) {
    await fs.rm(target, { recursive: true, force: true })
  }
  await fs.rename(tmp, target)
}

async function installFromCatalog(skillId: string): Promise<InstalledSkill> {
  const { index } = await fetchCatalog()
  const entry = index.skills.find((s) => s.id === skillId)
  if (!entry) throw new Error(`Skill not found in catalog: ${skillId}`)

  // Manifest is synthesized from catalog metadata — remote repos don't need skill.json.
  const manifest: SkillManifest = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    tags: entry.tags,
  }

  const base = normalizeBaseUrl(entry.base_url)
  const skillMdFile = entry.skill_md ?? 'skill.md'
  const mdRes = await fetchWithTimeout(`${base}${skillMdFile}`, { headers: { Accept: 'text/markdown,text/plain' } })
  if (!mdRes.ok) throw new Error(`Failed to fetch ${skillMdFile}: HTTP ${mdRes.status}`)
  const skillMd = await mdRes.text()
  if (!skillMd.trim()) throw new Error(`${skillMdFile} is empty`)

  await writeSkillToDisk(manifest, skillMd, { source: 'catalog', sourceUrl: base })
  const loaded = await readInstalledManifest(manifest.id)
  if (!loaded) throw new Error('Install completed but skill is unreadable on disk')
  return {
    manifest: loaded.manifest,
    dir: loaded.dir,
    source: 'catalog',
    sourceUrl: base,
    installedAt: new Date().toISOString(),
    usedBy: [],
  }
}

async function installFromUrl(rawUrl: string): Promise<InstalledSkill> {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://')
  const base = normalizeBaseUrl(url)
  const { manifest, skillMd } = await fetchSkillFiles(base, ['skill.json', 'skill.md'])
  await writeSkillToDisk(manifest, skillMd, { source: 'url', sourceUrl: base })
  const loaded = await readInstalledManifest(manifest.id)
  if (!loaded) throw new Error('Install completed but skill is unreadable on disk')
  return {
    manifest: loaded.manifest,
    dir: loaded.dir,
    source: 'url',
    sourceUrl: base,
    installedAt: new Date().toISOString(),
    usedBy: [],
  }
}

async function update(skillId: string): Promise<InstalledSkill> {
  const loaded = await readInstalledManifest(skillId)
  if (!loaded) throw new Error(`Skill not installed: ${skillId}`)
  const tr = (loaded.manifest._trayline ?? {}) as Record<string, unknown>
  const source = tr.source as string | undefined
  const sourceUrl = tr.source_url as string | undefined

  if (source === 'catalog' || (!source && sourceUrl)) {
    // Prefer the live catalog entry — the base_url it advertises may have
    // moved since install.
    const { index } = await fetchCatalog()
    const entry = index.skills.find((s) => s.id === skillId)
    if (entry) return installFromCatalog(skillId)
    if (sourceUrl) return installFromUrl(sourceUrl)
    throw new Error(`Skill "${skillId}" is no longer in the catalog and has no source URL`)
  }
  if (source === 'url' && sourceUrl) {
    return installFromUrl(sourceUrl)
  }
  throw new Error(`Skill "${skillId}" has no remote source to update from`)
}

async function uninstall(skillId: string): Promise<void> {
  const usage = await findUsage(skillId)
  if (usage.length > 0) {
    const where = usage.map((u) => `${u.project}/${u.workflow}/${u.stepId}`).join(', ')
    throw new Error(`Cannot uninstall "${skillId}": still used by ${usage.length} worker(s): ${where}`)
  }
  const dir = join(Paths.skills, skillId)
  if (await pathExists(dir)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

export const skillService = {
  fetchCatalog,
  listInstalled,
  installFromCatalog,
  installFromUrl,
  update,
  uninstall,
  findUsage,
}
