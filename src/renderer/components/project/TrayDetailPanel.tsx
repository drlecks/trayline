import { useState } from 'react'
import { Inbox } from 'lucide-react'
import CardsTab from './CardsTab'
import ConfigTab from './ConfigTab'
import SchemaTab from './SchemaTab'
import type { StepMeta } from '../../../shared/types'

type Tab = 'cards' | 'config' | 'schema'

interface TrayDetailPanelProps {
  step: StepMeta
}

export default function TrayDetailPanel({ step }: TrayDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('cards')
  const isErrors = step.id === '99-errors'

  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-md flex items-center justify-center ${
            isErrors ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-tray-light text-tray'
          }`}>
            <Inbox size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">{step.name}</h1>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Tray · {(step.raw.approval_mode as string) ?? 'manual'} approval
              {step.description && <> · {step.description}</>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-4">
          {(['cards', 'config', 'schema'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                px-3 py-1.5 text-xs font-medium capitalize border-b-2 transition-colors
                ${tab === t
                  ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
                  : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}
              `}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'cards' && <CardsTab step={step} />}
        {tab === 'config' && <ConfigTab step={step} />}
        {tab === 'schema' && <SchemaTab step={step} />}
      </div>
    </div>
  )
}
