import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, BellOff, Check, ExternalLink, Github, RefreshCw, Wrench, X } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import AdapterSetupWizard from '@/components/adapter/AdapterSetupWizard'
import type { AdapterReadiness, AdapterUsageSnapshot, NotificationSettings, Settings } from '../../../shared/types'

interface AdapterEntry {
  id: string
  displayName: string
  installed: boolean
  version: string | null
  installUrl: string | null
  readiness: AdapterReadiness | null
}

interface ModelEntry { id: string; label: string; description?: string }
interface EffortEntry { id: string; label: string }

export default function SettingsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const active = useProjectStore((s) => s.active)
  const all = useProjectStore((s) => s.all)
  const { theme, setTheme } = useThemeStore()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null)
  const [adapters, setAdapters] = useState<AdapterEntry[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [efforts, setEfforts] = useState<EffortEntry[]>([])
  const [usage, setUsage] = useState<AdapterUsageSnapshot | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [wizardAdapter, setWizardAdapter] = useState<AdapterEntry | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    void window.trayline.settings.get().then(setSettings)
    void window.trayline.notifications.getSettings().then(setNotifSettings)
    ;(async () => {
      const [list, readinessMap] = await Promise.all([
        window.trayline.adapters.list(),
        window.trayline.adapter.checkReadiness(),
      ])
      const detailed: AdapterEntry[] = list.map((a) => {
        const r = readinessMap[a.id] ?? null
        return {
          id: a.id,
          displayName: a.displayName,
          installUrl: a.installUrl ?? null,
          installed: r?.installed ?? false,
          version: r?.version ?? null,
          readiness: r,
        }
      })
      setAdapters(detailed)
    })()
  }, [])

  function openSetupWizard(adapter: AdapterEntry) {
    setWizardAdapter(adapter)
    setWizardOpen(true)
  }

  async function handleWizardComplete() {
    // Refresh adapter readiness after wizard completes
    const readinessMap = await window.trayline.adapter.checkReadiness()
    setAdapters((prev) => prev.map((a) => {
      const r = readinessMap[a.id] ?? null
      return r ? { ...a, installed: r.installed, version: r.version, readiness: r } : a
    }))
  }

  // Refresh model list whenever the active adapter changes.
  useEffect(() => {
    if (!settings) return
    let cancelled = false
    void (async () => {
      const ms = await window.trayline.adapters.listModels(settings.defaultAdapterId)
      if (cancelled) return
      setModels(ms)
      // If the currently-saved model is missing from the new list, fall back
      // to the first one so the dropdown shows a coherent state.
      const saved = settings.defaultModelByAdapter?.[settings.defaultAdapterId] ?? null
      const resolved = ms.find((m) => m.id === saved)?.id ?? ms[0]?.id ?? null
      if (resolved !== saved) {
        await persistModel(resolved)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultAdapterId])

  // Refresh effort list whenever model changes (re-issued even if the model
  // id is unchanged but the adapter just flipped — providers may tie efforts
  // to a specific model).
  const currentModelId = settings ? settings.defaultModelByAdapter?.[settings.defaultAdapterId] ?? null : null
  useEffect(() => {
    if (!settings || !currentModelId) { setEfforts([]); return }
    let cancelled = false
    void (async () => {
      const es = await window.trayline.adapters.listEfforts(settings.defaultAdapterId, currentModelId)
      if (cancelled) return
      setEfforts(es)
      const saved = settings.defaultEffortByAdapter?.[settings.defaultAdapterId] ?? null
      const resolved = es.find((e) => e.id === saved)?.id ?? es[0]?.id ?? null
      if (resolved !== saved) {
        await persistEffort(resolved)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultAdapterId, currentModelId])

  // Load usage on adapter change + when the user clicks refresh.
  useEffect(() => {
    if (!settings) return
    void refreshUsage()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.defaultAdapterId])

  async function refreshUsage() {
    if (!settings) return
    setUsageLoading(true)
    try {
      const snap = await window.trayline.adapters.getUsage(settings.defaultAdapterId)
      setUsage(snap)
    } finally {
      setUsageLoading(false)
    }
  }

  async function setAdapter(id: string) {
    const next = await window.trayline.settings.set('defaultAdapterId', id)
    setSettings(next)
  }

  async function persistModel(modelId: string | null) {
    if (!settings) return
    const map = { ...(settings.defaultModelByAdapter ?? {}) }
    map[settings.defaultAdapterId] = modelId
    const next = await window.trayline.settings.set('defaultModelByAdapter', map)
    setSettings(next)
  }

  async function updateNotifSettings(partial: Partial<NotificationSettings>) {
    const next = await window.trayline.notifications.updateSettings(partial)
    setNotifSettings(next)
  }

  function toggleProjectNotifications(projectName: string) {
    if (!notifSettings) return
    const disabled = notifSettings.disabledProjects.includes(projectName)
    void updateNotifSettings({
      disabledProjects: disabled
        ? notifSettings.disabledProjects.filter((p) => p !== projectName)
        : [...notifSettings.disabledProjects, projectName],
    })
  }

  async function persistEffort(effortId: string | null) {
    if (!settings) return
    const map = { ...(settings.defaultEffortByAdapter ?? {}) }
    map[settings.defaultAdapterId] = effortId
    const next = await window.trayline.settings.set('defaultEffortByAdapter', map)
    setSettings(next)
  }

  if (!settings) return null

  const activeAdapter = adapters.find((a) => a.id === settings.defaultAdapterId) ?? null

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-8 py-8">
      <button
        onClick={() => setScreen(active ? 'project' : all.length > 0 ? 'projectList' : 'splash')}
        className="self-start flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-6"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back
      </button>

      <h1 className="text-xl font-semibold tracking-tight mb-1">Settings</h1>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-8"></p>

      {/* Theme */}
      <Section title="Appearance" subtitle="How Trayline looks on your screen.">
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as Settings['theme'][]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`
                px-3 py-1.5 rounded-md text-xs capitalize
                border transition-colors
                ${theme === t
                  ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
              `}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      {/* Notifications */}
      {notifSettings && (
        <Section title="Notifications" subtitle="OS alerts and dock badge when cards need your review.">
          <div className="flex flex-col gap-3">
            {/* Global toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <Toggle
                checked={notifSettings.enabled}
                onChange={() => void updateNotifSettings({ enabled: !notifSettings.enabled })}
              />
              <div className="flex items-center gap-1.5">
                {notifSettings.enabled
                  ? <Bell size={13} strokeWidth={1.75} className="text-neutral-600 dark:text-neutral-400" />
                  : <BellOff size={13} strokeWidth={1.75} className="text-neutral-400" />
                }
                <span className="text-xs">Notify when cards need review</span>
              </div>
            </label>

            {/* Per-project toggles — only visible when global is on */}
            {notifSettings.enabled && all.length > 0 && (
              <div className="ml-12 flex flex-col gap-1.5 border-l border-neutral-200 dark:border-neutral-800 pl-3">
                <p className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">Per-project</p>
                {all.map((project) => {
                  const muted = notifSettings.disabledProjects.includes(project.name)
                  return (
                    <label key={project.name} className="flex items-center gap-2.5 cursor-pointer">
                      <Toggle
                        checked={!muted}
                        onChange={() => toggleProjectNotifications(project.name)}
                      />
                      <span className={`text-xs ${muted ? 'text-neutral-400 dark:text-neutral-600' : ''}`}>
                        {project.display_name}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            {/* Clear dedup set */}
            <button
              type="button"
              onClick={async () => {
                await window.trayline.notifications.clearAllNotified()
              }}
              className="self-start text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline-offset-2 hover:underline"
            >
              Clear notification history
            </button>
          </div>
        </Section>
      )}

      {/* AI Terminal */}
      <Section title="AI Terminal" subtitle="Which CLI agent runs your workers, plus the model and effort it should use.">
        <div className="flex flex-col gap-2 mb-4">
          {adapters.map((a) => {
            const selected = settings.defaultAdapterId === a.id
            const disabled = !a.installed
            return (
              <button
                key={a.id}
                onClick={() => { if (!disabled) void setAdapter(a.id) }}
                disabled={disabled}
                className={`
                  flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left
                  ${selected
                    ? 'border-neutral-900 dark:border-neutral-100'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
                  ${disabled ? 'opacity-60 cursor-not-allowed' : ''}
                `}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{a.displayName}</span>
                    {a.installed
                      ? <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-green-600 dark:text-green-500"><Check size={10} strokeWidth={2.5} /> installed</span>
                      : <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-400"><X size={10} strokeWidth={2.5} /> not detected</span>
                    }
                  </div>
                  {a.version && (
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 font-mono mt-0.5">{a.version}</div>
                  )}
                  {!a.installed && a.installUrl && (
                    <a
                      href={a.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline dark:text-blue-400 mt-0.5"
                    >
                      Install instructions <ExternalLink size={10} strokeWidth={2} />
                    </a>
                  )}
                  {!a.installed && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openSetupWizard(a) }}
                      className="inline-flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mt-0.5"
                    >
                      <Wrench size={10} strokeWidth={2} /> Re-run setup
                    </button>
                  )}
                </div>
                {selected && (
                  <Check size={14} strokeWidth={2} className="text-neutral-900 dark:text-neutral-100" />
                )}
              </button>
            )
          })}
        </div>

        {/* Model dropdown */}
        {activeAdapter?.installed && models.length > 0 && (
          <Field label="Model">
            <select
              value={currentModelId ?? ''}
              onChange={(e) => void persistModel(e.target.value || null)}
              className="
                w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-800
                bg-white dark:bg-neutral-950 px-2.5 py-1.5
              "
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            {models.find((m) => m.id === currentModelId)?.description && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1">
                {models.find((m) => m.id === currentModelId)?.description}
              </p>
            )}
          </Field>
        )}

        {/* Effort dropdown — only when the provider exposes tiers */}
        {activeAdapter?.installed && efforts.length > 0 && (
          <Field label="Effort">
            <select
              value={settings.defaultEffortByAdapter?.[settings.defaultAdapterId] ?? ''}
              onChange={(e) => void persistEffort(e.target.value || null)}
              className="
                w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-800
                bg-white dark:bg-neutral-950 px-2.5 py-1.5
              "
            >
              {efforts.map((eff) => (
                <option key={eff.id} value={eff.id}>{eff.label}</option>
              ))}
            </select>
          </Field>
        )}

        {/* Usage telemetry */}
        {activeAdapter?.installed && (
          <Field
            label="Usage"
            action={
              <button
                onClick={() => void refreshUsage()}
                disabled={usageLoading}
                className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 disabled:opacity-50"
              >
                <RefreshCw size={11} strokeWidth={2} className={usageLoading ? 'animate-spin' : ''} /> Refresh
              </button>
            }
          >
            {usage === null ? (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                This provider does not expose rolling-window usage.
              </p>
            ) : (
              <div className="text-xs font-mono tabular-nums flex flex-col gap-1">
                {usage.fiveHour && (
                  <UsageBar label="5-hour" used={usage.fiveHour.used} limit={usage.fiveHour.limit} resetsAt={usage.fiveHour.resetsAt} />
                )}
                {usage.weekly && (
                  <UsageBar label="Weekly" used={usage.weekly.used} limit={usage.weekly.limit} resetsAt={usage.weekly.resetsAt} />
                )}
              </div>
            )}
          </Field>
        )}
      </Section>

      <Section title="Help" subtitle="">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('trayline:open-tour'))}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-xs"
          >
            Run onboarding tour
          </button>
          <button
            type="button"
            onClick={() => {
              // Defer to the global shortcut handler so the dialog comes up.
              window.dispatchEvent(new KeyboardEvent('keydown', {
                key: '/',
                ctrlKey: !navigator.platform.toLowerCase().includes('mac'),
                metaKey: navigator.platform.toLowerCase().includes('mac'),
                bubbles: true,
              }))
            }}
            className="px-3 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-xs"
          >
            Keyboard shortcuts
          </button>
        </div>
      </Section>

      <Section title="About" subtitle="">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-700 dark:text-neutral-300">
            Built by <span className="font-medium">Alex Cabrera</span>
          </p>
          <a
            href="https://github.com/drlecks/trayline"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 w-fit"
          >
            <Github size={13} strokeWidth={1.75} />
            github.com/drlecks/trayline
          </a>
        </div>
      </Section>

      {wizardAdapter && (
        <AdapterSetupWizard
          adapterId={wizardAdapter.id}
          displayName={wizardAdapter.displayName}
          readiness={wizardAdapter.readiness ?? {
            adapterId: wizardAdapter.id,
            installed: false,
            version: null,
            blockers: [{ kind: 'not_installed', message: 'Not installed', fixUrl: wizardAdapter.installUrl ?? undefined }],
            checkedAt: Date.now(),
          }}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={() => void handleWizardComplete()}
        />
      )}

    </div>
  )
}

function UsageBar({ label, used, limit, resetsAt }: { label: string; used: number; limit: number; resetsAt: string }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between">
        <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
        <span>{used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-1 mt-0.5 rounded bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full ${pct >= 80 ? 'bg-amber-500' : 'bg-neutral-900 dark:bg-neutral-100'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
        Resets {new Date(resetsAt).toLocaleString()}
      </div>
    </div>
  )
}

function Section({ title, subtitle, children, highlight }: { title: string; subtitle?: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <section className={`mb-8${highlight ? ' rounded-xl border-2 border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-4 -mx-4' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {highlight && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
            Setup required
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">{subtitle}</p>}
      {children}
    </section>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent
        transition-colors duration-150 focus:outline-none
        ${checked ? 'bg-neutral-900 dark:bg-neutral-100' : 'bg-neutral-200 dark:bg-neutral-700'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full bg-white dark:bg-neutral-900 shadow
          ring-0 transition-transform duration-150
          ${checked ? 'translate-x-4' : 'translate-x-0'}
        `}
      />
    </div>
  )
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</label>
        {action}
      </div>
      {children}
    </div>
  )
}
