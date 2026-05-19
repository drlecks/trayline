import type {
  AITerminalAdapter,
  AISession,
  AISessionResult,
  SpawnOptions,
  ModelInfo,
  EffortInfo,
  AdapterUsageSnapshot,
  AdapterReadiness,
} from './adapter'

/**
 * Mock adapter — used in tests and dev when no CLI agent is available.
 * Does not spawn a real process. Returns a scripted response based on the
 * `MOCK_SCRIPT` setting (or a default scripted result if unset).
 */

let scriptedOutput: object | string = { summary: 'mock-result', fields: {} }
let scriptedExitCode = 0
let clearContextCalls = 0
let readinessOverride: Partial<AdapterReadiness> | null = null
let permissionPromptChunks: string[] = []
let capturedSendInputCalls: string[] = []

export function setMockScript(opts: { output?: object | string; exitCode?: number }) {
  if (opts.output !== undefined) scriptedOutput = opts.output
  if (opts.exitCode !== undefined) scriptedExitCode = opts.exitCode
}

export function setReadinessOverride(partial: Partial<AdapterReadiness> | null) {
  readinessOverride = partial
}

export function resetReadinessOverride() {
  readinessOverride = null
}

/** Pre-pend these chunks to stdout before the final scripted output. */
export function setPermissionPromptChunks(chunks: string[]) {
  permissionPromptChunks = [...chunks]
}

/** Returns a copy of sendInput() calls made on the last session. */
export function getSendInputCalls(): string[] { return [...capturedSendInputCalls] }

export function resetPermissionState() {
  permissionPromptChunks = []
  capturedSendInputCalls = []
}

export function getMockClearContextCalls(): number { return clearContextCalls }
export function resetMockClearContextCalls(): void { clearContextCalls = 0 }

async function* lines(strs: string[]): AsyncIterable<string> {
  for (const s of strs) yield s
}

class MockSession implements AISession {
  pid = -1
  awaitingInput = false
  private startedAt = Date.now()
  private killed = false

  stderr = lines([])
  stdout: AsyncIterable<string>

  constructor() {
    // Snapshot module-level state at spawn time so concurrent tests don't interfere
    const outputChunk = JSON.stringify(scriptedOutput)
    const allChunks = [...permissionPromptChunks, outputChunk]
    let idx = 0
    const self = this

    this.stdout = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<string>> {
            // Yield to the event loop so concurrent permission-detection code can run
            await Promise.resolve()
            if (self.killed || idx >= allChunks.length) {
              return { value: undefined as unknown as string, done: true }
            }
            return { value: allChunks[idx++], done: false }
          },
        }
      },
    }
  }

  async sendInput(text: string): Promise<void> {
    capturedSendInputCalls.push(text)
  }

  async kill(): Promise<void> {
    this.killed = true
  }

  async result(): Promise<AISessionResult> {
    // Resolves immediately — worker-runner uses Promise.all to ensure the
    // stdout consumer (permission detection) completes before proceeding.
    return {
      exitCode: scriptedExitCode,
      output: scriptedOutput,
      terminalLog: JSON.stringify(scriptedOutput) + '\n',
      startedAt: this.startedAt,
      endedAt: Date.now(),
    }
  }
}

const MOCK_MODELS: ModelInfo[] = [
  { id: 'mock-fast',  label: 'Mock Fast',  description: 'Deterministic fast fixture for tests.' },
  { id: 'mock-deep',  label: 'Mock Deep',  description: 'Deterministic deep fixture for tests.' },
]

const MOCK_EFFORTS_BY_MODEL: Record<string, EffortInfo[]> = {
  'mock-fast': [{ id: 'low', label: 'Low' }],
  'mock-deep': [
    { id: 'low',    label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high',   label: 'High' },
  ],
}

export const mockAdapter: AITerminalAdapter = {
  id: 'mock',
  displayName: 'Mock (test)',
  kind: 'mock',
  async checkReadiness(): Promise<AdapterReadiness> {
    const base: AdapterReadiness = {
      adapterId: 'mock',
      installed: true,
      version: '0.0.0-mock',
      blockers: [],
      checkedAt: Date.now(),
    }
    return readinessOverride ? { ...base, ...readinessOverride } : base
  },
  async detectInstalled() { return true },
  async getVersion() { return '0.0.0-mock' },
  async listModels() { return MOCK_MODELS },
  async listEfforts(modelId: string) { return MOCK_EFFORTS_BY_MODEL[modelId] ?? [] },
  async getUsage(): Promise<AdapterUsageSnapshot | null> {
    return {
      fiveHour: { used: 1234, limit: 10_000, resetsAt: '2026-01-01T00:00:00.000Z' },
      weekly:   { used: 5678, limit: 50_000, resetsAt: '2026-01-07T00:00:00.000Z' },
    }
  },
  async clearContext() { clearContextCalls++ },
  async spawn(_opts: SpawnOptions): Promise<AISession> {
    return new MockSession()
  },
}
