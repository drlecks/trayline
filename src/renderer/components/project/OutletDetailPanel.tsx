import { useEffect, useState, useCallback } from 'react'
import { Send, RotateCcw, Copy, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '@/stores/project-store'
import type { StepMeta, OutletStepConfig, OutletRunMeta, OutletRunEvent, CredentialSummary, FileExportFormat, FileExportFieldMap } from '../../../shared/types'

type Tab = 'config' | 'runs'

interface Props {
  step: StepMeta
}

export default function OutletDetailPanel({ step }: Props) {
  const active = useProjectStore((s) => s.active)
  const workflow = useProjectStore((s) => s.workflow)
  const steps = useProjectStore((s) => s.steps)
  const [tab, setTab] = useState<Tab>('config')
  const [config, setConfig] = useState<OutletStepConfig | null>(null)
  const [runs, setRuns] = useState<OutletRunMeta[]>([])
  const [credentials, setCredentials] = useState<CredentialSummary[]>([])

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
  useEffect(() => { void window.trayline.credential.list().then(setCredentials) }, [])

  useEffect(() => {
    const offC = window.trayline.outlet.onCompleted((ev: OutletRunEvent) => {
      if (ev.stepId === step.id) void loadRuns()
    })
    const offF = window.trayline.outlet.onFailed((ev: OutletRunEvent) => {
      if (ev.stepId === step.id) void loadRuns()
    })
    return () => { offC(); offF() }
  }, [step.id, loadRuns])

  const refreshSteps = useProjectStore((s) => s.refreshSteps)

  async function save(patch: Record<string, unknown>) {
    if (!active || !workflow) return
    try {
      await window.trayline.step.update({ project: active.name, workflow: workflow.name, stepId: step.id, patch })
      setConfig((c) => c ? { ...c, ...patch } as OutletStepConfig : c)
      void refreshSteps()
    } catch { /* ignore */ }
  }

  function saveChannel(channelPatch: Record<string, unknown>) {
    if (!config) return
    const next = { ...config.channel, ...channelPatch } as OutletStepConfig['channel']
    setConfig({ ...config, channel: next })
    void save({ channel: next })
  }

  async function retryRun(run: OutletRunMeta) {
    if (!active || !workflow || !config) return
    const idx = steps.findIndex((s) => s.id === step.id)
    const prevStep = idx > 0 ? steps[idx - 1] : null
    if (!prevStep) return
    await window.trayline.outlet.runNow(active.name, workflow.name, step.id, run.card_id, prevStep.id, config)
    void loadRuns()
  }

  const channelType = config?.channel?.type ?? 'smtp'
  const smtpCreds = credentials.filter((c) => c.type === 'smtp')
  const httpCreds = credentials.filter((c) => c.type === 'http')

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-teal-500 flex items-center justify-center text-white">
          <Send size={16} strokeWidth={2} />
        </div>
        <div>
          <h2 className="font-semibold text-sm">{step.name}</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Outlet · {channelType === 'smtp' ? 'SMTP email' : channelType === 'http_post' ? 'HTTP POST' : 'File export'}</p>
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
          <div key={step.id} className="px-6 py-5 space-y-5 max-w-xl">
            {/* Channel type */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Channel type</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { type: 'smtp', label: 'SMTP email' },
                  { type: 'http_post', label: 'HTTP POST' },
                  { type: 'file_export', label: 'File export' },
                ] as const).map(({ type: t, label }) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === 'file_export') {
                        saveChannel({ type: t, directory_path: '', filename_template: '{{card.id}}.txt', format: 'txt', append: false, body_template: '{{card.data}}' })
                      } else {
                        saveChannel({ type: t, credential_id: '' })
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${channelType === t ? 'border-teal-400 bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' : 'border-neutral-200 dark:border-neutral-700 text-neutral-500 hover:border-neutral-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Credential (smtp / http_post only — file_export uses local filesystem) */}
            {(channelType === 'smtp' || channelType === 'http_post') && (
              <div>
                <label className="block text-xs font-medium mb-1.5">Credential</label>
                <select
                  className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  value={(config.channel as { credential_id?: string }).credential_id ?? ''}
                  onChange={(e) => saveChannel({ credential_id: e.target.value })}
                >
                  <option value="">— Select credential —</option>
                  {(channelType === 'smtp' ? smtpCreds : httpCreds).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {(channelType === 'smtp' ? smtpCreds : httpCreds).length === 0 && (
                  <p className="text-xs text-neutral-400 mt-1">
                    No {channelType === 'smtp' ? 'SMTP' : 'HTTP'} credentials yet —{' '}
                    <button className="text-teal-500 hover:underline" onClick={() => useProjectStore.getState().setScreen('credentials')}>
                      add one in Credentials
                    </button>
                  </p>
                )}
              </div>
            )}

            {channelType === 'smtp' && (
              <>
                <TemplateField label="To" defaultValue={(config.channel as { to?: string }).to ?? ''} onBlur={(v) => saveChannel({ to: v })} placeholder="{{card.data.email}}" />
                <TemplateField label="Subject" defaultValue={(config.channel as { subject?: string }).subject ?? ''} onBlur={(v) => saveChannel({ subject: v })} placeholder="{{card.data.subject}}" />
                <TemplateField label="Body" multiline defaultValue={(config.channel as { body?: string }).body ?? ''} onBlur={(v) => saveChannel({ body: v })} placeholder="{{card.data}}" />
              </>
            )}

            {channelType === 'http_post' && (
              <>
                <div>
                  <label className="block text-xs font-medium mb-1.5">URL path <span className="font-normal text-neutral-400">(optional)</span></label>
                  <input
                    className="w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    defaultValue={(config.channel as { url_path?: string }).url_path ?? ''}
                    onBlur={(e) => saveChannel({ url_path: e.target.value })}
                    placeholder="/endpoint/{{card.data.id}}"
                  />
                  <p className="text-xs text-neutral-400 mt-1">Leave empty to POST directly to the credential's base URL (e.g. for Discord / Slack webhooks).</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5">Method</label>
                  <select
                    className="w-28 text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none"
                    value={(config.channel as { method?: string }).method ?? 'POST'}
                    onChange={(e) => saveChannel({ method: e.target.value })}
                  >
                    <option>POST</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                  </select>
                </div>
                <TemplateField label="Body" multiline defaultValue={(config.channel as { body?: string }).body ?? ''} onBlur={(v) => saveChannel({ body: v })} placeholder='{"content": "{{card.data.message}}"}' />
              </>
            )}

            {channelType === 'file_export' && (
              <FileExportConfig config={config} saveChannel={saveChannel} />
            )}

            {channelType !== 'file_export' && (
              <div className="text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-900 rounded-md p-3 space-y-1">
                <p className="font-medium text-neutral-500">Available tokens</p>
                <p><code className="font-mono">{'{{card.data.field}}'}</code> — specific field value</p>
                <p><code className="font-mono">{'{{card.data}}'}</code> — full card as pretty JSON</p>
                <p><code className="font-mono">{'{{card.data | json}}'}</code> — full card as compact JSON string</p>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1.5">Instructions (optional)</label>
              <textarea
                defaultValue={config.prompt ?? ''}
                onBlur={(e) => void save({ prompt: e.target.value.trim() || null })}
                rows={4}
                className="w-full text-sm rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                placeholder="e.g. Format the card data as a professional client-facing email. Keep it under 200 words."
              />
              <p className="text-xs text-neutral-400 mt-1">If set, the AI will format the card data using these instructions before sending.</p>
            </div>
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
                        <div className="flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded-full font-medium ${r.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : r.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-neutral-100 text-neutral-600'}`}>
                            {r.status}
                          </span>
                          {r.status === 'failed' && (
                            <button
                              title="Retry"
                              onClick={() => void retryRun(r)}
                              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                            >
                              <RotateCcw size={10} strokeWidth={2} /> Retry
                            </button>
                          )}
                          {r.error && (
                            <span className="flex items-center gap-1 min-w-0">
                              <span className="text-red-500 truncate max-w-[160px] inline-block align-bottom" title={r.error}>{r.error}</span>
                              <button
                                title="Copy full error"
                                onClick={() => void navigator.clipboard.writeText(
                                  `Run: ${r.run_id}\nCard: ${r.card_id}\nChannel: ${r.channel_type}\nStarted: ${r.started_at}\nError: ${r.error}`
                                )}
                                className="shrink-0 p-0.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                              >
                                <Copy size={10} strokeWidth={2} />
                              </button>
                            </span>
                          )}
                        </div>
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

const APPEND_FORMATS: FileExportFormat[] = ['txt', 'csv', 'xlsx']
const BODY_FORMATS: FileExportFormat[] = ['txt', 'pdf', 'docx']
const FIELD_FORMATS: FileExportFormat[] = ['csv', 'xlsx']

function FileExportConfig({ config, saveChannel }: {
  config: OutletStepConfig
  saveChannel: (patch: Record<string, unknown>) => void
}) {
  const ch = config.channel as { type: 'file_export'; directory_path?: string; filename_template?: string; format?: FileExportFormat; append?: boolean; body_template?: string; field_map?: FileExportFieldMap[] }
  const format: FileExportFormat = ch.format ?? 'txt'
  const fieldMap: FileExportFieldMap[] = ch.field_map ?? []

  function setFieldMap(next: FileExportFieldMap[]) {
    saveChannel({ field_map: next })
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1.5">Output directory</label>
        <input
          className="w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
          defaultValue={ch.directory_path ?? ''}
          onBlur={(e) => saveChannel({ directory_path: e.target.value })}
          placeholder="/Users/you/Documents/output"
        />
        <p className="text-xs text-neutral-400 mt-1">Absolute path where files will be written. Created automatically if it doesn't exist.</p>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1.5">Filename</label>
        <input
          className="w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
          defaultValue={ch.filename_template ?? '{{card.id}}.txt'}
          onBlur={(e) => saveChannel({ filename_template: e.target.value })}
          placeholder="{{card.id}}.pdf"
        />
        <p className="text-xs text-neutral-400 mt-1">Supports <code className="font-mono">{'{{card.id}}'}</code> and <code className="font-mono">{'{{card.data.field}}'}</code>. Use a fixed name with append mode to build up a single file.</p>
      </div>

      <div className="flex gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1.5">Format</label>
          <select
            className="w-full text-sm border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
            value={format}
            onChange={(e) => saveChannel({ format: e.target.value as FileExportFormat })}
          >
            <option value="txt">Plain text (.txt)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="pdf">PDF (.pdf)</option>
            <option value="docx">Word document (.docx)</option>
            <option value="xlsx">Excel spreadsheet (.xlsx)</option>
          </select>
        </div>

        {APPEND_FORMATS.includes(format) && (
          <div className="flex flex-col justify-end pb-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={ch.append ?? false}
                onChange={(e) => saveChannel({ append: e.target.checked })}
                className="rounded"
              />
              Append to existing file
            </label>
          </div>
        )}
      </div>

      {BODY_FORMATS.includes(format) && (
        <div>
          <label className="block text-xs font-medium mb-1.5">Content template</label>
          <textarea
            className="w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y min-h-[80px]"
            defaultValue={ch.body_template ?? '{{card.data}}'}
            onBlur={(e) => saveChannel({ body_template: e.target.value })}
            placeholder="{{card.data}}"
          />
          <p className="text-xs text-neutral-400 mt-1">The text written to the file. Use <code className="font-mono">{'{{card.data.field}}'}</code> or <code className="font-mono">{'{{card.data}}'}</code> for the full JSON.</p>
        </div>
      )}

      {FIELD_FORMATS.includes(format) && (
        <div>
          <label className="block text-xs font-medium mb-1.5">Columns</label>
          <div className="space-y-2">
            {fieldMap.map((f, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  className="flex-1 text-xs border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  value={f.header}
                  placeholder="Column header"
                  onChange={(e) => {
                    const next = [...fieldMap]
                    next[i] = { ...f, header: e.target.value }
                    setFieldMap(next)
                  }}
                />
                <input
                  className="flex-1 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded px-2 py-1.5 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  value={f.value}
                  placeholder="{{card.data.field}}"
                  onChange={(e) => {
                    const next = [...fieldMap]
                    next[i] = { ...f, value: e.target.value }
                    setFieldMap(next)
                  }}
                />
                <button
                  onClick={() => setFieldMap(fieldMap.filter((_, j) => j !== i))}
                  className="p-1 text-neutral-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={13} strokeWidth={2} />
                </button>
              </div>
            ))}
            <button
              onClick={() => setFieldMap([...fieldMap, { header: '', value: '' }])}
              className="flex items-center gap-1.5 text-xs text-teal-600 dark:text-teal-400 hover:underline"
            >
              <Plus size={12} strokeWidth={2} /> Add column
            </button>
          </div>
          <p className="text-xs text-neutral-400 mt-2">Each column maps a header name to a card data field. Rows are appended in order.</p>
        </div>
      )}

      <div className="text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-900 rounded-md p-3 space-y-1">
        <p className="font-medium text-neutral-500">Available tokens</p>
        <p><code className="font-mono">{'{{card.id}}'}</code> — unique card ID (useful in filenames)</p>
        <p><code className="font-mono">{'{{card.data.field}}'}</code> — specific field value</p>
        <p><code className="font-mono">{'{{card.data}}'}</code> — full card as pretty JSON</p>
      </div>
    </div>
  )
}

function TemplateField({ label, defaultValue, onBlur, placeholder, multiline }: {
  label: string
  defaultValue: string
  onBlur: (v: string) => void
  placeholder?: string
  multiline?: boolean
}) {
  const cls = 'w-full text-sm font-mono border border-neutral-200 dark:border-neutral-700 rounded-md px-3 py-2 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-teal-500'
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5">{label}</label>
      {multiline ? (
        <textarea
          className={`${cls} resize-y min-h-[80px]`}
          defaultValue={defaultValue}
          onBlur={(e) => onBlur(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input className={cls} defaultValue={defaultValue} onBlur={(e) => onBlur(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}
