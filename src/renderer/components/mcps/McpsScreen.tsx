import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Download, ExternalLink, MoreHorizontal, Plug, Plus, Search, Settings2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useProjectStore } from '@/stores/project-store'
import type { InstalledMcpRow, McpCatalogEntry, McpHealthState, McpManifest } from '../../../shared/types'
import McpSetupWizard from './McpSetupWizard'

// ── Status badge ──────────────────────────────────────────────────────────────

const HEALTH_CONFIG: Record<McpHealthState, { label: string; className: string }> = {
  ready:        { label: '✓ Ready',        className: 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950/40 dark:border-green-900' },
  unconfigured: { label: '⚠ Setup needed', className: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900' },
  error:        { label: '✗ Error',         className: 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/40 dark:border-red-900' },
  unknown:      { label: '? Unknown',       className: 'text-neutral-500 bg-neutral-50 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800' },
  disabled:     { label: '⏸ Disabled',     className: 'text-neutral-500 bg-neutral-50 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800' },
}

function McpStatusBadge({ state }: { state: McpHealthState }) {
  const { label, className } = HEALTH_CONFIG[state]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${className}`}>
      {label}
    </span>
  )
}

// ── Tab button (shared) ───────────────────────────────────────────────────────

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 text-xs -mb-px border-b-2 transition-colors duration-150
        ${active
          ? 'border-neutral-900 dark:border-neutral-100 text-neutral-900 dark:text-neutral-100 font-medium'
          : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'}
      `}
    >
      {children}
    </button>
  )
}

// ── Tag chip ─────────────────────────────────────────────────────────────────

function TagChip({ tag }: { tag: string }) {
  return (
    <span className="text-[10px] rounded bg-neutral-100 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 px-1.5 py-0.5">
      {tag}
    </span>
  )
}

// ── Installed MCP card ────────────────────────────────────────────────────────

function InstalledMcpCard({
  row,
  busy,
  onSelect,
  onUninstall,
  onToggleDisabled,
}: {
  row: InstalledMcpRow
  busy: boolean
  onSelect: () => void
  onUninstall: () => void
  onToggleDisabled: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [menuOpen])

  return (
    <li className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 flex items-start gap-3 hover:border-neutral-300 dark:hover:border-neutral-700 transition-colors">
      <button
        className="flex-1 min-w-0 text-left"
        onClick={onSelect}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{row.manifest.name}</span>
          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">v{row.manifest.version}</span>
          <McpStatusBadge state={row.healthState} />
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">{row.manifest.description}</p>
        {row.manifest.tags && row.manifest.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {row.manifest.tags.map((t) => <TagChip key={t} tag={t} />)}
          </div>
        )}
      </button>

      <div className="flex items-center gap-1 shrink-0 relative" ref={menuRef}>
        <Button size="sm" variant="outline" onClick={onSelect} className="text-[11px]">
          Details <ChevronRight size={11} strokeWidth={2} className="ml-0.5" />
        </Button>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.05] transition-colors"
          title="More actions"
        >
          <MoreHorizontal size={14} strokeWidth={1.75} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-50 w-44 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg py-1">
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={() => { setMenuOpen(false); onToggleDisabled() }}
              disabled={busy}
            >
              {row.status.disabled ? 'Enable' : 'Disable'}
            </button>
            <button
              className="w-full text-left px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => { setMenuOpen(false); onUninstall() }}
              disabled={busy}
            >
              Uninstall
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

// ── MCP detail dialog ─────────────────────────────────────────────────────────

function McpDetailDialog({
  row,
  open,
  onOpenChange,
  onUninstall,
  onToggleDisabled,
  onSetup,
  busy,
}: {
  row: InstalledMcpRow | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onUninstall: () => void
  onToggleDisabled: () => void
  onSetup: () => void
  busy: boolean
}) {
  if (!row) return null
  const { manifest, status, healthState } = row
  const hasCredentials = manifest.credentials_schema.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base">{manifest.name}</DialogTitle>
              <DialogDescription className="mt-0.5">{manifest.description}</DialogDescription>
            </div>
            <McpStatusBadge state={healthState} />
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-5 mt-2">
          {/* Credentials */}
          <section>
            <h3 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Credentials</h3>
            {!hasCredentials ? (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">No credentials required.</p>
            ) : (
              <ul className="space-y-1.5">
                {manifest.credentials_schema.map((cred) => (
                  <li key={cred.id} className="flex items-center justify-between gap-2 rounded bg-neutral-50 dark:bg-neutral-900 px-3 py-2">
                    <div>
                      <span className="text-xs font-medium">{cred.label}</span>
                      {cred.description && (
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{cred.description}</p>
                      )}
                    </div>
                    {status.configured ? (
                      <span className="text-[11px] flex items-center gap-1 text-green-700 dark:text-green-400 shrink-0">
                        <Check size={11} strokeWidth={2.5} /> Configured
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 shrink-0">Not set</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {hasCredentials && !status.configured && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSetup}
                className="mt-2 gap-1.5 text-[11px]"
              >
                <Settings2 size={11} strokeWidth={2} />
                Set up
              </Button>
            )}
          </section>

          {/* Install method */}
          <section>
            <h3 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-2">Install</h3>
            <div className="rounded bg-neutral-50 dark:bg-neutral-900 px-3 py-2 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 break-all">
              {manifest.command_template}
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1.5 capitalize">
              Method: {manifest.install_method}
            </p>
          </section>

          {/* Tags + homepage */}
          {(manifest.tags?.length || manifest.homepage) && (
            <section>
              {manifest.tags && manifest.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {manifest.tags.map((t) => <TagChip key={t} tag={t} />)}
                </div>
              )}
              {manifest.homepage && (
                <a
                  href={manifest.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] flex items-center gap-1 text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
                >
                  <ExternalLink size={11} strokeWidth={1.75} />
                  {manifest.homepage}
                </a>
              )}
            </section>
          )}

          {/* Last health check */}
          {status.healthCheckedAt && (
            <section>
              <h3 className="text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Last health check</h3>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {new Date(status.healthCheckedAt).toLocaleString()}
                {status.health === 'failed' && status.lastError && (
                  <span className="text-red-600 dark:text-red-400 block mt-0.5">{status.lastError}</span>
                )}
              </p>
            </section>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-neutral-100 dark:border-neutral-800 mt-2 shrink-0">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onToggleDisabled}
            >
              {status.disabled ? 'Enable' : 'Disable'}
            </Button>
            {hasCredentials && status.configured && (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={onSetup}
                className="gap-1.5"
              >
                <Settings2 size={11} strokeWidth={2} />
                Reset credentials
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onUninstall}
              className="text-red-600 dark:text-red-400 hover:border-red-300 dark:hover:border-red-700"
            >
              <Trash2 size={12} strokeWidth={2} className="mr-1" />
              Uninstall
            </Button>
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-600 shrink-0">
            Installed {new Date(row.installedAt).toLocaleDateString()}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Add MCP dialog ────────────────────────────────────────────────────────────

type AddTab = 'catalog' | 'registry' | 'url'

function AddMcpDialog({
  open,
  onOpenChange,
  installedIds,
  onInstalled,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  installedIds: Set<string>
  onInstalled: (row: InstalledMcpRow) => void
}) {
  const [tab, setTab] = useState<AddTab>('catalog')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add an MCP</DialogTitle>
          <DialogDescription>
            Browse the curated catalog or install from a URL.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mt-2 mb-4 shrink-0">
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>Browse catalog</TabButton>
          <TabButton active={tab === 'registry'} onClick={() => setTab('registry')}>Browse registry</TabButton>
          <TabButton active={tab === 'url'} onClick={() => setTab('url')}>From URL</TabButton>
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === 'catalog' && (
            <CatalogAddTab
              installedIds={installedIds}
              onInstalled={(row) => { onInstalled(row); onOpenChange(false) }}
            />
          )}
          {tab === 'registry' && <RegistryStubTab />}
          {tab === 'url' && <UrlStubTab />}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CatalogAddTab({
  installedIds,
  onInstalled,
}: {
  installedIds: Set<string>
  onInstalled: (row: InstalledMcpRow) => void
}) {
  const [catalog, setCatalog] = useState<McpCatalogEntry[] | null>(null)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.trayline.mcp.listCatalog().then(setCatalog).catch(() => setCatalog([]))
  }, [])

  const filtered = useMemo(() => {
    if (!catalog) return []
    const q = search.toLowerCase()
    return catalog
      .filter((e) => !installedIds.has(e.id))
      .filter((e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.tags?.some((t) => t.toLowerCase().includes(q)),
      )
  }, [catalog, installedIds, search])

  async function handleInstall(mcpId: string) {
    setBusy(mcpId)
    setError(null)
    try {
      const row = await window.trayline.mcp.install(mcpId)
      onInstalled(row)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" strokeWidth={1.75} />
        <input
          type="text"
          placeholder="Search MCPs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-neutral-200 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-neutral-400"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}

      {catalog === null && <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>}

      {catalog !== null && filtered.length === 0 && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 py-4 text-center">
          {search ? 'No MCPs match your search.' : 'All catalog MCPs are already installed.'}
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {filtered.map((entry) => (
            <li key={entry.id} className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2.5 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium">{entry.name}</span>
                  <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">v{entry.version}</span>
                  {entry.credentials_schema.length === 0 && (
                    <span className="text-[10px] text-green-700 dark:text-green-500">No credentials needed</span>
                  )}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{entry.description}</p>
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {entry.tags.map((t) => <TagChip key={t} tag={t} />)}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                disabled={busy === entry.id}
                onClick={() => void handleInstall(entry.id)}
                className="shrink-0"
              >
                <Download size={12} strokeWidth={2} className={`mr-1 ${busy === entry.id ? 'animate-pulse' : ''}`} />
                {busy === entry.id ? 'Installing…' : 'Install'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RegistryStubTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <Plug size={28} strokeWidth={1.25} className="text-neutral-300 dark:text-neutral-700" />
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">Registry coming soon</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-500 max-w-xs">
        The public MCP registry will let you discover and install community-built MCPs. Until then, use the curated catalog or install from a URL.
      </p>
    </div>
  )
}

function UrlStubTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <AlertTriangle size={28} strokeWidth={1.25} className="text-neutral-300 dark:text-neutral-700" />
      <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">URL install coming soon</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-500 max-w-xs">
        Installing MCPs from a URL (with security confirmation) is coming in the next release. For now, use the curated catalog.
      </p>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function McpsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const active = useProjectStore((s) => s.active)
  const all = useProjectStore((s) => s.all)

  const [installed, setInstalled] = useState<InstalledMcpRow[] | null>(null)
  const [catalog, setCatalog] = useState<McpCatalogEntry[] | null>(null)
  const [detail, setDetail] = useState<InstalledMcpRow | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [wizardManifest, setWizardManifest] = useState<McpManifest | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    const [inst, cat] = await Promise.all([
      window.trayline.mcp.listInstalled(),
      window.trayline.mcp.listCatalog(),
    ])
    setInstalled(inst)
    setCatalog(cat)
    // Sync detail panel if it's open
    setDetail((prev) => prev ? inst.find((r) => r.manifest.id === prev.manifest.id) ?? null : null)
  }

  useEffect(() => { void refresh() }, [])

  const installedIds = useMemo(() => new Set((installed ?? []).map((r) => r.manifest.id)), [installed])

  const available = useMemo(() => {
    if (!catalog) return []
    return catalog.filter((e) => !installedIds.has(e.id))
  }, [catalog, installedIds])

  async function handleUninstall(row: InstalledMcpRow) {
    if (!window.confirm(`Uninstall "${row.manifest.name}"?`)) return
    setBusy(row.manifest.id)
    setError(null)
    try {
      await window.trayline.mcp.uninstall(row.manifest.id)
      setDetail(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleToggleDisabled(row: InstalledMcpRow) {
    setBusy(row.manifest.id)
    setError(null)
    try {
      await window.trayline.mcp.writeStatus(row.manifest.id, { disabled: !row.status.disabled })
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function handleSetup(row: InstalledMcpRow) {
    if (row.status.configured) {
      if (!window.confirm(`Reset credentials for "${row.manifest.name}"?\nYou will need to re-enter your credentials.`)) return
      setBusy(row.manifest.id)
      try {
        await window.trayline.mcp.deleteCredentials(row.manifest.id)
        await window.trayline.mcp.writeStatus(row.manifest.id, { configured: false, health: null, healthCheckedAt: null })
        await refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setBusy(null)
        return
      }
      setBusy(null)
    }
    setWizardManifest(row.manifest)
  }

  function backTarget(): string {
    if (active) return 'project'
    return all.length > 0 ? 'projectList' : 'splash'
  }

  return (
    <div className="flex flex-col w-full max-w-3xl mx-auto px-8 py-8">
      <button
        onClick={() => setScreen(backTarget() as Parameters<typeof setScreen>[0])}
        className="self-start flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-6"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back
      </button>

      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight mb-1">MCPs</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Model Context Protocol servers — give workers real-world powers like reading email, browsing the web, or posting to Slack.
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} strokeWidth={2} className="mr-1" />
          Add MCP
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="opacity-70 hover:opacity-100"><X size={12} /></button>
        </div>
      )}

      {/* Installed */}
      <h2 className="text-sm font-medium mb-3">Installed</h2>
      {installed === null && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Loading…</p>
      )}
      {installed !== null && installed.length === 0 && (
        <div className="rounded-md border border-dashed border-neutral-200 dark:border-neutral-800 px-4 py-6 text-center mb-8">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No MCPs installed. Click <strong>Add MCP</strong> to browse the catalog.
          </p>
        </div>
      )}
      {installed !== null && installed.length > 0 && (
        <ul className="flex flex-col gap-2 mb-8">
          {installed.map((row) => (
            <InstalledMcpCard
              key={row.manifest.id}
              row={row}
              busy={busy === row.manifest.id}
              onSelect={() => setDetail(row)}
              onUninstall={() => void handleUninstall(row)}
              onToggleDisabled={() => void handleToggleDisabled(row)}
            />
          ))}
        </ul>
      )}

      {/* Available from catalog */}
      {available.length > 0 && (
        <>
          <h2 className="text-sm font-medium mb-3">Available</h2>
          <ul className="flex flex-col gap-2">
            {available.map((entry) => (
              <li key={entry.id} className="rounded-md border border-neutral-100 dark:border-neutral-900 px-3 py-2.5 flex items-start gap-3 opacity-80">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium">{entry.name}</span>
                    {entry.credentials_schema.length === 0 && (
                      <span className="text-[10px] text-green-700 dark:text-green-500">No credentials needed</span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">{entry.description}</p>
                  {entry.tags && entry.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {entry.tags.map((t) => <TagChip key={t} tag={t} />)}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setAddOpen(true)}
                >
                  <Download size={12} strokeWidth={2} className="mr-1" />
                  Install
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Detail panel */}
      <McpDetailDialog
        row={detail}
        open={detail !== null}
        onOpenChange={(o) => { if (!o) setDetail(null) }}
        onUninstall={() => detail && void handleUninstall(detail)}
        onToggleDisabled={() => detail && void handleToggleDisabled(detail)}
        onSetup={() => detail && void handleSetup(detail)}
        busy={detail ? busy === detail.manifest.id : false}
      />

      {/* Add MCP dialog */}
      <AddMcpDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        installedIds={installedIds}
        onInstalled={(row) => {
          void refresh()
          if (row.manifest.credentials_schema.length > 0) {
            setWizardManifest(row.manifest)
          }
        }}
      />

      {/* Setup wizard — auto-chained after install or opened from detail panel */}
      {wizardManifest && (
        <McpSetupWizard
          manifest={wizardManifest}
          open={wizardManifest !== null}
          onOpenChange={(o) => { if (!o) setWizardManifest(null) }}
          onComplete={() => { setWizardManifest(null); void refresh() }}
        />
      )}
    </div>
  )
}
