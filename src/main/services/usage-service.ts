// Tracks the AI agent's rate-limit window usage (e.g. Claude Code's 5-hour and
// weekly windows). The footer polls this every 10 s.
//
// Real integration with the Claude Code CLI's status endpoint will land in
// Phase 4 alongside the worker engine — at that point the active AI Terminal
// Adapter will be the source of truth. For now this returns a stable but
// non-zero placeholder so the footer renders something verifiable instead of
// constant em-dashes.

import type { UsageSnapshot } from '../../shared/types'

let lastSnapshot: UsageSnapshot = {
  fiveHourPct: null,
  weeklyPct: null,
  source: 'placeholder',
  updatedAt: new Date().toISOString(),
}

// Slow random walk so the user can visually confirm the 10-second refresh.
// Replaced wholesale once the adapter exposes real usage data.
function placeholderTick(prev: number | null, base: number): number {
  if (prev === null) return base
  const drift = (Math.random() - 0.5) * 2 // ±1
  return Math.max(0, Math.min(100, Math.round((prev + drift) * 10) / 10))
}

function computePlaceholder(): UsageSnapshot {
  return {
    fiveHourPct: placeholderTick(lastSnapshot.fiveHourPct, 12),
    weeklyPct: placeholderTick(lastSnapshot.weeklyPct, 38),
    source: 'placeholder',
    updatedAt: new Date().toISOString(),
  }
}

async function getSnapshot(): Promise<UsageSnapshot> {
  // Phase 4 will replace this branch with a call into the active adapter
  // (e.g. claudeCodeAdapter.getUsage()). Until then, return placeholder data.
  lastSnapshot = computePlaceholder()
  return lastSnapshot
}

export const usageService = { getSnapshot }
