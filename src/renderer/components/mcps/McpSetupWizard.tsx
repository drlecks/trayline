import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { McpManifest } from '../../../shared/types'

// ── Internal step model (derived from manifest, not declared in mcp.json) ─────

type InternalStep =
  | { kind: 'info' }
  | { kind: 'credential'; id: string; label: string; description?: string; masked: boolean }
  | { kind: 'test_connection' }

function buildSteps(manifest: McpManifest): InternalStep[] {
  const steps: InternalStep[] = []
  if (manifest.instructions) steps.push({ kind: 'info' })
  for (const cred of manifest.credentials_schema) {
    steps.push({
      kind: 'credential',
      id: cred.id,
      label: cred.label,
      description: cred.description,
      masked: cred.kind === 'api_key',
    })
  }
  if (manifest.has_test) steps.push({ kind: 'test_connection' })
  return steps
}

// ── Step renderers ────────────────────────────────────────────────────────────

function InfoStep({ instructions }: { instructions: string }) {
  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-line">
      {instructions}
    </p>
  )
}

function CredentialStep({
  step,
  value,
  onChange,
}: {
  step: Extract<InternalStep, { kind: 'credential' }>
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="flex flex-col gap-3">
      {step.description && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed whitespace-pre-line">
          {step.description}
        </p>
      )}
      <input
        ref={ref}
        type={step.masked ? 'password' : 'text'}
        className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-neutral-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={step.masked ? '••••••••••••' : `Enter ${step.label.toLowerCase()}…`}
        autoComplete={step.masked ? 'new-password' : 'off'}
      />
    </div>
  )
}

type TestPhase = 'running' | 'ok' | 'error'

function TestConnectionStep({
  phase,
  testError,
  onRetry,
}: {
  phase: TestPhase
  testError: string | null
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center justify-center">
      {phase === 'running' && (
        <>
          <Loader2 size={22} strokeWidth={1.75} className="animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Testing connection…</p>
        </>
      )}
      {phase === 'ok' && (
        <>
          <Check size={22} strokeWidth={2.5} className="text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            Connection verified!
          </p>
        </>
      )}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-3 w-full">
          <p className="text-xs text-red-600 dark:text-red-400 max-w-xs break-words">
            {testError ?? 'Connection test failed.'}
          </p>
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        </div>
      )}
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────

export interface McpSetupWizardProps {
  manifest: McpManifest
  open: boolean
  onOpenChange: (o: boolean) => void
  onComplete: () => void
}

