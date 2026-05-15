// Skill security validator (N2.1).
//
// Validates a skill bundle — either fetched from a URL or read from disk — against
// the full security pipeline defined in docs/skills-and-mcps.md.
//
// Public API:
//   validateFromUrl(url)  → download to temp, validate, return SkillValidationResult
//   validateOnDisk(dir)   → read from disk, validate (used for launch quarantine check)
//   cleanupTemp(tempDir)  → remove a staged temp dir (call on cancel or after failure)

import { join, extname } from 'path'
import { posix } from 'path'
import fs from 'fs/promises'
import os from 'os'
import type { SkillManifest, ValidationCheck, SkillValidationResult } from '../../shared/types'

export const VALIDATOR_VERSION = '1.0.0'

// ── Limits ────────────────────────────────────────────────────────────────────

const MAX_FILE_COUNT = 50
const MAX_TOTAL_BYTES = 10 * 1024 * 1024   // 10 MB
const MAX_PER_FILE_BYTES = 1 * 1024 * 1024 // 1 MB
const MAX_SKILL_MD_BYTES = 500 * 1024      // 500 KB
const BINARY_SCAN_BYTES = 8192
const BINARY_THRESHOLD = 0.003             // 0.3 %

// ── Extension lists ───────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set([
  '.json', '.md', '.markdown', '.txt', '.yaml', '.yml',
  '.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp',
  '.py', // Python agent-tool scripts (not executed by Trayline; only invoked by the AI)
])

const EXECUTABLE_EXTS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.bat', '.cmd', '.ps1', '.psm1',
  '.sh', '.bash', '.zsh', '.fish', '.app', '.command', '.scpt', '.msi',
  '.deb', '.rpm', '.apk', '.jar', '.class', '.pyc', '.wasm', '.scr',
  '.com', '.vbs', '.vbe', '.js', '.mjs', '.cjs', '.ts', '.rb',
  '.pl', '.php', '.lua',
])

const TEXT_EXTS = new Set(['.json', '.md', '.markdown', '.txt', '.yaml', '.yml', '.py'])

// ── Junk patterns ─────────────────────────────────────────────────────────────

const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db'])
const JUNK_DIRS = ['.git/', '.hg/', '.svn/']

// ── Magic byte signatures ─────────────────────────────────────────────────────

interface MagicSig { name: string; offset: number; bytes: number[] }

