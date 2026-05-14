import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const MOD = navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl'

const SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: [`${MOD}+N`], description: 'New card in the selected tray' },
  { keys: [`${MOD}+,`], description: 'Open Settings' },
  { keys: [`${MOD}+K`], description: 'Command palette — jump to a step' },
  { keys: [`${MOD}+/`], description: 'Show this shortcut reference' },
  { keys: ['Space'], description: 'Mark focused card ready (when a card is open)' },
  { keys: ['Esc'], description: 'Close the active dialog' },
]

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Kbd>{MOD}+/</Kbd> at any time to bring this list back up.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 mt-2">
          {SHORTCUTS.map((s) => (
            <li key={s.keys.join('+')} className="flex items-center justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-900 last:border-0">
              <span className="text-xs text-neutral-700 dark:text-neutral-300">{s.description}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k) => <Kbd key={k}>{k}</Kbd>)}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="
      inline-flex items-center justify-center
      min-w-[24px] h-[22px] px-1.5
      rounded border border-neutral-200 dark:border-neutral-800
      bg-neutral-50 dark:bg-neutral-900
      text-[10px] font-mono text-neutral-700 dark:text-neutral-300
    ">{children}</kbd>
  )
}
