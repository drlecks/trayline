import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Download, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/project-store'
import type {
  InstalledSkillRow,
  SkillCatalogEntry,
  SkillCatalogFetchResult,
} from '../../../shared/types'

type Tab = 'catalog' | 'url'

export default function SkillsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const active = useProjectStore((s) => s.active)
  const [installed, setInstalled] = useState<InstalledSkillRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function refreshInstalled() {
    setInstalled(await window.trayline.skills.listInstalled())
  }

  useEffect(() => {
    void refreshInstalled()
  }, [])

  async function handleUninstall(skill: InstalledSkillRow) {
    if (skill.usedBy.length > 0) return
    if (!window.confirm(`Uninstall "${skill.manifest.name}"?`)) return
    setBusy(skill.manifest.id)
    setError(null)
    try {
      await window.trayline.skills.uninstall(skill.manifest.id)
      await refreshInstalled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleUpdate(skill: InstalledSkillRow) {
    setBusy(skill.manifest.id)
    setError(null)
    try {
      await window.trayline.skills.update(skill.manifest.id)
      await refreshInstalled()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto px-8 py-8">
      <button
        onClick={() => setScreen(active ? 'project' : 'splash')}
        className="self-start flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-6"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back
      </button>

      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight mb-1">Skills</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Reusable instructions workers can pull into their prompts.
          </p>
        </div>
        <Button size="sm" onClick={() => setModalOpen(true)}>
          <Plus size={14} strokeWidth={2} className="mr-1" />
          Add skill
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      <h2 className="text-sm font-medium mb-3">Installed</h2>
      {installed === null && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
      )}
      {installed !== null && installed.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 px-4 py-6 text-center">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No skills installed yet. Click <strong>Add skill</strong> to browse the catalog.
          </p>
        </div>
      )}
      {installed && installed.length > 0 && (
        <ul className="flex flex-col gap-2">
          {installed.map((s) => (
            <InstalledRow
              key={s.manifest.id}
              skill={s}
              busy={busy === s.manifest.id}
              onUpdate={() => void handleUpdate(s)}
              onUninstall={() => void handleUninstall(s)}
            />
          ))}
        </ul>
      )}

      <AddSkillModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o)
          if (!o) void refreshInstalled()
        }}
        installedIds={new Set((installed ?? []).map((s) => s.manifest.id))}
      />
    </div>
  )
}

