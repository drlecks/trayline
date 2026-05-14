import { create } from 'zustand'
import type { ProviderReadyResult } from '../../shared/types'

interface ProviderGuardState {
  open: boolean
  result: ProviderReadyResult | null
  /**
   * Verify a production AI provider is installed. Returns true when a run can
   * proceed; returns false (and opens the install modal) when nothing usable
   * is on PATH. Callers should bail out on false.
   */
  ensureReady: () => Promise<boolean>
  close: () => void
}

export const useProviderGuard = create<ProviderGuardState>((set) => ({
  open: false,
  result: null,
  ensureReady: async () => {
    if (!window.trayline) return false
    const result = await window.trayline.adapters.checkProviderReady()
    if (!result.ready) {
      set({ open: true, result })
      return false
    }
    return true
  },
  close: () => set({ open: false }),
}))
