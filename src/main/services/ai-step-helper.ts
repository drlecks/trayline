// Lightweight helper for running a one-shot AI prompt inside a source or outlet
// step run. Writes the user's prompt text as ai-prompt.md, spawns the default
// production adapter, waits for the result, then clears adapter context.

import fs from 'fs/promises'
import { join } from 'path'
import { adapterRegistry } from '../ai-terminals/registry'
import { adapterReadinessService } from './adapter-readiness-service'
import { ANSI_RE } from '../ai-terminals/prompt-utils'
import { aiOutputLog } from './ai-output-log'
import type { ProjectPermissions } from '../../shared/types'

export interface AIStepResult {
  /** Parsed JSON object if the AI returned valid JSON, otherwise the raw string. */
  output: object | string
  terminalLog: string
}

export async function runAIStep(opts: {
  runDir: string
  prompt: string
  prefetchedData?: string
  cardData?: object
  permissions?: ProjectPermissions
  timeoutMs?: number
}): Promise<AIStepResult> {
  const { runDir, prompt, prefetchedData, cardData = {}, permissions, timeoutMs = 60_000 } = opts

  const adapter =
    adapterRegistry.get('claude-code') ??
    adapterRegistry.list().find((a) => a.kind === 'production') ??
    null
  if (!adapter) throw new Error('No AI adapter available')

  if (adapter.kind === 'production' && !(await adapterReadinessService.isReadyToRun(adapter.id))) {
    const readiness = adapterReadinessService.getCached(adapter.id)
    const detail = readiness?.blockers[0]?.message ?? `${adapter.displayName} is not installed.`
    throw new Error(detail)
  }

  const processFile = join(runDir, 'ai-prompt.md')
  await fs.writeFile(processFile, prompt, 'utf-8')

  const session = await adapter.spawn({
    processFile,
    cardData,
    contextPacks: [],
    workingDir: runDir,
    timeout: timeoutMs,
    prefetchedData,
    permissions,
  })

  let result
  try {
    void (async () => {
      try {
        for await (const chunk of session.stdout) {
          const clean = chunk.replace(ANSI_RE, '')
          if (clean.trim()) {
            console.log('[ai-step]', clean.trimEnd())
            void aiOutputLog.append('ai-step', clean.trimEnd())
          }
        }
      } catch { /* ignore */ }
    })()
    result = await session.result()
  } finally {
    try { await adapter.clearContext() } catch { /* ignore */ }
  }

  if (result.exitCode !== 0) {
    const tail = result.terminalLog
      ? '\n\nAI output:\n' + result.terminalLog.replace(ANSI_RE, '').trimEnd().slice(-600)
      : ''
    throw new Error(`AI step exited with code ${result.exitCode}${tail}`)
  }
  if (result.output === null) {
    throw new Error('AI step returned no output')
  }

  return { output: result.output, terminalLog: result.terminalLog }
}
