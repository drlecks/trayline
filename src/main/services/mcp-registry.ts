import { app } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { z } from 'zod'
import { Paths, fsService } from './fs-service'
import { auditDb } from './audit-db'
import { mcpCredentials } from './mcp-credentials'
import type {
  McpManifest,
  McpStatus,
  McpCatalogEntry,
  McpCatalogIndex,
  InstalledMcpRow,
  McpHealthState,
} from '../../shared/types'

// ── Zod schema ────────────────────────────────────────────────────────────────

const McpCredentialSchemaEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  kind: z.enum(['api_key', 'text_field']),
})

const McpManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  install_method: z.enum(['npm', 'binary', 'docker', 'local']),
  command_template: z.string().min(1),
  instructions: z.string().optional(),
  credentials_schema: z.array(McpCredentialSchemaEntrySchema),
  has_test: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  homepage: z.string().optional(),
})

export function validateMcpManifest(raw: unknown): McpManifest {
  return McpManifestSchema.parse(raw) as McpManifest
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const CATALOG_PATH = join(Paths.appData, 'mcps-catalog.json')

function getBundledCatalogPath(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'mcps-catalog.json')
  return join(app.getAppPath(), 'resources', 'mcps-catalog.json')
}

function mcpDir(mcpId: string): string {
  return join(Paths.mcps, mcpId)
}

function manifestPath(mcpId: string): string {
  return join(mcpDir(mcpId), 'mcp.json')
}

function statusPath(mcpId: string): string {
  return join(mcpDir(mcpId), 'state', 'status.json')
}

function metaPath(mcpId: string): string {
  return join(mcpDir(mcpId), 'state', 'meta.json')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

function deriveHealthState(manifest: McpManifest, status: McpStatus): McpHealthState {
  if (status.disabled) return 'disabled'
  if (!status.configured && manifest.credentials_schema.length > 0) return 'unconfigured'
  if (status.health === 'failed') return 'error'
  if (status.health === 'ok') return 'ready'
  // No credentials needed → auto-ready; otherwise we haven't checked yet
  if (manifest.credentials_schema.length === 0) return 'ready'
  return 'unknown'
}

function mcpAudit(
  event: 'mcp_installed' | 'mcp_uninstalled' | 'mcp_configured' | 'mcp_credentials_reset' | 'mcp_health_check_failed',
  details: Record<string, unknown>,
) {
  auditDb.insert({
    project_id: '', workflow_id: '', step_id: '', card_id: '',
    event, actor: 'system',
    details_json: JSON.stringify(details),
  })
}

// ── Catalog seeding ───────────────────────────────────────────────────────────

/** Copy bundled mcps-catalog.json to app-data on first launch. No-op if already present. */
async function seedCatalog(): Promise<void> {
  if (await pathExists(CATALOG_PATH)) return
  const src = getBundledCatalogPath()
  if (!(await pathExists(src))) return
  const raw = await fs.readFile(src, 'utf-8')
  await fs.mkdir(Paths.appData, { recursive: true })
  await fs.writeFile(CATALOG_PATH, raw, 'utf-8')
}

// ── Catalog listing ───────────────────────────────────────────────────────────

async function listCatalog(): Promise<McpCatalogEntry[]> {
  if (!(await pathExists(CATALOG_PATH))) return []
  try {
    const index = await fsService.readJson<McpCatalogIndex>(CATALOG_PATH)
    return index.mcps ?? []
  } catch {
    return []
  }
}

// ── Status r/w ────────────────────────────────────────────────────────────────

async function readStatus(mcpId: string): Promise<McpStatus> {
  const p = statusPath(mcpId)
  if (!(await pathExists(p))) return { configured: false, health: null, healthCheckedAt: null }
  try {
    return await fsService.readJson<McpStatus>(p)
  } catch {
    return { configured: false, health: null, healthCheckedAt: null }
  }
}

async function writeStatus(mcpId: string, partial: Partial<McpStatus>): Promise<McpStatus> {
  const current = await readStatus(mcpId)
  const updated: McpStatus = { ...current, ...partial }
  const stateDir = join(mcpDir(mcpId), 'state')
  await fs.mkdir(stateDir, { recursive: true })
  await fsService.writeJsonAtomic(statusPath(mcpId), updated)
  return updated
}

// ── Manifest r/w ──────────────────────────────────────────────────────────────

async function readManifest(mcpId: string): Promise<McpManifest | null> {
  const p = manifestPath(mcpId)
  if (!(await pathExists(p))) return null
  try {
    const raw = await fs.readFile(p, 'utf-8')
    return validateMcpManifest(JSON.parse(raw))
  } catch {
    return null
  }
}

// ── Installed listing ─────────────────────────────────────────────────────────

async function listInstalled(): Promise<InstalledMcpRow[]> {
  if (!(await pathExists(Paths.mcps))) return []
  const entries = await fs.readdir(Paths.mcps, { withFileTypes: true })
  const out: InstalledMcpRow[] = []

  for (const e of entries) {
    if (!e.isDirectory()) continue
    const manifest = await readManifest(e.name)
    if (!manifest) continue

    const status = await readStatus(manifest.id)
    const healthState = deriveHealthState(manifest, status)

    let installedAt = new Date().toISOString()
    const mp = metaPath(manifest.id)
    if (await pathExists(mp)) {
      try {
        const meta = await fsService.readJson<{ installedAt?: string }>(mp)
        if (meta.installedAt) installedAt = meta.installedAt
      } catch { /* use default */ }
    }

    out.push({ manifest, status, healthState, installedAt })
  }

  out.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name))
  return out
}

