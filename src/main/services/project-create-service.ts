// Top-level orchestration for "describe a workflow, get a scaffolded project".
// Combines authorService (AI generation) with scaffoldService (file system
// materialization). Used by Phase 2's Workflow Author screen.

import fs from 'fs/promises'
import { join } from 'path'
import { authorService, type AuthorOutcome } from './author-service'
import { scaffoldService } from './scaffold-service'
import { projectService } from './project-service'
import { Paths } from './fs-service'
import type { ProjectMeta, ProjectCreateOutcome } from '../../shared/types'

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

/** Returns a project folder name that doesn't already exist on disk.
 *  If `base` is free it's returned as-is. Otherwise tries base-2, base-3, … */
async function uniqueProjectName(base: string): Promise<string> {
  if (!(await pathExists(join(Paths.projects, base)))) return base
  // Strip any existing trailing -N suffix so we always start from the bare name
  const stripped = base.replace(/-(\d+)$/, '')
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stripped}-${n}`
    if (!(await pathExists(join(Paths.projects, candidate)))) return candidate
  }
  return `${stripped}-${Date.now()}`
}

async function createFromDescription(
  description: string,
  opts: { regenerateOf?: string } = {},
): Promise<ProjectCreateOutcome> {
  const authored: AuthorOutcome = await authorService.generate(description)
  if (!authored.ok) {
    return {
      ok: false,
      stage: 'author',
      reason: authored.reason,
      message: authored.message,
      raw: authored.raw,
    }
  }

  // If regenerating, archive the existing project under .history/<timestamp>/
  // before scaffolding the new version. Otherwise find a unique folder name
  // so a collision never causes an error.
  let archiveExistingTo: string | undefined
  if (opts.regenerateOf && opts.regenerateOf === authored.plan.project.name) {
    archiveExistingTo = new Date().toISOString().replace(/[:.]/g, '-')
  } else {
    const resolvedName = await uniqueProjectName(authored.plan.project.name)
    if (resolvedName !== authored.plan.project.name) {
      authored.plan = {
        ...authored.plan,
        project: { ...authored.plan.project, name: resolvedName },
      }
    }
  }

  try {
    const result = await scaffoldService.scaffold(authored.plan, {
      archiveExistingTo,
    })
    return {
      ok: true,
      project: result.project,
      hasSourceStep: result.hasSourceStep,
    }
  } catch (err) {
    return {
      ok: false,
      stage: 'scaffold',
      reason: 'scaffold_failed',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}

async function deleteProject(name: string): Promise<void> {
  await scaffoldService.deleteProject(name)
}

async function listProjects(): Promise<ProjectMeta[]> {
  return projectService.listProjects()
}

export const projectCreateService = {
  createFromDescription,
  deleteProject,
  listProjects,
}
