// Pure helpers extracted from DynamicForm so they can be unit-tested without
// pulling React into the test environment.

import { z } from 'zod'
import type { PlanFieldDef } from '../../../shared/workflow-plan'

/**
 * Build a zod object schema from a workflow tray's field definitions.
 *
 * - text / textarea / date / select: string. min(1) when required, optional otherwise.
 * - number: coerced from string; required → required number, otherwise empty
 *   string also passes through as undefined.
 * - checkbox: boolean.
 * - file: array of strings (placeholder until Phase 10 wires real attachments).
 */
export function buildZodSchema(fields: PlanFieldDef[]) {
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
      case 'select':
        s = z.string()
        if (f.required) s = (s as z.ZodString).min(1, 'Required')
        else s = s.optional()
        break
      case 'file':
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

/**
 * Build a default-values object for a fields list. Empty string for text-like,
 * empty array for files, false for checkboxes. `overrides` win, so an existing
 * card's data can be passed in to seed an edit form.
 */
export function buildDefaults(
  fields: PlanFieldDef[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
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
