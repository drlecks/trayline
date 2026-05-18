import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Pencil, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { CredentialSummary, Credential } from '../../../shared/types'
import HttpCredentialDialog from './HttpCredentialDialog'
import ImapCredentialDialog from './ImapCredentialDialog'
import SmtpCredentialDialog from './SmtpCredentialDialog'

type CredentialType = 'http' | 'imap' | 'smtp'

const TYPE_LABEL: Record<CredentialType, string> = {
  http: 'HTTP',
  imap: 'IMAP',
  smtp: 'SMTP',
}

const TYPE_COLOR: Record<CredentialType, string> = {
  http: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  imap: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  smtp: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

type TestState = 'idle' | 'testing' | 'ok' | 'fail'

export default function CredentialsScreen() {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [addType, setAddType] = useState<CredentialType | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editCredential, setEditCredential] = useState<Credential | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [testStates, setTestStates] = useState<Record<string, TestState>>({})
  const [testErrors, setTestErrors] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const list = await window.trayline.credential.list()
    setCredentials(list)
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleDelete(id: string) {
    await window.trayline.credential.delete(id)
    setDeleteConfirm(null)
    await load()
  }

  async function handleTest(id: string) {
    setTestStates((s) => ({ ...s, [id]: 'testing' }))
    setTestErrors((e) => { const n = { ...e }; delete n[id]; return n })
    const result = await window.trayline.credential.testConnection(id)
    setTestStates((s) => ({ ...s, [id]: result.ok ? 'ok' : 'fail' }))
    if (!result.ok && result.error) {
      setTestErrors((e) => ({ ...e, [id]: result.error! }))
    }
    setTimeout(() => setTestStates((s) => ({ ...s, [id]: 'idle' })), 4000)
  }

  async function handleEdit(id: string) {
    const c = await window.trayline.credential.get(id)
    if (c) { setEditCredential(c); setEditId(id) }
  }

  function closeDialogs() {
    setAddType(null)
    setEditId(null)
    setEditCredential(null)
  }

  async function handleSaved() {
    closeDialogs()
    await load()
  }

  return (
    <div className="flex-1 max-w-2xl mx-auto px-6 py-8 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Credentials</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-0.5">
            Named auth configs for external services — used by Sources and Outlets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['http', 'imap', 'smtp'] as CredentialType[]).map((t) => (
            <button
              key={t}
              onClick={() => setAddType(t)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              <Plus size={13} strokeWidth={2.5} />
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {credentials.length === 0 ? (
        <div className="text-center py-20 text-neutral-400 dark:text-neutral-600">
          <p className="text-sm">No credentials yet.</p>
          <p className="text-sm mt-1">Add one to connect your workflows to external services.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {credentials.map((c) => {
            const ts = testStates[c.id] ?? 'idle'
            return (
              <li
                key={c.id}
                className="flex items-center justify-between p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              >
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLOR[c.type]}`}>
                    {TYPE_LABEL[c.type]}
                  </span>
                  <span className="font-medium text-sm">{c.name}</span>
                  <span className="text-xs text-neutral-400 font-mono">{c.id}</span>
                </div>

                <div className="flex items-center gap-2">
                  {testErrors[c.id] && ts === 'idle' && (
                    <span className="text-xs text-red-500 max-w-[200px] truncate">{testErrors[c.id]}</span>
                  )}
                  {ts === 'ok' && <CheckCircle2 size={15} className="text-emerald-500" />}
                  {ts === 'fail' && <XCircle size={15} className="text-red-500" />}

                  <button
                    onClick={() => void handleTest(c.id)}
                    disabled={ts === 'testing'}
                    className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50"
                  >
                    {ts === 'testing' ? <Loader2 size={12} className="animate-spin" /> : 'Test'}
                  </button>

                  <button
                    onClick={() => void handleEdit(c.id)}
                    className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500"
                    title="Edit"
                  >
                    <Pencil size={13} />
                  </button>

                  {deleteConfirm === c.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void handleDelete(c.id)}
                        className="text-xs px-2 py-1 rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(c.id)}
                      className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors text-neutral-500 hover:text-red-500"
                      title="Delete — also deletes stored passwords"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {addType === 'http' && (
        <HttpCredentialDialog onSaved={handleSaved} onClose={closeDialogs} />
      )}
      {addType === 'imap' && (
        <ImapCredentialDialog onSaved={handleSaved} onClose={closeDialogs} />
      )}
      {addType === 'smtp' && (
        <SmtpCredentialDialog onSaved={handleSaved} onClose={closeDialogs} />
      )}
      {editId && editCredential?.type === 'http' && (
        <HttpCredentialDialog existing={editCredential as import('../../../shared/types').HttpCredential} onSaved={handleSaved} onClose={closeDialogs} />
      )}
      {editId && editCredential?.type === 'imap' && (
        <ImapCredentialDialog existing={editCredential as import('../../../shared/types').ImapCredential} onSaved={handleSaved} onClose={closeDialogs} />
      )}
      {editId && editCredential?.type === 'smtp' && (
        <SmtpCredentialDialog existing={editCredential as import('../../../shared/types').SmtpCredential} onSaved={handleSaved} onClose={closeDialogs} />
      )}
    </div>
  )
}
