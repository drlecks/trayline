import { useState } from 'react'
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react'
import type { HttpCredential } from '../../../shared/types'
import CredentialDialogShell from './CredentialDialogShell'

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
}

interface Props {
  existing?: HttpCredential
  onSaved: () => void
  onClose: () => void
}

export default function HttpCredentialDialog({ existing, onSaved, onClose }: Props) {
  const [name, setName] = useState(existing?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? '')
  const [timeoutMs, setTimeoutMs] = useState(String(existing?.timeout_ms ?? 15000))
  const [headers, setHeaders] = useState<Array<{ name: string; value: string; isSecret: boolean; secretValue: string }>>(
    existing?.headers.map((h) => ({
      name: h.name,
      value: h.value,
      isSecret: h.value.startsWith('{{secret:'),
      secretValue: '',
    })) ?? [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [revealedRows, setRevealedRows] = useState<Set<number>>(new Set())

  function addHeader() {
    setHeaders((h) => [...h, { name: '', value: '', isSecret: false, secretValue: '' }])
  }

  function removeHeader(i: number) {
    setHeaders((h) => h.filter((_, idx) => idx !== i))
  }

  function updateHeader(i: number, field: 'name' | 'value' | 'secretValue', val: string) {
    setHeaders((h) => h.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  function toggleSecret(i: number) {
    setHeaders((h) => h.map((r, idx) => idx === i ? { ...r, isSecret: !r.isSecret, secretValue: '' } : r))
  }

  function toggleReveal(i: number) {
    setRevealedRows((s) => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) { setError('Name is required'); return }
    if (!baseUrl.trim()) { setError('Base URL is required'); return }

    setSaving(true)
    setError('')
    try {
      const id = existing?.id ?? (slugify(name) || `http-${Date.now()}`)

      const credentialHeaders = headers
        .filter((h) => h.name.trim())
        .map((h) => ({
          name: h.name.trim(),
          value: h.isSecret ? `{{secret:${h.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')}}}` : h.value,
        }))

      const credential: HttpCredential = {
        id,
        type: 'http',
        name: name.trim(),
        base_url: baseUrl.trim().replace(/\/$/, ''),
        headers: credentialHeaders,
        timeout_ms: parseInt(timeoutMs) || 15000,
      }

      await window.trayline.credential.save(credential)

      // Save secrets
      for (const h of headers.filter((h) => h.isSecret && h.secretValue)) {
        const key = h.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_')
        await window.trayline.credential.saveSecret(id, key, h.secretValue)
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
      title={existing ? 'Edit HTTP Credential' : 'Add HTTP Credential'}
      onClose={onClose}
      onSave={() => void handleSave()}
      saving={saving}
      error={error}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Name</label>
          <input
            className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GitHub API"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Base URL</label>
          <input
            className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Timeout (ms)</label>
          <input
            type="number"
            className="w-32 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            value={timeoutMs}
            onChange={(e) => setTimeoutMs(e.target.value)}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium">Headers</label>
            <button
              type="button"
              onClick={addHeader}
              className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
            >
              <Plus size={12} /> Add header
            </button>
          </div>
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  className="flex-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Header name"
                  value={h.name}
                  onChange={(e) => updateHeader(i, 'name', e.target.value)}
                />
                {h.isSecret ? (
                  <div className="flex-[2] flex gap-1">
                    <input
                      type={revealedRows.has(i) ? 'text' : 'password'}
                      className="flex-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={existing ? '(stored — enter new value to update)' : 'Secret value'}
                      value={h.secretValue}
                      onChange={(e) => updateHeader(i, 'secretValue', e.target.value)}
                    />
                    <button type="button" onClick={() => toggleReveal(i)} className="p-1.5 text-neutral-400 hover:text-neutral-600">
                      {revealedRows.has(i) ? <EyeOff size={12} /> : <Eye size={12} />}
                    </button>
                  </div>
                ) : (
                  <input
                    className="flex-[2] text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                  />
                )}
                <button
                  type="button"
                  onClick={() => toggleSecret(i)}
                  className={`text-xs px-2 py-1.5 rounded border transition-colors ${h.isSecret ? 'border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-900/20' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-orange-300 hover:text-orange-600'}`}
                  title="Mark as secret (stored in OS keychain)"
                >
                  {h.isSecret ? '🔒' : '🔓'}
                </button>
                <button type="button" onClick={() => removeHeader(i)} className="p-1.5 text-neutral-400 hover:text-red-500">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          {headers.length === 0 && (
            <p className="text-xs text-neutral-400 italic">No headers — add one for auth tokens or custom headers.</p>
          )}
        </div>
      </div>
    </CredentialDialogShell>
  )
}
