import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/stores/project-store'

interface AddOutletDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AddOutletDialog({ open, onOpenChange }: AddOutletDialogProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setDescription('')
    setBusy(false)
    setError(null)
  }

  async function handleSubmit() {
    if (!active || !workflow) return
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true); setError(null)
    try {
      const result = await window.trayline.step.addOutlet({
        project: active.name,
        workflow: workflow.name,
        name: name.trim(),
        description: description.trim(),
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
          <DialogTitle>Add an outlet</DialogTitle>
          <DialogDescription>
            An outlet sends each card to an external destination — email, Discord, Slack, or an HTTP endpoint.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outlet-name" className="text-xs">Name</Label>
            <Input
              id="outlet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Send Discord Summary"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outlet-desc" className="text-xs">Description (optional)</Label>
            <Textarea
              id="outlet-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this outlet send and where?"
            />
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
            {busy ? 'Adding…' : 'Add outlet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
