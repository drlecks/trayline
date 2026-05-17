import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { localModelService } from './local-model-service'

// The global vitest.setup.ts already mocks electron and returns testRoot for
// all app.getPath() calls. That root doubles as userData for this service.

let testUserData = ''

// Override getPath('userData') per test by pointing it at a fresh tmp dir.
// We do this by mutating the env var that the global electron mock reads.
beforeEach(async () => {
  testUserData = await mkdtemp(join(tmpdir(), 'trayline-lm-'))
  // The global electron stub returns __TRAYLINE_TEST_DOCS__ for all paths.
  // We point that to our per-test dir so localModelService.getModelsDir()
  // resolves inside our isolated directory.
  process.env.__TRAYLINE_TEST_DOCS__ = testUserData
})

afterEach(async () => {
  await rm(testUserData, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('localModelService', () => {
  describe('isDownloaded', () => {
    it('returns false when the file does not exist', async () => {
      const result = await localModelService.isDownloaded('nonexistent.gguf')
      expect(result).toBe(false)
    })

    it('returns true when the file exists in the models dir', async () => {
      const modelsDir = join(testUserData, 'trayline-models')
      await mkdir(modelsDir, { recursive: true })
      await writeFile(join(modelsDir, 'test-model.gguf'), 'fake model data')
      const result = await localModelService.isDownloaded('test-model.gguf')
      expect(result).toBe(true)
    })
  })

  describe('listWithStatus', () => {
    it('returns all catalog entries with downloaded: false when no files exist', async () => {
      const entries = await localModelService.listWithStatus()
      expect(entries.length).toBeGreaterThan(0)
      for (const e of entries) {
        expect(e.downloaded).toBe(false)
        expect(e.downloadedAt).toBeUndefined()
      }
    })

    it('marks an entry as downloaded when its file is present', async () => {
      const entries = await localModelService.listWithStatus()
      const first = entries[0]

      const modelsDir = join(testUserData, 'trayline-models')
      await mkdir(modelsDir, { recursive: true })
      await writeFile(join(modelsDir, first.filename), 'fake model data')

      const updated = await localModelService.listWithStatus()
      const target = updated.find((e) => e.id === first.id)!
      expect(target.downloaded).toBe(true)
      expect(target.downloadedAt).toBeTypeOf('number')

      const others = updated.filter((e) => e.id !== first.id)
      for (const e of others) expect(e.downloaded).toBe(false)
    })
  })

  describe('cleanupStaleParts', () => {
    it('removes .part files from the models directory', async () => {
      const modelsDir = join(testUserData, 'trayline-models')
      await mkdir(modelsDir, { recursive: true })
      await writeFile(join(modelsDir, 'somemodel.gguf.part'), 'partial data')
      await writeFile(join(modelsDir, 'good.gguf'), 'complete model')

      await localModelService.cleanupStaleParts()

      await expect(access(join(modelsDir, 'somemodel.gguf.part'))).rejects.toThrow()
      await expect(access(join(modelsDir, 'good.gguf'))).resolves.toBeUndefined()
    })

    it('does not throw when the models directory does not yet exist', async () => {
      await expect(localModelService.cleanupStaleParts()).resolves.toBeUndefined()
    })
  })

  describe('deleteModel', () => {
    it('removes the model file when it exists', async () => {
      const entries = await localModelService.listWithStatus()
      const first = entries[0]
      const modelsDir = join(testUserData, 'trayline-models')
      await mkdir(modelsDir, { recursive: true })
      await writeFile(join(modelsDir, first.filename), 'fake model')

      await localModelService.deleteModel(first.id)

      const result = await localModelService.isDownloaded(first.filename)
      expect(result).toBe(false)
    })

    it('does not throw when the file is already gone (ENOENT)', async () => {
      const entries = await localModelService.listWithStatus()
      await expect(localModelService.deleteModel(entries[0].id)).resolves.toBeUndefined()
    })

    it('throws for an unknown model id', async () => {
      await expect(localModelService.deleteModel('does-not-exist')).rejects.toThrow('Unknown model id')
    })
  })
})