export default function McpSetupWizard({
  manifest,
  open,
  onOpenChange,
  onComplete,
}: McpSetupWizardProps) {
  const steps = buildSteps(manifest)
  const [stepIdx, setStepIdx] = useState(0)
  const [fieldValue, setFieldValue] = useState('')
  const [collected, setCollected] = useState<Record<string, string>>({})
  const [testPhase, setTestPhase] = useState<TestPhase>('running')
  const [testError, setTestError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const step = steps[stepIdx] as InternalStep | undefined
  const isFirst = stepIdx === 0
  const isLast = stepIdx === steps.length - 1

  // Reset all state when the dialog opens.
  useEffect(() => {
    if (!open) return
    setStepIdx(0)
    setFieldValue('')
    setCollected({})
    setTestPhase('running')
    setTestError(null)
    setFieldError(null)
    setBusy(false)
  }, [open])

  // When step changes: prefill input from collected; auto-run test.
  useEffect(() => {
    if (!step) return
    setFieldError(null)
    if (step.kind === 'credential') {
      setFieldValue(collected[step.id] ?? '')
    }
    if (step.kind === 'test_connection') {
      setTestPhase('running')
      setTestError(null)
      void runTest()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx])

  // Commit all in-memory credentials to the OS keychain before test step.
  async function commitCollected(col: Record<string, string>) {
    for (const [credId, value] of Object.entries(col)) {
      await window.trayline.mcp.saveCredential(manifest.id, credId, value)
    }
  }

  async function advanceTo(nextIdx: number, currentCollected: Record<string, string>) {
    const nextStep = steps[nextIdx] as InternalStep | undefined
    if (nextStep?.kind === 'test_connection') {
      setBusy(true)
      try {
        await commitCollected(currentCollected)
      } catch (e) {
        setFieldError(e instanceof Error ? e.message : String(e))
        setBusy(false)
        return
      }
      setBusy(false)
    }
    setStepIdx(nextIdx)
  }

  async function handleNext() {
    if (!step) return
    setFieldError(null)

    if (step.kind === 'info') {
      if (isLast) { await handleFinish(collected); return }
      await advanceTo(stepIdx + 1, collected)
      return
    }

    if (step.kind === 'credential') {
      if (!fieldValue.trim()) { setFieldError('This field is required.'); return }
      const next = { ...collected, [step.id]: fieldValue }
      setCollected(next)
      if (isLast) { await handleFinish(next); return }
      await advanceTo(stepIdx + 1, next)
      return
    }
  }

  async function handleFinish(col: Record<string, string>) {
    setBusy(true)
    setFieldError(null)
    try {
      await commitCollected(col)
      await window.trayline.mcp.writeStatus(manifest.id, { configured: true })
      onComplete()
      onOpenChange(false)
    } catch (e) {
      setFieldError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  function handleBack() {
    setFieldError(null)
    setStepIdx((i) => Math.max(0, i - 1))
  }

  async function handleCancel() {
    await window.trayline.mcp.deleteCredentials(manifest.id).catch(() => {})
    onOpenChange(false)
  }

  async function runTest() {
    setTestPhase('running')
    setTestError(null)
    try {
      const result = await window.trayline.mcp.testConnection(manifest.id)
      if (result.ok) {
        setTestPhase('ok')
        await window.trayline.mcp.writeStatus(manifest.id, {
          configured: true,
          health: 'ok',
          healthCheckedAt: new Date().toISOString(),
        })
        setTimeout(() => { onComplete(); onOpenChange(false) }, 1200)
      } else {
        setTestPhase('error')
        setTestError(result.error ?? 'Connection test failed.')
      }
    } catch (e) {
      setTestPhase('error')
      setTestError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!step || steps.length === 0) return null

  const stepTitle =
    step.kind === 'info' ? 'Setup instructions' :
    step.kind === 'credential' ? step.label :
    'Verifying connection…'

  const canNext =
    step.kind === 'info' ||
    (step.kind === 'credential' && fieldValue.trim().length > 0)

  const showNextButton = step.kind !== 'test_connection'
  const showBack = !isFirst && step.kind !== 'test_connection'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) void handleCancel() }}>
      <DialogContent className="max-w-md p-0 overflow-hidden flex flex-col gap-0">
        {/* Progress bar */}
        <div className="h-0.5 bg-neutral-100 dark:bg-neutral-800 shrink-0">
          <div
            className="h-full bg-neutral-800 dark:bg-neutral-200 transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="p-6 flex flex-col gap-5">
          <DialogHeader>
            <p className="text-[11px] text-neutral-400 dark:text-neutral-600">
              {manifest.name} · Step {stepIdx + 1} of {steps.length}
            </p>
            <DialogTitle className="text-base">{stepTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              Setup wizard for {manifest.name}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-[100px]">
            {step.kind === 'info' && manifest.instructions && (
              <InfoStep instructions={manifest.instructions} />
            )}
            {step.kind === 'credential' && (
              <CredentialStep step={step} value={fieldValue} onChange={setFieldValue} />
            )}
            {step.kind === 'test_connection' && (
              <TestConnectionStep
                phase={testPhase}
                testError={testError}
                onRetry={() => void runTest()}
              />
            )}
          </div>

          {fieldError && (
            <p className="text-xs text-red-600 dark:text-red-400 -mt-2">{fieldError}</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
            <div>
              {showBack && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleBack}
                  disabled={busy}
                  className="gap-1"
                >
                  <ArrowLeft size={13} strokeWidth={2} />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleCancel()}
                disabled={busy}
              >
                Cancel
              </Button>
              {showNextButton && (
                <Button
                  size="sm"
                  onClick={() => void handleNext()}
                  disabled={!canNext || busy}
                >
                  {isLast ? 'Finish' : 'Next →'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
