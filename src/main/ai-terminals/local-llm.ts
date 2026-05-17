import fs from 'fs/promises'
import { join } from 'path'
import type {
  AITerminalAdapter,
  AISession,
  AISessionResult,
  SpawnOptions,
  ModelInfo,
  EffortInfo,
  AdapterReadiness,
} from './adapter'
import { localModelService } from '../services/local-model-service'
import { settingsStore } from '../services/settings-store'
import { renderProcessTemplate } from './prompt-utils'

// ── node-llama-cpp dynamic import cache ──────────────────────────────────────
// Dynamic import defers native-module loading until first use. The module is
// bundled via asarUnpack so it is always present in production; in tests the
// module is fully mocked via vi.mock('node-llama-cpp', ...).

type LlamaCppModule = typeof import('node-llama-cpp')
type LlamaHandle = Awaited<ReturnType<LlamaCppModule['getLlama']>>
type LlamaModelHandle = Awaited<ReturnType<LlamaHandle['loadModel']>>

let _module: LlamaCppModule | null = null
let _llama: LlamaHandle | null = null
let _loadedModel: { path: string; model: LlamaModelHandle } | null = null

async function getLlamaCppModule(): Promise<LlamaCppModule> {
  if (_module) return _module
  _module = await import('node-llama-cpp') as LlamaCppModule
  return _module
}

async function ensureLlama(): Promise<LlamaHandle> {
  if (_llama) return _llama
  const mod = await getLlamaCppModule()
  _llama = await mod.getLlama()
  return _llama
}

async function ensureModel(modelPath: string): Promise<LlamaModelHandle> {
  if (_loadedModel?.path === modelPath) return _loadedModel.model
  const llama = await ensureLlama()
  if (_loadedModel) {
    try {
      await (_loadedModel.model as unknown as { dispose(): Promise<void> }).dispose()
    } catch { /* ignore */ }
  }
  const model = await llama.loadModel({ modelPath })
  _loadedModel = { path: modelPath, model }
  return model
}

// Exposed for testing — lets tests reset module-level singletons.
export function _resetLlamaCache(): void {
  _module = null
  _llama = null
  _loadedModel = null
}

// ── Prompt assembly ───────────────────────────────────────────────────────────

const JSON_SYSTEM_PREFIX =
  'You are a workflow automation assistant processing business data. ' +
  'You MUST respond with valid JSON only — no markdown fences, no explanatory prose, ' +
  'no text outside the JSON object. ' +
  'Your response must be a single JSON object matching the schema described in the task instructions below.'

async function buildFullPrompt(opts: SpawnOptions): Promise<string> {
  const processBody = await fs.readFile(opts.processFile, 'utf-8')
  const parts: string[] = [JSON_SYSTEM_PREFIX]
  for (const skill of opts.skills) {
    parts.push(`## Skill: ${skill.id}\n\n${skill.content}`)
  }
  if (opts.contextPacks.length > 0) {
    parts.push(`## Context\n\n${opts.contextPacks.join('\n\n')}`)
  }
  parts.push(renderProcessTemplate(processBody, opts.cardData))
  return parts.join('\n\n---\n\n')
}

// ── Token streaming queue ─────────────────────────────────────────────────────

interface TokenQueue {
  push(token: string): void
  close(): void
  readonly iter: AsyncIterable<string>
}

function makeTokenQueue(): TokenQueue {
  const chunks: string[] = []
  const waiters: Array<() => void> = []
  let closed = false

  async function* generate(): AsyncIterable<string> {
    while (true) {
      if (chunks.length > 0) { yield chunks.shift()!; continue }
      if (closed) return
      await new Promise<void>((res) => waiters.push(res))
    }
  }

  return {
    iter: generate(),
    push(token: string) {
      chunks.push(token)
      waiters.shift()?.()
    },
    close() {
      closed = true
      waiters.shift()?.()
    },
  }
}

// ── AISession implementation ──────────────────────────────────────────────────

async function* emptyIter(): AsyncIterable<string> {}

