import { spawn as childSpawn } from 'child_process'
import fs from 'fs/promises'
import { join } from 'path'
import * as pty from 'node-pty'
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
import { renderProcessTemplate } from './prompt-utils'

// Strip ANSI escape sequences before trying to parse output as JSON. The PTY
// preserves cursor moves, colour codes, AND OSC title sequences from the
// underlying CLI, but the worker contract treats stdout as the agent's reply
// text. Handles:
//   - CSI:   ESC [ ... <final-byte>
//   - OSC:   ESC ] ... (BEL | ESC \)        ← e.g. \x1B]0;claude\x07
//   - other: ESC <single-char>
// Also drops stray BEL (\x07) bytes left after partial parses, plus any C1
// control characters that conpty/Windows occasionally injects.
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)|\x1B\[[0-?]*[ -/]*[@-~]|\x1B[@-Z\\-_]|[\x07\x00-\x06\x0E-\x1A\x1C-\x1F]/g

// Lightweight heuristic: trailing prompt characters with no following newline
// suggest the CLI is waiting on input. Conservative on purpose — Claude in
// `-p` print mode should never trip this.
const PROMPT_RE = /(?:^|\n)([>?$#]|.+:)\s*$/

function detectInstalled(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = childSpawn('claude', ['--version'], { shell: true })
    let out = ''
    child.stdout.on('data', (b) => (out += b.toString()))
    child.on('error', () => resolve(null))
    child.on('exit', (code) => resolve(code === 0 ? out.trim() || null : null))
  })
}

interface ClaudeSessionRegistryEntry {
  pid: number
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
}

const liveSessions = new Map<string, ClaudeSessionRegistryEntry>()

/** Public access for the worker-runner IPC layer to forward keystrokes. */
export function getLiveSession(key: string): ClaudeSessionRegistryEntry | null {
  return liveSessions.get(key) ?? null
}

export function registerLiveSession(key: string, entry: ClaudeSessionRegistryEntry) {
  liveSessions.set(key, entry)
}

export function unregisterLiveSession(key: string) {
  liveSessions.delete(key)
}

class ClaudePtySession implements AISession {
  pid: number
  awaitingInput = false

  private term: pty.IPty
  private terminalLog = ''
  private outChunks: string[] = []
  private outResolvers: Array<(r: IteratorResult<string>) => void> = []
  private ended = false
  private exitPromise: Promise<AISessionResult>
  private startedAt = Date.now()
  private opts: SpawnOptions
  private awaitingTimer: NodeJS.Timeout | null = null

  constructor(term: pty.IPty, opts: SpawnOptions) {
    this.term = term
    this.opts = opts
    this.pid = term.pid

    term.onData((data: string) => {
      this.terminalLog += data
      this.outChunks.push(data)
      this.flushOutResolvers()
      this.scheduleAwaitingCheck()
    })

    this.exitPromise = new Promise<AISessionResult>((resolve) => {
      term.onExit(({ exitCode }) => {
        this.ended = true
        if (this.awaitingTimer) clearTimeout(this.awaitingTimer)
        this.flushOutResolvers(true)
        if (this.awaitingInput) {
          this.awaitingInput = false
          opts.onAwaitingInputChange?.(false)
        }
        void (async () => {
          try {
            await fs.writeFile(join(opts.workingDir, 'terminal.log'), this.terminalLog, 'utf-8')
          } catch {
            // working dir might be gone in tests — log loss is acceptable.
          }
          const cleaned = this.terminalLog.replace(ANSI_RE, '').trim()
          let output: object | string | null = cleaned || null
          if (typeof output === 'string') {
            // Try to find the last balanced JSON object/array in the output.
            const jsonGuess = extractTrailingJson(cleaned)
            if (jsonGuess) {
              try { output = JSON.parse(jsonGuess) } catch { /* keep as string */ }
            }
          }
          resolve({
            exitCode: exitCode ?? -1,
            output,
            terminalLog: this.terminalLog,
            startedAt: this.startedAt,
            endedAt: Date.now(),
          })
        })()
      })
    })

    if (opts.timeout > 0) {
      setTimeout(() => {
        if (!this.ended) {
          try { term.kill() } catch { /* ignore */ }
        }
      }, opts.timeout)
    }
  }

  private flushOutResolvers(done = false) {
    if (done) {
      for (const r of this.outResolvers) r({ value: undefined, done: true })
      this.outResolvers = []
      return
    }
    while (this.outResolvers.length && this.outChunks.length) {
      const r = this.outResolvers.shift()!
      const chunk = this.outChunks.shift()!
      r({ value: chunk, done: false })
    }
  }

  /**
   * Debounce a tail-of-buffer check: if no new data arrives for a moment AND
   * the trailing line looks like a prompt, flip awaitingInput on.
   */
  private scheduleAwaitingCheck() {
    if (this.awaitingTimer) clearTimeout(this.awaitingTimer)
    this.awaitingTimer = setTimeout(() => {
      if (this.ended) return
      const tail = this.terminalLog.slice(-256).replace(ANSI_RE, '')
      const looksLikePrompt = PROMPT_RE.test(tail) && !tail.endsWith('\n')
      if (looksLikePrompt && !this.awaitingInput) {
        this.awaitingInput = true
        this.opts.onAwaitingInputChange?.(true)
      }
    }, 750)
  }

  stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<string>>((resolve) => {
          if (this.outChunks.length) {
            resolve({ value: this.outChunks.shift()!, done: false })
            return
          }
          if (this.ended) {
            resolve({ value: undefined, done: true })
            return
          }
          this.outResolvers.push(resolve)
        }),
    }),
  }

  // Single PTY stream — stderr is folded into stdout above.
  stderr: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve<IteratorResult<string>>({ value: undefined, done: true }),
    }),
  }

  async sendInput(text: string): Promise<void> {
    if (this.ended) return
    this.term.write(text)
    // Treat any user input as "no longer awaiting" — a fresh trailing-prompt
    // check after the response will flip it back on if needed.
    if (this.awaitingInput) {
      this.awaitingInput = false
      this.opts.onAwaitingInputChange?.(false)
    }
  }

  async kill(): Promise<void> {
    if (!this.ended) {
      try { this.term.kill() } catch { /* ignore */ }
    }
  }

  async result(): Promise<AISessionResult> {
    return this.exitPromise
  }

  /** Expose PTY write/resize for the IPC layer (used by external callers). */
  rawWrite(data: string) { this.term.write(data) }
  resize(cols: number, rows: number) {
    try { this.term.resize(cols, rows) } catch { /* ignore */ }
  }
}


