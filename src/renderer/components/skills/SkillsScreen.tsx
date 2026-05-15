import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CheckSquare, Download, Plus, RefreshCw, Search, Square, Trash2, X } from 'lucide-react'
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
  SkillValidationResult,
  ValidationCheck,
} from '../../../shared/types'

type Tab = 'catalog' | 'url'

export default function SkillsScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const active = useProjectStore((s) => s.active)
  const all = useProjectStore((s) => s.all)
  const [installed, setInstalled] = useState<InstalledSkillRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function refreshInstalled() {
    setInstalled(await window.trayline.skills.listInstalled())
  }

  useEffect(() => { void refreshInstalled() }, [])

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
        onClick={() => setScreen(active ? 'project' : all.length > 0 ? 'projectList' : 'splash')}
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
    <li className={`rounded-md border px-3 py-2.5 flex items-start gap-3 ${
      skill.quarantined
        ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30'
        : 'border-neutral-200 dark:border-neutral-800'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium">{skill.manifest.name}</span>
          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400">v{skill.manifest.version}</span>
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500 capitalize">{skill.source}</span>
          {skill.quarantined && (
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <AlertTriangle size={10} strokeWidth={2} />
              quarantined
            </span>
          )}
          {skill.updateAvailable && !skill.quarantined && (
            <span className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-500">
              update {skill.updateAvailable} available
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{skill.manifest.description}</p>
        {skill.quarantined && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
            This skill failed on-disk security validation and will not be injected into worker prompts. Reinstall to restore it.
          </p>
        )}
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
            {skill.quarantined ? 'Reinstall' : 'Update'}
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
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add a skill</DialogTitle>
          <DialogDescription>
            Browse the public catalog or paste a URL to a skill directory.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800 mt-2 mb-4 shrink-0">
          <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')}>Browse catalog</TabButton>
          <TabButton active={tab === 'url'} onClick={() => setTab('url')}>From URL</TabButton>
        </div>

        <div className="overflow-y-auto flex-1">
          {tab === 'catalog' ? (
            <CatalogTab installedIds={installedIds} />
          ) : (
            <UrlTab installedIds={installedIds} onInstalled={() => onOpenChange(false)} />
          )}
        </div>
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

// ── Catalog tab ───────────────────────────────────────────────────────────────

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

      <div className="flex flex-col gap-2 pr-1">
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

// ── URL tab — multi-step validation flow ──────────────────────────────────────

type UrlStep = 'input' | 'validating' | 'checklist' | 'confirming' | 'installing' | 'done'

function UrlTab({ installedIds, onInstalled }: { installedIds: Set<string>; onInstalled: () => void }) {
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<UrlStep>('input')
  const [validation, setValidation] = useState<SkillValidationResult | null>(null)
  const [acceptedWarnings, setAcceptedWarnings] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  void installedIds

  async function handleValidate() {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!/^https?:\/\//i.test(trimmed)) {
      setError('URL must start with http:// or https://')
      return
    }
    setError(null)
    setStep('validating')
    try {
      const result = await window.trayline.skills.validateFromUrl(trimmed)
      setValidation(result)
      setAcceptedWarnings(new Set())
      setStep('checklist')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('input')
    }
  }

  async function handleCancel() {
    if (validation?.pendingTempDir) {
      await window.trayline.skills.cancelValidation(validation.pendingTempDir).catch(() => {})
    }
    setValidation(null)
    setAcceptedWarnings(new Set())
    setStep('input')
  }

  function handleProceedToConfirm() {
    setStep('confirming')
  }

  async function handleInstall() {
    if (!validation?.pendingTempDir || !validation.sourceUrl) return
    setStep('installing')
    try {
      await window.trayline.skills.confirmInstall(
        validation.pendingTempDir,
        [...acceptedWarnings],
        validation.sourceUrl,
        'url',
      )
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('checklist')
    }
  }

  function handleDone() {
    onInstalled()
  }

  const warns = (validation?.checks ?? []).filter((c) => c.status === 'warn')
  const allWarningsAccepted = warns.every((c) => acceptedWarnings.has(c.id))
  const canProceed = validation && !validation.hasFail

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
          <Check size={20} strokeWidth={2} className="text-green-600 dark:text-green-400" />
        </div>
        <p className="text-sm font-medium">Skill installed successfully</p>
        {validation?.manifest && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {validation.manifest.name} v{validation.manifest.version} is ready to use.
          </p>
        )}
        <Button size="sm" onClick={handleDone}>Close</Button>
      </div>
    )
  }

  if (step === 'installing') {
    return (
      <div className="flex flex-col items-center gap-3 py-8">
        <RefreshCw size={20} strokeWidth={1.75} className="animate-spin text-neutral-400" />
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Installing skill…</p>
      </div>
    )
  }

  if (step === 'confirming' && validation) {
    return <ConfirmStep
      validation={validation}
      warns={warns}
      acceptedWarnings={acceptedWarnings}
      onToggleWarning={(id) =>
        setAcceptedWarnings((s) => {
          const next = new Set(s)
          next.has(id) ? next.delete(id) : next.add(id)
          return next
        })
      }
      allWarningsAccepted={allWarningsAccepted}
      onBack={() => setStep('checklist')}
      onInstall={() => void handleInstall()}
      error={error}
    />
  }

  if ((step === 'checklist' || step === 'validating') && validation) {
    return <ChecklistStep
      validation={validation}
      loading={step === 'validating'}
      canProceed={!!canProceed}
      onBack={() => void handleCancel()}
      onContinue={handleProceedToConfirm}
      error={error}
    />
  }

  // input step
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Paste the URL of a directory containing <code className="font-mono">skill.json</code> and{' '}
        <code className="font-mono">skill.md</code>. For GitHub, use the raw content URL.
      </p>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void handleValidate() }}
        placeholder="https://raw.githubusercontent.com/user/repo/main/skill-folder/"
        className="w-full text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 px-2.5 py-1.5 font-mono"
      />
      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      {step === 'validating' && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
          Fetching and validating skill…
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={() => void handleValidate()} disabled={!url.trim() || step === 'validating'}>
          {step === 'validating' ? (
            <><RefreshCw size={12} strokeWidth={2} className="mr-1 animate-spin" />Validating…</>
          ) : (
            'Validate'
          )}
        </Button>
      </div>
    </div>
  )
}

function ChecklistStep({
  validation,
  loading,
  canProceed,
  onBack,
  onContinue,
  error,
}: {
  validation: SkillValidationResult
  loading: boolean
  canProceed: boolean
  onBack: () => void
  onContinue: () => void
  error: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <RefreshCw size={12} strokeWidth={2} className="animate-spin" />
          Running security checks…
        </div>
      )}

      <div className="flex flex-col gap-1">
        {validation.checks.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </div>

      {validation.hasFail && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          Validation failed. Fix the errors above and try a different URL, or contact the skill author.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
          ← Try a different URL
        </button>
        {canProceed && (
          <Button size="sm" onClick={onContinue}>
            Continue to install →
          </Button>
        )}
      </div>
    </div>
  )
}

function CheckRow({ check }: { check: ValidationCheck }) {
  const [expanded, setExpanded] = useState(false)
  const hasDetail = !!(check.message || (check.matches && check.matches.length > 0))

  const icon = check.status === 'pass'
    ? <Check size={12} strokeWidth={2.5} className="text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
    : check.status === 'fail'
      ? <X size={12} strokeWidth={2.5} className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
      : <AlertTriangle size={12} strokeWidth={2.5} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />

  const labelColor = check.status === 'pass'
    ? 'text-neutral-700 dark:text-neutral-300'
    : check.status === 'fail'
      ? 'text-red-700 dark:text-red-300'
      : 'text-amber-700 dark:text-amber-300'

  return (
    <div className="flex flex-col">
      <button
        className={`flex items-start gap-2 py-1 text-left ${hasDetail ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={() => hasDetail && setExpanded((x) => !x)}
        disabled={!hasDetail}
      >
        {icon}
        <span className={`text-xs flex-1 ${labelColor}`}>{check.label}</span>
        {hasDetail && (
          <span className="text-[10px] text-neutral-400">{expanded ? '▲' : '▼'}</span>
        )}
      </button>
      {expanded && hasDetail && (
        <div className="ml-5 mb-1 text-[11px] text-neutral-600 dark:text-neutral-400 space-y-1">
          {check.message && <p>{check.message}</p>}
          {check.matches && check.matches.length > 0 && (
            <ul className="space-y-0.5">
              {check.matches.map((m, i) => (
                <li key={i} className="font-mono text-[10px] bg-neutral-100 dark:bg-neutral-900 rounded px-2 py-0.5">{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function ConfirmStep({
  validation,
  warns,
  acceptedWarnings,
  onToggleWarning,
  allWarningsAccepted,
  onBack,
  onInstall,
  error,
}: {
  validation: SkillValidationResult
  warns: ValidationCheck[]
  acceptedWarnings: Set<string>
  onToggleWarning: (id: string) => void
  allWarningsAccepted: boolean
  onBack: () => void
  onInstall: () => void
  error: string | null
}) {
  const m = validation.manifest

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 px-4 py-3 space-y-2">
        <h3 className="text-xs font-semibold">Skill summary</h3>
        {m && (
          <div className="space-y-0.5">
            <div className="flex gap-2 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">Name</span>
              <span>{m.name}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">ID</span>
              <span className="font-mono">{m.id}</span>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">Version</span>
              <span>{m.version}</span>
            </div>
            {m.description && (
              <div className="flex gap-2 text-xs">
                <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">Description</span>
                <span>{m.description}</span>
              </div>
            )}
            {validation.sourceUrl && (
              <div className="flex gap-2 text-xs">
                <span className="text-neutral-500 dark:text-neutral-400 w-20 shrink-0">Source</span>
                <span className="font-mono break-all text-[10px]">{validation.sourceUrl}</span>
              </div>
            )}
          </div>
        )}
        {validation.fileList.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">Files</p>
            <ul className="space-y-0.5">
              {validation.fileList.map((f) => (
                <li key={f.name} className="flex justify-between text-[10px] font-mono text-neutral-600 dark:text-neutral-400">
                  <span>{f.name}</span>
                  <span>{f.sizeBytes < 1024 ? `${f.sizeBytes} B` : `${Math.round(f.sizeBytes / 1024)} KB`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {warns.length > 0 && (
        <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 space-y-3">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {warns.length === 1 ? 'Warning requires your confirmation' : `${warns.length} warnings require your confirmation`}
          </p>
          {warns.map((w) => (
            <div key={w.id} className="space-y-1">
              <label className="flex items-start gap-2 cursor-pointer" onClick={() => onToggleWarning(w.id)}>
                <span className="mt-0.5 shrink-0">
                  {acceptedWarnings.has(w.id)
                    ? <CheckSquare size={14} strokeWidth={2} className="text-amber-700 dark:text-amber-400" />
                    : <Square size={14} strokeWidth={2} className="text-neutral-400" />}
                </span>
                <span className="text-xs text-amber-800 dark:text-amber-300">
                  I have reviewed and accept the risk: <strong>{w.label}</strong>
                </span>
              </label>
              {w.matches && w.matches.length > 0 && (
                <ul className="ml-5 space-y-0.5">
                  {w.matches.map((m, i) => (
                    <li key={i} className="font-mono text-[10px] bg-amber-100/50 dark:bg-amber-950/60 rounded px-2 py-0.5 text-amber-800 dark:text-amber-300">{m}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200">
          ← Back to checklist
        </button>
        <Button
          size="sm"
          disabled={!allWarningsAccepted}
          onClick={onInstall}
        >
          <Download size={12} strokeWidth={2} className="mr-1" />
          Install
        </Button>
      </div>
    </div>
  )
}
