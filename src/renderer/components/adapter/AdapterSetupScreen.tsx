import { useState } from 'react'
import { ExternalLink, RefreshCw, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdapterStore } from '@/stores/adapter-store'
import AdapterSetupWizard from './AdapterSetupWizard'
import type { AdapterReadiness } from '../../../shared/types'

interface AdapterCard {
  id: string
  displayName: string
  installUrl: string | null
  kind: 'production' | 'mock'
}

/**
 * Full-window gate shown when no production AI adapter is installed.
 * Replaces the entire app UI until at least one adapter is ready.
 */
export default function AdapterSetupScreen({ onReady }: { onReady: () => void }) {
  const readiness = useAdapterStore((s) => s.readiness)
  const setReadiness = useAdapterStore((s) => s.setReadiness)

  const [adapters, setAdapters] = useState<AdapterCard[]>([])
  const [wizardAdapter, setWizardAdapter] = useState<AdapterCard | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [recheckingId, setRecheckingId] = useState<string | null>(null)

  // Load adapter list once on mount
  useState(() => {
    void (async () => {
      const list = await window.trayline.adapters.list()
      setAdapters(list.filter((a) => a.kind === 'production'))
    })()
  })

  async function recheck(adapter: AdapterCard) {
    setRecheckingId(adapter.id)
    try {
      const r = await window.trayline.adapter.recheck(adapter.id)
      setReadiness(adapter.id, r)
      if (r.installed) {
        onReady()
      }
    } finally {
      setRecheckingId(null)
    }
  }

  function openWizard(adapter: AdapterCard) {
    setWizardAdapter(adapter)
    setWizardOpen(true)
  }

  function getReadiness(adapterId: string): AdapterReadiness | null {
    return readiness[adapterId] ?? null
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-md flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-100 dark:bg-neutral-800">
            <Zap size={18} strokeWidth={1.75} className="text-neutral-600 dark:text-neutral-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Connect your AI</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 leading-snug">
              Trayline needs an AI agent to run your workflows.
              Install one of the providers below, then click <strong>Check again</strong>.
            </p>
          </div>
        </div>

        {/* Adapter cards */}
        <div className="flex flex-col gap-2">
          {adapters.map((adapter) => {
            const r = getReadiness(adapter.id)
            const checking = recheckingId === adapter.id

            return (
              <div
                key={adapter.id}
                className="flex flex-col gap-2.5 rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-3.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{adapter.displayName}</p>
                    {r?.version && (
                      <p className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 mt-0.5">{r.version}</p>
                    )}
                  </div>
                  {adapter.installUrl && (
                    <a
                      href={adapter.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400 hover:underline shrink-0 mt-0.5"
                    >
                      Install guide <ExternalLink size={10} strokeWidth={2} />
                    </a>
                  )}
                </div>

                {r?.blockers[0]?.fixCommand && (
                  <code className="text-[11px] font-mono bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded px-2.5 py-1.5 text-neutral-600 dark:text-neutral-400">
                    {r.blockers[0].fixCommand}
                  </code>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void recheck(adapter)}
                    disabled={checking}
                    className="flex-1"
                  >
                    {checking
                      ? <><RefreshCw size={12} strokeWidth={2} className="animate-spin mr-1.5" /> Checking…</>
                      : <><RefreshCw size={12} strokeWidth={2} className="mr-1.5" /> Check again</>
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openWizard(adapter)}
                    className="text-xs"
                  >
                    Setup guide
                  </Button>
                </div>
              </div>
            )
          })}

          {adapters.length === 0 && (
            <p className="text-xs text-neutral-400 text-center py-4">Loading…</p>
          )}
        </div>
      </div>

      {/* Setup wizard modal */}
      {wizardAdapter && (
        <AdapterSetupWizard
          adapterId={wizardAdapter.id}
          displayName={wizardAdapter.displayName}
          readiness={getReadiness(wizardAdapter.id) ?? {
            adapterId: wizardAdapter.id,
            installed: false,
            version: null,
            blockers: [{ kind: 'not_installed', message: 'Not installed', fixUrl: wizardAdapter.installUrl ?? undefined }],
            checkedAt: Date.now(),
          }}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={onReady}
        />
      )}
    </div>
  )
}
