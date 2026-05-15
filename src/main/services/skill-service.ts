import { join } from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import { Paths, fsService } from './fs-service'
import { projectService } from './project-service'
import { auditDb } from './audit-db'
import {
  validateFromUrl as validatorFromUrl,
  validateFromGitHubCatalog,
  validateOnDisk,
  cleanupTemp,
  VALIDATOR_VERSION,
  validateManifestContent,
} from './skill-validator'
import type { SkillManifest, InstalledSkillRow, SkillValidationResult } from '../../shared/types'

const CATALOG_URL =
  process.env.TRAYLINE_CATALOG_URL ??
  'https://raw.githubusercontent.com/drlecks/trayline/develop/catalog/index.json'
const CACHE_PATH = join(Paths.appData, 'skills-index-cache.json')
const FETCH_TIMEOUT_MS = 8000

function getBundledCatalogPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'skills-catalog.json')
  return join(app.getAppPath(), 'resources', 'skills-catalog.json')
}

export interface CatalogEntry {
  id: string
  name: string
  version: string
  description: string
  author?: string
  tags?: string[]
  /** GitHub Contents API URL for listing this skill's files (includes `?ref=`). */
  base_url: string
  files?: string[]
}

export interface CatalogIndex {
  schema_version?: number
  generated_at?: string
  skills: CatalogEntry[]
}

export interface CatalogFetchResult {
  index: CatalogIndex
  source: 'remote' | 'cache'
  remoteError?: string
}

export type InstalledSkill = InstalledSkillRow & { dir: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
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
      const sa = pa[i] ?? '', sb = pb[i] ?? ''
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

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

async function readInstalledManifest(skillId: string): Promise<{
  manifest: SkillManifest; dir: string
} | null> {
  const dir = join(Paths.skills, skillId)
  const manifestPath = join(dir, 'skill.json')
  if (!(await pathExists(manifestPath))) return null
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const manifest = validateManifestContent(JSON.parse(raw))
    return { manifest, dir }
  } catch {
    return null
  }
}

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
        if (skills.includes(skillId)) out.push({ project: proj.name, workflow: wf.name, stepId: step.id })
      }
    }
  }
  return out
}

function skillAudit(event: 'skill_installed' | 'skill_updated' | 'skill_uninstalled' | 'skill_quarantined', details: Record<string, unknown>) {
  auditDb.insert({
    project_id: '', workflow_id: '', step_id: '', card_id: '',
    event, actor: 'system',
    details_json: JSON.stringify(details),
  })
}

// ── Catalog seeding + fetch ───────────────────────────────────────────────────

/**
 * Seed skills-index-cache.json from the bundled catalog on launch.
 * Overwrites an empty cache (e.g. stale remote-fetched empty array) so the
 * app is never left with a blank catalog when bundled skills are available.
 */
async function seedCatalog(): Promise<void> {
  const src = getBundledCatalogPath()
  if (!(await pathExists(src))) return

  if (await pathExists(CACHE_PATH)) {
    try {
      const existing = await fsService.readJson<CatalogIndex>(CACHE_PATH)
      if ((existing.skills?.length ?? 0) > 0) return // Cache already has real data
    } catch { /* corrupt — fall through and reseed */ }
  }

  const raw = await fs.readFile(src, 'utf-8')
  await fs.mkdir(Paths.appData, { recursive: true })
  await fs.writeFile(CACHE_PATH, raw, 'utf-8')
}

