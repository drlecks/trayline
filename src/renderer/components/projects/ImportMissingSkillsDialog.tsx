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

type ItemStatus = 'pending' | 'installing' | 'done' | 'failed'

interface ImportMissingSkillsDialogProps {
  projectName: string
  missingSkills: MissingSkill[]
  missingMcps?: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'done') return <CheckCircle size={14} className="text-emerald-500 shrink-0" />
  if (status === 'failed') return <AlertTriangle size={14} className="text-red-500 shrink-0" />
  if (status === 'installing') return <Loader2 size={14} className="text-neutral-500 shrink-0 animate-spin" />
  return <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 dark:border-neutral-600 shrink-0" />
}

export default function ImportMissingSkillsDialog({
  projectName,
  missingSkills,
  missingMcps = [],
  open,
  onOpenChange,
  onDone,
}: ImportMissingSkillsDialogProps) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({})
  const [busy, setBusy] = useState(false)

  function setStatus(id: string, status: ItemStatus) {
    setStatuses((prev) => ({ ...prev, [id]: status }))
  }

  async function handleInstallAll() {
    setBusy(true)
    for (const skill of missingSkills) {
      setStatus(`skill:${skill.id}`, 'installing')
      try {
        await window.trayline.skills.install(skill.id)
        setStatus(`skill:${skill.id}`, 'done')
      } catch {
        setStatus(`skill:${skill.id}`, 'failed')
      }
    }
    for (const mcpId of missingMcps) {
      setStatus(`mcp:${mcpId}`, 'installing')
      try {
        await window.trayline.mcp.install(mcpId)
        setStatus(`mcp:${mcpId}`, 'done')
      } catch {
        setStatus(`mcp:${mcpId}`, 'failed')
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

  const skillCount = missingSkills.length
  const mcpCount = missingMcps.length
  const parts: string[] = []
  if (skillCount > 0) parts.push(`${skillCount} skill${skillCount > 1 ? 's' : ''}`)
  if (mcpCount > 0) parts.push(`${mcpCount} MCP${mcpCount > 1 ? 's' : ''}`)
  const depsSummary = parts.join(' and ')

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Project imported</DialogTitle>
          <DialogDescription>
            "{projectName}" was added to your projects. This project needs{' '}
            {depsSummary} not currently installed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          {skillCount > 0 && (
            <div>
              {mcpCount > 0 && (
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">Skills</p>
              )}
              <ul className="flex flex-col gap-1.5">
                {missingSkills.map((skill) => {
                  const status = statuses[`skill:${skill.id}`] ?? 'pending'
                  return (
                    <li
                      key={skill.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
                    >
                      <StatusIcon status={status} />
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
            </div>
          )}

          {mcpCount > 0 && (
            <div>
              {skillCount > 0 && (
                <p className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">MCPs</p>
              )}
              <ul className="flex flex-col gap-1.5">
                {missingMcps.map((mcpId) => {
                  const status = statuses[`mcp:${mcpId}`] ?? 'pending'
                  return (
                    <li
                      key={mcpId}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800"
                    >
                      <StatusIcon status={status} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{mcpId}</span>
                      </div>
                      {status === 'failed' && (
                        <span className="text-xs text-red-500">Not in catalog</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>

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
