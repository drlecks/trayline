// Tracks the AI agent's rate-limit window usage (e.g. Claude Code's 5-hour and
// weekly windows). The footer polls this every 10 s.
//
// Honest status as of Phase 2:
// Claude Code does not surface 5h/week window state through any non-
// interactive entry point — `/usage` is a TUI-only slash command and the
// CLI's --output-format=json envelope only carries per-call token counts,
// not the rolling window percentages. Local state files don't cache it
// either; the data lives server-side and is fetched on each interactive
// session.
//
// We return nulls with source: 'unavailable' so the footer shows em-dashes
// instead of fabricated numbers. Real wiring is Phase 4 work, and will
// most likely take one of these forms:
//   1. Anthropic ships a CLI flag or subcommand that prints window state
//      (preferred — we'd just call it here).
//   2. We accumulate per-run token usage ourselves from the JSON envelope
//      (`usage.input_tokens` etc.) over the 5h / 7d windows. This gives a
//      lower bound that's accurate for runs spawned by Trayline but misses
//      usage from the user's other Claude Code sessions.
//   3. Hit the same internal API the TUI uses, which would require
//      reverse-engineering and is fragile.
//
// Until then: nulls and an em-dash.

import type { UsageSnapshot } from '../../shared/types'

async function getSnapshot(): Promise<UsageSnapshot> {
  return {
    fiveHourPct: null,
    weeklyPct: null,
    source: 'unavailable',
    updatedAt: new Date().toISOString(),
  }
}

export const usageService = { getSnapshot }
