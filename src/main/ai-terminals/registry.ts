import type { AITerminalAdapter } from './adapter'
import { claudeCodeAdapter } from './claude-code'
import { mockAdapter } from './mock'

const adapters = new Map<string, AITerminalAdapter>()

function register(adapter: AITerminalAdapter) {
  adapters.set(adapter.id, adapter)
}

function get(id: string): AITerminalAdapter | null {
  return adapters.get(id) ?? null
}

function list(): AITerminalAdapter[] {
  return [...adapters.values()]
}

// Default registrations. Adding a new adapter is one new file plus one line here.
register(claudeCodeAdapter)
register(mockAdapter)

export const adapterRegistry = { register, get, list }
