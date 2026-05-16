import { useEffect, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, RefreshCw, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAdapterStore } from '@/stores/adapter-store'
import type { AdapterReadiness } from '../../../shared/types'

// ── Internal step model ───────────────────────────────────────────────────────

type InternalStep =
  | { kind: 'install'; blocker: AdapterReadiness['blockers'][0] }
  | { kind: 'done' }

function buildSteps(readiness: AdapterReadiness): InternalStep[] {
  const notInstalled = readiness.blockers.find((b: AdapterReadiness['blockers'][0]) => b.kind === 'not_installed')
  if (notInstalled) return [{ kind: 'install', blocker: notInstalled }, { kind: 'done' }]
  return [{ kind: 'done' }]
}

// ── Step renderers ────────────────────────────────────────────────────────────

function InstallStep({
  adapterId,
  displayName,
  blocker,
  onInstalled,
}: {
  adapterId: string
  displayName: string
  blocker: AdapterReadiness['blockers'][0]
  onInstalled: (r: AdapterReadiness) => void
}) {
  const [checking, setChecking] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const setReadiness = useAdapterStore((s) => s.setReadiness)

  async function handleCheck() {
    setChecking(true)
    setNotFound(false)
    try {
      const r = await window.trayline.adapter.recheck(adapterId)
      setReadiness(adapterId, r)
      if (r.installed) {
        onInstalled(r)
      } else {
        setNotFound(true)
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
        {displayName} is not detected on this machine.
        Install it first, then come back and click <strong>Check again</strong>.
      </p>

      {blocker.fixCommand && (
        <div className="flex items-start gap-2 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5">
          <Terminal size={13} strokeWidth={1.75} className="text-neutral-400 shrink-0 mt-0.5" />
          <code className="text-xs font-mono text-neutral-700 dark:text-neutral-300 break-all">
            {blocker.fixCommand}
          </code>
        </div>
      )}

      {blocker.fixUrl && (
        <a
          href={blocker.fixUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline w-fit"
        >
          Open install guide <ExternalLink size={11} strokeWidth={2} />
        </a>
      )}

      {notFound && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {displayName} still not detected. Make sure the install completed and your terminal is up to date.
        </p>
      )}

      <Button
        size="sm"
        variant="outline"
        onClick={() => void handleCheck()}
        disabled={checking}
        className="self-start"
      >
        {checking
          ? <><RefreshCw size={13} strokeWidth={2} className="animate-spin mr-1.5" /> Checking…</>
          : <><RefreshCw size={13} strokeWidth={2} className="mr-1.5" /> Check again</>
        }
      </Button>
    </div>
  )
}

function DoneStep({ displayName }: { displayName: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Check size={22} strokeWidth={2.5} className="text-green-600 dark:text-green-400" />
      <p className="text-sm text-green-700 dark:text-green-400 font-medium">
        {displayName} is installed and ready.
      </p>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export interface AdapterSetupWizardProps {
  adapterId: string
  displayName: string
  readiness: AdapterReadiness
  open: boolean
  onOpenChange: (o: boolean) => void
  onComplete: () => void
}

export default function AdapterSetupWizard({
  adapterId,
  displayName,
  readiness,
  open,
  onOpenChange,
  onComplete,
}: AdapterSetupWizardProps) {
  const [currentReadiness, setCurrentReadiness] = useState(readiness)
  const steps = buildSteps(currentReadiness)
  const [stepIdx, setStepIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setCurrentReadiness(readiness)
    setStepIdx(0)
  }, [open, readiness])

  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1
  const canGoBack = stepIdx > 0

  function handleInstalled(r: AdapterReadiness) {
    setCurrentReadiness(r)
    setStepIdx(steps.length - 1)
  }

  function handleFinish() {
    onOpenChange(false)
    onComplete()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Set up {displayName}</DialogTitle>
        </DialogHeader>

        {/* Progress dots */}
        {steps.length > 1 && (
          <div className="flex items-center gap-1.5 mb-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i <= stepIdx
                    ? 'w-4 bg-neutral-900 dark:bg-neutral-100'
                    : 'w-1.5 bg-neutral-200 dark:bg-neutral-700'
                }`}
              />
            ))}
          </div>
        )}

        <div className="py-2">
          {step?.kind === 'install' && (
            <InstallStep
              adapterId={adapterId}
              displayName={displayName}
              blocker={step.blocker}
              onInstalled={handleInstalled}
            />
          )}
          {step?.kind === 'done' && <DoneStep displayName={displayName} />}
        </div>

        <div className="flex items-center justify-between pt-1">
          <div>
            {canGoBack && (
              <Button variant="ghost" size="sm" onClick={() => setStepIdx((i) => i - 1)}>
                <ArrowLeft size={13} strokeWidth={2} className="mr-1" /> Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {!isLast && (
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            )}
            {isLast && (
              <Button size="sm" onClick={handleFinish}>
                Done
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
