// Schema of the workflow plan JSON produced by the `trayline-author` system
// skill and consumed by the scaffold service. Lives in shared/ so both the
// renderer (for previews) and the main process (for scaffolding) can validate
// against the same shape.

export type StepKind = 'tray' | 'worker'

export interface PlanFieldDef {
  id: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'file' | 'checkbox'
  required?: boolean
  help?: string
  options?: string[]
  multiple?: boolean
}

export interface PlanTrayStep {
  kind: 'tray'
  id: string
  name: string
  description?: string
  icon?: string
  approval_mode: 'manual' | 'auto'
  input_schema: { fields: PlanFieldDef[] }
  allow_manual_create?: boolean
}

export interface PlanWorkerStep {
  kind: 'worker'
  id: string
  name: string
  description?: string
  icon?: string
  skills?: string[]
  mcps?: string[]
  context_packs?: string[]
  process_md: string
}

export type PlanStep = PlanTrayStep | PlanWorkerStep

export interface WorkflowPlan {
  project: {
    name: string
    display_name: string
    description: string
  }
  workflow: {
    name: string
    display_name: string
    steps: PlanStep[]
  }
}
