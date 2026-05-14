import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const PRESETS = [
  { label: 'Every minute',       cron: '* * * * *' },
  { label: 'Every 5 minutes',    cron: '*/5 * * * *' },
  { label: 'Every 15 minutes',   cron: '*/15 * * * *' },
  { label: 'Every 30 minutes',   cron: '*/30 * * * *' },
  { label: 'Every hour',         cron: '0 * * * *' },
  { label: 'Every day at 9 am',  cron: '0 9 * * *' },
  { label: 'Custom',             cron: '' },
]

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return 'Invalid expression'
  const [min, hour, dom, mon, dow] = parts

  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every minute'
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(min.slice(2), 10)
    return `Every ${n} minute${n === 1 ? '' : 's'}`
  }
  if (min === '0' && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const n = parseInt(hour.slice(2), 10)
    return `Every ${n} hour${n === 1 ? '' : 's'}`
  }
  if (min === '0' && hour === '*' && dom === '*' && mon === '*' && dow === '*') return 'Every hour (at :00)'
  if (min !== '*' && hour !== '*' && dom === '*' && mon === '*' && dow === '*') {
    const h = parseInt(hour, 10)
    const m = parseInt(min, 10)
    const ampm = h < 12 ? 'am' : 'pm'
    const h12 = h % 12 || 12
    const mStr = String(m).padStart(2, '0')
    return `Every day at ${h12}:${mStr} ${ampm}`
  }
  return expr
}

function isValidCron(expr: string): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every((p) => /^[\d*,\/\-]+$/.test(p))
}

interface SchedulePickerProps {
  value: string
  onChange: (cron: string) => void
  label?: string
}

export default function SchedulePicker({ value, onChange, label }: SchedulePickerProps) {
  const matchedPreset = PRESETS.find((p) => p.cron === value && p.label !== 'Custom')
  const [selectValue, setSelectValue] = useState(matchedPreset?.label ?? 'Custom')
  const [rawInput, setRawInput] = useState(value)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const matched = PRESETS.find((p) => p.cron === value && p.label !== 'Custom')
    setSelectValue(matched?.label ?? 'Custom')
    setRawInput(value)
    setError(null)
  }, [value])

  function handlePresetChange(label: string) {
    setSelectValue(label)
    const preset = PRESETS.find((p) => p.label === label)
    if (preset && preset.cron) {
      setRawInput(preset.cron)
      setError(null)
      onChange(preset.cron)
    }
  }

  function handleRawChange(raw: string) {
    setRawInput(raw)
    if (!isValidCron(raw)) {
      setError('Invalid cron expression')
    } else {
      setError(null)
      onChange(raw)
    }
  }

  const description = !error && isValidCron(value) ? describeCron(value) : null

  return (
    <div className="flex flex-col gap-2">
      {label && <Label className="text-xs">{label}</Label>}
      <select
        value={selectValue}
        onChange={(e) => handlePresetChange(e.target.value)}
        className="
          h-8 w-full rounded-md border border-neutral-200 dark:border-neutral-800
          bg-white dark:bg-neutral-950 px-2 text-sm
          focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
        "
      >
        {PRESETS.map((p) => (
          <option key={p.label} value={p.label}>{p.label}</option>
        ))}
      </select>

      {selectValue === 'Custom' && (
        <Input
          value={rawInput}
          onChange={(e) => handleRawChange(e.target.value)}
          placeholder="*/5 * * * *"
          className={`h-8 text-sm font-mono ${error ? 'border-red-400 dark:border-red-600' : ''}`}
        />
      )}

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {description && !error && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      )}
    </div>
  )
}
