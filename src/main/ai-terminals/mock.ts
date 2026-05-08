import type { AITerminalAdapter, AISession, AISessionResult, SpawnOptions } from './adapter'

/**
 * Mock adapter — used in tests and dev when no CLI agent is available.
 * Does not spawn a real process. Returns a scripted response based on the
 * `MOCK_SCRIPT` setting (or a default scripted result if unset).
 */

let scriptedOutput: object | string = { summary: 'mock-result', fields: {} }
let scriptedExitCode = 0

export function setMockScript(opts: { output?: object | string; exitCode?: number }) {
  if (opts.output !== undefined) scriptedOutput = opts.output
  if (opts.exitCode !== undefined) scriptedExitCode = opts.exitCode
}

async function* lines(strs: string[]): AsyncIterable<string> {
  for (const s of strs) yield s
}

class MockSession implements AISession {
  pid = -1
  awaitingInput = false
  private startedAt = Date.now()
  private endedAt = 0
  private cached: AISessionResult | null = null

  stdout = lines([JSON.stringify(scriptedOutput)])
  stderr = lines([])

  async sendInput(_text: string): Promise<void> {
    // No-op — mock never blocks
  }

  async kill(): Promise<void> {
    this.endedAt = Date.now()
  }

  async result(): Promise<AISessionResult> {
    if (this.cached) return this.cached
    this.endedAt = Date.now()
    const out = JSON.stringify(scriptedOutput)
    this.cached = {
      exitCode: scriptedExitCode,
      output: scriptedOutput,
      terminalLog: out + '\n',
      startedAt: this.startedAt,
      endedAt: this.endedAt,
    }
    return this.cached
  }
}

export const mockAdapter: AITerminalAdapter = {
  id: 'mock',
  displayName: 'Mock (test)',
  async detectInstalled() { return true },
  async getVersion() { return '0.0.0-mock' },
  async spawn(_opts: SpawnOptions): Promise<AISession> {
    return new MockSession()
  },
}
