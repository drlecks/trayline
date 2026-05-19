import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ExportProjectDialogProps {
  projectName: string
  displayName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ExportProjectDialog({
  projectName,
  displayName,
  open,
  onOpenChange,
}: ExportProjectDialogProps) {
  const [includeCards, setIncludeCards] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setIncludeCards(false)
    setBusy(false)
    setError(null)
  }

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      const result = await window.trayline.project.export(projectName, { includeCards })
      if ('canceled' in result) return
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export "{displayName}"</DialogTitle>
          <DialogDescription>
            Saves a .zip file you can share or import on another machine.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          {/* Privacy warning */}
          <div className="flex gap-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2.5">
            <AlertTriangle size={14} strokeWidth={1.75} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              This export includes your workflow configuration — step names, AI prompts, and process
              instructions. Review the contents for any personal or sensitive information before sharing.
            </p>
          </div>

          {/* Include cards option */}
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={includeCards}
                onChange={(e) => setIncludeCards(e.target.checked)}
                className="sr-only"
              />
              <div
                onClick={() => setIncludeCards((v) => !v)}
                className={`
                  w-4 h-4 rounded border flex items-center justify-center transition-colors
                  ${includeCards
                    ? 'bg-neutral-900 dark:bg-neutral-100 border-neutral-900 dark:border-neutral-100'
                    : 'border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950'}
                `}
              >
                {includeCards && (
                  <svg className="w-2.5 h-2.5 text-white dark:text-neutral-900" fill="none" viewBox="0 0 12 12">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Include cards</span>
              <span className="text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
                Adds pending, ready, and archived cards from all steps. Run history is never included.
              </span>
            </div>
          </label>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false) }} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
