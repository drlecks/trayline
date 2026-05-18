// Schema of the workflow plan JSON produced by the author service and consumed
// by the scaffold service. Lives in shared/ so both the renderer (for previews)
// and the main process (for scaffolding) can validate against the same shape.

export type StepKind = 'tray' | 'worker' | 'source' | 'outlet'

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
  context_packs?: string[]
  process_md: string
  batch_mode?: boolean
  batch_max?: number | null
}

export interface PlanSourceStep {
  kind: 'source'
  id: string
  name: string
  description?: string
  icon?: string
  schedule_cron: string
  dedup: {
    key: string
    max_memory: number
    first_run: 'skip_existing' | 'process_all' | 'process_last_n'
    first_run_n?: number
  }
  source_md?: string
}

export interface PlanOutletStep {
  kind: 'outlet'
  id: string
  name: string
  description?: string
  icon?: string
  channel: {
    type: 'smtp' | 'http_post'
    credential_id: string
    [key: string]: unknown
  }
}

export type PlanStep = PlanTrayStep | PlanWorkerStep | PlanSourceStep | PlanOutletStep

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
