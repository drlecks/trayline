import { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { PlanFieldDef } from '../../../shared/workflow-plan'

interface DynamicFormProps {
  fields: PlanFieldDef[]
  onSubmit: (values: Record<string, unknown>) => void | Promise<void>
  onCancel?: () => void
  submitting?: boolean
  defaultValues?: Record<string, unknown>
  submitLabel?: string
  /** Optional second submit button rendered next to the primary. */
  secondarySubmit?: {
    label: string
    onSubmit: (values: Record<string, unknown>) => void | Promise<void>
  }
}

function buildZodSchema(fields: PlanFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) {
    let s: z.ZodTypeAny
    switch (f.type) {
      case 'number':
        s = z.coerce.number({ invalid_type_error: 'Must be a number' })
        if (!f.required) s = (s as z.ZodNumber).optional().or(z.literal('').transform(() => undefined))
        break
      case 'checkbox':
        s = z.boolean()
        break
      case 'date':
        s = z.string()
        if (f.required) s = (s as z.ZodString).min(1, 'Required')
        else s = s.optional()
        break
      case 'select':
        s = z.string()
        if (f.required) s = (s as z.ZodString).min(1, 'Required')
        else s = s.optional()
        break
      case 'file':
        // File handling lives outside the form value object — we just accept the
        // filename string here. Phase 3 doesn't actually move files, so this is
        // a placeholder until Phase 10 wires attachments through.
        s = z.array(z.string())
        if (!f.required) s = s.optional()
        break
      case 'text':
      case 'textarea':
      default:
        s = z.string()
        if (f.required) s = (s as z.ZodString).min(1, 'Required')
        else s = s.optional()
        break
    }
    shape[f.id] = s
  }
  return z.object(shape)
}

function buildDefaults(fields: PlanFieldDef[], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(overrides, f.id)) {
      out[f.id] = overrides[f.id]
      continue
    }
    switch (f.type) {
      case 'checkbox': out[f.id] = false; break
      case 'number':   out[f.id] = ''; break
      case 'file':     out[f.id] = []; break
      default:         out[f.id] = ''
    }
  }
  return out
}

export default function DynamicForm({
  fields,
  onSubmit,
  onCancel,
  submitting = false,
  defaultValues = {},
  submitLabel = 'Submit',
  secondarySubmit,
}: DynamicFormProps) {
  const schema = useMemo(() => buildZodSchema(fields), [fields])
  const defaults = useMemo(() => buildDefaults(fields, defaultValues), [fields, defaultValues])

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  })

  if (fields.length === 0) {
    return (
      <div className="text-sm text-neutral-500 dark:text-neutral-400">
        This tray has no fields defined. Add some in the <strong>Schema</strong> tab first.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {fields.map((f) => {
        const error = errors[f.id]
        return (
          <div key={f.id} className="flex flex-col gap-1.5">
            <Label htmlFor={f.id} className="text-xs">
              {f.label}
              {f.required && <span className="text-red-500 ml-1">*</span>}
            </Label>

            {f.type === 'textarea' && (
              <Textarea id={f.id} rows={4} {...register(f.id)} />
            )}

            {f.type === 'text' && (
              <Input id={f.id} type="text" {...register(f.id)} />
            )}

            {f.type === 'number' && (
              <Input id={f.id} type="number" step="any" {...register(f.id)} />
            )}

            {f.type === 'date' && (
              <Input id={f.id} type="date" {...register(f.id)} />
            )}

            {f.type === 'select' && (
              <select
                id={f.id}
                {...register(f.id)}
                className="
                  flex h-9 w-full rounded-md border border-neutral-200 dark:border-neutral-800
                  bg-white dark:bg-neutral-950 px-3 py-1 text-sm shadow-sm
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700
                "
              >
                <option value="">— Select —</option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {f.type === 'checkbox' && (
              <label className="flex items-center gap-2 text-sm">
                <input id={f.id} type="checkbox" {...register(f.id)} className="rounded" />
                {f.help ?? f.label}
              </label>
            )}

            {f.type === 'file' && (
              <div className="text-xs text-neutral-500 italic px-2 py-2 rounded border border-dashed border-neutral-300 dark:border-neutral-700">
                File attachments arrive in Phase 10. Leave empty for now.
              </div>
            )}

            {f.help && f.type !== 'checkbox' && (
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{f.help}</div>
            )}
            {error && (
              <div className="text-[11px] text-red-600 dark:text-red-400">{String(error.message)}</div>
            )}
          </div>
        )
      })}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {secondarySubmit && (
          <Button
            type="button"
            size="sm"
            disabled={submitting}
            onClick={() => { void handleSubmit(secondarySubmit.onSubmit)() }}
          >
            {secondarySubmit.label}
          </Button>
        )}
      </div>
    </form>
  )
}
