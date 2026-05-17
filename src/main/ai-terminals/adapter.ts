// AI Terminal Adapter — the abstraction every CLI agent (Claude Code, Open Code,
// Aider, etc.) implements. Workers never call `claude` directly; they call this
// interface and the registry picks the right adapter by id.
//
// See docs/tech-stack.md for the full architectural rationale.

export interface SpawnOptions {
  /** Absolute path to the worker's process.md (already-resolved variables). */
  processFile: string
  /** The card's full data payload. */
  cardData: object
  /** Context pack file contents (already loaded), concatenated under ## Context. */
  contextPacks: string[]
  /** The run's working directory (`runs/<run_id>/`). */
  workingDir: string
  /** Hard timeout in milliseconds. */
  timeout: number
  /**
   * Pre-fetched data from a Source channel (HTTP response or serialised email
   * list). When present, adapters prepend it to the prompt under ## Fetched data
   * so the AI reasons on already-retrieved content rather than fetching itself.
   */
  prefetchedData?: string
  /**
   * Notifies when the session flips between awaiting user input and not.
   * Adapters that never block on input (e.g. mock) may ignore this.
   */
  onAwaitingInputChange?: (awaiting: boolean) => void
}

export interface AISessionResult {
  exitCode: number
  /** Whatever the worker wrote to stdout, parsed as JSON if possible. */
  output: object | string | null
  /** The full terminal log, exactly as written to terminal.log. */
  terminalLog: string
  /** Time the spawn started, in ms since epoch. */
  startedAt: number
  /** Time the process exited, in ms since epoch. */
  endedAt: number
}

export interface AISession {
  /** OS process id, or -1 if the adapter doesn't spawn a real process (mock). */
  pid: number
  /** Async iterator of stdout lines as they arrive. */
  stdout: AsyncIterable<string>
  /** Async iterator of stderr lines as they arrive. */
  stderr: AsyncIterable<string>
  /** True when the process is blocked waiting for user input. */
  awaitingInput: boolean
  /** Send a line of input to the process (for interactive workers). */
  sendInput(text: string): Promise<void>
  /** Kill the process. */
  kill(): Promise<void>
  /** Resolves when the process exits. Idempotent. */
  result(): Promise<AISessionResult>
}

export interface ModelInfo {
  id: string
  label: string
  description?: string
}

export interface EffortInfo {
  id: string
  label: string
}

// These types live in src/shared/types so the renderer can import them without
// dragging main-process modules into its TS program.
export type { AdapterUsageSnapshot, AdapterReadiness, AdapterBlocker, AdapterBlockerKind } from '../../shared/types'
import type { AdapterUsageSnapshot, AdapterReadiness } from '../../shared/types'

export interface AITerminalAdapter {
  /** Stable identifier used by worker config (`adapter: "claude-code"`). */
  id: string
  /** Human-readable name shown in settings. */
  displayName: string
  /**
   * `production` adapters are real CLI agents that workers can actually run
   * against. `mock` adapters return scripted fixtures for tests and dev. The
   * app refuses to start a worker run when no production adapter is installed
   * — see the renderer's provider-guard and worker-runner's pre-flight check.
   */
  kind: 'production' | 'mock'
  /** Optional URL with install instructions, surfaced when `detectInstalled()` is false. */
  installUrl?: string
  /** Short description shown in the adapter selector UI. */
  description?: string
  /**
   * Returns structured readiness without running any inference.
   * Checks only what is cheaply detectable: binary presence, version, and any
   * adapter-specific structural preconditions (e.g. local server reachable).
   * Safe to call at startup; never consumes API tokens.
   */
  checkReadiness(): Promise<AdapterReadiness>
  /** @deprecated Use checkReadiness() instead. */
  detectInstalled(): Promise<boolean>
  /** @deprecated Use checkReadiness() instead. */
  getVersion(): Promise<string | null>
  /** Models the user can pick for this provider. Empty array if not applicable. */
  listModels(): Promise<ModelInfo[]>
  /** Effort tiers for the given model. Return `[]` for providers that don't expose efforts. */
  listEfforts(modelId: string): Promise<EffortInfo[]>
  /** Account/usage telemetry. Return `null` when the provider does not expose rolling windows. */
  getUsage?(): Promise<AdapterUsageSnapshot | null>
  /**
   * Invoke the provider's "/clear" (or equivalent) so the next run starts with
   * empty transcript history. Must be safe to call when no session is open.
   */
  clearContext(): Promise<void>
  /** Spawn a session for a single card. */
  spawn(opts: SpawnOptions): Promise<AISession>
}
