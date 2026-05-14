import { useEffect, useLayoutEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export interface TourStep {
  /** querySelector for the element to highlight. Omit for a centered welcome card. */
  target?: string
  title: string
  body: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome to Trayline',
    body: 'Trayline lets you build AI workflows by chaining trays (where cards wait) and workers (where AI processes them). Take a quick tour — it should only take a moment.',
  },
  {
    target: '[data-tour="topbar"]',
    title: 'Top bar',
    body: 'Switch projects, change theme, install skills, and open settings from here. Notifications about queued runs surface here too.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="left-rail"]',
    title: 'Workflow steps',
    body: 'Your workflow is a list of trays and workers. Click any step to open it in the right panel. Add new steps from the "+ Add step" button at the bottom of the list.',
    placement: 'right',
  },
  {
    target: '[data-tour="detail-panel"]',
    title: 'Step details',
    body: 'Open a tray to add cards or define its schema. Open a worker to edit its instructions, run it, or watch its terminal output.',
    placement: 'left',
  },
  {
    title: "You're ready",
    body: 'Anything else you need is in Settings (⌘/Ctrl+,). You can re-run this tour anytime from the Settings screen.',
  },
]

interface OnboardingTourProps {
  open: boolean
  onClose: () => void
}

interface Rect { top: number; left: number; width: number; height: number }

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)

  const step = TOUR_STEPS[stepIdx]

  useEffect(() => {
    if (open) setStepIdx(0)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    if (!step.target) { setRect(null); return }
    let raf = 0
    function measure() {
      const el = document.querySelector(step.target!) as HTMLElement | null
      if (el) {
        const r = el.getBoundingClientRect()
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
      } else {
        setRect(null)
      }
      raf = requestAnimationFrame(measure)
    }
    measure()
    return () => cancelAnimationFrame(raf)
  }, [open, step])

  if (!open) return null

  const isFirst = stepIdx === 0
  const isLast = stepIdx === TOUR_STEPS.length - 1

  function next() { if (isLast) onClose(); else setStepIdx((i) => i + 1) }
  function prev() { if (!isFirst) setStepIdx((i) => i - 1) }

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding tour"
    >
      {/* Backdrop with a soft cutout via ring on a transparent box */}
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 pointer-events-auto" />

      {/* Highlight ring around the target */}
      {rect && (
        <div
          className="absolute rounded-lg pointer-events-none transition-all duration-200"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55), 0 0 0 2px rgb(250 204 21)',
          }}
        />
      )}

      {/* Tooltip card */}
      <Tooltip rect={rect} placement={step.placement}>
        <h2 className="text-sm font-semibold mb-1">{step.title}</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed mb-4">
          {step.body}
        </p>
        <div className="flex items-center justify-between">
          <button
            onClick={onClose}
            className="text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-neutral-400 mr-1">
              {stepIdx + 1} / {TOUR_STEPS.length}
            </span>
            {!isFirst && (
              <Button size="sm" variant="outline" onClick={prev}>Back</Button>
            )}
            <Button size="sm" onClick={next}>{isLast ? 'Done' : 'Next'}</Button>
          </div>
        </div>
      </Tooltip>
    </div>
  )
}

function Tooltip({
  rect,
  placement = 'bottom',
  children,
}: { rect: Rect | null; placement?: TourStep['placement']; children: React.ReactNode }) {
  const card = (
    <div className="
      pointer-events-auto
      w-80 max-w-[calc(100vw-32px)]
      rounded-xl border border-neutral-200 dark:border-neutral-800
      bg-white dark:bg-neutral-950
      shadow-xl px-4 py-3.5
    ">
      {children}
    </div>
  )

  if (!rect) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        {card}
      </div>
    )
  }

  const GAP = 14
  const style: React.CSSProperties = {}
  if (placement === 'bottom') {
    style.top = rect.top + rect.height + GAP
    style.left = clamp(rect.left + rect.width / 2 - 160, 16, window.innerWidth - 320 - 16)
  } else if (placement === 'top') {
    style.bottom = window.innerHeight - rect.top + GAP
    style.left = clamp(rect.left + rect.width / 2 - 160, 16, window.innerWidth - 320 - 16)
  } else if (placement === 'right') {
    style.left = rect.left + rect.width + GAP
    style.top = clamp(rect.top + rect.height / 2 - 70, 16, window.innerHeight - 180 - 16)
  } else {
    style.right = window.innerWidth - rect.left + GAP
    style.top = clamp(rect.top + rect.height / 2 - 70, 16, window.innerHeight - 180 - 16)
  }

  return (
    <div className="absolute" style={style}>
      {card}
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}
