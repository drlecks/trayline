import { useCallback, useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta } from '../../../shared/types'

export default function ConfigTab({ step }: { step: StepMeta }) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)
  const setSelectedStepId = useProjectStore((s) => s.setSelectedStepId)

  const [name, setName] = useState(step.name)
  const [description, setDescription] = useState((step.raw.description as string) ?? '')
  const [approvalMode, setApprovalMode] = useState<'manual' | 'auto'>(
    (step.raw.approval_mode as 'manual' | 'auto') ?? 'manual',
  )
  const [allowManualCreate, setAllowManualCreate] = useState<boolean>(
    (step.raw.allow_manual_create as boolean | undefined) ?? true,
  )
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userEditedRef = useRef(false)

  useEffect(() => {
    userEditedRef.current = false
    setName(step.name)
    setDescription((step.raw.description as string) ?? '')
    setApprovalMode((step.raw.approval_mode as 'manual' | 'auto') ?? 'manual')
    setAllowManualCreate((step.raw.allow_manual_create as boolean | undefined) ?? true)
    setError(null)
  }, [step.id, step.name, step.raw])

  const save = useCallback(async () => {
    if (!active || !workflow) return
    try {
      await window.trayline.step.update({
        project: active.name,
        workflow: workflow.name,
        stepId: step.id,
        patch: { name, description, approval_mode: approvalMode, allow_manual_create: allowManualCreate },
      })
      await refreshSteps()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [active, workflow, step.id, name, description, approvalMode, allowManualCreate, refreshSteps])

  useEffect(() => {
    if (!userEditedRef.current) return
    const timer = setTimeout(() => { void save() }, 500)
    return () => clearTimeout(timer)
  }, [save])

  async function handleDelete() {
    if (!active || !workflow) return
    if (!confirm(`Delete tray "${step.name}"? Cards inside will be lost. This cannot be undone.`)) return
    setDeleteBusy(true); setError(null)
    try {
      await window.trayline.step.delete({
        project: active.name,
        workflow: workflow.name,
        stepId: step.id,
      })
      setSelectedStepId(null)
      await refreshSteps()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setDeleteBusy(false)
    }
  }

  function markEdited() { userEditedRef.current = true }

  const isErrors = step.id === '99-errors'

  return (
    <div className="px-6 py-4 max-w-2xl flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cfg-name" className="text-xs">Name</Label>
        <Input id="cfg-name" value={name} onChange={(e) => { markEdited(); setName(e.target.value) }} disabled={isErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cfg-desc" className="text-xs">Description</Label>
        <Textarea id="cfg-desc" value={description} onChange={(e) => { markEdited(); setDescription(e.target.value) }} rows={3} disabled={isErrors} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Approval mode</Label>
        <div className="flex gap-2">
          {(['manual', 'auto'] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={isErrors}
              onClick={() => { markEdited(); setApprovalMode(m) }}
              className={`
                px-3 py-1.5 rounded-md text-xs capitalize border transition-colors
                ${approvalMode === m
                  ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-50 dark:bg-neutral-900'
                  : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={allowManualCreate}
          onChange={(e) => { markEdited(); setAllowManualCreate(e.target.checked) }}
          disabled={isErrors}
        />
        <span>Allow users to create cards manually in this tray</span>
      </label>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex items-center pt-2">
        <Button size="sm" variant="ghost" onClick={handleDelete} disabled={deleteBusy || isErrors} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40">
          <Trash2 size={13} strokeWidth={1.75} /> Delete tray
        </Button>
      </div>
    </div>
  )
}
