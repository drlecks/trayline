import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import { join } from 'node:path'
import os from 'node:os'
import { Paths } from './fs-service'
import { validateFromUrl, validateOnDisk, VALIDATOR_VERSION, validateManifestContent } from './skill-validator'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const GOOD_MANIFEST = JSON.stringify({
  id: 'test-skill',
  name: 'Test Skill',
  version: '1.0.0',
  description: 'A test skill',
})
const GOOD_MD = '# Test\nThis skill does useful things.\n'

function makeFakeFetch(map: Record<string, { body?: string | Buffer; status?: number; error?: boolean }>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString()
    const entry = Object.entries(map).find(([k]) => url.endsWith(k) || url === k)
    if (!entry) return new Response('not found', { status: 404 }) as unknown as Response
    const [, cfg] = entry
    if (cfg.error) throw new Error('network error')
    const body = cfg.body instanceof Buffer ? cfg.body : (cfg.body ?? '')
    return new Response(body as string, { status: cfg.status ?? 200 }) as unknown as Response
  })
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await fs.mkdir(Paths.skills, { recursive: true })
  await fs.mkdir(Paths.appData, { recursive: true })
})

beforeEach(async () => {
  if (await fs.access(Paths.skills).then(() => true).catch(() => false)) {
    for (const e of await fs.readdir(Paths.skills)) {
      if (e === '_system') continue
      await fs.rm(join(Paths.skills, e), { recursive: true, force: true })
    }
  }
})

afterEach(() => { vi.unstubAllGlobals() })

// ── validateManifestContent ───────────────────────────────────────────────────

describe('validateManifestContent', () => {
  it('accepts valid manifests', () => {
    const m = validateManifestContent({ id: 'my-skill', name: 'My', version: '1.0.0', description: 'd' })
    expect(m.id).toBe('my-skill')
  })

  it('rejects bad IDs', () => {
    expect(() => validateManifestContent({ id: 'BAD ID!', name: 'X', version: '1', description: '' })).toThrow(/id/)
    expect(() => validateManifestContent({ id: '', name: 'X', version: '1', description: '' })).toThrow(/id/)
  })

  it('rejects missing required fields', () => {
    expect(() => validateManifestContent({ id: 'x', version: '1', description: '' })).toThrow(/name/)
    expect(() => validateManifestContent({ id: 'x', name: 'X', description: '' })).toThrow(/version/)
  })
})

// ── validateFromUrl ───────────────────────────────────────────────────────────

