import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/stores/project-store'

interface AddTrayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AddTrayDialog({ open, onOpenChange }: AddTrayDialogProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [approvalMode, setApprovalMode] = useState<'manual' | 'auto'>('manual')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setDescription('')
    setApprovalMode('manual')
    setBusy(false)
    setError(null)
  }

  async function handleSubmit() {
    if (!active || !workflow) return
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true); setError(null)
    try {
      const result = await window.trayline.step.addTray({
        project: active.name,
        workflow: workflow.name,
        name: name.trim(),
        description: description.trim(),
        approval_mode: approvalMode,
      })
      await refreshSteps()
      setSelectedStepId(result.id)
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
          <DialogTitle>Add a tray</DialogTitle>
          <DialogDescription>
            A tray holds work items waiting for review or processing.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tray-name" className="text-xs">Name</Label>
            <Input
              id="tray-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Client Intake"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tray-desc" className="text-xs">Description (optional)</Label>
            <Textarea
              id="tray-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What kinds of items land here?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Approval mode</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setApprovalMode('manual')}
                className={`flex-1 px-3 py-2 rounded-md border text-left text-xs ${
                  approvalMode === 'manual'
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="font-medium">Manual</div>
                <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">A person must mark each card ready before it moves on.</div>
              </button>
              <button
                type="button"
                onClick={() => setApprovalMode('auto')}
                className={`flex-1 px-3 py-2 rounded-md border text-left text-xs ${
                  approvalMode === 'auto'
                    ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                    : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="font-medium">Auto</div>
                <div className="text-neutral-500 dark:text-neutral-400 mt-0.5">Cards advance automatically as soon as they arrive.</div>
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => { reset(); onOpenChange(false) }} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Adding…' : 'Add tray'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