/**
 * Pull a JSON value out of a text blob even when it's wrapped in markdown
 * code fences or sandwiched between prose. Returns the slice between the
 * first `{`/`[` and the matching last `}`/`]`, so trailing ```` ``` ```` /
 * commentary / banner text doesn't break JSON.parse downstream.
 */
function extractTrailingJson(s: string): string | null {
  const trimmed = s.trim()
  if (!trimmed) return null
  const firstObj = trimmed.indexOf('{')
  const firstArr = trimmed.indexOf('[')
  let start: number
  if (firstObj === -1) start = firstArr
  else if (firstArr === -1) start = firstObj
  else start = Math.min(firstObj, firstArr)
  if (start < 0) return null
  const openChar = trimmed[start]
  const closeChar = openChar === '{' ? '}' : ']'
  const end = trimmed.lastIndexOf(closeChar)
  if (end <= start) return null
  return trimmed.slice(start, end + 1)
}

// Claude Code's published models. We keep this list curated here because the
// CLI's `claude --help` output does not expose a machine-readable model list,
// and shelling out to `claude models` is interactive. When new models ship,
// add them here.
const CLAUDE_MODELS: ModelInfo[] = [
  { id: 'claude-opus-4-7',     label: 'Claude Opus 4.7',     description: 'Most capable; best for complex multi-step reasoning.' },
  { id: 'claude-sonnet-4-6',   label: 'Claude Sonnet 4.6',   description: 'Balanced quality and speed for most workers.' },
  { id: 'claude-haiku-4-5',    label: 'Claude Haiku 4.5',    description: 'Fastest and cheapest; good for high-volume light tasks.' },
]


