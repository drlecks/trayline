import { useEffect, useState } from 'react'
import type { UsageSnapshot } from '../../../shared/types'

const POLL_MS = 10_000

function formatPct(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${value.toFixed(0)}%`
}

export default function Footer() {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const snap = await window.trayline.usage.get()
        if (!cancelled) setUsage(snap)
      } catch {
        // Service unavailable — leave previous snapshot in place; the next
        // tick may succeed.
      }
    }

    tick() // first read immediately
    const id = setInterval(tick, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  return (
    <footer className="
      flex items-center justify-end shrink-0
      h-7 px-4 gap-4
      border-t border-black/[0.06] dark:border-white/[0.06]
      bg-[var(--bg)]
      text-[11px] text-neutral-500 dark:text-neutral-400
      font-mono tabular-nums
      select-none
    ">
      <div className="flex items-center gap-3" title={
        !usage
          ? 'Loading usage…'
          : usage.source === 'unavailable'
            ? 'Claude Code does not expose 5h/weekly window state to other apps yet. We\'ll surface real values here once the upstream CLI provides them or once Trayline runs enough workers to estimate locally (Phase 4).'
            : `Source: ${usage.source} · Updated: ${new Date(usage.updatedAt).toLocaleTimeString()}`
      }>
        <span>
          <span className="text-neutral-400 dark:text-neutral-500">5h</span>{' '}
          <span className={usage && usage.fiveHourPct !== null && usage.fiveHourPct >= 80 ? 'text-amber-600 dark:text-amber-400' : ''}>
            {formatPct(usage?.fiveHourPct ?? null)}
          </span>
        </span>
        <span className="text-neutral-300 dark:text-neutral-700">·</span>
        <span>
          <span className="text-neutral-400 dark:text-neutral-500">Weekly</span>{' '}
          <span className={usage && usage.weeklyPct !== null && usage.weeklyPct >= 80 ? 'text-amber-600 dark:text-amber-400' : ''}>
            {formatPct(usage?.weeklyPct ?? null)}
          </span>
        </span>
      </div>
    </footer>
  )
}
