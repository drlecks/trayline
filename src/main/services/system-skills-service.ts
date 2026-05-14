import { app } from 'electron'
import { join, dirname } from 'path'
import fs from 'fs/promises'
import { Paths } from './fs-service'

// In dev mode, bundled resources sit at <repoRoot>/resources/system-skills/
// In prod (electron-builder), they're under process.resourcesPath/system-skills/
function getBundledRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'system-skills')
  }
  return join(app.getAppPath(), 'resources', 'system-skills')
}

const SYSTEM_SKILL_IDS = ['trayline-author', 'trayline-scaffold', 'trayline-worker-contract'] as const
export type SystemSkillId = (typeof SYSTEM_SKILL_IDS)[number]

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else if (entry.isFile()) {
      await fs.mkdir(dirname(destPath), { recursive: true })
      await fs.copyFile(srcPath, destPath)
    }
  }
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function readManifestVersion(manifestPath: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw) as { id?: string; version?: string }
    if (!parsed.id || !parsed.version) return null
    return parsed.version
  } catch {
    return null
  }
}

async function isValidSystemSkill(skillDir: string): Promise<boolean> {
  const manifest = join(skillDir, 'skill.json')
  const instructions = join(skillDir, 'skill.md')
  if (!(await pathExists(manifest)) || !(await pathExists(instructions))) return false
  return (await readManifestVersion(manifest)) !== null
}

/**
 * Compare semver-ish strings like "1.2.3". Falls back to string compare on any
 * non-numeric segment so weird versions still produce a stable ordering.
 */
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

/**
 * Copy bundled system skills into ~/Documents/Trayline/skills/_system/.
 * Runs on every launch. A skill is restored from the bundle when any of:
 *   - the local copy is missing or its manifest is unreadable, or
 *   - the bundled version is newer than the local version (semver-ish).
 * Otherwise the local copy is left alone so power users can edit the
 * master prompts (e.g. `trayline-author/skill.md`) without losing their
 * changes on every launch.
 */
async function ensureInstalled(): Promise<{ restored: SystemSkillId[] }> {
  const bundledRoot = getBundledRoot()
  const restored: SystemSkillId[] = []

  for (const id of SYSTEM_SKILL_IDS) {
    const target = join(Paths.systemSkills, id)
    const source = join(bundledRoot, id)
    if (!(await pathExists(source))) {
      throw new Error(`Bundled system skill missing: ${source}`)
    }

    let shouldRestore = !(await isValidSystemSkill(target))
    if (!shouldRestore) {
      const localVersion = await readManifestVersion(join(target, 'skill.json'))
      const bundledVersion = await readManifestVersion(join(source, 'skill.json'))
      if (localVersion && bundledVersion && compareVersions(bundledVersion, localVersion) > 0) {
        shouldRestore = true
      }
    }
    if (!shouldRestore) continue

    if (await pathExists(target)) {
      await fs.rm(target, { recursive: true, force: true })
    }
    await copyDir(source, target)
    restored.push(id)
  }

  return { restored }
}

export const systemSkillsService = {
  ensureInstalled,
  ids: SYSTEM_SKILL_IDS,
}