export const claudeCodeAdapter: AITerminalAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  kind: 'production',
  description: 'Cloud-powered — most capable. Requires external installation.',
  installUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',

  async checkReadiness(): Promise<AdapterReadiness> {
    const version = await detectInstalled()
    if (version === null) {
      return {
        adapterId: 'claude-code',
        installed: false,
        version: null,
        blockers: [{
          kind: 'not_installed',
          message: 'Claude Code CLI is not installed on this machine.',
          fixUrl: 'https://docs.claude.com/en/docs/claude-code/quickstart',
          fixCommand: 'npm install -g @anthropic-ai/claude-code',
        }],
        checkedAt: Date.now(),
      }
    }
    return {
      adapterId: 'claude-code',
      installed: true,
      version,
      blockers: [],
      checkedAt: Date.now(),
    }
  },

  async detectInstalled() {
    return (await detectInstalled()) !== null
  },

  async getVersion() {
    return detectInstalled()
  },

  async listModels(): Promise<ModelInfo[]> {
    return CLAUDE_MODELS
  },

  // Claude Code's `-p` mode does not take an `--effort` flag; reasoning depth
  // is steered via prompt wording. We still expose the standard tiers here so
  // the user can pick a default that workers can echo into their process.md
  // (e.g. "ultrathink") — the choice is persisted globally and applied at
  // prompt-assembly time. Haiku doesn't gain meaningfully from deeper thinking
  // budgets, so we collapse it to a single tier.
  async listEfforts(modelId: string): Promise<EffortInfo[]> {
    if (modelId === 'claude-haiku-4-5') {
      return [{ id: 'low', label: 'Low' }]
    }
    return [
      { id: 'low',    label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high',   label: 'High' },
    ]
  },

  // Claude Code does not surface 5h / weekly rolling-window state through any
  // non-interactive entry point — `/usage` is TUI-only. See usage-service.ts
  // for the full reasoning; return null until upstream provides it.
  async getUsage(): Promise<AdapterUsageSnapshot | null> {
    return null
  },

  // `claude -p` print mode is a one-shot invocation that does not persist
  // transcript state across calls, so each run already starts with empty
  // history. We model clearContext as a documented no-op rather than spawning
  // a no-op shell call.
  async clearContext(): Promise<void> {
    // intentionally empty
  },

  async spawn(opts: SpawnOptions): Promise<AISession> {
    const processBody = await fs.readFile(opts.processFile, 'utf-8')

    const promptParts: string[] = []
    if (opts.prefetchedData) {
      promptParts.push(`## Fetched data\n\n${opts.prefetchedData}`)
    }
    if (opts.contextPacks.length > 0) {
      promptParts.push(`## Context\n\n${opts.contextPacks.join('\n\n')}`)
    }
    promptParts.push(renderProcessTemplate(processBody, opts.cardData))

    const prompt = promptParts.join('\n\n---\n\n')

    // Persist the prompt next to the run so it's reproducible and can be fed
    // to the CLI through shell redirection (avoids command-line length limits
    // and platform quoting hell).
    const promptFile = join(opts.workingDir, 'prompt.txt')
    await fs.writeFile(promptFile, prompt, 'utf-8')

    const isWin = process.platform === 'win32'
    const shell = isWin ? 'cmd.exe' : '/bin/sh'
    // On Windows, pass the command line as a single raw string to bypass
    // node-pty's argv quoting. The array form ends up wrapping the entire
    // command in quotes, and because of the shell-special `<` redirection
    // cmd.exe then treats the quoted string as a program name and bails with
    // "filename/directory/volume label syntax is incorrect". `/s /c "<cmd>"`
    // tells cmd to use everything between the outer quotes verbatim.
    const shellArgs: string | string[] = isWin
      ? `/s /c "claude -p < "${promptFile}""`
      : ['-c', `claude -p < "${promptFile}"`]

    // Use a very wide PTY so the CLI does not soft-wrap its stdout. ConPTY on
    // Windows emits awkward last-column autowrap artifacts that split JSON
    // tokens mid-word (e.g. "process_md": "...the tex<\n>xt..."); the xterm.js
    // panel re-wraps to its own width regardless, so the only cost of a wide
    // PTY is the unread parts of the scrollback buffer.
    const term = pty.spawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 1000,
      rows: 30,
      cwd: opts.workingDir,
      env: process.env as Record<string, string>,
    })

    return new ClaudePtySession(term, opts)
  },
}
