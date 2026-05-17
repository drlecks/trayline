// Runs the workflow author prompt against a free-text user description
// and returns a parsed WorkflowPlan.

import { join } from 'path'
import fs from 'fs/promises'
import os from 'os'
import { app } from 'electron'
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

function getAuthorPromptPath(): string {
  // In production the resource is in the asar-unpacked resources folder.
  // In dev/test it sits next to the project root resources/ directory.
  try {
    return join(app.getAppPath(), '..', 'resources', 'author-prompt.md')
  } catch {
    return join(__dirname, '..', '..', '..', 'resources', 'author-prompt.md')
  }
}

async function loadAuthorPrompt(): Promise<string | null> {
  try {
    return await fs.readFile(getAuthorPromptPath(), 'utf-8')
  } catch {
    return null
  }
}

function tryParse(s: string): unknown | null {
  try { return JSON.parse(s) } catch { return null }
}

/**
 * Escape raw control characters (newlines, tabs, carriage returns) that appear
 * inside JSON string values. The AI sometimes emits literal newlines inside
 * strings, producing invalid JSON that JSON.parse rejects outright.
 */
function sanitizeJsonStrings(raw: string): string {
  let out = ''
  let inString = false
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]
    if (inString) {
      if (ch === '\\') {
        out += ch
        i++
        if (i < raw.length) out += raw[i]
      } else if (ch === '"') {
        inString = false
        out += ch
      } else if (ch === '\n') {
        out += '\\n'
      } else if (ch === '\r') {
        out += '\\r'
      } else if (ch === '\t') {
        out += '\\t'
      } else {
        out += ch
      }
    } else {
      if (ch === '"') inString = true
      out += ch
    }
    i++
  }
  return out
}

function extractJson(raw: string): unknown | null {
  // Be lenient: the agent may wrap output in fences or add a preamble.
  // Find the first '{' and the matching last '}' and parse what's between.
  const trimmed = raw.trim()

  // 1. Direct parse (clean output)
  const direct = tryParse(trimmed)
  if (direct !== null) return direct

  // 2. Extract outermost {...} block (agent added preamble/postamble)
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const slice = trimmed.slice(start, end + 1)

  const sliceDirect = tryParse(slice)
  if (sliceDirect !== null) return sliceDirect

  // 3. Sanitize unescaped control characters inside string values, then retry
  return tryParse(sanitizeJsonStrings(slice))
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

  const authorPrompt = await loadAuthorPrompt()
  if (!authorPrompt) {
    return {
      ok: false,
      reason: 'unknown',
      message: 'Author prompt file is missing. Try restarting the app.',
    }
  }

  // Write the author prompt as the process file. The card data carries the
  // user's description and is substituted via {{card.data}} at spawn time.
  const workingDir = await fs.mkdtemp(join(os.tmpdir(), 'trayline-author-'))
  const processFile = join(workingDir, 'process.md')
  await fs.writeFile(processFile, authorPrompt + '\n\n{{card.data}}\n', 'utf-8')

  try {
    const session = await adapter.spawn({
      processFile,
      cardData: { description },
      contextPacks: [],
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
