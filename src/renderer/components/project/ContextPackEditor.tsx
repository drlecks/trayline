import { useEffect, useMemo, useState } from 'react'
import { FileText, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  project: string
}

export default function ContextPackEditor({ project }: Props) {
  const [files, setFiles] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [body, setBody] = useState('')
  const [saved, setSaved] = useState('')
  const [loadingFile, setLoadingFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // New-file dialog state
  const [newFileName, setNewFileName] = useState('')
  const [showNewFile, setShowNewFile] = useState(false)

  async function refreshFiles() {
    const list = await window.trayline!.project.listContextFiles(project)
    setFiles(list)
  }

  useEffect(() => {
    void refreshFiles()
    setSelectedFile(null)
    setBody('')
    setSaved('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  async function selectFile(file: string) {
    setSelectedFile(file)
    setLoadingFile(true)
    setError(null)
    try {
      const content = await window.trayline!.project.readContextFile(project, file)
      setBody(content)
      setSaved(content)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingFile(false)
    }
  }

  async function saveFile() {
    if (!selectedFile) return
    setSaving(true)
    setError(null)
    try {
      await window.trayline!.project.writeContextFile(project, selectedFile, body)
      setSaved(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function deleteFile(file: string) {
    if (!window.confirm(`Delete "${file}"? This cannot be undone.`)) return
    setError(null)
    try {
      await window.trayline!.project.deleteContextFile(project, file)
      if (selectedFile === file) {
        setSelectedFile(null)
        setBody('')
        setSaved('')
      }
      await refreshFiles()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function createFile() {
    let name = newFileName.trim()
    if (!name) return
    if (!name.endsWith('.md')) name = `${name}.md`
    setError(null)
    try {
      await window.trayline!.project.writeContextFile(project, name, '')
      await refreshFiles()
      setShowNewFile(false)
      setNewFileName('')
      void selectFile(name)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const dirty = body !== saved

  const variableName = useMemo(
    () => selectedFile ? `{{context.${selectedFile.replace(/\.md$/, '')}}}` : null,
    [selectedFile],
  )

  return (
    <div className="flex h-full">
      {/* File list sidebar */}
      <div className="w-56 shrink-0 border-r border-black/[0.06] dark:border-white/[0.06] flex flex-col py-3">
        <div className="px-4 mb-3 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-neutral-400">Context files</span>
          <button
            type="button"
            title="New file"
            onClick={() => setShowNewFile(true)}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>

        {showNewFile && (
          <div className="px-3 mb-2 flex items-center gap-1">
            <input
              autoFocus
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFile()
                if (e.key === 'Escape') { setShowNewFile(false); setNewFileName('') }
              }}
              placeholder="brand-voice.md"
              className="flex-1 text-xs rounded border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2 py-1 font-mono"
            />
            <button
              type="button"
              onClick={() => { setShowNewFile(false); setNewFileName('') }}
              className="text-neutral-400 hover:text-neutral-600"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {files.length === 0 && !showNewFile && (
          <p className="px-4 text-xs text-neutral-400 dark:text-neutral-600 italic">No context files yet.</p>
        )}

        <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 px-2">
          {files.map((file) => {
            const isBase = file.startsWith('_')
            return (
              <button
                key={file}
                onClick={() => void selectFile(file)}
                className={`
                  group flex items-center justify-between gap-1 px-2 py-1.5 rounded text-left text-xs
                  ${selectedFile === file
                    ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100'
                    : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-900'}
                `}
              >
                <span className="flex items-center gap-1.5 min-w-0 truncate">
                  <FileText size={12} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
                  <span className="truncate">{file}</span>
                  {isBase && (
                    <span className="shrink-0 text-[9px] px-1 py-px rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wide">base</span>
                  )}
                </span>
                <span
                  role="button"
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); void deleteFile(file) }}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <Trash2 size={11} strokeWidth={1.75} />
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Editor pane */}
      <div className="flex-1 min-w-0 flex flex-col p-5 gap-3">
        {error && (
          <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        )}

        {!selectedFile && (
          <div className="flex-1 flex items-center justify-center text-sm text-neutral-400 dark:text-neutral-600">
            Select a file to edit, or create a new one.
          </div>
        )}

        {selectedFile && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{selectedFile}</div>
                {variableName && (
                  <button
                    type="button"
                    title="Click to copy variable"
                    onClick={() => void navigator.clipboard.writeText(variableName)}
                    className="text-[11px] font-mono text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mt-0.5 block"
                  >
                    {variableName} ↗ click to copy
                  </button>
                )}
              </div>
            </div>
            {loadingFile ? (
              <div className="text-xs text-neutral-500">Loading…</div>
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="
                  flex-1 min-h-0 rounded-md border border-neutral-200 dark:border-neutral-800
                  bg-white dark:bg-neutral-950 px-3 py-2 text-xs font-mono
                  focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
                  resize-none
                "
              />
            )}
            <div className="flex justify-end gap-2 shrink-0">
              <Button size="sm" variant="ghost" disabled={!dirty || saving} onClick={() => setBody(saved)}>
                Reset
              </Button>
              <Button size="sm" disabled={!dirty || saving || loadingFile} onClick={() => void saveFile()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
