import { useState } from 'react'
import { CheckCircle, AlertTriangle, Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface MissingSkill {
  id: string
  version: string
}

type SkillStatus = 'pending' | 'installing' | 'done' | 'failed'

interface ImportMissingSkillsDialogProps {
  projectName: string
  missingSkills: MissingSkill[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

export default function ImportMissingSkillsDialog({
  projectName,
  missingSkills,
  open,
  onOpenChange,
  onDone,
}: ImportMissingSkillsDialogProps) {
  const [statuses, setStatuses] = useState<Record<string, SkillStatus>>({})
  const [busy, setBusy] = useState(false)

  function setStatus(id: string, status: SkillStatus) {
    setStatuses((prev) => ({ ...prev, [id]: status }))
  }

  async function handleInstallAll() {
    setBusy(true)
    for (const skill of missingSkills) {
      setStatus(skill.id, 'installing')
      try {
        await window.trayline.skills.install(skill.id)
        setStatus(skill.id, 'done')
      } catch {
        setStatus(skill.id, 'failed')
      }
    }
    setBusy(false)
    onDone()
    onOpenChange(false)
  }

  function handleSkip() {
    onDone()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project imported</DialogTitle>
          <DialogDescription>
            "{projectName}" was added to your projects. This project needs{' '}
            {missingSkills.length === 1
              ? '1 skill that is'
              : `${missingSkills.length} skills that are`}{' '}
            not currently installed.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-1.5 mt-2">
          {missingSkills.map((skill) => {
            const status = statuses[skill.id] ?? 'pending'
            return (
              <li
                key={skill.id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
              >
                {status === 'done' && (
                  <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                )}
                {status === 'failed' && (
                  <AlertTriangle size={14} className="text-red-500 shrink-0" />
                )}
                {status === 'installing' && (
                  <Loader2 size={14} className="text-neutral-500 shrink-0 animate-spin" />
                )}
                {status === 'pending' && (
                  <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 dark:border-neutral-600 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{skill.id}</span>
                  <span className="ml-2 text-xs text-neutral-400">v{skill.version}</span>
                </div>
                {status === 'failed' && (
                  <span className="text-xs text-red-500">Not in catalog</span>
                )}
              </li>
            )
          })}
        </ul>

        <DialogFooter className="mt-4">
          <Button variant="ghost" size="sm" onClick={handleSkip} disabled={busy}>
            Skip for now
          </Button>
          <Button size="sm" onClick={handleInstallAll} disabled={busy}>
            {busy ? 'Installing…' : 'Install all'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
