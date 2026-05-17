import { useEffect, useState } from 'react'
import { Check, Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { LocalModelEntry, ModelDownloadProgress } from '../../../shared/types'

type ModalState = 'idle' | 'downloading' | 'complete' | 'error'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  onReady: () => void
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export default function ModelDownloadModal({ open, onOpenChange, onReady }: Props) {
  const [models, setModels] = useState<LocalModelEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [state, setState] = useState<ModalState>('idle')
  const [progress, setProgress] = useState<ModelDownloadProgress | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    void window.trayline.localModel.list().then((list) => {
      setModels(list)
      const rec = list.find((m) => m.recommended) ?? list[0] ?? null
      setSelectedId(rec?.id ?? null)
      setState('idle')
      setProgress(null)
      setErrorMsg(null)
    })
  }, [open])

  useEffect(() => {
    const offProgress = window.trayline.localModel.onProgress((p) => {
      setProgress(p)
    })
    const offComplete = window.trayline.localModel.onDownloadComplete(() => {
      setState('complete')
    })
    const offError = window.trayline.localModel.onDownloadError(({ error }) => {
      setErrorMsg(error)
      setState('error')
    })
    return () => { offProgress(); offComplete(); offError() }
  }, [])

  async function handleDownload() {
    if (!selectedId) return
    setState('downloading')
    setProgress(null)
    setErrorMsg(null)
    try {
      await window.trayline.localModel.download(selectedId)
      // onDownloadComplete event handles the state transition
    } catch {
      // onDownloadError event handles the state transition
    }
  }

  async function handleStartUsing() {
    const r = await window.trayline.localModel.recheckAdapter()
    if (r.installed) onReady()
  }

  function handleCancel() {
    if (selectedId) window.trayline.localModel.cancel(selectedId)
    setState('idle')
    setProgress(null)
  }

  const selectedModel = models.find((m) => m.id === selectedId) ?? null

  return (
    <Dialog open={open} onOpenChange={state === 'downloading' ? undefined : onOpenChange}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={state === 'downloading' ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={state === 'downloading' ? (e) => e.preventDefault() : undefined}
      >
        {state === 'idle' && (
          <>
            <DialogHeader>
              <DialogTitle>Download a local AI model</DialogTitle>
              <DialogDescription>
                Pick a model to download. Trayline will use it to run your workflows — no internet required after this.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 my-2">
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id)}
                  className={`
                    flex items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors
                    ${selectedId === m.id
                      ? 'border-neutral-900 dark:border-neutral-100'
                      : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
                  `}
                >
                  <div className={`
                    mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center
                    ${selectedId === m.id ? 'border-neutral-900 dark:border-neutral-100' : 'border-neutral-300 dark:border-neutral-600'}
                  `}>
                    {selectedId === m.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-neutral-100" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-medium">{m.label}</span>
                      {m.recommended && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                          Recommended
                        </span>
                      )}
                      {m.downloaded && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800">
                          Downloaded
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{m.description}</p>
                    <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-0.5">{m.sizeMb.toLocaleString()} MB</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" onClick={() => void handleDownload()} disabled={!selectedId}>
                <Download size={13} strokeWidth={2} className="mr-1.5" />
                Download
              </Button>
            </div>
          </>
        )}

        {state === 'downloading' && selectedModel && (
          <>
            <DialogHeader>
              <DialogTitle>Downloading {selectedModel.label}</DialogTitle>
              <DialogDescription>Please wait while the model downloads.</DialogDescription>
            </DialogHeader>

            <div className="my-3">
              <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-neutral-900 dark:bg-neutral-100 transition-all duration-300"
                  style={{ width: `${progress?.percent ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between mt-1.5 text-[11px] text-neutral-500">
                <span>{progress ? `${formatMb(progress.downloadedBytes)} of ${formatMb(progress.totalBytes)}` : 'Starting…'}</span>
                <span>{progress?.percent ?? 0}%</span>
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleCancel}
                className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:underline"
              >
                Cancel download
              </button>
            </div>
          </>
        )}

        {state === 'complete' && (
          <>
            <DialogHeader>
              <DialogTitle>Model ready</DialogTitle>
              <DialogDescription>Your local AI model is downloaded and ready to use.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-10 h-10 rounded-full bg-green-50 dark:bg-green-950/40 flex items-center justify-center">
                <Check size={20} strokeWidth={2} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Ready to run workflows offline.</p>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => void handleStartUsing()}>
                Start using Trayline
              </Button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle>Download failed</DialogTitle>
              <DialogDescription>{errorMsg ?? 'An unexpected error occurred.'}</DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
              <Button size="sm" onClick={() => { setState('idle'); setErrorMsg(null) }}>
                Try again
              </Button>
            </div>
          </>
        )}

        {state === 'downloading' && (
          <div className="absolute top-3 right-3">
            <X size={14} strokeWidth={2} className="text-neutral-300 dark:text-neutral-700" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
