import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'

export default function ProjectSettingsPanel() {
  const active = useProjectStore((s) => s.active)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)
  const setActive = useProjectStore((s) => s.setActive)

  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!active) return
    setDisplayName(active.display_name)
    setDescription(active.description ?? '')
    setSaved(false)
  }, [active])

  async function handleSave() {
    if (!active) return
    const trimmedName = displayName.trim()
    if (!trimmedName) return
    setSaving(true)
    try {
      const updated = await window.trayline.project.updateMeta(active.name, {
        display_name: trimmedName,
        description: description.trim(),
      })
      // Reflect the updated name/description in the project store
      setActive({ ...active, ...updated })
      await refreshProjects()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  if (!active) return null

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-black/[0.06] dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Settings size={15} strokeWidth={1.75} className="text-neutral-500 dark:text-neutral-400" />
          <h2 className="text-sm font-semibold tracking-tight">Project Settings</h2>
        </div>
      </div>

      <div className="px-6 py-6 flex flex-col gap-5 max-w-lg">
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSave() }}
            className="
              w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-800
              bg-white dark:bg-neutral-950 px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
            "
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="
              w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-800
              bg-white dark:bg-neutral-950 px-3 py-2
              focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
              resize-none
            "
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={() => void handleSave()} disabled={saving || !displayName.trim()}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </Button>
          {saved && (
            <p className="text-xs text-green-600 dark:text-green-500">Changes saved.</p>
          )}
        </div>
      </div>
    </div>
  )
}