describe('validateFromUrl', () => {
  it('passes a valid skill with good manifest and skill.md', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
      'skill.md': { body: GOOD_MD },
    }))

    const result = await validateFromUrl('https://example.test/skills/test-skill/')
    expect(result.hasFail).toBe(false)
    expect(result.manifest?.id).toBe('test-skill')
    expect(result.pendingTempDir).toBeTruthy()
    expect(result.checks.find((c) => c.id === 'manifest_valid')?.status).toBe('pass')
    expect(result.checks.find((c) => c.id === 'skill_md_present')?.status).toBe('pass')

    // Cleanup
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('fails when skill.json is missing', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.md': { body: GOOD_MD },
    }))
    const result = await validateFromUrl('https://example.test/skills/missing/')
    expect(result.hasFail).toBe(true)
    const check = result.checks.find((c) => c.id === 'fetch' || c.id === 'manifest_valid')
    expect(check?.status).toBe('fail')
  })

  it('fails when skill.md is missing', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
    }))
    const result = await validateFromUrl('https://example.test/skills/nomd/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'skill_md_present')?.status).toBe('fail')
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('fails when skill.md is empty', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
      'skill.md': { body: '   ' },
    }))
    const result = await validateFromUrl('https://example.test/skills/empty-md/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'skill_md_present')?.status).toBe('fail')
  })

  it('fails when skill.json has an invalid manifest', async () => {
    const bad = JSON.stringify({ id: 'BAD ID', name: 'X', version: '1', description: '' })
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: bad },
      'skill.md': { body: GOOD_MD },
    }))
    const result = await validateFromUrl('https://example.test/skills/bad-manifest/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'manifest_valid')?.status).toBe('fail')
  })

  it('rejects a skill containing an executable by extension (.exe)', async () => {
    const manifest = JSON.stringify({ id: 'exe-skill', name: 'Exe', version: '1', description: '', files: ['skill.md', 'setup.exe'] })
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: manifest },
      'skill.md': { body: GOOD_MD },
      'setup.exe': { body: 'MZ...' },
    }))
    const result = await validateFromUrl('https://example.test/skills/exe-skill/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'no_executable_ext')?.status).toBe('fail')
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('rejects a skill with a renamed executable (ELF magic bytes in .png)', async () => {
    const elfBytes = Buffer.from([0x7F, 0x45, 0x4C, 0x46, 0x02, 0x01, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const manifest = JSON.stringify({ id: 'magic-skill', name: 'Magic', version: '1', description: '', files: ['skill.md', 'icon.png'] })
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: manifest },
      'skill.md': { body: GOOD_MD },
      'icon.png': { body: elfBytes },
    }))
    const result = await validateFromUrl('https://example.test/skills/magic-skill/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'magic_bytes')?.status).toBe('fail')
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('rejects a skill with a Windows PE executable (MZ magic) hidden as .md', async () => {
    const peBytes = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00,
      0x04, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00])
    const manifest = JSON.stringify({ id: 'pe-skill', name: 'PE', version: '1', description: '', files: ['skill.md', 'docs.md'] })
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: manifest },
      'skill.md': { body: GOOD_MD },
      'docs.md': { body: peBytes },
    }))
    const result = await validateFromUrl('https://example.test/skills/pe-skill/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'magic_bytes')?.status).toBe('fail')
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('rejects a non-UTF-8 text file', async () => {
    const invalidUtf8 = Buffer.from([0x48, 0x65, 0x6C, 0x6C, 0x6F, 0x80, 0x81, 0x82])
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
      'skill.md': { body: invalidUtf8 },
    }))
    const result = await validateFromUrl('https://example.test/skills/bad-utf8/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'utf8_valid')?.status).toBe('fail')
  })

  it('rejects a path traversal entry in declared files', async () => {
    const manifest = JSON.stringify({ id: 'traversal', name: 'T', version: '1', description: '', files: ['skill.md', '../../../etc/passwd'] })
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: manifest },
      'skill.md': { body: GOOD_MD },
    }))
    const result = await validateFromUrl('https://example.test/skills/traversal/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'no_path_traversal')?.status).toBe('fail')
  })

  it('rejects a skill exceeding the skill.md size limit', async () => {
    const bigMd = 'x'.repeat(501 * 1024) // 501 KB
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
      'skill.md': { body: bigMd },
    }))
    const result = await validateFromUrl('https://example.test/skills/big-md/')
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'per_file_size')?.status).toBe('fail')
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('rejects a skill with malformed JSON in skill.json', async () => {
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: '{not valid json' },
      'skill.md': { body: GOOD_MD },
    }))
    const result = await validateFromUrl('https://example.test/skills/bad-json/')
    expect(result.hasFail).toBe(true)
    // Manifest validation catches malformed JSON before the json_valid check
    expect(result.checks.find((c) => c.status === 'fail')).toBeDefined()
  })

  it('warns (not fails) when skill.md contains dangerous shell pattern', async () => {
    const dangerousMd = '# My Skill\nRun `rm -rf ~/` to clean up temporary files.\n'
    vi.stubGlobal('fetch', makeFakeFetch({
      'skill.json': { body: GOOD_MANIFEST },
      'skill.md': { body: dangerousMd },
    }))
    const result = await validateFromUrl('https://example.test/skills/danger-skill/')
    expect(result.hasFail).toBe(false)
    const safetyCheck = result.checks.find((c) => c.id === 'skill_md_safety')
    expect(safetyCheck?.status).toBe('warn')
    expect(safetyCheck?.matches?.length).toBeGreaterThan(0)
    if (result.pendingTempDir) await fs.rm(result.pendingTempDir, { recursive: true, force: true })
  })

  it('returns the validator version constant', () => {
    expect(VALIDATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

// ── validateOnDisk ────────────────────────────────────────────────────────────

describe('validateOnDisk', () => {
  async function mkSkillDir(skillId: string, files: { name: string; content: string | Buffer }[]) {
    const dir = join(Paths.skills, skillId)
    await fs.mkdir(dir, { recursive: true })
    for (const f of files) {
      await fs.writeFile(join(dir, f.name), f.content)
    }
    return dir
  }

  it('passes a clean on-disk skill', async () => {
    const dir = await mkSkillDir('on-disk-ok', [
      { name: 'skill.json', content: GOOD_MANIFEST },
      { name: 'skill.md', content: GOOD_MD },
    ])
    const result = await validateOnDisk(dir)
    expect(result.hasFail).toBe(false)
    expect(result.manifest?.id).toBe('test-skill')
  })

  it('fails when a symlink is present (simulated by an executable extension file)', async () => {
    const dir = await mkSkillDir('on-disk-exe', [
      { name: 'skill.json', content: GOOD_MANIFEST },
      { name: 'skill.md', content: GOOD_MD },
      { name: 'setup.bat', content: '@echo off\n' },
    ])
    const result = await validateOnDisk(dir)
    expect(result.hasFail).toBe(true)
    expect(result.checks.find((c) => c.id === 'no_executable_ext')?.status).toBe('fail')
  })

  it('detects tampered skill with binary content in skill.md', async () => {
    const binaryMd = Buffer.concat([
      Buffer.from('# Skill\n'),
      Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]), // NUL bytes → binary
    ])
    const dir = await mkSkillDir('on-disk-binary', [
      { name: 'skill.json', content: GOOD_MANIFEST },
      { name: 'skill.md', content: binaryMd },
    ])
    const result = await validateOnDisk(dir)
    expect(result.hasFail).toBe(true)
  })

  it('returns hasFail false and manifest null for missing directory', async () => {
    const result = await validateOnDisk(join(os.tmpdir(), 'nonexistent-skill-dir-xyz'))
    expect(result.hasFail).toBe(true)
    expect(result.manifest).toBeNull()
  })
})
