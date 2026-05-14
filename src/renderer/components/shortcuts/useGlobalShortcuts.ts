import { useEffect } from 'react'
import { useProjectStore } from '@/stores/project-store'

export const NEW_CARD_EVENT = 'trayline:new-card'

interface ShortcutHandlers {
  openSettings: () => void
  openPalette: () => void
  openShortcuts: () => void
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Global keyboard shortcut handler. Mounted once at the app root.
 *
 * Skipped when the user is typing in an input or contenteditable, except for
 * Cmd/Ctrl+K which is intentional global (matches the convention from
 * Slack, VS Code, GitHub, etc.).
 */
export function useGlobalShortcuts({ openSettings, openPalette, openShortcuts }: ShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      // Cmd/Ctrl+K — command palette (works even when typing)
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        openPalette()
        return
      }

      if (isTypingTarget(e.target)) return

      // Cmd/Ctrl+, — settings
      if (e.key === ',') {
        e.preventDefault()
        openSettings()
        return
      }

      // Cmd/Ctrl+/ — shortcuts reference
      if (e.key === '/') {
        e.preventDefault()
        openShortcuts()
        return
      }

      // Cmd/Ctrl+N — new card in selected tray
      if (e.key === 'n' || e.key === 'N') {
        const state = useProjectStore.getState()
        const step = state.steps.find((s) => s.id === state.selectedStepId)
        if (state.screen === 'project' && step && step.kind === 'tray' && step.id !== '99-errors') {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent(NEW_CARD_EVENT))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSettings, openPalette, openShortcuts])
}
