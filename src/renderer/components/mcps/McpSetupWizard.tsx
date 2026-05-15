import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, ExternalLink, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { McpManifest, McpSetupStep } from '../../../shared/types'

// ── Step renderers ────────────────────────────────────────────────────────────

function InfoStep({ step }: { step: McpSetupStep }) {
  return (
    <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed whitespace-pre-line">
      {step.body}
    </p>
  )
}

function InputStep({
  step,
  value,
  onChange,
  masked,
}: {
  step: McpSetupStep
  value: string
  onChange: (v: string) => void
  masked?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <div className="flex flex-col gap-3">
      {step.body && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed whitespace-pre-line">
          {step.body}
        </p>
      )}
      <input
        ref={ref}
        type={masked ? 'password' : 'text'}
        className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-neutral-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={masked ? '••••••••••••' : 'Enter value…'}
        autoComplete={masked ? 'new-password' : 'off'}
      />
    </div>
  )
}

function SelectStep({
  step,
  value,
  onChange,
}: {
  step: McpSetupStep
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      {step.body && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{step.body}</p>
      )}
      <select
        className="w-full px-3 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-400"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {(step.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

type OAuthPhase = 'ready' | 'waiting' | 'done' | 'error'

function OAuthStep({
  step,
  phase,
  oauthError,
  onStart,
  onCancel,
}: {
  step: McpSetupStep
  phase: OAuthPhase
  oauthError: string | null
  onStart: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center min-h-[120px] justify-center">
      {phase === 'ready' && (
        <>
          {step.body && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-xs">{step.body}</p>
          )}
          <Button onClick={onStart} className="gap-1.5">
            <ExternalLink size={13} strokeWidth={2} />
            Open browser to authorize
          </Button>
        </>
      )}
      {phase === 'waiting' && (
        <>
          <Loader2 size={22} strokeWidth={1.75} className="animate-spin text-neutral-400" />
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Waiting for you to authorize in your browser…
          </p>
          <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
            <X size={12} strokeWidth={2} />
            Cancel
          </Button>
        </>
      )}
      {phase === 'done' && (
        <>
          <Check size={22} strokeWidth={2.5} className="text-green-600 dark:text-green-400" />
          <p className="text-sm text-green-700 dark:text-green-400 font-medium">
            Authorization successful!
          </p>
        </>
      )}
      {phase === 'error' && (
        <>
          <p className="text-xs text-red-600 dark:text-red-400 max-w-xs break-words">
            {oauthError ?? 'Authorization failed.'}
          </p>
          <Button size="sm" onClick={onStart}>Try again</Button>
        </>
      )}
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
    <div className="flex flex-col items-center gap-4 py-6 text-center min-h-[120px] justify-center">
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
  const steps = manifest.setup_steps
  const [stepIdx, setStepIdx] = useState(0)
  const [fieldValue, setFieldValue] = useState('')
  const [collected, setCollected] = useState<Record<string, string>>({})
  const [oauthPhase, setOauthPhase] = useState<OAuthPhase>('ready')
  const [oauthError, setOauthError] = useState<string | null>(null)
  const [testPhase, setTestPhase] = useState<TestPhase>('running')
  const [testError, setTestError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const step = steps[stepIdx] as McpSetupStep | undefined
  const isFirst = stepIdx === 0
  const isLast = stepIdx === steps.length - 1

  // Reset all state when the dialog opens.
  useEffect(() => {
    if (!open) return
    setStepIdx(0)
    setFieldValue('')
    setCollected({})
    setOauthPhase('ready')
    setOauthError(null)
    setTestPhase('running')
    setTestError(null)
    setFieldError(null)
    setBusy(false)
  }, [open])

  // When stepIdx changes: prefill input from collected; trigger auto-run steps.
  useEffect(() => {
    if (!step) return
    setFieldError(null)
    if (step.type === 'text_field' || step.type === 'api_key' || step.type === 'select') {
      setFieldValue(step.credential_id ? (collected[step.credential_id] ?? '') : '')
    }
    if (step.type === 'oauth') {
      setOauthPhase('ready')
      setOauthError(null)
    }
    if (step.type === 'test_connection') {
      setTestPhase('running')
      setTestError(null)
      void runTest()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx])

  // Commit in-memory credentials to the OS keychain.
  async function commitCollected(col: Record<string, string>) {
    for (const [credId, value] of Object.entries(col)) {
      await window.trayline.mcp.saveCredential(manifest.id, credId, value)
    }
  }

  // Advance to the next step. If the next step needs credentials in keychain, commit first.
  async function doAdvance(currentCollected: Record<string, string>) {
    const nextStep = steps[stepIdx + 1] as McpSetupStep | undefined
    if (nextStep && (nextStep.type === 'oauth' || nextStep.type === 'test_connection')) {
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
    setStepIdx((i) => i + 1)
  }

  async function handleNext() {
    if (!step) return
    setFieldError(null)

    if (step.type === 'info') {
      if (isLast) { await handleFinish(collected); return }
      await doAdvance(collected)
      return
    }

    if (step.type === 'text_field' || step.type === 'api_key') {
      if (!fieldValue.trim()) { setFieldError('This field is required.'); return }
      const credId = step.credential_id!
      const next = { ...collected, [credId]: fieldValue }
      setCollected(next)
      if (isLast) { await handleFinish(next); return }
      await doAdvance(next)
      return
    }

    if (step.type === 'select') {
      if (!fieldValue) { setFieldError('Please select an option.'); return }
      const credId = step.credential_id!
      const next = { ...collected, [credId]: fieldValue }
      setCollected(next)
      if (isLast) { await handleFinish(next); return }
      await doAdvance(next)
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
    // Delete any partial credentials written during this wizard session.
    await window.trayline.mcp.deleteCredentials(manifest.id).catch(() => {})
    // Abort any in-progress OAuth flow.
    await window.trayline.mcp.cancelOAuth(manifest.id).catch(() => {})
    onOpenChange(false)
  }

  async function startOAuth() {
    if (!step || step.type !== 'oauth') return
    setOauthPhase('waiting')
    setOauthError(null)
    try {
      await window.trayline.mcp.startOAuth(
        manifest.id,
        step.credential_id!,
        step.provider!,
        step.scopes ?? [],
        { clientIdKey: step.client_id_key, clientSecretKey: step.client_secret_key },
      )
      setOauthPhase('done')
      setTimeout(async () => {
        if (isLast) { await handleFinish(collected); return }
        await doAdvance(collected)
      }, 1200)
    } catch (e) {
      setOauthPhase('error')
      setOauthError(e instanceof Error ? e.message : String(e))
    }
  }

  function cancelOAuthFlow() {
    void window.trayline.mcp.cancelOAuth(manifest.id)
    setOauthPhase('ready')
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

  if (!step) return null

  const isInputStep = step.type === 'text_field' || step.type === 'api_key' || step.type === 'select'
  const canNext =
    step.type === 'info' ||
    (step.type === 'text_field' && fieldValue.trim().length > 0) ||
    (step.type === 'api_key' && fieldValue.trim().length > 0) ||
    (step.type === 'select' && fieldValue.length > 0)

  const showNextButton = isInputStep || step.type === 'info'
  const nextLabel = isLast ? 'Finish' : 'Next →'

  // Back is never shown on test_connection (user must retry or cancel)
  const showBack = !isFirst && step.type !== 'test_connection'

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
            <DialogTitle className="text-base">{step.title}</DialogTitle>
            <DialogDescription className="sr-only">
              Setup wizard for {manifest.name}
            </DialogDescription>
          </DialogHeader>

          {/* Step content */}
          <div className="min-h-[100px]">
            {step.type === 'info' && <InfoStep step={step} />}
            {step.type === 'text_field' && (
              <InputStep step={step} value={fieldValue} onChange={setFieldValue} />
            )}
            {step.type === 'api_key' && (
              <InputStep step={step} value={fieldValue} onChange={setFieldValue} masked />
            )}
            {step.type === 'select' && (
              <SelectStep step={step} value={fieldValue} onChange={setFieldValue} />
            )}
            {step.type === 'oauth' && (
              <OAuthStep
                step={step}
                phase={oauthPhase}
                oauthError={oauthError}
                onStart={() => void startOAuth()}
                onCancel={cancelOAuthFlow}
              />
            )}
            {step.type === 'test_connection' && (
              <TestConnectionStep
                phase={testPhase}
                testError={testError}
                onRetry={() => void runTest()}
              />
            )}
          </div>

          {/* Field-level error */}
          {fieldError && (
            <p className="text-xs text-red-600 dark:text-red-400 -mt-2">{fieldError}</p>
          )}

          {/* Footer actions */}
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
                  {nextLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
