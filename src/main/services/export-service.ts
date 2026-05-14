import { join } from 'path'
import { tmpdir } from 'os'
import fs from 'fs/promises'
import { createWriteStream, createReadStream } from 'fs'
import { app } from 'electron'
import archiver from 'archiver'
import * as unzipper from 'unzipper'
import { Paths } from './fs-service'
import { projectService } from './project-service'
import type { ExportManifest, ExportOptions, ImportResult } from '../../shared/types'

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

// Directories that are always excluded from exports (derived/runtime data)
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

async function buildManifest(projectName: string): Promise<ExportManifest> {
  const skillIds = new Set<string>()

  const wfRoot = join(Paths.projects, projectName, 'workflows')
  if (await pathExists(wfRoot)) {
    const wfs = await fs.readdir(wfRoot, { withFileTypes: true })
    for (const wf of wfs) {
      if (!wf.isDirectory()) continue
      const stepsRoot = join(wfRoot, wf.name, 'steps')
      if (!(await pathExists(stepsRoot))) continue
      const steps = await fs.readdir(stepsRoot, { withFileTypes: true })
      for (const step of steps) {
        if (!step.isDirectory()) continue
        try {
          const raw = JSON.parse(await fs.readFile(join(stepsRoot, step.name, 'step.json'), 'utf-8')) as Record<string, unknown>
          if (raw.kind === 'worker' && Array.isArray(raw.skills)) {
            for (const id of raw.skills) {
              if (typeof id === 'string') skillIds.add(id)
            }
          }
        } catch { /* skip unparseable */ }
      }
    }
  }

  const skills: ExportManifest['skills'] = []
  for (const id of skillIds) {
    const manifest = await projectService.getSkill(id)
    skills.push({ id, version: manifest?.version ?? 'unknown' })
  }

  return {
    trayline_version: app.getVersion(),
    exported_at: new Date().toISOString(),
    skills,
    mcps: [],
  }
}

async function exportProject(
  projectName: string,
  options: ExportOptions,
  outputPath: string,
): Promise<void> {
  const projectDir = join(Paths.projects, projectName)
  if (!(await pathExists(projectDir))) throw new Error(`Project not found: ${projectName}`)

  const manifest = await buildManifest(projectName)

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

async function importProject(zipPath: string): Promise<ImportResult> {
  const tempDir = join(tmpdir(), `trayline-import-${Date.now()}`)
  await fs.mkdir(tempDir, { recursive: true })

  try {
    await new Promise<void>((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('close', resolve)
        .on('error', reject)
    })

    // manifest.json is at the zip root
    let manifest: ExportManifest | null = null
    try {
      const raw = await fs.readFile(join(tempDir, 'manifest.json'), 'utf-8')
      manifest = JSON.parse(raw) as ExportManifest
    } catch { /* proceed without manifest */ }

    // The project folder is the first (and only) subdirectory in the zip root
    const entries = await fs.readdir(tempDir, { withFileTypes: true })
    const projectDir = entries.find((e) => e.isDirectory())
    if (!projectDir) throw new Error('Invalid export: no project folder found in zip.')

    const extractedPath = join(tempDir, projectDir.name)

    // Validate project.json
    const projectJsonPath = join(extractedPath, 'project.json')
    if (!(await pathExists(projectJsonPath))) {
      throw new Error('Invalid export: project.json not found.')
    }
    const projectJson = JSON.parse(await fs.readFile(projectJsonPath, 'utf-8')) as { name?: string }
    const projectName = projectJson.name ?? projectDir.name

    // Reject if project already exists
    const targetPath = join(Paths.projects, projectName)
    if (await pathExists(targetPath)) {
      throw new Error(`A project named "${projectName}" already exists. Delete it first before importing.`)
    }

    // Copy extracted project to projects folder
    await fs.cp(extractedPath, targetPath, { recursive: true })

    // Determine missing skills
    const missingSkills: ImportResult['missingSkills'] = []
    if (manifest) {
      for (const skill of manifest.skills) {
        const installed = await pathExists(join(Paths.skills, skill.id, 'skill.json'))
        if (!installed) missingSkills.push(skill)
      }
    }

    return { ok: true, projectName, missingSkills }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function openExampleProject(): Promise<ImportResult> {
  const exampleSrc = join(app.getAppPath(), '..', 'resources', 'example-project')
  const fallback = join(process.resourcesPath ?? '', 'example-project')

  let src = (await pathExists(exampleSrc)) ? exampleSrc : null
  if (!src && (await pathExists(fallback))) src = fallback
  if (!src) throw new Error('Example project not found in app bundle.')

  // Read project name from project.json
  const projectJson = JSON.parse(await fs.readFile(join(src, 'project.json'), 'utf-8')) as { name?: string }
  const projectName = projectJson.name ?? 'example-project'

  const targetPath = join(Paths.projects, projectName)

  // If already imported, just return it
  if (await pathExists(targetPath)) {
    return { ok: true, projectName, missingSkills: [] }
  }

  await fs.cp(src, targetPath, { recursive: true })
  return { ok: true, projectName, missingSkills: [] }
}

export const exportService = {
  exportProject,
  importProject,
  openExampleProject,
}
