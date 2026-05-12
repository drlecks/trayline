import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { Search, X, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import type { WorkerRunEvent, WorkerRunStatus } from '../../../shared/worker-run'

interface TerminalPanelProps {
  project: string
  workflow: string
  stepId: string
  runId: string
  /** Renderer-side current status; drives interactive mode. */
  status: WorkerRunStatus | 'idle'
}

export default function TerminalPanel({ project, workflow, stepId, runId, status }: TerminalPanelProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const statusRef = useRef(status)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')

  // Keep statusRef live so the keystroke handler can decide whether to forward.
  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    if (!hostRef.current) return

    const dark = document.documentElement.classList.contains('dark')
    const term = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
      fontSize: 12,
      lineHeight: 1.25,
      cursorBlink: false,
      convertEol: true,
      scrollback: 5000,
      theme: dark
        ? { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5' }
        : { background: '#0a0a0a', foreground: '#e5e5e5', cursor: '#e5e5e5' },
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    term.loadAddon(fit)
    term.loadAddon(search)
    term.open(hostRef.current)

    termRef.current = term
    fitRef.current = fit
    searchRef.current = search

    let disposed = false
    let rafId: number | null = null

    // `fit.fit()` reads xterm's internal renderer dimensions, which are set up
    // asynchronously after `term.open()`. Calling fit before that — or with a
    // zero-sized host — throws later inside Viewport.syncScrollArea. Guard
    // against both: require a non-zero host and the renderer to exist before
    // calling fit. If either isn't ready, retry on the next rAF.
    function safeFit() {
      if (disposed) return
      const host = hostRef.current
      if (!host || host.clientWidth <= 0 || host.clientHeight <= 0) return
      // @ts-expect-error — peek at the private renderService to detect when xterm is ready
      if (!term._core?._renderService?.dimensions) {
        rafId = requestAnimationFrame(safeFit)
        return
      }
      try { fit.fit() } catch { /* no-op */ }
    }
    rafId = requestAnimationFrame(safeFit)

    // Forward keystrokes to the live PTY only while the worker is awaiting input.
    // Otherwise the terminal is read-only and typing does nothing — matching
    // the "Layer 3" terminal contract in docs/features.md.
    term.onData((data) => {
      if (statusRef.current === 'awaiting_input' || statusRef.current === 'running') {
        void window.trayline.worker.sendInput(project, workflow, stepId, runId, data)
      }
    })

    const ro = new ResizeObserver(() => { safeFit() })
    ro.observe(hostRef.current)

    return () => {
      disposed = true
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
      searchRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, workflow, stepId, runId])

  // Initial load + live streaming. Replays the on-disk terminal.log first,
  // then attaches to live `log` events for the current run.
  useEffect(() => {
    let cancelled = false
    const term = termRef.current
    if (!term) return

    term.clear()

    void (async () => {
      const log = await window.trayline.worker.readTerminalLog(project, workflow, stepId, runId)
      if (cancelled || !termRef.current) return
      if (log) termRef.current.write(normalize(log))
    })()

    const off = window.trayline.worker.onRunEvent((ev: WorkerRunEvent) => {
      if (ev.runId !== runId) return
      if (ev.type === 'log' && termRef.current) termRef.current.write(normalize(ev.chunk))
    })

    return () => { cancelled = true; off() }
  }, [project, workflow, stepId, runId])

  // Keyboard: Ctrl/Cmd+F toggles search bar.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setShowSearch((v) => !v)
      }
      if (e.key === 'Escape' && showSearch) setShowSearch(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSearch])

  return (
    <div className="relative w-full">
      {showSearch && (
        <div className="absolute top-0 right-0 z-10 flex items-center gap-1 m-1 px-2 py-1 rounded-md bg-neutral-800/95 border border-neutral-700 shadow">
          <Search size={12} strokeWidth={1.75} className="text-neutral-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.shiftKey
                  ? searchRef.current?.findPrevious(query)
                  : searchRef.current?.findNext(query)
              }
              if (e.key === 'Escape') setShowSearch(false)
            }}
            placeholder="Search…"
            className="bg-transparent text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none w-40"
          />
          <button
            onClick={() => searchRef.current?.findPrevious(query)}
            className="p-1 rounded text-neutral-300 hover:bg-neutral-700"
            title="Previous (Shift+Enter)"
          >
            <ChevronUp size={12} strokeWidth={2} />
          </button>
          <button
            onClick={() => searchRef.current?.findNext(query)}
            className="p-1 rounded text-neutral-300 hover:bg-neutral-700"
            title="Next (Enter)"
          >
            <ChevronDown size={12} strokeWidth={2} />
          </button>
          <button
            onClick={() => setShowSearch(false)}
            className="p-1 rounded text-neutral-300 hover:bg-neutral-700"
            title="Close (Esc)"
          >
            <X size={12} strokeWidth={2} />
          </button>
        </div>
      )}
      <div
        ref={hostRef}
        className="w-full h-96 rounded-md border border-neutral-800 bg-[#0a0a0a] p-2 overflow-hidden"
      />
    </div>
  )
}

/**
 * xterm.js writes raw byte data. Many CLI streams use bare `\n` line endings
 * which xterm.js by default does not convert to CRLF when `convertEol: true`
 * is set (it does — but legacy CR-only chunks can still misalign). Normalize
 * to be safe: strip stray `\r\n` → `\n`, then `convertEol` handles the rest.
 */
function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n')
}

export function OpenExternalTerminalButton({
  project, workflow, stepId, runId,
}: { project: string; workflow: string; stepId: string; runId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true); setError(null)
          const r = await window.trayline.worker.openExternalTerminal(project, workflow, stepId, runId)
          if (!r.ok) setError(r.message ?? 'Failed to open terminal')
          setBusy(false)
        }}
        className="inline-flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100"
        title="Open the run directory in your OS terminal"
      >
        <ExternalLink size={12} strokeWidth={1.75} />
        Open in external terminal
      </button>
      {error && <span className="text-[11px] text-red-600 dark:text-red-400 ml-2">{error}</span>}
    </>
  )
}
