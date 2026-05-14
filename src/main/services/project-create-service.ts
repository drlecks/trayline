// Top-level orchestration for "describe a workflow, get a scaffolded project".
// Combines authorService (AI generation) with scaffoldService (file system
// materialization). Used by Phase 2's Workflow Author screen.

import { authorService, type AuthorOutcome } from './author-service'
import { scaffoldService } from './scaffold-service'
import { projectService } from './project-service'
import type { ProjectMeta, ProjectCreateOutcome } from '../../shared/types'

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
  // before scaffolding the new version.
  let archiveExistingTo: string | undefined
  if (opts.regenerateOf && opts.regenerateOf === authored.plan.project.name) {
    archiveExistingTo = new Date().toISOString().replace(/[:.]/g, '-')
  }

  try {
    const result = await scaffoldService.scaffold(authored.plan, {
      archiveExistingTo,
    })
    return {
      ok: true,
      project: result.project,
      unconfiguredMcps: result.unconfiguredMcps,
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
