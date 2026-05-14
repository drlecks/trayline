import { useState } from 'react'
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SecurityFinding, ImportProjectSummary } from '../../../shared/types'

const CATEGORY_LABELS: Record<string, string> = {
  suspicious_file: 'Unexpected file',
  exfiltration: 'Exfiltration',
  system_access: 'System access',
  obfuscation: 'Obfuscation',
  prompt_injection: 'Prompt injection',
}

function FindingRow({ f }: { f: SecurityFinding }) {
  return (
    <div className={`
      flex gap-2.5 px-3 py-2 rounded-md border
      ${f.severity === 'critical'
        ? 'border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/30'
        : 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30'}
    `}>
      <div className="mt-0.5 shrink-0">
        {f.severity === 'critical'
          ? <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-red-600 text-white">CRITICAL</span>
          : <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-amber-500 text-white">WARNING</span>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-xs font-medium ${f.severity === 'critical' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {CATEGORY_LABELS[f.category] ?? f.category}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500 truncate">
            {f.file}
          </span>
        </div>
        <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{f.description}</p>
        {f.match && (
          <code className="mt-1 block text-[11px] font-mono text-neutral-500 dark:text-neutral-400 truncate">
            {f.match}
          </code>
        )}
      </div>
    </div>
  )
}

interface ImportSecurityAuditDialogProps {
  token: string
  projectName: string
  securityFindings: SecurityFinding[]
  projectSummary: ImportProjectSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommit: (token: string) => Promise<void>
  onAbort: (token: string) => void
}

export default function ImportSecurityAuditDialog({
  token,
  projectName,
  securityFindings,
  projectSummary,
  open,
  onOpenChange,
  onCommit,
  onAbort,
}: ImportSecurityAuditDialogProps) {
  const [busy, setBusy] = useState(false)
  const [showPreviews, setShowPreviews] = useState(false)

  const criticals = securityFindings.filter((f) => f.severity === 'critical')
  const warnings = securityFindings.filter((f) => f.severity === 'warning')

  const hasCriticals = criticals.length > 0

  async function handleImportAnyway() {
    setBusy(true)
    try {
      await onCommit(token)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  function handleCancel() {
    onAbort(token)
    onOpenChange(false)
  }

  const summaryLine = [
    projectSummary.trays > 0 && `${projectSummary.trays} tray${projectSummary.trays !== 1 ? 's' : ''}`,
    projectSummary.workers > 0 && `${projectSummary.workers} worker${projectSummary.workers !== 1 ? 's' : ''}`,
    projectSummary.skillsRequired.length > 0 && `${projectSummary.skillsRequired.length} skill${projectSummary.skillsRequired.length !== 1 ? 's' : ''} required`,
  ].filter(Boolean).join(' · ')

  const findingsSummary = [
    criticals.length > 0 && `${criticals.length} critical`,
    warnings.length > 0 && `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`,
  ].filter(Boolean).join(', ')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !busy) handleCancel() }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert
              size={18}
              strokeWidth={1.75}
              className={hasCriticals ? 'text-red-600 dark:text-red-400' : 'text-amber-500 dark:text-amber-400'}
            />
            <DialogTitle>Security review</DialogTitle>
          </div>
          <DialogDescription>
            We scanned <strong className="text-neutral-700 dark:text-neutral-200">"{projectName}"</strong> before importing.
            {' '}{findingsSummary} found — review before proceeding.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-1">
          {/* Project summary */}
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 px-3 py-2.5">
            <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">Project</div>
            <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{projectSummary.displayName || projectName}</div>
            {projectSummary.description && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{projectSummary.description}</div>
            )}
            {summaryLine && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{summaryLine}</div>
            )}
            {projectSummary.workerPreviews.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPreviews((v) => !v)}
                className="mt-2 flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
              >
                {showPreviews ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                {showPreviews ? 'Hide' : 'Show'} AI instructions
              </button>
            )}
            {showPreviews && projectSummary.workerPreviews.map((wp) => (
              <div key={wp.name} className="mt-2 border-t border-neutral-200 dark:border-neutral-800 pt-2">
                <div className="text-xs font-medium text-neutral-600 dark:text-neutral-400 mb-0.5">{wp.name}</div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed line-clamp-4 whitespace-pre-wrap">{wp.excerpt}</p>
              </div>
            ))}
          </div>

          {/* Findings */}
          <div>
            <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
              Findings ({securityFindings.length})
            </div>
            <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-0.5">
              {criticals.map((f, i) => <FindingRow key={`c${i}`} f={f} />)}
              {warnings.map((f, i) => <FindingRow key={`w${i}`} f={f} />)}
            </div>
          </div>

          {/* Bottom warning */}
          <div className={`
            flex gap-2 rounded-lg border px-3 py-2
            ${hasCriticals
              ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40'}
          `}>
            <AlertTriangle
              size={13}
              strokeWidth={1.75}
              className={`shrink-0 mt-0.5 ${hasCriticals ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}
            />
            <p className={`text-xs leading-relaxed ${hasCriticals ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
              {hasCriticals
                ? 'Critical issues were found. Importing this project could compromise your system or expose your data. Only continue if you trust the source.'
                : 'Review the warnings above carefully. If you trust the source and understand the risks, you may continue.'}
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={busy}>
            Cancel import
          </Button>
          <Button
            size="sm"
            onClick={handleImportAnyway}
            disabled={busy}
            className={hasCriticals ? 'bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800' : ''}
          >
            {busy ? 'Importing…' : `Import anyway (${securityFindings.length} issue${securityFindings.length !== 1 ? 's' : ''})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
