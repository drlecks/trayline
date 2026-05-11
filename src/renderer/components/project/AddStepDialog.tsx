import { useState } from 'react'
import { Inbox, Cpu } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AddStepDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (kind: 'tray' | 'worker') => void
}

export default function AddStepDialog({ open, onOpenChange, onPick }: AddStepDialogProps) {
  const [hovered, setHovered] = useState<'tray' | 'worker' | null>(null)

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
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
        {/* Hovered hint slot (currently unused but keeps the layout stable) */}
        <div className="sr-only">{hovered}</div>
      </DialogContent>
    </Dialog>
  )
}