async function fetchCatalog(opts?: { forceRefresh?: boolean }): Promise<CatalogFetchResult> {
  let remoteError: string | undefined
  try {
    const res = await fetchWithTimeout(CATALOG_URL, { headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = JSON.parse(await res.text()) as CatalogIndex
    if (!parsed || !Array.isArray(parsed.skills)) throw new Error('catalog: missing `skills` array')
    // Don't cache or return a remote catalog with no skills — treat it the same
    // as a failed fetch so the bundled / cached catalog continues to show.
    if (parsed.skills.length === 0) throw new Error('remote catalog has no skills')
    await fs.mkdir(Paths.appData, { recursive: true })
    await fsService.writeJsonAtomic(CACHE_PATH, parsed)
    return { index: parsed, source: 'remote' }
  } catch (err) {
    remoteError = err instanceof Error ? err.message : String(err)
  }

  void opts // forceRefresh is a hint only; we always fall back gracefully

  if (await pathExists(CACHE_PATH)) {
    const cached = await fsService.readJson<CatalogIndex>(CACHE_PATH)
    if ((cached.skills?.length ?? 0) > 0) return { index: cached, source: 'cache', remoteError }
  }
  // Last resort: read from the bundled file shipped with the app
  const bundled = getBundledCatalogPath()
  if (await pathExists(bundled)) {
    const index = await fsService.readJson<CatalogIndex>(bundled)
    return { index, source: 'cache', remoteError }
  }
  return { index: { skills: [] }, source: 'cache', remoteError }
}

// ── Installed skills ──────────────────────────────────────────────────────────

async function listInstalled(): Promise<InstalledSkillRow[]> {
  if (!(await pathExists(Paths.skills))) return []
  const entries = await fs.readdir(Paths.skills, { withFileTypes: true })

  let catalogById = new Map<string, CatalogEntry>()
  if (await pathExists(CACHE_PATH)) {
    try {
      const cached = await fsService.readJson<CatalogIndex>(CACHE_PATH)
      catalogById = new Map(cached.skills.map((s) => [s.id, s]))
    } catch { /* ignore corrupt cache */ }
  }

  const out: InstalledSkillRow[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === '_system') continue
    const loaded = await readInstalledManifest(e.name)
    if (!loaded) continue
    const tr = (loaded.manifest._trayline ?? {}) as Record<string, unknown>
    const source = (tr.source as InstalledSkillRow['source']) ?? 'local'
    const sourceUrl = typeof tr.source_url === 'string' ? tr.source_url : undefined
    const installedAt = typeof tr.installed_at === 'string' ? tr.installed_at : undefined
    const quarantined = tr.quarantined === true
    const usedBy = await findUsage(loaded.manifest.id)
    const cat = catalogById.get(loaded.manifest.id)
    const updateAvailable = cat && compareVersions(cat.version, loaded.manifest.version) > 0
      ? cat.version : undefined
    out.push({ manifest: loaded.manifest, source, sourceUrl, installedAt, usedBy, updateAvailable, quarantined })
  }
  out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  return out
}

// ── Install helpers ───────────────────────────────────────────────────────────

/** Copy files from a staged temp dir into skills/<id>/, stamp _trayline, write audit. */
async function finalizeFromTemp(
  tempDir: string,
  origin: { source: 'catalog' | 'url'; sourceUrl: string },
  acceptedWarnings: string[],
  event: 'skill_installed' | 'skill_updated',
): Promise<InstalledSkillRow> {
  // Read and re-validate the manifest from temp to get the id
  const manifestPath = join(tempDir, 'skill.json')
  const rawManifest = await fs.readFile(manifestPath, 'utf-8')
  const manifest = validateManifestContent(JSON.parse(rawManifest))

  const target = join(Paths.skills, manifest.id)
  const swapTmp = target + '.installing'
  if (await pathExists(swapTmp)) await fs.rm(swapTmp, { recursive: true, force: true })

  // Copy temp to .installing sibling
  await fs.cp(tempDir, swapTmp, { recursive: true })

  // Enrich skill.json with _trayline metadata
  const enriched: SkillManifest = {
    ...manifest,
    _trayline: {
      ...(manifest._trayline ?? {}),
      source: origin.source,
      source_url: origin.sourceUrl,
      installed_at: new Date().toISOString(),
      validator_version: VALIDATOR_VERSION,
      accepted_warnings: acceptedWarnings,
    },
  }
  await fs.writeFile(join(swapTmp, 'skill.json'), JSON.stringify(enriched, null, 2), 'utf-8')

  // Atomic swap
  if (await pathExists(target)) await fs.rm(target, { recursive: true, force: true })
  await fs.rename(swapTmp, target)

  // Cleanup temp
  await cleanupTemp(tempDir).catch(() => {})

  const usedBy = await findUsage(manifest.id)
  skillAudit(event, {
    skill_id: manifest.id,
    version: manifest.version,
    source: origin.source,
    source_url: origin.sourceUrl,
    validator_version: VALIDATOR_VERSION,
    accepted_warnings: acceptedWarnings,
  })

  return {
    manifest: enriched,
    source: origin.source,
    sourceUrl: origin.sourceUrl,
    installedAt: enriched._trayline!.installed_at as string,
    usedBy,
    quarantined: false,
  }
}

// ── Public install API ────────────────────────────────────────────────────────

/** Step 1: validate a URL-sourced skill bundle and stage it to a temp dir. */
async function validateSkillFromUrl(url: string): Promise<SkillValidationResult> {
  const result = await validatorFromUrl(url)

  // Add ID-collision check if manifest was parsed
  if (result.manifest && !result.hasFail) {
    const existingDir = join(Paths.skills, result.manifest.id)
    if (await pathExists(existingDir)) {
      result.checks.push({
        id: 'id_collision',
        label: 'Skill ID unique (or replacement confirmed)',
        status: 'warn',
        message: `A skill with id "${result.manifest.id}" is already installed. Installing will replace it.`,
      })
    } else {
      result.checks.push({
        id: 'id_collision',
        label: 'Skill ID unique (or replacement confirmed)',
        status: 'pass',
      })
    }
  }

  return result
}

/** Step 2: move a staged temp dir into the final install location. */
async function confirmInstall(
  tempDir: string,
  acceptedWarnings: string[],
  sourceUrl: string,
  source: 'url' | 'catalog' = 'url',
): Promise<InstalledSkillRow> {
  return finalizeFromTemp(tempDir, { source, sourceUrl }, acceptedWarnings, 'skill_installed')
}

/** Cancel a pending validation — removes the staged temp dir. */
async function cancelValidation(tempDir: string): Promise<void> {
  await cleanupTemp(tempDir)
}

async function installFromCatalog(skillId: string): Promise<InstalledSkillRow> {
  const { index } = await fetchCatalog()
  const entry = index.skills.find((s) => s.id === skillId)
  if (!entry) throw new Error(`Skill not found in catalog: ${skillId}`)

  // Build catalog-authoritative manifest (these repos don't ship their own skill.json)
  const catalogManifest: SkillManifest = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    tags: entry.tags,
  }

  // Use GitHub Contents API URL to list + download the full directory tree, then run security checks
  const result = await validateFromGitHubCatalog(entry.base_url, catalogManifest)
  if (result.hasFail) {
    const failing = result.checks.filter((c) => c.status === 'fail').map((c) => c.message ?? c.label)
    throw new Error(`Catalog skill "${skillId}" failed validation: ${failing.join('; ')}`)
  }

  return finalizeFromTemp(
    result.pendingTempDir!,
    { source: 'catalog', sourceUrl: entry.base_url },
    [],
    'skill_installed',
  )
}

