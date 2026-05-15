import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import { Paths } from './fs-service'
import { auditDb } from './audit-db'
import { mcpRegistry, validateMcpManifest } from './mcp-registry'
import type { McpCatalogIndex, McpCatalogEntry } from '../../shared/types'

// ── keytar mock ───────────────────────────────────────────────────────────────
// keytar is a native module that isn't available in Vitest — stub it out.
vi.mock('keytar', () => {
  const store = new Map<string, string>()
  const key = (service: string, account: string) => `${service}:${account}`
  return {
    default: {
      setPassword: vi.fn(async (s: string, a: string, v: string) => { store.set(key(s, a), v) }),
      getPassword: vi.fn(async (s: string, a: string) => store.get(key(s, a)) ?? null),
      deletePassword: vi.fn(async (s: string, a: string) => { store.delete(key(s, a)) }),
      findCredentials: vi.fn(async (s: string) =>
        [...store.entries()]
          .filter(([k]) => k.startsWith(`${s}:`))
          .map(([k, password]) => ({ account: k.slice(s.length + 1), password }))
      ),
    },
  }
})

// ── Helpers ───────────────────────────────────────────────────────────────────

async function writeJson(path: string, data: unknown) {
  await fs.mkdir(join(path, '..'), { recursive: true })
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

const SAMPLE_CATALOG: McpCatalogIndex = {
  schema_version: 2,
  generated_at: '2026-01-01T00:00:00Z',
  mcps: [
    {
      id: 'no-creds-mcp',
      name: 'No Creds MCP',
      version: '1.0.0',
      description: 'An MCP that needs no credentials',
      install_method: 'npm',
      command_template: 'npx -y @test/no-creds',
      instructions: 'No setup required.',
      credentials_schema: [],
      has_test: false,
    },
    {
      id: 'creds-mcp',
      name: 'Creds MCP',
      version: '2.0.0',
      description: 'An MCP that requires an API key',
      install_method: 'npm',
      command_template: 'npx -y @test/creds',
      instructions: 'Get your API key from the dashboard.',
      credentials_schema: [
        { id: 'API_KEY', label: 'API Key', kind: 'api_key' },
      ],
      has_test: false,
    },
  ] as McpCatalogEntry[],
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  // appData must exist before better-sqlite3 opens audit.db
  await fs.mkdir(Paths.appData, { recursive: true })
  auditDb.init()
})

beforeEach(async () => {
  // Reset the mcps directory each test
  await fs.rm(Paths.mcps, { recursive: true, force: true })
  await fs.mkdir(Paths.mcps, { recursive: true })
  // Remove the catalog file so tests start clean (appData dir stays — audit.db lives there)
  await fs.rm(join(Paths.appData, 'mcps-catalog.json'), { force: true })
})

// ── validateMcpManifest ───────────────────────────────────────────────────────

describe('validateMcpManifest', () => {
  it('passes a valid manifest', () => {
    const raw = {
      id: 'test-mcp',
      name: 'Test MCP',
      version: '1.0.0',
      description: 'Test',
      install_method: 'npm',
      command_template: 'npx -y @test/mcp',
      credentials_schema: [],
    }
    expect(() => validateMcpManifest(raw)).not.toThrow()
  })

  it('rejects a manifest missing required fields', () => {
    expect(() => validateMcpManifest({ id: 'x', name: 'X' })).toThrow()
  })

  it('rejects unknown install_method', () => {
    expect(() => validateMcpManifest({
      id: 'x', name: 'X', version: '1.0.0', description: 'D',
      install_method: 'chocolatey',
      command_template: 'cmd',
      credentials_schema: [],
    })).toThrow()
  })
})

// ── seedCatalog ───────────────────────────────────────────────────────────────

describe('seedCatalog', () => {
  it('copies bundled catalog to app-data on first launch', async () => {
    // Write a fake bundled catalog at the path the service resolves in dev mode
    // (app.getAppPath() returns process.cwd() per vitest.setup.ts electron mock)
    const bundledPath = join(process.cwd(), 'resources', 'mcps-catalog.json')
    // The real file should exist in the repo
    const bundledExists = await pathExists(bundledPath)
    if (!bundledExists) return // skip if resources not present in CI

    await mcpRegistry.seedCatalog()

    const destPath = join(Paths.appData, 'mcps-catalog.json')
    expect(await pathExists(destPath)).toBe(true)
    const content = JSON.parse(await fs.readFile(destPath, 'utf-8'))
    expect(content).toHaveProperty('mcps')
    expect(Array.isArray(content.mcps)).toBe(true)
  })

  it('does not overwrite an existing catalog', async () => {
    const destPath = join(Paths.appData, 'mcps-catalog.json')
    const existingContent = JSON.stringify({ schema_version: 99, mcps: [] })
    await fs.writeFile(destPath, existingContent, 'utf-8')

    await mcpRegistry.seedCatalog()

    const content = await fs.readFile(destPath, 'utf-8')
    expect(JSON.parse(content).schema_version).toBe(99)
  })
})

// ── listCatalog ───────────────────────────────────────────────────────────────