function InstalledRow({
  skill,
  busy,
  onUpdate,
  onUninstall,
}: {
  skill: InstalledSkillRow
  busy: boolean
  onUpdate: () => void
  onUninstall: () => void
}) {
  const blocked = skill.usedBy.length > 0
  const tooltip = blocked
    ? `In use by ${skill.usedBy.length} worker${skill.usedBy.length === 1 ? '' : 's'}: ${skill.usedBy.map((u) => `${u.project}/${u.workflow}/${u.stepId}`).join(', ')}`
    : undefined
  return (
    <li className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{skill.manifest.name}</span>
          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">v{skill.manifest.version}</span>
          {skill.updateAvailable && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500">
              update {skill.updateAvailable} available
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{skill.manifest.description}</p>
        {skill.manifest.tags && skill.manifest.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {skill.manifest.tags.map((t) => (
              <span key={t} className="text-[10px] rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(skill.source === 'catalog' || skill.source === 'url') && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onUpdate}>
            <RefreshCw size={12} strokeWidth={2} className={`mr-1 ${busy ? 'animate-spin' : ''}`} />
            Update
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || busy}
          title={tooltip}
          onClick={onUninstall}
        >
          <Trash2 size={12} strokeWidth={2} className="mr-1" />
          Uninstall
        </Button>
      </div>
    </li>
  )
}

function AddSkillModal({
  open,
  onOpenChange,
  installedIds,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  installedIds: Set<string>
}) {
  const [tab, setTab] = useState<Tab>('catalog')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a skill</DialogTitle>
          <DialogDescription>
            Browse the public catalog or paste a URL to a skill directory.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mt-2 mb-4">
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>Browse catalog</TabButton>
          <TabButton active={tab === 'url'} onClick={() => setTab('url')}>From URL</TabButton>
        </div>

        {tab === 'catalog' ? (
          <CatalogTab installedIds={installedIds} />
        ) : (
          <UrlTab installedIds={installedIds} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-xs -mb-px border-b-2
        ${active
          ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100'
          : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}
      `}
    >
      {children}
    </button>
  )
}

function CatalogTab({ installedIds }: { installedIds: Set<string> }) {
  const [result, setResult] = useState<SkillCatalogFetchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [installedSinceOpen, setInstalledSinceOpen] = useState<Set<string>>(new Set())

  async function load(forceRefresh = false) {
    setLoading(true)
    setError(null)
    try {
      const r = await window.trayline.skills.fetchCatalog({ forceRefresh })
      setResult(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  async function install(entry: SkillCatalogEntry) {
    setInstalling(entry.id)
    setError(null)
    try {
      await window.trayline.skills.install(entry.id)
      setInstalledSinceOpen((s) => new Set([...s, entry.id]))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(null)
    }
  }

  const filtered = useMemo(() => {
    const list = result?.index.skills ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) => {
      const hay = [s.id, s.name, s.description, ...(s.tags ?? [])].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [result, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, description, or tag"
            className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 pl-7 pr-2.5 py-1.5"
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw size={12} strokeWidth={2} className={`mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {result?.source === 'cache' && (
        <div className="rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          Showing the cached catalog — couldn't reach the remote index{result.remoteError ? ` (${result.remoteError})` : ''}.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto flex flex-col gap-2 pr-1">
        {loading && !result && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4 text-center">Fetching catalog…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4 text-center">
            {result?.index.skills.length === 0 ? 'No skills in the catalog yet.' : 'No skills match your search.'}
          </p>
        )}
        {filtered.map((entry) => {
          const alreadyInstalled = installedIds.has(entry.id) || installedSinceOpen.has(entry.id)
          return (
            <div key={entry.id} className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{entry.name}</span>
                  <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">v{entry.version}</span>
                  {entry.author && <span className="text-[10px] text-neutral-500 dark:text-neutral-400">by {entry.author}</span>}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{entry.description}</p>
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.tags.map((t) => (
                      <span key={t} className="text-[10px] rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={alreadyInstalled || installing === entry.id}
                onClick={() => void install(entry)}
              >
                <Download size={12} strokeWidth={2} className={`mr-1 ${installing === entry.id ? 'animate-pulse' : ''}`} />
                {alreadyInstalled ? 'Installed' : installing === entry.id ? 'Installing…' : 'Install'}
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function UrlTab({ installedIds }: { installedIds: Set<string> }) {
  const [url, setUrl] = useState('')
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [installed, setInstalled] = useState<string | null>(null)

  async function install() {
    setInstalling(true)
    setError(null)
    setInstalled(null)
    try {
      const row = await window.trayline.skills.installFromUrl(url)
      setInstalled(row.manifest.name)
      setUrl('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstalling(false)
    }
  }

  // Suppress unused warning — installedIds is reserved for future "already
  // installed" detection but we don't have an id until we fetch.
  void installedIds

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Paste the URL of a directory containing <code className="font-mono">skill.json</code> and{' '}
        <code className="font-mono">skill.md</code>. For GitHub, use the raw URL.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://raw.githubusercontent.com/user/repo/main/skill-folder/"
        className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2.5 py-1.5 font-mono"
      />
      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {installed && (
        <div className="rounded-md border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 text-xs text-green-700 dark:text-green-300">
          Installed <strong>{installed}</strong>.
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void install()} disabled={!url.trim() || installing}>
          <Download size={12} strokeWidth={2} className={`mr-1 ${installing ? 'animate-pulse' : ''}`} />
          {installing ? 'Installing…' : 'Install'}
        </Button>
      </div>
      <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
        Note: phase-8 installs only accept <code>skill.json</code> and <code>skill.md</code>.
        Richer validation (executable scanning, multi-file skills) lands in phase N2.1.
      </p>
    </div>
  )
}
