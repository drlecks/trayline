import { ArrowRight, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  hasSourceStep: boolean
  sourceStepId?: string
  firstTrayId?: string
  onSelectStep: (id: string) => void
  onDismiss: () => void
  onTour: () => void
}

interface Step {
  number: number
  title: string
  body: string
  action?: { label: string; stepId: string }
}

export default function FirstProjectGuide({
  hasSourceStep,
  sourceStepId,
  firstTrayId,
  onSelectStep,
  onDismiss,
  onTour,
}: Props) {
  const steps: Step[] = hasSourceStep
    ? [
        {
          number: 1,
          title: 'Open your Source step',
          body: 'Click it in the left rail to configure what data to fetch and how often.',
          action: sourceStepId ? { label: 'Go to Source', stepId: sourceStepId } : undefined,
        },
        {
          number: 2,
          title: 'Add a credential if your source needs one',
          body: 'Open Credentials in the top bar to connect Gmail, Outlook, or any HTTP API.',
        },
        {
          number: 3,
          title: 'Click "Run now" to test your Source',
          body: 'Cards will appear in the tray below and your workers will start automatically.',
        },
      ]
    : [
        {
          number: 1,
          title: 'Open the first tray in your workflow',
          body: 'Click it in the left rail, then click "+ New card" to add something to process.',
          action: firstTrayId ? { label: 'Go to tray', stepId: firstTrayId } : undefined,
        },
        {
          number: 2,
          title: 'Mark the card as ready',
          body: 'Your workers pick it up automatically and start processing.',
        },
        {
          number: 3,
          title: 'Check the next tray for results',
          body: 'Review and approve or edit before the workflow continues.',
        },
      ]

  return (
    <div className="flex flex-col h-full items-center justify-center px-10 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-lg bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
            <Compass size={15} strokeWidth={1.75} className="text-neutral-600 dark:text-neutral-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Your workflow is ready.</h2>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">Here's what to do next:</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 mb-8">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-3">
              <div className="w-5 h-5 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400">{step.number}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 leading-snug">{step.title}</p>
                  {step.action && (
                    <button
                      onClick={() => onSelectStep(step.action!.stepId)}
                      className="shrink-0 flex items-center gap-0.5 text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors mt-0.5"
                    >
                      {step.action.label}
                      <ArrowRight size={10} strokeWidth={2} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed mt-0.5">{step.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <button
            onClick={onTour}
            className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
          >
            Take a quick tour
          </button>
          <Button variant="ghost" size="sm" onClick={onDismiss} className="text-xs text-neutral-500">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
