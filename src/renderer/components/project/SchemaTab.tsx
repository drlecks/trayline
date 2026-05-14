import { useEffect, useState } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta } from '../../../shared/types'
import type { PlanFieldDef } from '../../../shared/workflow-plan'

type FieldType = PlanFieldDef['type']

const FIELD_TYPES: { id: FieldType; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'textarea', label: 'Long text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'select', label: 'Select' },
  { id: 'file', label: 'File' },
  { id: 'checkbox', label: 'Checkbox' },
]

function slugId(label: string, existing: string[]): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
  let id = base, n = 2
  while (existing.includes(id)) id = `${base}_${n++}`
  return id
}

export default function SchemaTab({ step }: { step: StepMeta }) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const refreshSteps = useProjectStore((s) => s.refreshSteps)

  const initialFields = (step.raw.input_schema as { fields?: PlanFieldDef[] } | undefined)?.fields ?? []
  const [fields, setFields] = useState<PlanFieldDef[]>(initialFields)
  const [busy, setBusy] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // Resync when the step changes
  useEffect(() => {
    setFields((step.raw.input_schema as { fields?: PlanFieldDef[] } | undefined)?.fields ?? [])
    setDirty(false)
    setSavedAt(null)
    setError(null)
  }, [step.id, step.raw])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active: a, over } = event
    if (!over || a.id === over.id) return
    setFields((items) => {
      const oldIdx = items.findIndex((f) => f.id === a.id)
      const newIdx = items.findIndex((f) => f.id === over.id)
      if (oldIdx === -1 || newIdx === -1) return items
      return arrayMove(items, oldIdx, newIdx)
    })
    setDirty(true)
  }

  function addField(type: FieldType) {
    const id = slugId(type, fields.map((f) => f.id))
    const f: PlanFieldDef = {
      id,
      label: typeLabel(type),
      type,
      required: false,
      ...(type === 'select' ? { options: ['Option 1', 'Option 2'] } : {}),
    }
    setFields([...fields, f])
    setDirty(true)
  }

  function updateField(idx: number, patch: Partial<PlanFieldDef>) {
    setFields((items) => items.map((f, i) => i === idx ? { ...f, ...patch } : f))
    setDirty(true)
  }

  function removeField(idx: number) {
    setFields((items) => items.filter((_, i) => i !== idx))
    setDirty(true)
  }

  async function save() {
    if (!active || !workflow) return
    setBusy(true); setError(null)
    try {
      await window.trayline.step.update({
        project: active.name,
        workflow: workflow.name,
        stepId: step.id,
        patch: { input_schema: { fields } },
      })
      await refreshSteps()
      setSavedAt(new Date().toLocaleTimeString())
      setDirty(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-6 py-4 max-w-3xl flex flex-col gap-4">
      <div className="text-xs text-neutral-500 dark:text-neutral-400">
        Define the fields each card in this tray collects. Drag the handle on the left to reorder.
      </div>

      {fields.length === 0 ? (
        <div className="text-sm text-neutral-400 italic py-6 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-md">
          No fields yet. Add one below to get started.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {fields.map((f, i) => (
                <SortableFieldRow
                  key={f.id}
                  field={f}
                  onPatch={(patch) => updateField(i, patch)}
                  onRemove={() => removeField(i)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add field */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-black/[0.06] dark:border-white/[0.06]">
        <span className="text-xs text-neutral-500 dark:text-neutral-400 self-center mr-1">Add field:</span>
        {FIELD_TYPES.map((t) => (
          <Button key={t.id} size="sm" variant="outline" onClick={() => addField(t.id)}>
            <Plus size={11} strokeWidth={1.75} /> {t.label}
          </Button>
        ))}
      </div>

      {error && (
        <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        {savedAt && !dirty && <span className="text-[11px] text-neutral-500">Saved at {savedAt}</span>}
        {dirty && <span className="text-[11px] text-amber-600 dark:text-amber-400">Unsaved changes</span>}
        <Button size="sm" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save schema'}
        </Button>
      </div>
    </div>
  )
}

function SortableFieldRow({
  field,
  onPatch,
  onRemove,
}: {
  field: PlanFieldDef
  onPatch: (patch: Partial<PlanFieldDef>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="
        flex flex-col gap-2 p-3 rounded-md border border-neutral-200 dark:border-neutral-800
        bg-white dark:bg-neutral-950
      "
    >
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
          title="Drag to reorder"
        >
          <GripVertical size={14} strokeWidth={1.75} />
        </button>
        <span className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400 font-medium">
          {typeLabel(field.type)}
        </span>
        <span className="text-[11px] text-neutral-400 font-mono">{field.id}</span>
        <div className="flex-1" />
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={field.required ?? false}
            onChange={(e) => onPatch({ required: e.target.checked })}
          />
          Required
        </label>
        <button
          onClick={onRemove}
          className="p-1 text-neutral-400 hover:text-red-600"
          title="Remove field"
        >
          <Trash2 size={12} strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-6">
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-neutral-500">Label</Label>
          <Input value={field.label} onChange={(e) => onPatch({ label: e.target.value })} className="h-8 text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[11px] text-neutral-500">Help text (optional)</Label>
          <Input value={field.help ?? ''} onChange={(e) => onPatch({ help: e.target.value })} className="h-8 text-xs" />
        </div>

        {field.type === 'select' && (
          <div className="flex flex-col gap-1 sm:col-span-2">
            <Label className="text-[11px] text-neutral-500">Options (one per line)</Label>
            <textarea
              value={(field.options ?? []).join('\n')}
              onChange={(e) => onPatch({ options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              rows={3}
              className="text-xs font-mono px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
            />
          </div>
        )}
      </div>
    </div>
  )
}

function typeLabel(t: FieldType): string {
  return FIELD_TYPES.find((x) => x.id === t)?.label ?? t
}
