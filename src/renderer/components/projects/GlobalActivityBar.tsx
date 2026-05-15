import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useActiveRunsStore } from '@/stores/active-runs-store'

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - startedAt) / 1000))

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return <span>{elapsed}s</span>
}

export default function GlobalActivityBar() {
  const activeRuns = useActiveRunsStore((s) => s.activeRuns)

  if (activeRuns.length === 0) return null

  return (
    <div className="w-full mt-6 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 overflow-hidden">
      <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-900">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
          Live activity
        </span>
      </div>
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
        {activeRuns.map((run) => (
          <li key={run.runId} className="flex items-center gap-3 px-4 py-2.5">
            <Loader2
              size={13}
              strokeWidth={1.75}
              className="text-emerald-500 shrink-0 animate-spin"
            />
            <span className="flex-1 text-sm text-neutral-700 dark:text-neutral-300 truncate">
              {run.displayName}
            </span>
            <span className="text-xs text-neutral-400 dark:text-neutral-500 shrink-0 tabular-nums">
              Running <ElapsedTimer startedAt={run.startedAt} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
