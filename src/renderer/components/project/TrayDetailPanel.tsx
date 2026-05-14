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
      <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-lg flex items-center justify-center text-white ${
            isErrors ? 'bg-error-strip' : 'bg-tray-strip'
          }`}>
            <Inbox size={20} strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{step.name}</h1>
            <div className="text-[13px] text-neutral-500 dark:text-neutral-400">
              {isErrors ? 'Error tray' : 'Tray'} · {(step.raw.approval_mode as string) ?? 'manual'} approval
              {step.description && <> · {step.description}</>}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 -mb-5">
          {(['cards', 'config', 'schema'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`
                px-3 py-2 text-[13px] font-medium capitalize border-b-2 transition-colors
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
