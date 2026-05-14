import * as React from 'react'
import { cn } from '@/lib/utils'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[64px] w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm',
        'shadow-sm transition-colors',
        'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-neutral-800 dark:bg-neutral-950',
        'resize-y',
        className,
      )}
      {...props}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
