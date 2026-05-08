import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-md border border-neutral-200 bg-white px-3 py-1 text-sm',
        'shadow-sm transition-colors',
        'placeholder:text-neutral-400 dark:placeholder:text-neutral-600',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-neutral-800 dark:bg-neutral-950',
        className,
      )}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
