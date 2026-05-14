import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import DynamicForm from '@/components/card/DynamicForm'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta } from '../../../shared/types'
import type { PlanFieldDef } from '../../../shared/workflow-plan'

interface NewCardDialogProps {
  step: StepMeta
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: () => void | Promise<void>
}

export default function NewCardDialog({ step, open, onOpenChange, onCreated }: NewCardDialogProps) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = ((step.raw.input_schema as { fields?: PlanFieldDef[] } | undefined)?.fields) ?? []

  async function handleSubmit(values: Record<string, unknown>) {
    if (!active || !workflow) return
    setSubmitting(true); setError(null)
    try {
      await window.trayline.card.create(active.name, workflow.name, step.id, values)
      await onCreated()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New card · {step.name}</DialogTitle>
          <DialogDescription>Fill in the fields and submit. The card lands in Pending.</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {error && (
            <div className="text-xs text-red-600 dark:text-red-400 mb-3">{error}</div>
          )}
          <DynamicForm
            fields={fields}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            submitting={submitting}
            submitLabel="Create card"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
