import { useState } from 'react'
import { Inbox, Cpu, Rss, Send } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type StepKind = 'tray' | 'worker' | 'source' | 'outlet'

interface AddStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (kind: StepKind) => void
}

export default function AddStepDialog({ open, onOpenChange, onPick }: AddStepDialogProps) {
  const [hovered, setHovered] = useState<StepKind | null>(null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a step</DialogTitle>
          <DialogDescription>Pick the kind of step to add to this workflow.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            type="button"
            onMouseEnter={() => setHovered('source')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick('source')}
            className="text-left rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 p-4 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <Rss size={16} strokeWidth={1.75} />
            </div>
            <div className="text-sm font-medium">Source</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Fetches new data on a schedule and creates cards.
            </div>
          </button>

          <button
            type="button"
            onMouseEnter={() => setHovered('tray')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick('tray')}
            className="text-left rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 p-4 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-tray-light text-tray flex items-center justify-center mb-3">
              <Inbox size={16} strokeWidth={1.75} />
            </div>
            <div className="text-sm font-medium">Tray</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Holds cards waiting for human review or processing.
            </div>
          </button>

          <button
            type="button"
            onMouseEnter={() => setHovered('worker')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick('worker')}
            className="text-left rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 p-4 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-worker-light text-worker flex items-center justify-center mb-3">
              <Cpu size={16} strokeWidth={1.75} />
            </div>
            <div className="text-sm font-medium">Worker</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Runs an AI agent on cards from the preceding tray.
            </div>
          </button>

          <button
            type="button"
            onMouseEnter={() => setHovered('outlet')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick('outlet')}
            className="text-left rounded-md border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 p-4 transition-colors"
          >
            <div className="w-9 h-9 rounded-md bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3">
              <Send size={16} strokeWidth={1.75} />
            </div>
            <div className="text-sm font-medium">Outlet</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Sends cards to email, Discord, Slack, or an HTTP endpoint.
            </div>
          </button>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
        <div className="sr-only">{hovered}</div>
      </DialogContent>
    </Dialog>
  )
}
