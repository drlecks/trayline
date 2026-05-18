import { useState } from 'react'
import { Eye, EyeOff, ExternalLink } from 'lucide-react'
import type { SmtpCredential } from '../../../shared/types'
import CredentialDialogShell from './CredentialDialogShell'
import { CREDENTIAL_PROVIDERS } from '../../lib/credential-providers'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

const SMTP_PROVIDERS = CREDENTIAL_PROVIDERS.filter((p) => p.id === 'custom' || p.smtp)

interface Props {
  existing?: SmtpCredential
  onSaved: () => void
  onClose: () => void
}

export default function SmtpCredentialDialog({ existing, onSaved, onClose }: Props) {
  const [providerId, setProviderId] = useState<string>(() => {
    if (!existing) return 'gmail'
    const match = SMTP_PROVIDERS.find(
      (p) => p.smtp && p.smtp.host === existing.host && p.smtp.port === existing.port,
    )
    return match?.id ?? 'custom'
  })

  const provider = SMTP_PROVIDERS.find((p) => p.id === providerId) ?? SMTP_PROVIDERS[SMTP_PROVIDERS.length - 1]
  const isCustom = providerId === 'custom'
  const preset = provider.smtp

  const [name, setName] = useState(existing?.name ?? (!isCustom ? provider.name : ''))
  const [host, setHost] = useState(existing?.host ?? (preset?.host ?? ''))
  const [port, setPort] = useState(String(existing?.port ?? (preset?.port ?? 587)))
  const [secure, setSecure] = useState(existing?.secure ?? (preset?.secure ?? false))
  const [username, setUsername] = useState(existing?.username ?? '')
  const [password, setPassword] = useState('')
  const [fromName, setFromName] = useState(existing?.from_name ?? '')
  const [fromAddress, setFromAddress] = useState(existing?.from_address ?? '')
  const [reveal, setReveal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function applyProvider(id: string) {
    setProviderId(id)
    const p = SMTP_PROVIDERS.find((p) => p.id === id)
    if (!p) return
    if (!existing) {
      if (p.smtp) {
        setHost(p.smtp.host)
        setPort(String(p.smtp.port))
        setSecure(p.smtp.secure)
        if (!name || SMTP_PROVIDERS.some((x) => x.name === name)) setName(p.id === 'custom' ? '' : p.name)
      } else {
        setHost('')
        setPort('587')
        setSecure(false)
        setName('')
      }
    }
  }

  const passwordLabel = (!isCustom && provider.authGuide?.passwordLabel) ? provider.authGuide.passwordLabel : 'Password'

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!host.trim()) { setError('Host is required'); return }
    if (!username.trim()) { setError('Username is required'); return }
    if (!fromAddress.trim()) { setError('From address is required'); return }
    if (!existing && !password) { setError(`${passwordLabel} is required`); return }

    setSaving(true)
    setError('')
    try {
      const id = existing?.id ?? (slugify(name) || `smtp-${Date.now()}`)
      const credential: SmtpCredential = {
        id, type: 'smtp', name: name.trim(), host: host.trim(),
        port: parseInt(port) || 587, secure, username: username.trim(),
        from_name: fromName.trim(), from_address: fromAddress.trim(),
      }
      await window.trayline.credential.save(credential)
      if (password) await window.trayline.credential.saveSecret(id, 'password', password)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <CredentialDialogShell
      title={existing ? 'Edit SMTP Credential' : 'Add SMTP Credential'}
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      error={error}
    >
      <div className="space-y-4">
        {/* Provider picker */}
        {!existing && (
          <div>
            <label className="block text-xs font-medium mb-1.5">Provider</label>
            <div className="flex flex-wrap gap-1.5">
              {SMTP_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyProvider(p.id)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    providerId === p.id
                      ? 'border-neutral-800 dark:border-neutral-200 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
                      : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={preset ? provider.name : 'My SMTP'} />
        </Field>

        <Field label="Host">
          <input
            className={`${inputCls} font-mono ${!isCustom ? 'bg-neutral-50 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400' : ''}`}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            readOnly={!isCustom}
            placeholder="smtp.example.com"
          />
        </Field>

        <div className="flex gap-4">
          <Field label="Port" className="w-28">
            <input
              type="number"
              className={`${inputCls} ${!isCustom ? 'bg-neutral-50 dark:bg-neutral-800/50 text-neutral-500 dark:text-neutral-400' : ''}`}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              readOnly={!isCustom}
            />
          </Field>
          <Field label="Secure (SSL/TLS)">
            <button
              type="button"
              onClick={() => isCustom && setSecure((s) => !s)}
              className={`mt-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                secure
                  ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
              } ${!isCustom ? 'opacity-60 cursor-default' : ''}`}
            >
              {secure ? 'On' : 'Off'}
            </button>
          </Field>
        </div>

        <Field label="Username (email address)">
          <input
            className={inputCls}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="you@gmail.com"
            autoComplete="username"
          />
        </Field>

        {/* App Password guide */}
        {!isCustom && provider.authGuide && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3">
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mb-2 leading-relaxed">
              {provider.authGuide.helpText}
            </p>
            <ol className="space-y-1 mb-2.5">
              {provider.authGuide.steps.map((step, i) => (
                <li key={i} className="flex gap-2 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                  <span className="shrink-0 font-semibold">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <a
              href={provider.authGuide.settingsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open {provider.name} settings
              <ExternalLink size={10} strokeWidth={2} />
            </a>
          </div>
        )}

        <Field label={existing ? `${passwordLabel} (leave blank to keep current)` : passwordLabel}>
          <div className="flex gap-2">
            <input
              type={reveal ? 'text' : 'password'}
              className={`${inputCls} flex-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={existing ? '(stored — enter new to update)' : ''}
              autoComplete="current-password"
            />
            <button type="button" onClick={() => setReveal((r) => !r)} className="p-2 text-neutral-400 hover:text-neutral-600">
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>

        <Field label="From name">
          <input className={inputCls} value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Alex" />
        </Field>
        <Field label="From address">
          <input className={inputCls} value={fromAddress} onChange={(e) => setFromAddress(e.target.value)} placeholder="you@gmail.com" />
        </Field>
      </div>
    </CredentialDialogShell>
  )
}

const inputCls = 'w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500'

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium mb-1">{label}</label>
      {children}
    </div>
  )
}