// ── Install ───────────────────────────────────────────────────────────────────

async function install(mcpId: string): Promise<InstalledMcpRow> {
  const catalog = await listCatalog()
  const entry = catalog.find((e) => e.id === mcpId)
  if (!entry) throw new Error(`MCP not found in catalog: ${mcpId}`)

  const dir = mcpDir(mcpId)
  const stateDir = join(dir, 'state')
  await fs.mkdir(stateDir, { recursive: true })

  const manifest: McpManifest = {
    id: entry.id,
    name: entry.name,
    version: entry.version,
    description: entry.description,
    install_method: entry.install_method,
    command_template: entry.command_template,
    instructions: entry.instructions,
    credentials_schema: entry.credentials_schema,
    has_test: entry.has_test,
    tags: entry.tags,
    homepage: entry.homepage,
  }

  await fsService.writeJsonAtomic(manifestPath(mcpId), manifest)

  // Auto-configure when no credentials are required
  const configured = manifest.credentials_schema.length === 0
  const status: McpStatus = { configured, health: null, healthCheckedAt: null }
  await fsService.writeJsonAtomic(statusPath(mcpId), status)

  const installedAt = new Date().toISOString()
  await fsService.writeJsonAtomic(metaPath(mcpId), { installedAt })

  mcpAudit('mcp_installed', { mcp_id: mcpId, version: manifest.version })

  return { manifest, status, healthState: deriveHealthState(manifest, status), installedAt }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

async function uninstall(mcpId: string): Promise<void> {
  const manifest = await readManifest(mcpId)
  if (!manifest) throw new Error(`MCP not installed: ${mcpId}`)

  await mcpCredentials.deleteAllCredentials(mcpId, manifest.credentials_schema)

  const dir = mcpDir(mcpId)
  if (await pathExists(dir)) await fs.rm(dir, { recursive: true, force: true })

  mcpAudit('mcp_uninstalled', { mcp_id: mcpId })
}

// ── Public API ────────────────────────────────────────────────────────────────

export const mcpRegistry = {
  seedCatalog,
  listCatalog,
  listInstalled,
  install,
  uninstall,
  readManifest,
  readStatus,
  writeStatus,
}
