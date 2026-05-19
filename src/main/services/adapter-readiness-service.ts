import { adapterRegistry } from '../ai-terminals/registry'
import type { AdapterReadiness } from '../ai-terminals/adapter'

const cache = new Map<string, AdapterReadiness>()

async function checkAll(): Promise<Map<string, AdapterReadiness>> {
  const result = new Map<string, AdapterReadiness>()
  for (const adapter of adapterRegistry.list()) {
    if (adapter.kind !== 'production') continue
    const readiness = await adapter.checkReadiness()
    cache.set(adapter.id, readiness)
    result.set(adapter.id, readiness)
  }
  return result
}

function getCached(adapterId: string): AdapterReadiness | null {
  return cache.get(adapterId) ?? null
}

async function recheck(adapterId: string): Promise<AdapterReadiness> {
  const adapter = adapterRegistry.get(adapterId)
  if (!adapter) throw new Error(`Unknown adapter: ${adapterId}`)
  const readiness = await adapter.checkReadiness()
  cache.set(adapterId, readiness)
  return readiness
}

/**
 * Returns true if the adapter is installed and ready to run.
 * Uses the cache when available; calls checkReadiness() on first access
 * so callers don't need to manually pre-populate the cache.
 */
async function isReadyToRun(adapterId: string): Promise<boolean> {
  const cached = cache.get(adapterId)
  if (cached !== undefined) return cached.installed
  const readiness = await recheck(adapterId)
  return readiness.installed
}

export const adapterReadinessService = { checkAll, getCached, recheck, isReadyToRun }

/** For use in tests only — clears the in-memory cache so tests don't bleed state. */
export function _clearCacheForTests() { cache.clear() }
