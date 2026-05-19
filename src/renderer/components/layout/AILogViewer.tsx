import { useEffect, useRef, useState } from 'react'
import { X, RefreshCw } from 'lucide-react'

interface Props {
  onClose: () => void
}

export default function AILogViewer({ onClose }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function load() {
    setLoading(true)
    try {
      const result = await window.trayline.aiLog.getLines()
      setLines(result)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  // Scroll to bottom when lines change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [lines])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-stretch bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full flex flex-col bg-neutral-950 border-t border-neutral-800 shadow-2xl" style={{ height: '40vh', minHeight: 220, maxHeight: 480 }}>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-800 shrink-0">
          <span className="text-xs font-medium text-neutral-300 font-mono">AI output log</span>
          <span className="text-xs text-neutral-600 ml-1">(last 1000 lines)</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => void load()}
              title="Refresh"
              className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw size={13} strokeWidth={2} />
            </button>
            <button
              onClick={onClose}
              title="Close"
              className="p-1 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
            >
              <X size={13} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Log lines */}
        <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed text-neutral-300">
          {loading && <span className="text-neutral-600">Loading…</span>}
          {!loading && lines.length === 0 && (
            <span className="text-neutral-600">No AI output recorded yet. Run a worker or outlet with AI instructions to see output here.</span>
          )}
          {!loading && lines.map((line, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
