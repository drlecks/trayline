// Global persistent log for AI terminal output. Keeps the last MAX_LINES lines
// from all worker and outlet AI runs in a single file under app-data/. Read by
// the renderer's log viewer via IPC.

import fs from 'fs/promises'
import { Paths } from './fs-service'
import { join } from 'path'

const MAX_LINES = 1000

class AIOutputLog {
  private get logFile() { return join(Paths.appData, 'ai-output.log') }
  private lines: string[] = []
  private loaded = false
  private writeScheduled = false

  async append(prefix: string, text: string): Promise<void> {
    if (!this.loaded) await this.load()
    const ts = new Date().toISOString()
    // Split multi-line chunks into individual log lines
    for (const line of text.split('\n')) {
      const trimmed = line.trimEnd()
      if (!trimmed) continue
      this.lines.push(`[${ts}] [${prefix}] ${trimmed}`)
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

export const aiOutputLog = new AIOutputLog()
