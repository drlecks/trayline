import { useEffect, useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useThemeStore } from '@/stores/theme-store'
import { useProjectStore } from '@/stores/project-store'
import type { Settings } from '../../../shared/types'

interface AdapterEntry {
  id: string
  displayName: string
  installed: boolean
  version: string | null
}

export default function SettingsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const { theme, setTheme } = useThemeStore()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [adapters, setAdapters] = useState<AdapterEntry[]>([])

  useEffect(() => {
    window.trayline.settings.get().then(setSettings)
    ;(async () => {
      const list = await window.trayline.adapters.list()
      const detailed: AdapterEntry[] = await Promise.all(
        list.map(async (a) => {
          const det = await window.trayline.adapters.detect(a.id)
          return { ...a, installed: det.installed, version: det.version }
        }),
      )
      setAdapters(detailed)
    })()
  }, [])

  async function setAdapter(id: string) {
    const next = await window.trayline.settings.set('defaultAdapterId', id)
    setSettings(next)
  }

  if (!settings) return null

  return (
    <div className="flex flex-col w-full max-w-2xl mx-auto px-8 py-8">
      <button
        onClick={() => setScreen('splash')}
        className="self-start flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-6"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back
      </button>

      <h1 className="text-xl font-semibold tracking-tight mb-1">Settings</h1>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-8">General preferences for the app.</p>

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

      {/* AI adapter */}
      <Section title="AI agent" subtitle="Which CLI agent runs your workers.">
        <div className="flex flex-col gap-2">
          {adapters.map((a) => (
            <button
              key={a.id}
              onClick={() => setAdapter(a.id)}
              className={`
                flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left
                ${settings.defaultAdapterId === a.id
                  ? 'border-neutral-900 dark:border-neutral-100'
                  : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
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
              </div>
              {settings.defaultAdapterId === a.id && (
                <Check size={14} strokeWidth={2} className="text-neutral-900 dark:text-neutral-100" />
              )}
            </button>
          ))}
        </div>
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm font-medium mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-3">{subtitle}</p>}
      {children}
    </section>
  )
}
