// Lightweight helper for running a one-shot AI prompt inside a source or outlet
// step run. Writes the user's prompt text as ai-prompt.md, spawns the default
// production adapter, waits for the result, then clears adapter context.

import fs from 'fs/promises'
import { join } from 'path'
import { adapterRegistry } from '../ai-terminals/registry'
import { adapterReadinessService } from './adapter-readiness-service'

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
  timeoutMs?: number
}): Promise<AIStepResult> {
  const { runDir, prompt, prefetchedData, cardData = {}, timeoutMs = 60_000 } = opts

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
  })

  let result
  try {
    result = await session.result()
  } finally {
    try { await adapter.clearContext() } catch { /* ignore */ }
  }

  if (result.exitCode !== 0) {
    throw new Error(`AI step exited with code ${result.exitCode}`)
  }
  if (result.output === null) {
    throw new Error('AI step returned no output')
  }

  return { output: result.output, terminalLog: result.terminalLog }
}
