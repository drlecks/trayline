import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { LocalModelEntry } from '../../shared/types'

// ── Hoisted mock state ────────────────────────────────────────────────────────
// vi.hoisted lets us declare values that the vi.mock factory can close over,
// even though vi.mock is hoisted above top-level imports.

type PromptOpts = { onTextChunk?: (c: string) => void; signal?: AbortSignal }

const llamaMocks = vi.hoisted(() => {
  const promptFn = vi.fn(
    async (_prompt: string, opts: PromptOpts) => {
      opts?.onTextChunk?.('{"summary"')
      opts?.onTextChunk?.(':"ok"}')
      return '{"summary":"ok"}'
    },
  )
  const contextDispose = vi.fn().mockResolvedValue(undefined)
  const getSequence = vi.fn().mockReturnValue({ id: 'seq-0' })
  const createContext = vi.fn().mockResolvedValue({
    getSequence,
    dispose: contextDispose,
  })
  const modelDispose = vi.fn().mockResolvedValue(undefined)
  const loadModel = vi.fn().mockResolvedValue({
    createContext,
    dispose: modelDispose,
  })
  const getLlama = vi.fn().mockResolvedValue({ loadModel })

  return { promptFn, contextDispose, getSequence, createContext, modelDispose, loadModel, getLlama }
})

vi.mock('node-llama-cpp', () => {
  class LlamaChatSession {
    constructor(_opts: unknown) {}
    prompt(...args: Parameters<typeof llamaMocks.promptFn>) {
      return llamaMocks.promptFn(...args)
    }
  }
  return {
    getLlama: llamaMocks.getLlama,
    LlamaChatSession,
  }
})

// ── localModelService mock ────────────────────────────────────────────────────

const modelServiceMocks = vi.hoisted(() => {
  const catalog = [
    {
      id: 'qwen2.5-1.5b',
      label: 'Qwen 2.5 1.5B',
      description: 'Fastest local model.',
      filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
      sizeMb: 986,
      sizeBytes: 1034000000,
      recommended: true,
      minRamMb: 2048,
    },
    {
      id: 'phi-4-mini',
      label: 'Phi-4 Mini',
      description: 'Strong reasoning.',
      filename: 'Phi-4-mini-instruct-Q4_K_M.gguf',
      sizeMb: 2480,
      sizeBytes: 2600000000,
      recommended: false,
      minRamMb: 6144,
    },
  ]

  const listWithStatus = vi.fn<() => Promise<LocalModelEntry[]>>()
  const getCatalog = vi.fn().mockResolvedValue(catalog)
  const getModelPath = vi.fn((filename: string) => `/fake/models/${filename}`)

  return { catalog, listWithStatus, getCatalog, getModelPath }
})

vi.mock('../services/local-model-service', () => ({
  localModelService: {
    listWithStatus: modelServiceMocks.listWithStatus,
    getCatalog: modelServiceMocks.getCatalog,
    getModelPath: modelServiceMocks.getModelPath,
  },
}))