class LocalLlmSession implements AISession {
  pid = -1
  awaitingInput = false
  readonly stdout: AsyncIterable<string>
  readonly stderr: AsyncIterable<string> = emptyIter()

  private _result: Promise<AISessionResult>
  private _startedAt: number
  private _abort: AbortController

  constructor(
    inferencePromise: Promise<string>,
    queue: TokenQueue,
    abort: AbortController,
    startedAt: number,
  ) {
    this._startedAt = startedAt
    this._abort = abort
    this.stdout = queue.iter

    this._result = inferencePromise.then((raw): AISessionResult => {
      // Strip any markdown fences the model may emit despite instructions
      const clean = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```\s*$/, '').trim()
      let parsed: object | string | null
      try { parsed = JSON.parse(clean) } catch { parsed = raw }
      return {
        exitCode: 0,
        output: parsed,
        terminalLog: raw + '\n',
        startedAt: this._startedAt,
        endedAt: Date.now(),
      }
    }).catch((err: unknown): AISessionResult => {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        exitCode: 1,
        output: null,
        terminalLog: msg + '\n',
        startedAt: this._startedAt,
        endedAt: Date.now(),
      }
    })
  }

  async sendInput(_text: string): Promise<void> {}

  async kill(): Promise<void> {
    this._abort.abort()
  }

  async result(): Promise<AISessionResult> {
    return this._result
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export const localLlmAdapter: AITerminalAdapter = {
  id: 'local-llm',
  displayName: 'Local AI (no account needed)',
  kind: 'production',
  description: 'Runs entirely on your device — no internet, no API key required.',
  supportsMcps: false,

  async checkReadiness(): Promise<AdapterReadiness> {
    const models = await localModelService.listWithStatus()
    const downloaded = models.filter((m) => m.downloaded)
    const blockers = downloaded.length === 0
      ? [{
          kind: 'model_not_downloaded' as const,
          message: 'No local model downloaded. Open Settings → Local AI to download a model.',
        }]
      : []
    return {
      adapterId: 'local-llm',
      installed: true,
      version: null,
      blockers,
      checkedAt: Date.now(),
    }
  },

  async detectInstalled(): Promise<boolean> {
    const models = await localModelService.listWithStatus()
    return models.some((m) => m.downloaded)
  },

  async getVersion(): Promise<string | null> { return null },

  async listModels(): Promise<ModelInfo[]> {
    const catalog = await localModelService.getCatalog()
    return catalog.map((e) => ({ id: e.id, label: e.label, description: e.description }))
  },

  async listEfforts(_modelId: string): Promise<EffortInfo[]> {
    return []
  },

  async clearContext(): Promise<void> {},

  async spawn(opts: SpawnOptions): Promise<AISession> {
    // Resolve selected model (settings preference → first downloaded → error)
    const settings = settingsStore.store
    const selectedId = (settings.defaultModelByAdapter ?? {})['local-llm'] ?? null
    const models = await localModelService.listWithStatus()
    const downloaded = models.filter((m) => m.downloaded)

    const entry = (selectedId ? downloaded.find((m) => m.id === selectedId) : null)
      ?? downloaded[0]
      ?? null

    if (!entry) {
      throw new Error(
        'No local model downloaded. Please download a model in Settings → Local AI before running.',
      )
    }

    const modelPath = localModelService.getModelPath(entry.filename)
    const prompt = await buildFullPrompt(opts)

    // Write prompt.txt for reproducibility / debugging
    await fs.writeFile(join(opts.workingDir, 'prompt.txt'), prompt, 'utf-8')

    const abort = new AbortController()
    const queue = makeTokenQueue()
    const startedAt = Date.now()

    const { LlamaChatSession } = await getLlamaCppModule()
    const model = await ensureModel(modelPath)
    const context = await model.createContext()
    const session = new LlamaChatSession({ contextSequence: context.getSequence() })

    const inferencePromise = session
      .prompt(prompt, {
        onTextChunk: (chunk: string) => queue.push(chunk),
        signal: abort.signal,
      })
      .finally(() => {
        queue.close()
        void context.dispose()
      })

    return new LocalLlmSession(inferencePromise, queue, abort, startedAt)
  },
}
