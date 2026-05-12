import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface CopyButtonProps {
  /** Text or function returning text to copy. */
  value: string | (() => string)
  /** Optional tooltip label. */
  title?: string
  className?: string
  size?: number
}

export function CopyButton({ value, title = 'Copy to clipboard', className = '', size = 12 }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const text = typeof value === 'function' ? value() : value
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard API can fail in some contexts; silently ignore.
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={copied ? 'Copied' : title}
      aria-label={copied ? 'Copied' : title}
      className={`
        inline-flex items-center justify-center
        w-6 h-6 rounded
        text-current opacity-60 hover:opacity-100
        hover:bg-black/5 dark:hover:bg-white/10
        transition
        ${className}
      `}
    >
      {copied ? <Check size={size} strokeWidth={2} /> : <Copy size={size} strokeWidth={1.75} />}
    </button>
  )
}