const MAGIC_SIGS: MagicSig[] = [
  { name: 'ELF executable',              offset: 0,   bytes: [0x7F, 0x45, 0x4C, 0x46] },
  { name: 'Mach-O executable (BE)',      offset: 0,   bytes: [0xFE, 0xED, 0xFA, 0xCE] },
  { name: 'Mach-O executable (BE 64)',   offset: 0,   bytes: [0xFE, 0xED, 0xFA, 0xCF] },
  { name: 'Mach-O executable (LE)',      offset: 0,   bytes: [0xCE, 0xFA, 0xED, 0xFE] },
  { name: 'Mach-O executable (LE 64)',   offset: 0,   bytes: [0xCF, 0xFA, 0xED, 0xFE] },
  { name: 'Windows PE executable (MZ)',  offset: 0,   bytes: [0x4D, 0x5A] },
  { name: 'Java class / Mach-O FAT',    offset: 0,   bytes: [0xCA, 0xFE, 0xBA, 0xBE] },
  { name: 'Shell script (shebang)',      offset: 0,   bytes: [0x23, 0x21] },
  { name: 'ZIP / JAR archive',           offset: 0,   bytes: [0x50, 0x4B, 0x03, 0x04] },
  { name: 'GZIP archive',               offset: 0,   bytes: [0x1F, 0x8B] },
  { name: '7-Zip archive',              offset: 0,   bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
  { name: 'RAR archive',                offset: 0,   bytes: [0x52, 0x61, 0x72, 0x21] },
  { name: 'WebAssembly',                offset: 0,   bytes: [0x00, 0x61, 0x73, 0x6D] },
]

// ── Danger patterns for skill.md static scan ──────────────────────────────────

interface DangerPattern { id: string; label: string; pattern: RegExp }

const DANGER_PATTERNS: DangerPattern[] = [
  { id: 'rm_rf',           label: 'Destructive file deletion (rm -rf)',                pattern: /rm\s+-[rf]{1,2}\s+/m },
  { id: 'del_f',           label: 'Destructive file deletion (del /f)',                pattern: /del\s+\/[fqs]/im },
  { id: 'format_disk',     label: 'Disk format command',                               pattern: /\bformat\s+[a-z]:/im },
  { id: 'mkfs',            label: 'Disk format command (mkfs)',                        pattern: /\bmkfs\b/m },
  { id: 'dd_if',           label: 'Raw disk write (dd if=)',                           pattern: /\bdd\s+if=/m },
  { id: 'fork_bomb',       label: 'Fork bomb pattern',                                 pattern: /:\(\)\{:\|:&\};:/m },
  { id: 'curl_pipe_sh',    label: 'Remote code execution (curl | sh)',                 pattern: /curl\s+\S[^\n]*\|\s*(?:sh|bash)/im },
  { id: 'wget_pipe_sh',    label: 'Remote code execution (wget | sh)',                 pattern: /wget\s+\S[^\n]*\|\s*(?:sh|bash)/im },
  { id: 'iwr_iex',         label: 'Remote code execution (iwr | iex)',                 pattern: /iwr\s+\S[^\n]*\|\s*iex/im },
  { id: 'invoke_expr',     label: 'Dynamic PowerShell execution (Invoke-Expression)',  pattern: /Invoke-Expression/im },
  { id: 'ssh_keys',        label: 'Reads SSH keys (~/.ssh/)',                          pattern: /~\/\.ssh\//m },
  { id: 'aws_creds',       label: 'Reads AWS credentials (~/.aws/)',                   pattern: /~\/\.aws\//m },
  { id: 'dot_config',      label: 'Reads ~/.config/',                                  pattern: /~\/\.config\//m },
  { id: 'appdata',         label: 'Reads %APPDATA%',                                  pattern: /%APPDATA%/im },
  { id: 'userprofile',     label: 'Reads %USERPROFILE%',                              pattern: /%USERPROFILE%/im },
  { id: 'browser_cookies', label: 'Accesses browser cookies or passwords',            pattern: /browser\s+(?:cookie|password)/im },
  { id: 'keychain',        label: 'Accesses system keychain credentials',             pattern: /keychain.*(?:password|credential)/im },
  { id: 'disable_security', label: 'Instructions to disable security controls',       pattern: /disable\s+(?:security|firewall|antivirus|defender)/im },
]

// ── Internal file representation ──────────────────────────────────────────────

interface BundleFile {
  name: string       // relative path within the skill (e.g. 'skill.json', 'img/icon.png')
  content: Buffer
  isSymlink: boolean // always false for URL-fetched files
}

// ── Manifest validator ────────────────────────────────────────────────────────

export function validateManifestContent(raw: unknown): SkillManifest {
  if (!raw || typeof raw !== 'object') throw new Error('skill.json is not a JSON object')
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(m.id)) {
    throw new Error('`id` must be lowercase alphanumeric with optional dashes/underscores (max 64 chars)')
  }
  if (typeof m.name !== 'string' || !m.name.trim()) throw new Error('`name` is required and must be non-empty')
  if (typeof m.version !== 'string' || !m.version.trim()) throw new Error('`version` is required')
  if (typeof m.description !== 'string') throw new Error('`description` is required')
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    tags: Array.isArray(m.tags) ? (m.tags as string[]) : undefined,
    tools: Array.isArray(m.tools) ? (m.tools as string[]) : undefined,
    files: Array.isArray(m.files) ? (m.files as string[]) : undefined,
    _trayline: typeof m._trayline === 'object' && m._trayline
      ? (m._trayline as Record<string, unknown>)
      : undefined,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectMagicBytes(buf: Buffer): string | null {
  for (const sig of MAGIC_SIGS) {
    const slice = buf.subarray(sig.offset, sig.offset + sig.bytes.length)
    if (slice.length === sig.bytes.length && sig.bytes.every((b, i) => slice[i] === b)) {
      return sig.name
    }
  }
  // TAR: "ustar" at offset 257
  if (buf.length >= 263 && buf.subarray(257, 262).toString('ascii') === 'ustar') {
    return 'TAR archive'
  }
  return null
}

function hasBinaryContent(buf: Buffer): boolean {
  const scan = buf.subarray(0, BINARY_SCAN_BYTES)
  if (scan.includes(0x00)) return true
  let nonPrint = 0
  for (let i = 0; i < scan.length; i++) {
    const b = scan[i]!
    if (b < 0x09 || (b > 0x0D && b < 0x20) || b === 0x7F) nonPrint++
  }
  return nonPrint / scan.length > BINARY_THRESHOLD
}

function isValidUtf8(buf: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf)
    return true
  } catch {
    return false
  }
}

function checkPath(name: string): string | null {
  if (posix.isAbsolute(name) || /^[a-z]:/i.test(name)) return 'absolute path'
  if (name.includes('\0')) return 'NUL byte in path'
  if (name.startsWith('\\\\')) return 'UNC path'
  const norm = posix.normalize(name)
  if (norm.startsWith('..') || norm.includes('/../')) return 'path traversal (..)'
  return null
}

function isJunk(name: string): string | null {
  const base = posix.basename(name)
  if (JUNK_NAMES.has(base)) return `OS junk file (${base})`
  if (base.startsWith('._')) return `Apple double file (${base})`
  for (const d of JUNK_DIRS) {
    if (name.startsWith(d) || name.includes(`/${d}`)) return `VCS directory (${d})`
  }
  // Dotfiles: only text-extension dotfiles allowed
  if (base.startsWith('.') && !JUNK_NAMES.has(base) && !base.startsWith('._')) {
    const ext = extname(base).toLowerCase()
    if (!TEXT_EXTS.has(ext)) return `hidden file (${base})`
  }
  return null
}

interface SafetyMatch { patternId: string; label: string; lineNo: number; text: string }

function scanSkillMd(content: string): SafetyMatch[] {
  const lines = content.split('\n')
  const out: SafetyMatch[] = []
  for (let i = 0; i < lines.length; i++) {
    for (const dp of DANGER_PATTERNS) {
      if (dp.pattern.test(lines[i]!)) {
        out.push({ patternId: dp.id, label: dp.label, lineNo: i + 1, text: lines[i]!.trim().slice(0, 200) })
      }
    }
  }
  return out
}

// ── Core validation ───────────────────────────────────────────────────────────

function runChecks(files: BundleFile[], opts?: { instructionFile?: string }): {
  checks: ValidationCheck[]
  manifest: SkillManifest | null
} {
  const instructionFile = opts?.instructionFile ?? 'skill.md'
  const instructionFileLower = instructionFile.toLowerCase()

  const p = (id: string, label: string): ValidationCheck => ({ id, label, status: 'pass' })
  const f = (id: string, label: string, message: string): ValidationCheck => ({ id, label, status: 'fail', message })
  const w = (id: string, label: string, message: string, matches?: string[]): ValidationCheck =>
    ({ id, label, status: 'warn', message, matches })

  const checks: ValidationCheck[] = []
  let manifest: SkillManifest | null = null

  // 1. Manifest
  const manifestFile = files.find((x) => x.name === 'skill.json')
  if (!manifestFile) {
    checks.push(f('manifest_valid', 'skill.json present and valid', 'skill.json not found'))
  } else {
    try {
      manifest = validateManifestContent(JSON.parse(manifestFile.content.toString('utf-8')))
      checks.push(p('manifest_valid', 'skill.json present and valid'))
    } catch (e) {
      checks.push(f('manifest_valid', 'skill.json present and valid', e instanceof Error ? e.message : String(e)))
    }
  }

  // 2. Instruction file (SKILL.md, skill.md, or whatever the catalog declares)
  const mdFile = files.find((x) => x.name.toLowerCase() === instructionFileLower)
  if (!mdFile) {
    checks.push(f('skill_md_present', `${instructionFile} present and non-empty`, `${instructionFile} not found`))
  } else if (!mdFile.content.toString('utf-8').trim()) {
    checks.push(f('skill_md_present', `${instructionFile} present and non-empty`, `${instructionFile} is empty`))
  } else {
    checks.push(p('skill_md_present', `${instructionFile} present and non-empty`))
  }

  // 3. File count
  if (files.length > MAX_FILE_COUNT) {
    checks.push(f('file_count', `File count ≤ ${MAX_FILE_COUNT}`, `${files.length} files found (limit: ${MAX_FILE_COUNT})`))
  } else {
    checks.push(p('file_count', `File count ≤ ${MAX_FILE_COUNT}`))
  }

  // 4. Total size
  const totalBytes = files.reduce((s, x) => s + x.content.length, 0)
  if (totalBytes > MAX_TOTAL_BYTES) {
    checks.push(f('total_size', 'Total bundle ≤ 10 MB', `${(totalBytes / 1048576).toFixed(1)} MB (limit: 10 MB)`))
  } else {
    checks.push(p('total_size', 'Total bundle ≤ 10 MB'))
  }

  // Per-file accumulations
  const badExt: string[] = [], execExt: string[] = [], junkFiles: string[] = [],
    traversals: string[] = [], symlinks: string[] = [], oversized: string[] = [],
    magicFails: string[] = [], nonUtf8: string[] = [], badJson: string[] = [],
    binaryText: string[] = []
  let safetyMatches: SafetyMatch[] = []

  for (const file of files) {
    const ext = extname(file.name).toLowerCase()
    const lname = file.name.toLowerCase()

    const pathErr = checkPath(file.name)
    if (pathErr) traversals.push(`${file.name} (${pathErr})`)

    if (file.isSymlink) { symlinks.push(file.name); continue }

    const junkReason = isJunk(file.name)
    if (junkReason) { junkFiles.push(`${file.name}: ${junkReason}`); continue }

    if (!ext) {
      badExt.push(`${file.name} (no extension)`)
    } else if (EXECUTABLE_EXTS.has(ext)) {
      execExt.push(`${file.name} (${ext})`)
    } else if (!ALLOWED_EXTS.has(ext)) {
      badExt.push(`${file.name} (${ext})`)
    }

    const isInstructionFile = lname === instructionFileLower
    const sizeLimit = isInstructionFile ? MAX_SKILL_MD_BYTES : MAX_PER_FILE_BYTES
    const sizeLimitLabel = isInstructionFile ? '500 KB' : '1 MB'
    if (file.content.length > sizeLimit) {
      oversized.push(`${file.name} (${Math.round(file.content.length / 1024)} KB > ${sizeLimitLabel})`)
    }

    const magic = detectMagicBytes(file.content)
    if (magic) magicFails.push(`${file.name} (${magic})`)

    if (TEXT_EXTS.has(ext)) {
      if (!isValidUtf8(file.content)) {
        nonUtf8.push(file.name)
      } else {
        const text = file.content.toString('utf-8')
        if (ext === '.json') {
          try { JSON.parse(text) } catch { badJson.push(`${file.name} (invalid JSON)`) }
        }
        if (hasBinaryContent(file.content)) binaryText.push(file.name)
        if (isInstructionFile) safetyMatches = scanSkillMd(text)
      }
    }
  }

  // 5-14. Aggregate per-file check results
  checks.push(
    badExt.length > 0
      ? f('extension_allowlist', 'Only permitted file types', `Not permitted: ${badExt.join(', ')}`)
      : p('extension_allowlist', 'Only permitted file types'),
    execExt.length > 0
      ? f('no_executable_ext', 'No executable file extensions', `Executable files: ${execExt.join(', ')}`)
      : p('no_executable_ext', 'No executable file extensions'),
    junkFiles.length > 0
      ? f('no_junk_files', 'No hidden or OS junk files', `Junk files: ${junkFiles.join(', ')}`)
      : p('no_junk_files', 'No hidden or OS junk files'),
    traversals.length > 0
      ? f('no_path_traversal', 'No path traversal', `Unsafe paths: ${traversals.join(', ')}`)
      : p('no_path_traversal', 'No path traversal'),
    symlinks.length > 0
      ? f('no_symlinks', 'No symbolic links', `Symlinks: ${symlinks.join(', ')}`)
      : p('no_symlinks', 'No symbolic links'),
    oversized.length > 0
      ? f('per_file_size', `Per-file size limits (${instructionFile} ≤ 500 KB, others ≤ 1 MB)`, `Oversized: ${oversized.join(', ')}`)
      : p('per_file_size', `Per-file size limits (${instructionFile} ≤ 500 KB, others ≤ 1 MB)`),
    magicFails.length > 0
      ? f('magic_bytes', 'No executable or archive signatures', `Suspicious content: ${magicFails.join(', ')}`)
      : p('magic_bytes', 'No executable or archive signatures'),
    nonUtf8.length > 0
      ? f('utf8_valid', 'Text files are valid UTF-8', `Not UTF-8: ${nonUtf8.join(', ')}`)
      : p('utf8_valid', 'Text files are valid UTF-8'),
    badJson.length > 0
      ? f('json_valid', 'JSON files parse without error', `Malformed: ${badJson.join(', ')}`)
      : p('json_valid', 'JSON files parse without error'),
    binaryText.length > 0
      ? f('no_embedded_binary', 'No binary content in text files', `Binary content detected: ${binaryText.join(', ')}`)
      : p('no_embedded_binary', 'No binary content in text files'),
  )

  // 15. Instruction-file safety scan (warn, not fail)
  if (safetyMatches.length > 0) {
    const matchLines = safetyMatches.map((m) => `line ${m.lineNo}: [${m.label}] ${m.text}`)
    checks.push(w(
      'skill_md_safety',
      `${instructionFile} safety scan`,
      `${safetyMatches.length} potentially dangerous pattern(s) — review before installing`,
      matchLines,
    ))
  } else {
    checks.push(p('skill_md_safety', `${instructionFile} safety scan`))
  }

  return { checks, manifest }
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

async function fetchBytes(url: string): Promise<Buffer> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(t)
  }
}

function normalizeBase(url: string): string {
  return url.endsWith('/') ? url : url + '/'
}

// ── GitHub API helpers (for catalog installs with subdirectory trees) ─────────

/** Finds the primary instruction file in a bundle by looking for a root-level .md file. */
function detectInstructionFile(files: BundleFile[]): string {
  const rootMd = files.filter((f) => !f.name.includes('/') && f.name.toLowerCase().endsWith('.md'))
  return (
    rootMd.find((f) => f.name === 'SKILL.md')?.name ??
    rootMd.find((f) => f.name.toLowerCase() === 'skill.md')?.name ??
    rootMd[0]?.name ??
    'skill.md'
  )
}

interface GitHubFileEntry {
  name: string; type: 'file' | 'dir' | 'symlink'; download_url: string | null; url: string
}

async function listGitHubDirRecursive(
  apiUrl: string,
  prefix = '',
): Promise<{ relativePath: string; downloadUrl: string }[]> {
  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'trayline-skill-validator' },
  })
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status} — ${apiUrl}`)
  const items = (await res.json()) as GitHubFileEntry[]
  const result: { relativePath: string; downloadUrl: string }[] = []
  for (const item of items) {
    const relPath = prefix ? `${prefix}/${item.name}` : item.name
    if (item.type === 'file' && item.download_url) {
      result.push({ relativePath: relPath, downloadUrl: item.download_url })
    } else if (item.type === 'dir') {
      result.push(...await listGitHubDirRecursive(item.url, relPath))
    }
  }
  return result
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function validateFromUrl(url: string): Promise<SkillValidationResult> {
  const base = normalizeBase(url.trim())
  const tempDir = join(os.tmpdir(), `trayline-skill-${crypto.randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })

  const fetchedFiles: { name: string; sizeBytes: number }[] = []
  const bundleFiles: BundleFile[] = []

  try {
    // Fetch skill.json first to discover any extra declared files
    const manifestBuf = await fetchBytes(base + 'skill.json').catch((e) => {
      throw new Error(`Could not fetch skill.json: ${e instanceof Error ? e.message : String(e)}`)
    })
    bundleFiles.push({ name: 'skill.json', content: manifestBuf, isSymlink: false })
    fetchedFiles.push({ name: 'skill.json', sizeBytes: manifestBuf.length })

    let extraFiles: string[] = []
    try {
      const parsed = JSON.parse(manifestBuf.toString('utf-8'))
      const m = validateManifestContent(parsed)
      if (Array.isArray(m.files)) extraFiles = m.files.filter((f): f is string => typeof f === 'string')
    } catch { /* validation pass will report this */ }

    // Always fetch skill.md; also fetch any extras declared in manifest.files
    const toFetch = ['skill.md', ...extraFiles.filter((f) => f !== 'skill.json' && f !== 'skill.md')]
    for (const fname of toFetch) {
      if (fname === 'skill.json') continue
      // Validate path before attempting to fetch — add traversal entries so the
      // path-traversal check can fire even when we never actually fetch them.
      if (checkPath(fname) !== null) {
        bundleFiles.push({ name: fname, content: Buffer.alloc(0), isSymlink: false })
        fetchedFiles.push({ name: fname, sizeBytes: 0 })
        continue
      }
      const buf = await fetchBytes(base + fname).catch(() => null)
      // Absence of skill.md is handled by the skill_md_present check in runChecks.
      if (!buf) continue
      bundleFiles.push({ name: fname, content: buf, isSymlink: false })
      fetchedFiles.push({ name: fname, sizeBytes: buf.length })
    }

    // Stage files to temp dir
    for (const bf of bundleFiles) {
      const dest = join(tempDir, bf.name.replace(/\.\.\//g, '').replace(/^\//, ''))
      await fs.mkdir(join(dest, '..'), { recursive: true }).catch(() => {})
      await fs.writeFile(dest, bf.content)
    }

    const { checks, manifest } = runChecks(bundleFiles)
    const hasFail = checks.some((c) => c.status === 'fail')

    if (hasFail) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

    return { checks, manifest, fileList: fetchedFiles, hasFail, pendingTempDir: hasFail ? undefined : tempDir, sourceUrl: base }
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    return {
      checks: [{ id: 'fetch', label: 'Fetch skill files', status: 'fail', message: err instanceof Error ? err.message : String(err) }],
      manifest: null,
      fileList: fetchedFiles,
      hasFail: true,
      sourceUrl: base,
    }
  }
}

/**
 * Validates a catalog skill by listing its full GitHub directory tree via the
 * GitHub Contents API URL stored in the catalog entry, downloading every file
 * recursively, and synthesizing a skill.json from the catalog manifest (those
 * repos don't ship their own). The instruction file is auto-detected from the
 * listing as the root-level .md file — no `skill_md` declaration needed.
 */
export async function validateFromGitHubCatalog(
  apiUrl: string,
  manifest: SkillManifest,
): Promise<SkillValidationResult> {
  const tempDir = join(os.tmpdir(), `trayline-skill-${crypto.randomUUID()}`)
  await fs.mkdir(tempDir, { recursive: true })

  const fetchedFiles: { name: string; sizeBytes: number }[] = []
  const bundleFiles: BundleFile[] = []

  try {
    // List all files in the remote skill directory tree
    const remoteFiles = await listGitHubDirRecursive(apiUrl)
    if (remoteFiles.length === 0) throw new Error('GitHub directory listing returned no files')

    for (const { relativePath, downloadUrl } of remoteFiles) {
      if (checkPath(relativePath) !== null) {
        bundleFiles.push({ name: relativePath, content: Buffer.alloc(0), isSymlink: false })
        fetchedFiles.push({ name: relativePath, sizeBytes: 0 })
        continue
      }
      const buf = await fetchBytes(downloadUrl).catch(() => null)
      if (!buf) continue
      bundleFiles.push({ name: relativePath, content: buf, isSymlink: false })
      fetchedFiles.push({ name: relativePath, sizeBytes: buf.length })
    }

    // Synthesize skill.json from catalog-authoritative manifest
    const synthManifest: SkillManifest = { ...manifest }
    const manifestBuf = Buffer.from(JSON.stringify(synthManifest, null, 2), 'utf-8')
    const existingIdx = bundleFiles.findIndex((f) => f.name === 'skill.json')
    if (existingIdx >= 0) {
      bundleFiles[existingIdx] = { name: 'skill.json', content: manifestBuf, isSymlink: false }
      fetchedFiles[existingIdx] = { name: 'skill.json', sizeBytes: manifestBuf.length }
    } else {
      bundleFiles.unshift({ name: 'skill.json', content: manifestBuf, isSymlink: false })
      fetchedFiles.unshift({ name: 'skill.json', sizeBytes: manifestBuf.length })
    }

    // Stage to temp dir
    for (const bf of bundleFiles) {
      const dest = join(tempDir, bf.name.replace(/\.\.\//g, '').replace(/^\//, ''))
      await fs.mkdir(join(dest, '..'), { recursive: true }).catch(() => {})
      await fs.writeFile(dest, bf.content)
    }

    // Detect instruction file from the listing (root-level .md file)
    const instructionFile = detectInstructionFile(bundleFiles)
    const { checks, manifest: parsedManifest } = runChecks(bundleFiles, { instructionFile })
    const hasFail = checks.some((c) => c.status === 'fail')

    if (hasFail) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})

    return { checks, manifest: parsedManifest, fileList: fetchedFiles, hasFail, pendingTempDir: hasFail ? undefined : tempDir, sourceUrl: apiUrl }
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    return {
      checks: [{ id: 'fetch', label: 'Fetch skill files', status: 'fail', message: err instanceof Error ? err.message : String(err) }],
      manifest: null,
      fileList: fetchedFiles,
      hasFail: true,
      sourceUrl: apiUrl,
    }
  }
}

export async function validateOnDisk(dir: string): Promise<{
  checks: ValidationCheck[]
  manifest: SkillManifest | null
  hasFail: boolean
}> {
  const bundleFiles: BundleFile[] = []
  try {
    await collectDisk(dir, '', bundleFiles)
  } catch {
    return { checks: [{ id: 'read_dir', label: 'Read skill directory', status: 'fail', message: 'Could not read skill directory' }], manifest: null, hasFail: true }
  }

  const instructionFile = detectInstructionFile(bundleFiles)
  const { checks, manifest } = runChecks(bundleFiles, { instructionFile })
  return { checks, manifest, hasFail: checks.some((c) => c.status === 'fail') }
}

async function collectDisk(dir: string, prefix: string, out: BundleFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    const full = join(dir, e.name)
    if (e.isSymbolicLink()) {
      out.push({ name: rel, content: Buffer.alloc(0), isSymlink: true })
    } else if (e.isDirectory()) {
      await collectDisk(full, rel, out)
    } else if (e.isFile()) {
      out.push({ name: rel, content: await fs.readFile(full), isSymlink: false })
    }
  }
}

export async function cleanupTemp(tempDir: string): Promise<void> {
  await fs.rm(tempDir, { recursive: true, force: true })
}