vi.mock('../services/settings-store', () => ({
  settingsStore: {
    store: { defaultModelByAdapter: {} },
  },
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { localLlmAdapter, _resetLlamaCache } from './local-llm'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LocalModelEntry> = {}): LocalModelEntry {
  return {
    id: 'qwen2.5-1.5b',
    label: 'Qwen 2.5 1.5B',
    description: 'Fastest local model.',
    filename: 'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',
    sizeMb: 986,
    sizeBytes: 1034000000,
    recommended: true,
    minRamMb: 2048,
    downloaded: true,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let tmpDir = ''

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'trayline-llm-'))
  _resetLlamaCache()
  vi.clearAllMocks()
  // Re-apply defaults that clearAllMocks wiped
  llamaMocks.getLlama.mockResolvedValue({ loadModel: llamaMocks.loadModel })
  llamaMocks.loadModel.mockResolvedValue({
    createContext: llamaMocks.createContext,
    dispose: llamaMocks.modelDispose,
  })
  llamaMocks.createContext.mockResolvedValue({
    getSequence: llamaMocks.getSequence,
    dispose: llamaMocks.contextDispose,
  })
  llamaMocks.getSequence.mockReturnValue({ id: 'seq-0' })
  llamaMocks.promptFn.mockImplementation(async (_p: string, opts: PromptOpts) => {
    opts?.onTextChunk?.('{"summary"')
    opts?.onTextChunk?.(':"ok"}')
    return '{"summary":"ok"}'
  })
  modelServiceMocks.getCatalog.mockResolvedValue(modelServiceMocks.catalog)
  modelServiceMocks.getModelPath.mockImplementation((f: string) => `/fake/models/${f}`)
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('localLlmAdapter', () => {
  describe('adapter metadata', () => {
    it('has the correct id and kind', () => {
      expect(localLlmAdapter.id).toBe('local-llm')
      expect(localLlmAdapter.kind).toBe('production')
    })
  })

  describe('checkReadiness', () => {
    it('returns no blockers when at least one model is downloaded', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const r = await localLlmAdapter.checkReadiness()
      expect(r.installed).toBe(true)
      expect(r.blockers).toHaveLength(0)
    })

    it('returns model_not_downloaded blocker when nothing is downloaded', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([
        makeEntry({ downloaded: false }),
        { ...makeEntry(), id: 'phi-4-mini', downloaded: false },
      ])
      const r = await localLlmAdapter.checkReadiness()
      expect(r.installed).toBe(true)
      expect(r.blockers).toHaveLength(1)
      expect(r.blockers[0].kind).toBe('model_not_downloaded')
    })

    it('returns model_not_downloaded blocker when catalog is empty', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([])
      const r = await localLlmAdapter.checkReadiness()
      expect(r.blockers[0].kind).toBe('model_not_downloaded')
    })
  })

  describe('listModels', () => {
    it('returns catalog entries as ModelInfo', async () => {
      const models = await localLlmAdapter.listModels()
      expect(models).toHaveLength(2)
      expect(models[0].id).toBe('qwen2.5-1.5b')
      expect(models[0].label).toBe('Qwen 2.5 1.5B')
      expect(models[1].id).toBe('phi-4-mini')
    })
  })

  describe('listEfforts', () => {
    it('returns an empty array for any model id', async () => {
      expect(await localLlmAdapter.listEfforts('qwen2.5-1.5b')).toEqual([])
      expect(await localLlmAdapter.listEfforts('anything')).toEqual([])
    })
  })

  describe('spawn', () => {
    async function makeOpts(dir: string) {
      const processFile = join(dir, 'process.md')
      await writeFile(processFile, '## Task\n\nProcess this: {{card.data}}')
      const workingDir = join(dir, 'run')
      await mkdir(workingDir, { recursive: true })
      return {
        processFile,
        cardData: { subject: 'test card' },
        contextPacks: [],
        workingDir,
        timeout: 30_000,
      }
    }

    it('throws when no model is downloaded', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: false })])
      const opts = await makeOpts(tmpDir)
      await expect(localLlmAdapter.spawn(opts)).rejects.toThrow(/No local model downloaded/)
    })

    it('resolves a session that streams tokens to stdout', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)

      const chunks: string[] = []
      for await (const chunk of session.stdout) {
        chunks.push(chunk)
      }

      expect(chunks.join('')).toBe('{"summary":"ok"}')  // the two mock chunks concatenated
    })

    it('result() parses JSON output correctly', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)
      // drain stdout so inference finishes
      for await (const _ of session.stdout) {}
      const result = await session.result()
      expect(result.exitCode).toBe(0)
      expect(result.output).toEqual({ summary: 'ok' })
    })

    it('result() wraps non-JSON output as a string', async () => {
      llamaMocks.promptFn.mockImplementation(async (_p: string, opts: PromptOpts) => {
        opts?.onTextChunk?.('plain text response')
        return 'plain text response'
      })
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)
      for await (const _ of session.stdout) {}
      const result = await session.result()
      expect(result.exitCode).toBe(0)
      expect(result.output).toBe('plain text response')
    })

    it('strips markdown fences from JSON output', async () => {
      llamaMocks.promptFn.mockImplementation(async (_p: string, opts: PromptOpts) => {
        const raw = '```json\n{"key":"value"}\n```'
        opts?.onTextChunk?.(raw)
        return raw
      })
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)
      for await (const _ of session.stdout) {}
      const result = await session.result()
      expect(result.output).toEqual({ key: 'value' })
    })

    it('kill() aborts the inference', async () => {
      let receivedSignal: AbortSignal | undefined
      llamaMocks.promptFn.mockImplementation(
        (_p: string, opts: PromptOpts) =>
          new Promise<string>((_resolve, reject) => {
            receivedSignal = opts?.signal
            opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
          }),
      )
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)
      await session.kill()
      expect(receivedSignal?.aborted).toBe(true)
      const result = await session.result()
      expect(result.exitCode).toBe(1)
    })

    it('writes prompt.txt to the working directory', async () => {
      modelServiceMocks.listWithStatus.mockResolvedValue([makeEntry({ downloaded: true })])
      const opts = await makeOpts(tmpDir)
      const session = await localLlmAdapter.spawn(opts)
      for await (const _ of session.stdout) {}
      const { access } = await import('node:fs/promises')
      await expect(access(join(opts.workingDir, 'prompt.txt'))).resolves.toBeUndefined()
    })
  })
})
