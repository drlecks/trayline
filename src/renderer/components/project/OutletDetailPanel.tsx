import { useEffect, useState, useCallback } from 'react'
import { Send } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta, OutletStepConfig, OutletRunMeta, OutletRunEvent, CredentialSummary } from '../../../shared/types'

type Tab = 'config' | 'runs'

interface Props {
  step: StepMeta
}

export default function OutletDetailPanel({ step }: Props) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const [tab, setTab] = useState<Tab>('config')
  const [config, setConfig] = useState<OutletStepConfig | null>(null)
  const [runs, setRuns] = useState<OutletRunMeta[]>([])
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const loadConfig = useCallback(async () => {
    if (!active || !workflow) return
    try {
      const raw = await window.trayline.project.listSteps(active.name, workflow.name)
      const s = raw.find((r) => r.id === step.id)
      if (s) setConfig(s.raw as unknown as OutletStepConfig)
    } catch { /* ignore */ }
  }, [active, workflow, step.id])

  const loadRuns = useCallback(async () => {
    if (!active || !workflow) return
    try {
      const r = await window.trayline.outlet.listRuns(active.name, workflow.name, step.id)
      setRuns(r)
    } catch { /* ignore */ }
  }, [active, workflow, step.id])

  useEffect(() => { void loadConfig() }, [loadConfig])
  useEffect(() => { void loadRuns() }, [loadRuns])

  useEffect(() => {
    void window.trayline.credential.list().then((list) => {
      setCredentials(list)
    })
  }, [])

  // Listen for run events to refresh runs list
  useEffect(() => {
    const offC = window.trayline.outlet.onCompleted((ev: OutletRunEvent) => {
      if (ev.stepId === step.id) void loadRuns()
    })
    const offF = window.trayline.outlet.onFailed((ev: OutletRunEvent) => {
      if (ev.stepId === step.id) void loadRuns()
    })
    return () => { offC(); offF() }
  }, [step.id, loadRuns])

  async function handleSave() {
    if (!active || !workflow || !config) return
    setSaving(true)
    setSaveError('')
    try {
      await window.trayline.step.update({
        project: active.name,
        workflow: workflow.name,
        stepId: step.id,
        patch: { channel: config.channel },
      })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const channelType = config?.channel?.type ?? 'smtp'
  const smtpCreds = credentials.filter((c) => c.type === 'smtp')
  const httpCreds = credentials.filter((c) => c.type === 'http')

  function updateChannel(patch: Record<string, unknown>) {
    if (!config) return
    setConfig({ ...config, channel: { ...config.channel, ...patch } as OutletStepConfig['channel'] })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center text-white">
          <Send size={16} strokeWidth={2} />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{step.name}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Outlet · {channelType === 'smtp' ? 'SMTP email' : 'HTTP POST'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3 border-b border-black/[0.06] dark:border-white/[0.06]">
        {(['config', 'runs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-xs font-medium rounded-t capitalize transition-colors ${tab === t ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100' : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'config' && config && (
          <div className="px-6 py-5 space-y-5 max-w-xl">
            {/* Channel type */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Channel type</label>
              <div className="flex gap-2">
                {(['smtp', 'http_post'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => updateChannel({ type: t, credential_id: '' })}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${channelType === t ? 'border-violet-400 bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-300'}`}
                  >
                    {t === 'smtp' ? 'SMTP email' : 'HTTP POST'}
                  </button>
                ))}
              </div>
            </div>

            {/* Credential */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Credential</label>
              <select
                className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-violet-500"
                value={config.channel.credential_id}
                onChange={(e) => updateChannel({ credential_id: e.target.value })}
              >
                <option value="">— Select credential —</option>
                {(channelType === 'smtp' ? smtpCreds : httpCreds).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {(channelType === 'smtp' ? smtpCreds : httpCreds).length === 0 && (
                <p className="text-xs text-neutral-400 mt-1">
                  No {channelType === 'smtp' ? 'SMTP' : 'HTTP'} credentials yet —{' '}
                  <button className="text-violet-500 hover:underline" onClick={() => useProjectStore.getState().setScreen('credentials')}>
                    add one in Credentials
                  </button>
                </p>
              )}
            </div>

            {channelType === 'smtp' && (
              <>
                <TemplateField label="To" value={(config.channel as { to: string }).to ?? ''} onChange={(v) => updateChannel({ to: v })} placeholder="{{card.data.email}}" />
                <TemplateField label="Subject" value={(config.channel as { subject: string }).subject ?? ''} onChange={(v) => updateChannel({ subject: v })} placeholder="{{card.data.subject}}" />
                <TemplateField label="Body" multiline value={(config.channel as { body: string }).body ?? ''} onChange={(v) => updateChannel({ body: v })} placeholder="{{card.data}}" />
              </>
            )}

            {channelType === 'http_post' && (
              <>
                <TemplateField label="URL path" value={(config.channel as { url_path: string }).url_path ?? ''} onChange={(v) => updateChannel({ url_path: v })} placeholder="/endpoint/{{card.data.id}}" />
                <div>
                  <label className="block text-xs font-medium mb-1.5">Method</label>
                  <select
                    className="w-28 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none"
                    value={(config.channel as { method?: string }).method ?? 'POST'}
                    onChange={(e) => updateChannel({ method: e.target.value })}
                  >
                    <option>POST</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                  </select>
                </div>
                <TemplateField label="Body" multiline value={(config.channel as { body?: string }).body ?? ''} onChange={(v) => updateChannel({ body: v })} placeholder='{"data": {{card.data | json}}}' />
              </>
            )}

            <div className="text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-900 rounded-md p-3 space-y-1">
              <p className="font-medium text-neutral-500">Available tokens</p>
              <p><code className="font-mono">{'{{card.data.field}}'}</code> — specific field value</p>
              <p><code className="font-mono">{'{{card.data}}'}</code> — full card as pretty JSON</p>
              <p><code className="font-mono">{'{{card.data | json}}'}</code> — full card as compact JSON string</p>
            </div>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}

            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="px-4 py-2 text-sm bg-violet-500 text-white rounded-md hover:bg-violet-600 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {tab === 'runs' && (
          <div className="px-6 py-5">
            {runs.length === 0 ? (
              <p className="text-sm text-neutral-400">No runs yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                    <th className="text-left pb-2 font-medium">Time</th>
                    <th className="text-left pb-2 font-medium">Card</th>
                    <th className="text-left pb-2 font-medium">Channel</th>
                    <th className="text-left pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.run_id} className="border-b border-neutral-100 dark:border-neutral-800/50">
                      <td className="py-2 text-neutral-500">{new Date(r.started_at).toLocaleString()}</td>
                      <td className="py-2 font-mono text-neutral-600 dark:text-neutral-400 truncate max-w-[120px]">{r.card_id}</td>
                      <td className="py-2 text-neutral-500">{r.channel_type}</td>
                      <td className="py-2">
                        <span className={`px-1.5 py-0.5 rounded-full font-medium ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : r.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-neutral-100 text-neutral-600'}`}>
                          {r.status}
                        </span>
                        {r.error && <span className="ml-2 text-red-500 truncate max-w-[200px] inline-block align-bottom" title={r.error}>{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateField({ label, value, onChange, placeholder, multiline }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const cls = 'w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-violet-500'
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5">{label}</label>
      {multiline ? (
        <textarea
          className={`${cls} resize-y min-h-[80px]`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input className={cls} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}