describe('listCatalog', () => {
  it('returns empty array when catalog file is absent', async () => {
    const result = await mcpRegistry.listCatalog()
    expect(result).toEqual([])
  })

  it('returns catalog entries from the file', async () => {
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
    const result = await mcpRegistry.listCatalog()
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('no-creds-mcp')
  })

  it('includes entries with no platforms field', async () => {
    const catalog: McpCatalogIndex = {
      schema_version: 2,
      generated_at: '2026-01-01T00:00:00Z',
      mcps: [{ ...SAMPLE_CATALOG.mcps[0] }],
    }
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), catalog)
    const result = await mcpRegistry.listCatalog()
    expect(result).toHaveLength(1)
  })

  it('excludes entries whose platforms do not include the current platform', async () => {
    const otherPlatform = process.platform === 'darwin' ? 'win32' : 'darwin'
    const catalog: McpCatalogIndex = {
      schema_version: 2,
      generated_at: '2026-01-01T00:00:00Z',
      mcps: [{ ...SAMPLE_CATALOG.mcps[0], platforms: [otherPlatform] }],
    }
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), catalog)
    const result = await mcpRegistry.listCatalog()
    expect(result).toHaveLength(0)
  })

  it('includes entries whose platforms include the current platform', async () => {
    const currentPlatform = process.platform as 'darwin' | 'win32' | 'linux'
    const catalog: McpCatalogIndex = {
      schema_version: 2,
      generated_at: '2026-01-01T00:00:00Z',
      mcps: [{ ...SAMPLE_CATALOG.mcps[0], platforms: [currentPlatform] }],
    }
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), catalog)
    const result = await mcpRegistry.listCatalog()
    expect(result).toHaveLength(1)
  })
})

// ── listInstalled ─────────────────────────────────────────────────────────────

describe('listInstalled', () => {
  it('returns empty when mcps directory is empty', async () => {
    const result = await mcpRegistry.listInstalled()
    expect(result).toEqual([])
  })

  it('returns installed MCPs with correct healthState', async () => {
    // Manually install a no-creds MCP
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
    await mcpRegistry.install('no-creds-mcp')

    const result = await mcpRegistry.listInstalled()
    expect(result).toHaveLength(1)
    expect(result[0].manifest.id).toBe('no-creds-mcp')
    expect(result[0].healthState).toBe('ready')
  })

  it('ignores subdirectories without a valid mcp.json', async () => {
    await fs.mkdir(join(Paths.mcps, 'orphan-dir'), { recursive: true })
    const result = await mcpRegistry.listInstalled()
    expect(result).toEqual([])
  })
})

// ── install ───────────────────────────────────────────────────────────────────

describe('install', () => {
  beforeEach(async () => {
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
  })

  it('creates mcp.json, status.json and meta.json', async () => {
    await mcpRegistry.install('no-creds-mcp')

    expect(await pathExists(join(Paths.mcps, 'no-creds-mcp', 'mcp.json'))).toBe(true)
    expect(await pathExists(join(Paths.mcps, 'no-creds-mcp', 'state', 'status.json'))).toBe(true)
    expect(await pathExists(join(Paths.mcps, 'no-creds-mcp', 'state', 'meta.json'))).toBe(true)
  })

  it('auto-configures when no credentials_schema', async () => {
    const row = await mcpRegistry.install('no-creds-mcp')
    expect(row.status.configured).toBe(true)
    expect(row.healthState).toBe('ready')
  })

  it('marks unconfigured when credentials are required', async () => {
    const row = await mcpRegistry.install('creds-mcp')
    expect(row.status.configured).toBe(false)
    expect(row.healthState).toBe('unconfigured')
  })

  it('throws for unknown MCP id', async () => {
    await expect(mcpRegistry.install('does-not-exist')).rejects.toThrow('not found in catalog')
  })

  it('writes mcp_installed audit event', async () => {
    await mcpRegistry.install('no-creds-mcp')
    const rows = auditDb.query({ event: 'mcp_installed' })
    expect(rows.length).toBeGreaterThanOrEqual(1)
    const detail = JSON.parse(rows[0].details_json)
    expect(detail.mcp_id).toBe('no-creds-mcp')
  })
})

// ── uninstall ─────────────────────────────────────────────────────────────────

describe('uninstall', () => {
  beforeEach(async () => {
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
  })

  it('removes the mcp directory', async () => {
    await mcpRegistry.install('no-creds-mcp')
    await mcpRegistry.uninstall('no-creds-mcp')
    expect(await pathExists(join(Paths.mcps, 'no-creds-mcp'))).toBe(false)
  })

  it('throws if MCP is not installed', async () => {
    await expect(mcpRegistry.uninstall('no-creds-mcp')).rejects.toThrow('not installed')
  })

  it('writes mcp_uninstalled audit event', async () => {
    await mcpRegistry.install('no-creds-mcp')
    await mcpRegistry.uninstall('no-creds-mcp')
    const rows = auditDb.query({ event: 'mcp_uninstalled' })
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })
})

// ── readStatus / writeStatus ──────────────────────────────────────────────────

describe('readStatus / writeStatus', () => {
  it('readStatus returns default when no file exists', async () => {
    const status = await mcpRegistry.readStatus('nonexistent')
    expect(status).toEqual({ configured: false, health: null, healthCheckedAt: null })
  })

  it('writeStatus persists and merges partial updates', async () => {
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
    await mcpRegistry.install('creds-mcp')

    const updated = await mcpRegistry.writeStatus('creds-mcp', {
      configured: true,
      health: 'ok',
      healthCheckedAt: '2026-01-01T00:00:00Z',
    })

    expect(updated.configured).toBe(true)
    expect(updated.health).toBe('ok')

    // Verify it's persisted
    const reread = await mcpRegistry.readStatus('creds-mcp')
    expect(reread.configured).toBe(true)
    expect(reread.health).toBe('ok')
  })

  it('writeStatus merges — does not wipe unspecified fields', async () => {
    await writeJson(join(Paths.appData, 'mcps-catalog.json'), SAMPLE_CATALOG)
    await mcpRegistry.install('creds-mcp')
    await mcpRegistry.writeStatus('creds-mcp', { configured: true })

    await mcpRegistry.writeStatus('creds-mcp', { health: 'ok' })

    const status = await mcpRegistry.readStatus('creds-mcp')
    expect(status.configured).toBe(true)
    expect(status.health).toBe('ok')
  })
})
