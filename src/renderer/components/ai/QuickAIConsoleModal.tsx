import { useEffect, useRef, useState } from 'react'
import { Copy, Check, Terminal } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Status = 'idle' | 'running' | 'done' | 'error'

export default function QuickAIConsoleModal({ open, onOpenChange }: Props) {
  const [prompt, setPrompt] = useState('')
  const [response, setResponse] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const abortingRef = useRef(false)
  const responseRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus the textarea when the modal opens
  useEffect(() => {
    if (open) {
      setPrompt('')
      setResponse('')
      setStatus('idle')
      setErrorMsg(null)
      setCopied(false)
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [open])

  // Auto-scroll response area as chunks arrive
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight
    }
  }, [response])

  async function handleAsk() {
    if (!prompt.trim() || status === 'running') return
    abortingRef.current = false
    setResponse('')
    setErrorMsg(null)
    setStatus('running')

    const unsubChunk = window.trayline.ai.onChunk((chunk) => {
      if (abortingRef.current) return
      setResponse((prev) => prev + chunk)
    })

    try {
      await window.trayline.ai.query(prompt.trim())
      if (!abortingRef.current) setStatus('done')
    } catch (err) {
      if (!abortingRef.current) {
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    } finally {
      unsubChunk()
    }
  }

  function handleClose() {
    if (status === 'running') {
      abortingRef.current = true
      window.trayline.ai.abort()
      setStatus('idle')
    }
    onOpenChange(false)
  }

  function handleCopy() {
    void navigator.clipboard.writeText(response).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void handleAsk()
    }
  }

  const hasResponse = response.length > 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-2xl flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-neutral-200 dark:border-neutral-800">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
            <Terminal size={15} strokeWidth={2} className="text-neutral-500" />
            Quick AI
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 p-5">
          {/* Prompt input */}
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything… (Ctrl+Enter to send)"
            rows={3}
            disabled={status === 'running'}
            className="
              w-full resize-none rounded-md border border-neutral-200 dark:border-neutral-700
              bg-white dark:bg-neutral-900
              px-3 py-2 text-sm
              placeholder:text-neutral-400 dark:placeholder:text-neutral-600
              focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600
              disabled:opacity-50
            "
          />

          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!prompt.trim() || status === 'running'}
              onClick={() => void handleAsk()}
            >
              {status === 'running' ? 'Running…' : 'Ask'}
            </Button>
          </div>
        </div>

        {/* Response area */}
        {(hasResponse || status === 'error') && (
          <div className="border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between px-5 py-2">
              <span className="text-xs text-neutral-500 font-medium uppercase tracking-wide">
                Response
              </span>
              {hasResponse && (
                <button
                  onClick={handleCopy}
                  title="Copy response"
                  className="
                    flex items-center gap-1
                    text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200
                    transition-colors
                  "
                >
                  {copied ? (
                    <><Check size={12} strokeWidth={2} /> Copied</>
                  ) : (
                    <><Copy size={12} strokeWidth={2} /> Copy</>
                  )}
                </button>
              )}
            </div>

            {status === 'error' && (
              <p className="px-5 pb-4 text-sm text-red-500 dark:text-red-400">{errorMsg}</p>
            )}

            {hasResponse && (
              <div
                ref={responseRef}
                className="
                  px-5 pb-5 max-h-72 overflow-y-auto
                  text-sm text-neutral-800 dark:text-neutral-200
                  whitespace-pre-wrap font-mono leading-relaxed
                "
              >
                {response}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
