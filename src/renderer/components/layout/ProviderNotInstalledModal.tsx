import { AlertTriangle, ExternalLink } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useProviderGuard } from '@/stores/provider-guard-store'
import { useProjectStore } from '@/stores/project-store'

/**
 * Shown when the user (or any auto-trigger) tries to start a worker run while
 * no production AI CLI is installed on the machine. Lists the curated
 * suggestions returned by `adapters:checkProviderReady` with direct links to
 * their install pages, plus a shortcut into Settings.
 */
export default function ProviderNotInstalledModal() {
  const open = useProviderGuard((s) => s.open)
  const result = useProviderGuard((s) => s.result)
  const close = useProviderGuard((s) => s.close)
  const setScreen = useProjectStore((s) => s.setScreen)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={16} strokeWidth={2} className="text-amber-500" />
            No AI provider installed
          </DialogTitle>
          <DialogDescription>
            Workers need a real AI CLI on this machine before they can run.
            Install one of the providers below, then come back and try again.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 my-2">
          {(result?.suggestions ?? []).map((s) => (
            <a
              key={s.id}
              href={s.installUrl}
              target="_blank"
              rel="noreferrer"
              className="
                flex items-start justify-between gap-3
                rounded-md border border-neutral-200 dark:border-neutral-800
                px-3 py-2.5
                hover:bg-neutral-50 dark:hover:bg-neutral-900
                transition-colors
              "
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{s.displayName}</span>
                  {!s.available && (
                    <span className="text-[10px] uppercase tracking-wide text-neutral-400">coming soon</span>
                  )}
                </div>
                <p className="text-[12px] text-neutral-500 dark:text-neutral-400 mt-0.5">{s.description}</p>
                <p className="text-[11px] text-blue-600 dark:text-blue-400 font-mono mt-1 truncate">{s.installUrl}</p>
              </div>
              <ExternalLink size={14} strokeWidth={2} className="text-neutral-400 shrink-0 mt-0.5" />
            </a>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={close}>Dismiss</Button>
          <Button
            size="sm"
            onClick={() => { close(); setScreen('settings') }}
          >
            Open Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
