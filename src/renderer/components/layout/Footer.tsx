import { useEffect, useState } from 'react'
import { useProjectStore } from '@/stores/project-store'
import type { AdapterUsageSnapshot, Settings } from '../../../shared/types'

interface AdapterMeta { id: string; displayName: string }

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export default function Footer() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [adapters, setAdapters] = useState<AdapterMeta[]>([])
  const [modelLabel, setModelLabel] = useState<string | null>(null)
  const [effortLabel, setEffortLabel] = useState<string | null>(null)
  const [usage, setUsage] = useState<AdapterUsageSnapshot | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)

  // Load adapter list and app version once.
  useEffect(() => {
    void window.trayline.adapters.list().then((list) =>
      setAdapters(list.map((a) => ({ id: a.id, displayName: a.displayName }))),
    )
    void window.trayline.app.bootstrapInfo().then((info) => setAppVersion(info.appVersion))
  }, [])

  // Load settings + listen for changes that happen elsewhere (Settings screen
  // writes through the same IPC). We re-read on every usage:update event,
  // which fires after a worker run completes — that's also when the user is
  // most likely to have just changed the provider, so we ride that signal.
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const s = await window.trayline.settings.get()
      if (cancelled) return
      setSettings(s)

      const adapterId = s.defaultAdapterId
      const modelId = s.defaultModelByAdapter?.[adapterId] ?? null
      const effortId = s.defaultEffortByAdapter?.[adapterId] ?? null

      const models = await window.trayline.adapters.listModels(adapterId)
      if (cancelled) return
      const model = models.find((m) => m.id === modelId) ?? models[0] ?? null
      setModelLabel(model?.label ?? null)

      if (model) {
        const efforts = await window.trayline.adapters.listEfforts(adapterId, model.id)
        if (cancelled) return
        const eff = efforts.find((e) => e.id === effortId) ?? efforts[0] ?? null
        setEffortLabel(eff?.label ?? null)
      } else {
        setEffortLabel(null)
      }

      const snap = await window.trayline.adapters.getUsage(adapterId)
      if (cancelled) return
      setUsage(snap)
    }
    void refresh()
    const offUsage = window.trayline.adapters.onUsageUpdate(() => { void refresh() })
    const offSettings = window.trayline.settings.onChange(() => { void refresh() })
    return () => { cancelled = true; offUsage(); offSettings() }
  }, [])

  const adapter = adapters.find((a) => a.id === settings?.defaultAdapterId) ?? null
  const providerLabel = adapter?.displayName ?? settings?.defaultAdapterId ?? '—'

  const segments: React.ReactNode[] = [
    <span key="prov">{providerLabel}</span>,
  ]
  if (modelLabel)  segments.push(<span key="mdl">{modelLabel}</span>)
  if (effortLabel) segments.push(<span key="eff">{effortLabel}</span>)
  if (usage?.fiveHour) {
    segments.push(
      <span key="5h">
        <span className="text-neutral-400 dark:text-neutral-500">5h</span>{' '}
        {fmtCount(usage.fiveHour.used)}/{fmtCount(usage.fiveHour.limit)}
      </span>,
    )
  }
  if (usage?.weekly) {
    segments.push(
      <span key="wk">
        <span className="text-neutral-400 dark:text-neutral-500">Weekly</span>{' '}
        {fmtCount(usage.weekly.used)}/{fmtCount(usage.weekly.limit)}
      </span>,
    )
  }

  return (
    <footer
      className="
        flex items-center justify-between shrink-0
        h-7 px-4
        border-t border-black/[0.06] dark:border-white/[0.06]
        bg-[var(--bg)]
        text-[11px] text-neutral-500 dark:text-neutral-400
        font-mono tabular-nums
        select-none
      "
    >
      {appVersion && (
        <span className="text-neutral-400 dark:text-neutral-500">v{appVersion}</span>
      )}
      <button
        onClick={() => setScreen('settings')}
        title="Open AI Terminal settings"
        className="flex items-center gap-3 cursor-pointer hover:text-neutral-700 dark:hover:text-neutral-200 ml-auto"
      >
        {segments.map((seg, i) => (
          <span key={i} className="flex items-center gap-3">
            {i > 0 && <span className="text-neutral-300 dark:text-neutral-700">·</span>}
            {seg}
          </span>
        ))}
      </button>
    </footer>
  )
}
