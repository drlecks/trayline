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

async function isValidSystemSkill(skillDir: string): Promise<boolean> {
  const manifest = join(skillDir, 'skill.json')
  const instructions = join(skillDir, 'skill.md')
  if (!(await pathExists(manifest)) || !(await pathExists(instructions))) return false

  try {
    const raw = await fs.readFile(manifest, 'utf-8')
    const parsed = JSON.parse(raw) as { id?: string; version?: string }
    return !!parsed.id && !!parsed.version
  } catch {
    return false
  }
}

/**
 * Copy bundled system skills into ~/Documents/Trayline/skills/_system/.
 * Runs on every launch — if a system skill is missing or its manifest is
 * unreadable, it gets restored from the bundle. Existing valid copies are
 * left alone so power users can edit (e.g.) the master prompt of
 * `trayline-author/skill.md`.
 */
async function ensureInstalled(): Promise<{ restored: SystemSkillId[] }> {
  const bundledRoot = getBundledRoot()
  const restored: SystemSkillId[] = []

  for (const id of SYSTEM_SKILL_IDS) {
    const target = join(Paths.systemSkills, id)
    const valid = await isValidSystemSkill(target)
    if (valid) continue

    // Need to restore — wipe target and copy fresh
    if (await pathExists(target)) {
      await fs.rm(target, { recursive: true, force: true })
    }
    const source = join(bundledRoot, id)
    if (!(await pathExists(source))) {
      throw new Error(`Bundled system skill missing: ${source}`)
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
