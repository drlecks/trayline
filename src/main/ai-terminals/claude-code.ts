import { spawn as childSpawn } from 'child_process'
import fs from 'fs/promises'
import { join } from 'path'
import type {
  AITerminalAdapter,
  AISession,
  AISessionResult,
  SpawnOptions,
} from './adapter'

// `shell: true` matters here — on Windows the `claude` CLI is typically a
// `claude.cmd` shim installed by npm/Anthropic. Without a shell, `spawn` can't
// resolve the .cmd extension via PATHEXT and fails with ENOENT. The same flag
// is harmless on macOS and Linux (just adds a /bin/sh hop).
const SPAWN_SHELL = true

// Detect Claude Code via `claude --version` on PATH.
async function runVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = childSpawn('claude', ['--version'], { shell: SPAWN_SHELL })
    let out = ''
    child.stdout.on('data', (b) => (out += b.toString()))
    child.on('error', () => resolve(null))
    child.on('exit', (code) => resolve(code === 0 ? out.trim() || null : null))
  })
}

class ClaudeCodeSession implements AISession {
  pid: number
  awaitingInput = false

  private stdoutLines: string[] = []
  private stderrLines: string[] = []
  private stdoutResolvers: Array<(s: IteratorResult<string>) => void> = []
  private stderrResolvers: Array<(s: IteratorResult<string>) => void> = []
  private finishedStdout = false
  private finishedStderr = false

  private exitPromise: Promise<AISessionResult>
  private startedAt = Date.now()
  private terminalLog = ''
  private child: ReturnType<typeof childSpawn>

  constructor(child: ReturnType<typeof childSpawn>, opts: SpawnOptions) {
    this.child = child
    this.pid = child.pid ?? -1

    child.stdout?.on('data', (buf: Buffer) => this.pushStdout(buf.toString()))
    child.stderr?.on('data', (buf: Buffer) => this.pushStderr(buf.toString()))
    child.stdout?.on('end', () => this.endStream('stdout'))
    child.stderr?.on('end', () => this.endStream('stderr'))

    this.exitPromise = new Promise<AISessionResult>((resolve) => {
      child.on('exit', async (code) => {
        const endedAt = Date.now()
        // Persist the terminal log to disk
        try {
          await fs.writeFile(join(opts.workingDir, 'terminal.log'), this.terminalLog, 'utf-8')
        } catch {
          // The runner is responsible for the working dir; if it doesn't exist
          // we just lose the log, but the result is still returned.
        }
        // Try to parse stdout as JSON
        let output: object | string | null = this.stdoutLines.join('').trim() || null
        if (typeof output === 'string') {
          try { output = JSON.parse(output) } catch { /* leave as string */ }
        }
        resolve({
          exitCode: code ?? -1,
          output,
          terminalLog: this.terminalLog,
          startedAt: this.startedAt,
          endedAt,
        })
      })
    })

    if (opts.timeout > 0) {
      setTimeout(() => {
        // Note: 'SIGTERM' is honored on macOS/Linux; on Windows Node ignores
        // the signal and forcibly terminates the process. That's the correct
        // behavior for a hard timeout, so we don't need to branch on platform.
        if (!child.killed) child.kill('SIGTERM')
      }, opts.timeout)
    }
  }

  private pushStdout(chunk: string) {
    this.stdoutLines.push(chunk)
    this.terminalLog += chunk
    while (this.stdoutResolvers.length) {
      const r = this.stdoutResolvers.shift()!
      r({ value: chunk, done: false })
      return
    }
  }

  private pushStderr(chunk: string) {
    this.stderrLines.push(chunk)
    this.terminalLog += chunk
    while (this.stderrResolvers.length) {
      const r = this.stderrResolvers.shift()!
      r({ value: chunk, done: false })
      return
    }
  }

  private endStream(which: 'stdout' | 'stderr') {
    if (which === 'stdout') {
      this.finishedStdout = true
      this.stdoutResolvers.forEach((r) => r({ value: undefined, done: true }))
      this.stdoutResolvers = []
    } else {
      this.finishedStderr = true
      this.stderrResolvers.forEach((r) => r({ value: undefined, done: true }))
      this.stderrResolvers = []
    }
  }

  stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<string>>((resolve) => {
          if (this.finishedStdout && !this.stdoutLines.length) {
            resolve({ value: undefined, done: true })
            return
          }
          this.stdoutResolvers.push(resolve)
        }),
    }),
  }

  stderr: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<string>>((resolve) => {
          if (this.finishedStderr && !this.stderrLines.length) {
            resolve({ value: undefined, done: true })
            return
          }
          this.stderrResolvers.push(resolve)
        }),
    }),
  }

  async sendInput(text: string): Promise<void> {
    this.child.stdin?.write(text + '\n')
  }

  async kill(): Promise<void> {
    if (!this.child.killed) this.child.kill('SIGTERM')
  }

  async result(): Promise<AISessionResult> {
    return this.exitPromise
  }
}

export const claudeCodeAdapter: AITerminalAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',

  async detectInstalled() {
    const v = await runVersion()
    return v !== null
  },

  async getVersion() {
    return runVersion()
  },

  async spawn(opts: SpawnOptions): Promise<AISession> {
    // Build the prompt by concatenating: skills → context packs → process.md → card data.
    // node-pty would be the long-term home for this, but for the bootstrap we use
    // child_process. Phase 4 swaps in node-pty for proper PTY behaviour and interactive runs.

    const processBody = await fs.readFile(opts.processFile, 'utf-8')

    const promptParts: string[] = []
    for (const skill of opts.skills) {
      promptParts.push(`## Skill: ${skill.id}\n\n${skill.content}`)
    }
    if (opts.contextPacks.length > 0) {
      promptParts.push(`## Context\n\n${opts.contextPacks.join('\n\n')}`)
    }
    promptParts.push(processBody.replace('{{card.data}}', JSON.stringify(opts.cardData, null, 2)))

    const prompt = promptParts.join('\n\n---\n\n')

    // Pipe the prompt to `claude` over stdin. MCP wiring lands in Phase N2.5.
    // `shell: true` for Windows .cmd resolution (see SPAWN_SHELL note above).
    const child = childSpawn('claude', ['--no-color'], {
      cwd: opts.workingDir,
      shell: SPAWN_SHELL,
      env: { ...process.env },
    })
    child.stdin?.write(prompt)
    child.stdin?.end()

    return new ClaudeCodeSession(child, opts)
  },
}
