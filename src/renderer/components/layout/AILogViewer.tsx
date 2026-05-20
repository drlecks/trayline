import { Fragment, useEffect, useRef, useState } from 'react'
import { X, RefreshCw, Trash2 } from 'lucide-react'

type LogLevel = 'info' | 'warning' | 'error'

interface LogEntry {
  datetime: string
  tag: string
  level: LogLevel
  text: string
}

function parseLine(line: string): LogEntry {
  // New format: [ISO_DATE] [TAG] [level] text
  const m4 = line.match(/^\[([^\]]+)\] \[([^\]]+)\] \[(info|warning|error)\] (.*)$/)
  if (m4) {
    return { datetime: fmtDate(m4[1]), tag: m4[2], level: m4[3] as LogLevel, text: m4[4] }
  }
  // Legacy format: [ISO_DATE] [TAG] text
  const m3 = line.match(/^\[([^\]]+)\] \[([^\]]+)\] (.*)$/)
  if (m3) {
    return { datetime: fmtDate(m3[1]), tag: m3[2], level: 'info', text: m3[3] }
  }
  return { datetime: '', tag: '', level: 'info', text: line }
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

const levelStyle: Record<LogLevel, string> = {
  info:    'text-neutral-500',
  warning: 'text-yellow-400',
  error:   'text-red-400',
}

const levelLabel: Record<LogLevel, string> = {
  info:    'info',
  warning: 'warn',
  error:   'err',
}

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

  async function handleClear() {
    await window.trayline.aiLog.clear()
    setLines([])
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [lines])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const entries = lines.map(parseLine)

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
              onClick={() => void handleClear()}
              title="Clear log"
              className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-800 transition-colors"
            >
              <Trash2 size={13} strokeWidth={2} />
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

        {/* Log body */}
        <div className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed">
          {loading && (
            <div className="px-4 py-3 text-neutral-600">Loading…</div>
          )}
          {!loading && entries.length === 0 && (
            <div className="px-4 py-3 text-neutral-600">
              No AI output recorded yet. Run a worker or outlet with AI instructions to see output here.
            </div>
          )}
          {!loading && entries.length > 0 && (
            <div className="grid" style={{ gridTemplateColumns: '7.5rem max-content max-content 1fr' }}>
              {entries.map((entry, i) => (
                <Fragment key={i}>
                  <div className="px-4 py-[3px] text-neutral-600 tabular-nums border-b border-neutral-800/50 whitespace-nowrap select-text">
                    {entry.datetime}
                  </div>
                  <div className="pr-4 py-[3px] text-sky-400/80 border-b border-neutral-800/50 whitespace-nowrap select-text" title={entry.tag}>
                    {entry.tag}
                  </div>
                  <div className={`pr-4 py-[3px] border-b border-neutral-800/50 whitespace-nowrap select-text ${levelStyle[entry.level]}`}>
                    {levelLabel[entry.level]}
                  </div>
                  <div className="pr-4 py-[3px] text-neutral-300 border-b border-neutral-800/50 break-all select-text">
                    {entry.text}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
