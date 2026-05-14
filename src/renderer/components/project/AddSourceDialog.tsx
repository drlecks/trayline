import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import SchedulePicker from '@/components/shared/SchedulePicker'
import { useProjectStore } from '@/stores/project-store'

interface AddSourceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function AddSourceDialog({ open, onOpenChange }: AddSourceDialogProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)

  const [name, setName] = useState('')
  const [scheduleCron, setScheduleCron] = useState('0 * * * *')
  const [dedupKey, setDedupKey] = useState('id')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setName('')
    setScheduleCron('0 * * * *')
    setDedupKey('id')
    setBusy(false)
    setError(null)
  }

  async function handleSubmit() {
    if (!active || !workflow) return
    if (!name.trim()) { setError('Name is required'); return }
    setBusy(true); setError(null)
    try {
      const result = await window.trayline.source.create({
        project: active.name,
        workflow: workflow.name,
        name: name.trim(),
        schedule_cron: scheduleCron,
        dedup_key: dedupKey.trim() || 'id',
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
          <DialogTitle>Add a source</DialogTitle>
          <DialogDescription>
            A source fetches new items on a schedule and creates cards automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-name" className="text-xs">Name</Label>
            <Input
              id="source-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. New Support Tickets"
              autoFocus
            />
          </div>

          <SchedulePicker
            label="Schedule"
            value={scheduleCron}
            onChange={setScheduleCron}
          />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-dedup" className="text-xs">Dedup key</Label>
            <Input
              id="source-dedup"
              value={dedupKey}
              onChange={(e) => setDedupKey(e.target.value)}
              placeholder="id"
              className="font-mono text-sm"
            />
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              The JSON field used to identify unique items. Duplicate IDs are never re-created as cards.
            </p>
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
            {busy ? 'Adding…' : 'Add source'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
