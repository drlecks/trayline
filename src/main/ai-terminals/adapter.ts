// AI Terminal Adapter — the abstraction every CLI agent (Claude Code, Open Code,
// Aider, etc.) implements. Workers never call `claude` directly; they call this
// interface and the registry picks the right adapter by id.
//
// See docs/tech-stack.md for the full architectural rationale.

export interface SkillDefinition {
  id: string
  /** Resolved contents of the skill's skill.md, ready to inject into the prompt. */
  content: string
}

export interface MCPDefinition {
  id: string
  /** Resolved contents of the MCP's mcp.json. */
  manifest: Record<string, unknown>
  /** Credentials map already resolved from the keychain — env-var name → value. */
  credentials: Record<string, string>
}

export interface SpawnOptions {
  /** Absolute path to the worker's process.md (already-resolved variables). */
  processFile: string
  /** The card's full data payload. */
  cardData: object
  /** Skills to inject into the system prompt. */
  skills: SkillDefinition[]
  /** Context pack file contents (already loaded), concatenated under ## Context. */
  contextPacks: string[]
  /** MCPs that should be active during this run. */
  mcps: MCPDefinition[]
  /** The run's working directory (`runs/<run_id>/`). */
  workingDir: string
  /** Hard timeout in milliseconds. */
  timeout: number
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

export interface AITerminalAdapter {
  /** Stable identifier used by worker config (`adapter: "claude-code"`). */
  id: string
  /** Human-readable name shown in settings. */
  displayName: string
  /** Returns true if the underlying CLI is available on the host system. */
  detectInstalled(): Promise<boolean>
  /** Returns the CLI version string, or null if not installed. */
  getVersion(): Promise<string | null>
  /** Spawn a session for a single card. */
  spawn(opts: SpawnOptions): Promise<AISession>
}
