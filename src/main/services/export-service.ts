import { join } from 'path'
import { tmpdir } from 'os'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import { app } from 'electron'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
import { Paths } from './fs-service'
import { auditProject } from './security-audit-service'
import type {
  ExportManifest,
  ExportOptions,
  ImportResult,
  ImportSuccess,
  ImportNeedsReview,
} from '../../shared/types'

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

// ── Export ────────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['runs', 'state', '.history'])

async function addDirectory(
  archive: archiver.Archiver,
  dirPath: string,
  archivePath: string,
  options: ExportOptions,
): Promise<void> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const name = entry.name as string
    if (name.endsWith('.tmp')) continue

    const fullPath = join(dirPath, name)
    const entryPath = `${archivePath}/${name}`

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue
      if (name === 'cards' && !options.includeCards) continue
      await addDirectory(archive, fullPath, entryPath, options)
    } else {
      archive.file(fullPath, { name: entryPath })
    }
  }
}

function buildManifest(): ExportManifest {
  return {
    trayline_version: app.getVersion(),
    exported_at: new Date().toISOString(),
  }
}

async function exportProject(
  projectName: string,
  options: ExportOptions,
  outputPath: string,
): Promise<void> {
  const projectDir = join(Paths.projects, projectName)
  if (!(await pathExists(projectDir))) throw new Error(`Project not found: ${projectName}`)

  const manifest = buildManifest()

  const output = createWriteStream(outputPath)
  const archive = archiver('zip', { zlib: { level: 6 } })

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
  })

  archive.pipe(output)
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' })
  await addDirectory(archive, projectDir, projectName, options)
  archive.finalize()

  await finished
}

// ── Import — two-step: scan then commit/abort ─────────────────────────────────

type PendingImport = {
  tempDir: string
  projectName: string
  extractedPath: string
}

// In-memory map of pending imports awaiting user confirmation
const pendingImports = new Map<string, PendingImport>()

function makeToken(): string {
  return `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function extractAndValidate(zipPath: string): Promise<{
  tempDir: string
  extractedPath: string
  projectName: string
}> {
  const tempDir = join(tmpdir(), `trayline-import-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })

  const zip = new AdmZip(zipPath)
  zip.extractAllTo(tempDir, true)

  // Project folder is the first subdirectory in the zip root
  const entries = await fs.readdir(tempDir, { withFileTypes: true })
  const projectDirEntry = entries.find((e) => e.isDirectory())
  if (!projectDirEntry) throw new Error('Invalid export: no project folder found in zip.')

  const extractedPath = join(tempDir, projectDirEntry.name as string)

  const projectJsonPath = join(extractedPath, 'project.json')
  if (!(await pathExists(projectJsonPath))) {
    throw new Error('Invalid export: project.json not found.')
  }
  const projectJson = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8')) as { name?: string }
  const projectName = projectJson.name ?? (projectDirEntry.name as string)

  const targetPath = join(Paths.projects, projectName)
  if (await pathExists(targetPath)) {
    throw new Error(`A project named "${projectName}" already exists. Delete it first before importing.`)
  }

  return { tempDir, extractedPath, projectName }
}

async function importProject(zipPath: string): Promise<ImportResult> {
  const { tempDir, extractedPath, projectName } = await extractAndValidate(zipPath)

  // cleanupTemp tracks whether we own the temp dir at the end of this call.
  // Set to false when ownership is transferred to pendingImports.
  let cleanupTemp = true

  try {
    const { findings, summary } = await auditProject(extractedPath)

    if (findings.length > 0) {
      const token = makeToken()
      pendingImports.set(token, { tempDir, extractedPath, projectName })
      cleanupTemp = false  // temp is now owned by pendingImports entry
      const result: ImportNeedsReview = {
        ok: 'needs_review',
        token,
        projectName,
        securityFindings: findings,
        projectSummary: summary,
      }
      return result
    }

    // Clean — commit immediately
    await fs.cp(extractedPath, join(Paths.projects, projectName), { recursive: true })
    return { ok: true, projectName }
  } finally {
    if (cleanupTemp) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

async function commitImport(token: string): Promise<ImportSuccess> {
  const pending = pendingImports.get(token)
  if (!pending) throw new Error('Import session expired or not found.')
  pendingImports.delete(token)

  const { tempDir, extractedPath, projectName } = pending

  try {
    await fs.cp(extractedPath, join(Paths.projects, projectName), { recursive: true })
    return { ok: true, projectName }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function abortImport(token: string): Promise<void> {
  const pending = pendingImports.get(token)
  if (!pending) return
  pendingImports.delete(token)
  await fs.rm(pending.tempDir, { recursive: true, force: true }).catch(() => {})
}

// ── Example project ───────────────────────────────────────────────────────────

async function openExampleProject(): Promise<ImportSuccess> {
  const exampleSrc = join(app.getAppPath(), '..', 'resources', 'example-project')
  const fallback = join(process.resourcesPath ?? '', 'example-project')

  let src = (await pathExists(exampleSrc)) ? exampleSrc : null
  if (!src && (await pathExists(fallback))) src = fallback
  if (!src) throw new Error('Example project not found in app bundle.')

  const projectJson = JSON.parse(await fs.readFile(join(src, 'project.json'), 'utf-8')) as { name?: string }
  const projectName = projectJson.name ?? 'example-project'

  const targetPath = join(Paths.projects, projectName)
  if (await pathExists(targetPath)) {
    return { ok: true, projectName }
  }

  await fs.cp(src, targetPath, { recursive: true })
  return { ok: true, projectName }
}

export const exportService = {
  exportProject,
  importProject,
  commitImport,
  abortImport,
  openExampleProject,
}
