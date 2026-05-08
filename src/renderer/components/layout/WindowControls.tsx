import { Minus, Square, X } from 'lucide-react'

// Rendered only on Windows and Linux — macOS keeps native traffic lights
export default function WindowControls() {
  if (window.trayline.platform === 'darwin') return null

  return (
    <div className="flex items-stretch no-drag">
      <button
        onClick={() => window.trayline.window.minimize()}
        className="flex items-center justify-center w-11 h-full text-neutral-500 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
        aria-label="Minimize"
      >
        <Minus size={13} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => window.trayline.window.maximize()}
        className="flex items-center justify-center w-11 h-full text-neutral-500 hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
        aria-label="Maximize"
      >
        <Square size={11} strokeWidth={1.5} />
      </button>
      <button
        onClick={() => window.trayline.window.close()}
        className="flex items-center justify-center w-11 h-full text-neutral-500 hover:bg-red-500 hover:text-white transition-colors"
        aria-label="Close"
      >
        <X size={13} strokeWidth={1.5} />
      </button>
    </div>
  )
}
