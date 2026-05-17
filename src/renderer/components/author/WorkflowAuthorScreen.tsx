import { useEffect, useRef, useState } from 'react'
import { Sparkles, ArrowRight, ArrowLeft, Rss } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { useProjectStore } from '@/stores/project-store'
import type { ProjectCreateOutcome, ProjectCreateSuccess } from '../../../shared/types'

const EXAMPLES = [
  'Monitor a GitHub repo for new issues and triage them.',
  'Browse competitor websites weekly and summarise price changes.',
  'Turn long YouTube videos into short-form scripts.',
  'Process PDF invoices and post them to my accounting tool.',
  'Triage support tickets and draft responses.',
  'Poll Instagram comments every hour and draft a reply for each new one.',
  'Fetch the top Hacker News stories every 30 minutes and send a daily digest.',
]

const LOADING_MESSAGES = [
  'Imagining your workflow…',
  'Sketching out the trays…',
  'Wiring up the workers…',
  'Setting up your data source…',
  'Configuring the schedule…',
  'Wiring up deduplication…',
  'Almost there…',
]

export default function WorkflowAuthorScreen() {
  const setScreen = useProjectStore((s) => s.setScreen)
  const setActive = useProjectStore((s) => s.setActive)
  const refreshProjects = useProjectStore((s) => s.refreshProjects)
  const regenerateOf = useProjectStore((s) => s.regenerateOf)
  const setRegenerateOf = useProjectStore((s) => s.setRegenerateOf)
  const all = useProjectStore((s) => s.all)

  const isRegen = regenerateOf !== null
  const existing = isRegen ? all.find((p) => p.name === regenerateOf) ?? null : null

  const [description, setDescription] = useState(existing?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ message: string; raw?: string } | null>(null)
  const [postGenOutcome, setPostGenOutcome] = useState<ProjectCreateSuccess | null>(null)
  const [isLocalLlm, setIsLocalLlm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    void (async () => {
      const settings = await window.trayline.settings.get()
      setIsLocalLlm(settings.defaultAdapterId === 'local-llm')
    })()
    return window.trayline.settings.onChange((s) => setIsLocalLlm(s.defaultAdapterId === 'local-llm'))
  }, [])

  // Clear regenerateOf when the user navigates away
  useEffect(() => {
    return () => setRegenerateOf(null)
  }, [setRegenerateOf])

  async function generate() {
    if (busy) return
    if (description.trim().length < 10) {
      setError({ message: 'Describe your workflow in a sentence or two.' })
      return
    }
    setBusy(true)
    setError(null)

    const outcome: ProjectCreateOutcome = await window.trayline.project.create(
      description,
      regenerateOf ? { regenerateOf } : undefined,
    )

    setBusy(false)
    if (!outcome.ok) {
      setError({ message: outcome.message, raw: outcome.raw })
      return
    }
    await refreshProjects()
    setPostGenOutcome(outcome)
  }

  function openProject() {
    if (!postGenOutcome) return
    setActive(postGenOutcome.project)
  }

  if (busy) return <LoadingPanel />
  if (postGenOutcome) return <PostGenBanner outcome={postGenOutcome} onOpen={openProject} />

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto px-8">
      <button
        onClick={() => setScreen(all.length > 0 ? 'projectList' : 'splash')}
        className="self-start flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 mb-8"
      >
        <ArrowLeft size={13} strokeWidth={1.75} /> Back
      </button>

      <h1 className="text-2xl font-semibold tracking-tight mb-2 text-center">
        {isRegen ? 'Regenerate workflow' : 'What do you want Trayline to do for you?'}
      </h1>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 text-center mb-8">
        {isRegen
          ? 'Tweak the description and we\'ll rebuild. The previous version is archived to .history.'
          : "Describe a process in plain English. We'll build the workflow for you."}
      </p>

      <textarea
        ref={textareaRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={5}
        placeholder="Describe your workflow in plain English…"
        className="
          w-full rounded-xl px-4 py-3 mb-4
          border border-neutral-200 dark:border-neutral-800
          bg-white dark:bg-neutral-950
          text-sm leading-relaxed
          placeholder-neutral-400 dark:placeholder-neutral-600
          focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700
          resize-y
        "
      />

      {isLocalLlm && (
        <p className="w-full text-[11px] text-neutral-500 dark:text-neutral-400 mb-3 -mt-2">
          <strong className="text-neutral-600 dark:text-neutral-300">Using local AI model.</strong>{' '}
          Workflow generation works best with Claude Code — local models may produce simpler or incomplete plans.
          You can edit the result after creation.
        </p>
      )}

      <div className="w-full mb-6">
        <div className="text-[11px] uppercase tracking-wider text-neutral-400 mb-2">
          Need inspiration?
        </div>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setDescription(ex)}
              className="
                text-xs px-3 py-1.5 rounded-full
                border border-neutral-200 dark:border-neutral-800
                text-neutral-600 dark:text-neutral-400
                hover:bg-neutral-100 dark:hover:bg-neutral-900
                hover:text-neutral-900 dark:hover:text-neutral-100
                transition-colors
              "
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="
          w-full rounded-lg border border-red-200 dark:border-red-900/40
          bg-red-50 dark:bg-red-950/40 px-4 py-3 mb-4
          text-xs text-red-800 dark:text-red-300
        ">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="font-medium">Couldn't generate the workflow</div>
            <CopyButton
              value={() => (error.raw ? `${error.message}\n\n--- raw ---\n${error.raw}` : error.message)}
              title="Copy error to clipboard"
              className="-mt-1 -mr-1 text-red-700 dark:text-red-300"
            />
          </div>
          <div>{error.message}</div>
          {error.raw && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600 dark:text-red-400 hover:underline">Show raw agent output</summary>
              <div className="relative mt-1">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] font-mono pr-8">{error.raw}</pre>
                <CopyButton
                  value={error.raw}
                  title="Copy raw output"
                  className="absolute top-0 right-0 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40"
                />
              </div>
            </details>
          )}
        </div>
      )}

      <Button onClick={generate} size="lg" className="self-end">
        <Sparkles size={14} strokeWidth={1.75} />
        Generate workflow
        <ArrowRight size={14} strokeWidth={1.75} />
      </Button>
    </div>
  )
}