async function installFromUrl(rawUrl: string): Promise<InstalledSkillRow> {
  const url = rawUrl.trim()
  if (!/^https?:\/\//i.test(url)) throw new Error('URL must start with http:// or https://')

  const result = await validateSkillFromUrl(url)
  if (result.hasFail) {
    const failing = result.checks.filter((c) => c.status === 'fail').map((c) => c.message ?? c.label)
    throw new Error(`Skill validation failed: ${failing.join('; ')}`)
  }

  return finalizeFromTemp(
    result.pendingTempDir!,
    { source: 'url', sourceUrl: normalizeBaseUrl(url) },
    [],
    'skill_installed',
  )
}

async function update(skillId: string): Promise<InstalledSkillRow> {
  const loaded = await readInstalledManifest(skillId)
  if (!loaded) throw new Error(`Skill not installed: ${skillId}`)
  const tr = (loaded.manifest._trayline ?? {}) as Record<string, unknown>
  const source = tr.source as string | undefined
  const sourceUrl = tr.source_url as string | undefined

  let row: InstalledSkillRow
  if (source === 'catalog' || (!source && sourceUrl)) {
    const { index } = await fetchCatalog()
    const entry = index.skills.find((s) => s.id === skillId)
    if (entry) {
      row = await installFromCatalog(skillId)
    } else if (sourceUrl) {
      row = await installFromUrl(sourceUrl)
    } else {
      throw new Error(`Skill "${skillId}" is no longer in the catalog and has no source URL`)
    }
  } else if (source === 'url' && sourceUrl) {
    row = await installFromUrl(sourceUrl)
  } else {
    throw new Error(`Skill "${skillId}" has no remote source to update from`)
  }

  skillAudit('skill_updated', { skill_id: skillId, version: row.manifest.version, source: row.source })
  return row
}

async function uninstall(skillId: string): Promise<void> {
  const usage = await findUsage(skillId)
  if (usage.length > 0) {
    const where = usage.map((u) => `${u.project}/${u.workflow}/${u.stepId}`).join(', ')
    throw new Error(`Cannot uninstall "${skillId}": still used by ${usage.length} worker(s): ${where}`)
  }
  const dir = join(Paths.skills, skillId)
  if (await pathExists(dir)) await fs.rm(dir, { recursive: true, force: true })
  skillAudit('skill_uninstalled', { skill_id: skillId })
}

// ── Launch revalidation (quarantine check) ────────────────────────────────────

export async function revalidateAll(): Promise<{ skillId: string; quarantined: boolean }[]> {
  if (!(await pathExists(Paths.skills))) return []
  const entries = await fs.readdir(Paths.skills, { withFileTypes: true })
  const results: { skillId: string; quarantined: boolean }[] = []

  for (const e of entries) {
    if (!e.isDirectory() || e.name === '_system') continue
    const dir = join(Paths.skills, e.name)
    const manifestPath = join(dir, 'skill.json')
    if (!(await pathExists(manifestPath))) continue

    const { hasFail } = await validateOnDisk(dir)

    let manifest: SkillManifest | null = null
    try {
      manifest = validateManifestContent(JSON.parse(await fs.readFile(manifestPath, 'utf-8')))
    } catch { /* manifest itself is unreadable */ }

    const wasQuarantined = manifest?._trayline?.quarantined === true
    if (hasFail !== wasQuarantined && manifest) {
      // Update quarantine flag in skill.json
      const updated: SkillManifest = {
        ...manifest,
        _trayline: { ...(manifest._trayline ?? {}), quarantined: hasFail },
      }
      await fs.writeFile(manifestPath, JSON.stringify(updated, null, 2), 'utf-8').catch(() => {})
      if (hasFail) {
        skillAudit('skill_quarantined', { skill_id: e.name, reason: 'on-disk revalidation failed' })
      }
    }

    results.push({ skillId: e.name, quarantined: hasFail })
  }

  return results
}

export const skillService = {
  seedCatalog,
  fetchCatalog,
  listInstalled,
  installFromCatalog,
  installFromUrl,
  validateFromUrl: validateSkillFromUrl,
  confirmInstall,
  cancelValidation,
  update,
  uninstall,
  findUsage,
  revalidateAll,
}
