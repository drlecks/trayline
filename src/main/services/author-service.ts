// Runs the `trayline-author` system skill against a free-text user description
// and returns a parsed WorkflowPlan.

import { join } from 'path'
import fs from 'fs/promises'
import os from 'os'
import { Paths } from './fs-service'
import { adapterRegistry } from '../ai-terminals/registry'
import { settingsStore } from './settings-store'
import type { WorkflowPlan } from '../../shared/workflow-plan'

export interface AuthorResult {
  ok: true
  plan: WorkflowPlan
}

export interface AuthorError {
  ok: false
  reason:
    | 'adapter_not_installed'
    | 'invalid_json'
    | 'invalid_plan'
    | 'spawn_failed'
    | 'unknown'
  message: string
  /** Raw stdout from the agent, useful for diagnosing parse failures. */
  raw?: string
}

export type AuthorOutcome = AuthorResult | AuthorError

async function loadSystemSkill(skillId: string): Promise<{ id: string; content: string } | null> {
  const md = join(Paths.systemSkills, skillId, 'skill.md')
  try {
    const content = await fs.readFile(md, 'utf-8')
    return { id: skillId, content }
  } catch {
    return null
  }
}

function extractJson(raw: string): unknown | null {
  // Be lenient: the agent may wrap output in fences or add a preamble.
  // Find the first '{' and the matching last '}' and parse what's between.
  const trimmed = raw.trim()
  const direct = (() => { try { return JSON.parse(trimmed) } catch { return null } })()
  if (direct !== null) return direct

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function isWorkflowPlan(value: unknown): value is WorkflowPlan {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.project !== 'object' || v.project === null) return false
  const p = v.project as Record<string, unknown>
  if (typeof p.name !== 'string' || typeof p.display_name !== 'string') return false
  if (typeof v.workflow !== 'object' || v.workflow === null) return false
  const w = v.workflow as Record<string, unknown>
  if (typeof w.name !== 'string' || !Array.isArray(w.steps)) return false
  return true
}

async function generate(description: string, opts: { adapterId?: string } = {}): Promise<AuthorOutcome> {
  const adapterId = opts.adapterId ?? settingsStore.get('defaultAdapterId') ?? 'claude-code'
  const adapter = adapterRegistry.get(adapterId)
  if (!adapter) {
    return { ok: false, reason: 'unknown', message: `Unknown AI adapter: ${adapterId}` }
  }

  const installed = await adapter.detectInstalled()
  if (!installed) {
    return {
      ok: false,
      reason: 'adapter_not_installed',
      message: `${adapter.displayName} is not installed on this system. Install it and try again.`,
    }
  }

  const skill = await loadSystemSkill('trayline-author')
  if (!skill) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'trayline-author system skill is missing. Try restarting the app.',
    }
  }

  // Prepare a temp working dir + minimal process.md. The skill body carries
  // the full master prompt, including the output schema. process.md just hands
  // the user's description to the agent as the input payload.
  const workingDir = await fs.mkdtemp(join(os.tmpdir(), 'trayline-author-'))
  const processFile = join(workingDir, 'process.md')
  await fs.writeFile(processFile, '{{card.data}}\n', 'utf-8')

  try {
    const session = await adapter.spawn({
      processFile,
      cardData: { description },
      skills: [skill],
      contextPacks: [],
      mcps: [],
      workingDir,
      timeout: 120_000,
    })
    const result = await session.result()

    if (result.exitCode !== 0) {
      return {
        ok: false,
        reason: 'spawn_failed',
        message: `${adapter.displayName} exited with code ${result.exitCode}`,
        raw: result.terminalLog,
      }
    }

    let parsed: unknown
    if (typeof result.output === 'object' && result.output !== null) {
      parsed = result.output
    } else if (typeof result.output === 'string') {
      parsed = extractJson(result.output)
    } else {
      parsed = null
    }

    if (parsed === null) {
      return {
        ok: false,
        reason: 'invalid_json',
        message: 'The agent did not return valid JSON. Try rephrasing your description.',
        raw: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
      }
    }

    if (!isWorkflowPlan(parsed)) {
      return {
        ok: false,
        reason: 'invalid_plan',
        message: 'The returned JSON did not match the expected workflow plan shape.',
        raw: JSON.stringify(parsed, null, 2),
      }
    }

    return { ok: true, plan: parsed }
  } catch (err) {
    return {
      ok: false,
      reason: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    }
  } finally {
    // Clean up the temp working dir (best effort)
    try { await fs.rm(workingDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

export const authorService = { generate }