function LoadingPanel() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % LOADING_MESSAGES.length), 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <div className="w-12 h-12 mb-6">
        <div className="w-full h-full rounded-full border-2 border-neutral-200 dark:border-neutral-800 border-t-neutral-700 dark:border-t-neutral-300 animate-spin" />
      </div>
      <div className="text-sm text-neutral-600 dark:text-neutral-400 transition-opacity">
        {LOADING_MESSAGES[idx]}
      </div>
    </div>
  )
}

function PostGenBanner({ outcome, onOpen }: { outcome: ProjectCreateSuccess; onOpen: () => void }) {
  const hasSource = outcome.hasSourceStep
  const body = hasSource
    ? "Click your source step to write your fetch instructions and set the schedule."
    : "Edit anything you want, then click Run to process your first card."

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-lg mx-auto px-8 text-center">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 ${hasSource ? 'bg-emerald-500' : 'bg-neutral-800 dark:bg-neutral-200'}`}>
        {hasSource
          ? <Rss size={28} strokeWidth={1.75} className="text-white" />
          : <Sparkles size={28} strokeWidth={1.75} className="text-white dark:text-neutral-900" />
        }
      </div>
      <h2 className="text-xl font-semibold tracking-tight mb-2">{"Here's a starting point."}</h2>
      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-8 leading-relaxed">{body}</p>
      <Button size="lg" onClick={onOpen}>
        Open project
        <ArrowRight size={14} strokeWidth={1.75} />
      </Button>
    </div>
  )
}
