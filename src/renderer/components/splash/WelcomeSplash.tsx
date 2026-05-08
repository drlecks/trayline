import { useEffect, useState } from 'react'
import { Folder, Sparkles, FolderOpen, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/stores/project-store'
import type { BootstrapInfo } from '../../../shared/types'

export default function WelcomeSplash() {
  const [info, setInfo] = useState<BootstrapInfo | null>(null)
  const setScreen = useProjectStore((s) => s.setScreen)

  useEffect(() => {
    window.trayline.app.bootstrapInfo().then(setInfo)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto px-8">
      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 dark:bg-neutral-900 mb-6">
        <Sparkles size={22} className="text-neutral-700 dark:text-neutral-300" strokeWidth={1.5} />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight mb-2">Welcome to Trayline</h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center max-w-md mb-10 leading-relaxed">
        Visual AI workflow automation for people who work, not people who code.
        Start by creating a new project, importing one, or opening the example.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full mb-12">
        <Button variant="outline" size="lg" className="h-auto py-4 flex-col gap-2 items-start text-left" onClick={() => setScreen('author')}>
          <Sparkles size={16} strokeWidth={1.5} className="text-neutral-600 dark:text-neutral-400" />
          <div>
            <div className="text-sm font-medium">Create new project</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5">Describe a workflow in plain English</div>
          </div>
        </Button>

        <Button variant="outline" size="lg" className="h-auto py-4 flex-col gap-2 items-start text-left" disabled title="Coming in Phase 11">
          <FolderOpen size={16} strokeWidth={1.5} className="text-neutral-600 dark:text-neutral-400" />
          <div>
            <div className="text-sm font-medium">Import project</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5">Open a .zip from a colleague</div>
          </div>
        </Button>

        <Button variant="outline" size="lg" className="h-auto py-4 flex-col gap-2 items-start text-left" disabled title="Coming in Phase 11">
          <Package size={16} strokeWidth={1.5} className="text-neutral-600 dark:text-neutral-400" />
          <div>
            <div className="text-sm font-medium">Example project</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5">See what's possible</div>
          </div>
        </Button>
      </div>

      {info && (
        <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900/30 px-4 py-3 flex items-start gap-3">
          <Folder size={14} className="text-neutral-500 mt-0.5 shrink-0" strokeWidth={1.75} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Your data lives at
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono truncate mt-0.5" data-selectable>
              {info.dataDir}
            </div>
            {info.systemSkillsRestored.length > 0 && (
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5">
                Restored system skills: {info.systemSkillsRestored.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
