import { X, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  children: ReactNode
  onClose: () => void
  onSave: () => void
  saving: boolean
  error: string
}

export default function CredentialDialogShell({ title, children, onClose, onSave, saving, error }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="font-semibold text-sm">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
