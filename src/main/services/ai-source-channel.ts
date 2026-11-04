// AI prompt source channel helpers.
//
// An `ai_prompt` source has no external system to fetch from — the AI itself is
// the data channel. Each scheduled run sends the user's prompt plus a fixed
// output contract to the adapter, then turns the returned list into items that
// go through the normal dedup → card pipeline in source-runner.

import { createHash } from 'crypto'

export const AI_SOURCE_DEFAULT_TIMEOUT_SECONDS = 300
export const AI_SOURCE_DEFAULT_DEDUP_KEY = 'id'

/** How many recently seen IDs are shown to the AI so it can avoid repeats. */
const RECENT_IDS_IN_PROMPT = 50

export interface AiSourcePromptContext {
  now: string
  lastRunAt: string | null
  dedupKey: string
  recentSeenIds: string[]
}

/**
 * Wraps the user's prompt with the output contract and run context so the AI
 * returns a list the runner can split into cards.
 */
export function buildAiSourcePrompt(userPrompt: string, ctx: AiSourcePromptContext): string {
  const recent = ctx.recentSeenIds.slice(-RECENT_IDS_IN_PROMPT)
  const lines = [
    userPrompt.trim(),
    '',
    '## Output format',
    '',
    'Return ONLY a JSON array. Each element is one item and becomes one card.',
    `Give every item a stable, unique "${ctx.dedupKey}" field so the same item found again on a later run is recognised as a duplicate.`,
    'Return an empty array [] if there is nothing new.',
    '',
    '## Run context',
    '',
    `Current time: ${ctx.now}`,
    `Previous run: ${ctx.lastRunAt ?? 'none (this is the first run)'}`,
  ]
  if (recent.length > 0) {
    lines.push(`Already delivered ${ctx.dedupKey} values (do not return these again): ${recent.join(', ')}`)
  }
  return lines.join('\n')
}

/**
 * Normalises whatever the AI returned into a list of item objects.
 * Accepts a bare array, an object with an `items` array, a single object, or
 * plain text (which becomes one item with `ai_output`).
 */
export function parseAiSourceItems(output: object | string): Record<string, unknown>[] {
  let value: unknown = output
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    try {
      value = JSON.parse(trimmed)
    } catch {
      return [{ ai_output: trimmed }]
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const items = (value as { items?: unknown }).items
    value = Array.isArray(items) ? items : [value]
  }
  if (!Array.isArray(value)) return [{ value }]
  return value.map((el) =>
    el && typeof el === 'object' && !Array.isArray(el)
      ? (el as Record<string, unknown>)
      : { value: el },
  )
}

/**
 * Returns the dedup ID for an item: the configured key when present, otherwise
 * a content hash so identical items are still recognised across runs.
 */
export function aiItemDedupId(item: Record<string, unknown>, dedupKey: string): string {
  const raw = item[dedupKey]
  if (raw !== undefined && raw !== null && String(raw) !== '') return String(raw)
  return 'sha256:' + createHash('sha256').update(stableStringify(item)).digest('hex').slice(0, 32)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}
