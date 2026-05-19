import { create } from 'zustand'
import type { AdapterReadiness } from '../../shared/types'

interface AdapterStoreState {
  readiness: Record<string, AdapterReadiness>
  loading: boolean
  setReadiness: (id: string, r: AdapterReadiness) => void
  updateFromCheckAll: (map: Record<string, AdapterReadiness>) => void
  /** True when at least one production adapter is installed. */
  anyInstalled: () => boolean
}

export const useAdapterStore = create<AdapterStoreState>((set, get) => ({
  readiness: {},
  loading: false,

  setReadiness: (id, r) =>
    set((s) => ({ readiness: { ...s.readiness, [id]: r } })),

  updateFromCheckAll: (map) =>
    set((s) => ({ readiness: { ...s.readiness, ...map } })),

  anyInstalled: () =>
    Object.values(get().readiness).some((r) => r.installed),
}))
