import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import type { ImapCredential } from '../../../shared/types'
import CredentialDialogShell from './CredentialDialogShell'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

interface Props {
  existing?: ImapCredential
  onSaved: () => void
  onClose: () => void
}

export default function ImapCredentialDialog({ existing, onSaved, onClose }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [host, setHost] = useState(existing?.host ?? '')
  const [port, setPort] = useState(String(existing?.port ?? 993))
  const [secure, setSecure] = useState(existing?.secure ?? true)
  const [username, setUsername] = useState(existing?.username ?? '')
  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!host.trim()) { setError('Host is required'); return }
    if (!username.trim()) { setError('Username is required'); return }
    if (!existing && !password) { setError('Password is required'); return }

    setSaving(true)
    setError('')
    try {
      const id = existing?.id ?? (slugify(name) || `imap-${Date.now()}`)
      const credential: ImapCredential = {
        id, type: 'imap', name: name.trim(), host: host.trim(),
        port: parseInt(port) || 993, secure, username: username.trim(),
      }
      await window.trayline.credential.save(credential)
      if (password) {
        await window.trayline.credential.saveSecret(id, 'password', password)
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <CredentialDialogShell
      title={existing ? 'Edit IMAP Credential' : 'Add IMAP Credential'}
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      error={error}
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Gmail Inbox" />
        </Field>
        <Field label="Host">
          <input className={`${inputCls} font-mono`} value={host} onChange={(e) => setHost(e.target.value)} placeholder="imap.gmail.com" />
        </Field>
        <div className="flex gap-4">
          <Field label="Port" className="w-28">
            <input type="number" className={inputCls} value={port} onChange={(e) => setPort(e.target.value)} />
          </Field>
          <Field label="Secure (SSL/TLS)">
            <button
              type="button"
              onClick={() => setSecure((s) => !s)}
              className={`mt-1 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${secure ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'}`}
            >
              {secure ? 'On' : 'Off'}
            </button>
          </Field>
        </div>
        <Field label="Username">
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="user@gmail.com" />
        </Field>
        <Field label={existing ? 'Password (leave blank to keep current)' : 'Password'}>
          <div className="flex gap-2">
            <input
              type={reveal ? 'text' : 'password'}
              className={`${inputCls} flex-1`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={existing ? '(stored — enter new to update)' : ''}
            />
            <button type="button" onClick={() => setReveal((r) => !r)} className="p-2 text-neutral-400 hover:text-neutral-600">
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
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
