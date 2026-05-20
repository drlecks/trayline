// Global persistent log for all worker, source, outlet, adapter, and author runs.
// Keeps the last MAX_LINES lines in a single file under app-data/. Read by the
// renderer's log viewer via IPC.

import fs from 'fs/promises'
import { Paths } from './fs-service'
import { join } from 'path'

export type LogLevel = 'info' | 'warning' | 'error'

const MAX_LINES = 1000

class OutputLog {
  private get logFile() { return join(Paths.appData, 'output.log') }
  private lines: string[] = []
  private loaded = false
  private writeScheduled = false

  async append(prefix: string, text: string, level?: LogLevel): Promise<void> {
    if (!this.loaded) await this.load()
    const ts = new Date().toISOString()
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd()
      if (!trimmed) continue
      const lvl = level ?? 'info'
      this.lines.push(`[${ts}] [${prefix}] [${lvl}] ${trimmed}`)
    }
    if (this.lines.length > MAX_LINES) {
      this.lines = this.lines.slice(-MAX_LINES)
    }
    this.scheduleSave()
  }

  async getLines(): Promise<string[]> {
    if (!this.loaded) await this.load()
    return [...this.lines]
  }

  async clear(): Promise<void> {
    this.lines = []
    this.loaded = true
    try {
      await fs.writeFile(this.logFile, '', 'utf-8')
    } catch { /* non-fatal */ }
  }

  private scheduleSave() {
    if (this.writeScheduled) return
    this.writeScheduled = true
    setImmediate(async () => {
      this.writeScheduled = false
      try {
        await fs.writeFile(this.logFile, this.lines.join('\n') + '\n', 'utf-8')
      } catch { /* non-fatal */ }
    })
  }

  private async load(): Promise<void> {
    this.loaded = true
    try {
      const content = await fs.readFile(this.logFile, 'utf-8')
      this.lines = content.split('\n').filter(Boolean).slice(-MAX_LINES)
    } catch { /* file doesn't exist yet */ }
  }
}

export const outputLog = new OutputLog()
