import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { scanFiles, testFileWatchChannel } from './file-source-channel'
import type { FileWatchChannel } from '../../shared/types'

function makeChannel(overrides: Partial<FileWatchChannel> = {}): FileWatchChannel {
  return { type: 'file_watch', directory_path: '', ...overrides }
}

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'trayline-fsc-test-'))
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

describe('scanFiles', () => {
  it('returns items for each readable file in the directory', async () => {
    await writeFile(join(tmpDir, 'a.txt'), 'hello', 'utf-8')
    await writeFile(join(tmpDir, 'b.txt'), 'world', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir }))
    expect(items).toHaveLength(2)
    const names = items.map((i) => i.filename).sort()
    expect(names).toEqual(['a.txt', 'b.txt'])
  })

  it('includes file content and metadata', async () => {
    await writeFile(join(tmpDir, 'doc.txt'), 'some content', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir }))
    expect(items).toHaveLength(1)
    expect(items[0].content).toBe('some content')
    expect(items[0].filename).toBe('doc.txt')
    expect(items[0].extension).toBe('.txt')
    expect(items[0].size_bytes).toBeGreaterThan(0)
    expect(items[0].file_path).toContain('doc.txt')
    expect(items[0].modified_at).toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('filters files by pattern', async () => {
    await writeFile(join(tmpDir, 'report.csv'), 'a,b', 'utf-8')
    await writeFile(join(tmpDir, 'notes.txt'), 'hi', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir, file_pattern: '*.csv' }))
    expect(items).toHaveLength(1)
    expect(items[0].filename).toBe('report.csv')
  })

  it('returns empty array when no files match the pattern', async () => {
    await writeFile(join(tmpDir, 'notes.txt'), 'hi', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir, file_pattern: '*.csv' }))
    expect(items).toHaveLength(0)
  })

  it('does not recurse into subdirectories when include_subdirs is false', async () => {
    await mkdir(join(tmpDir, 'sub'))
    await writeFile(join(tmpDir, 'top.txt'), 'top', 'utf-8')
    await writeFile(join(tmpDir, 'sub', 'nested.txt'), 'nested', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir, include_subdirs: false }))
    expect(items.map((i) => i.filename)).toEqual(['top.txt'])
  })

  it('recurses into subdirectories when include_subdirs is true', async () => {
    await mkdir(join(tmpDir, 'sub'))
    await writeFile(join(tmpDir, 'top.txt'), 'top', 'utf-8')
    await writeFile(join(tmpDir, 'sub', 'nested.txt'), 'nested', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir, include_subdirs: true }))
    const names = items.map((i) => i.filename).sort()
    expect(names).toEqual(['nested.txt', 'top.txt'])
  })

  it('throws when directory does not exist', async () => {
    await expect(
      scanFiles(makeChannel({ directory_path: join(tmpDir, 'nonexistent') })),
    ).rejects.toThrow('Directory not accessible')
  })

  it('uses file_path as the natural dedup key (absolute path)', async () => {
    await writeFile(join(tmpDir, 'item.txt'), 'data', 'utf-8')
    const items = await scanFiles(makeChannel({ directory_path: tmpDir }))
    expect(items[0].file_path).toBe(items[0].file_path)  // always defined
    expect(items[0].file_path).toContain('item.txt')
    // Two scans return the same file_path for the same file
    const items2 = await scanFiles(makeChannel({ directory_path: tmpDir }))
    expect(items2[0].file_path).toBe(items[0].file_path)
  })
})

describe('testFileWatchChannel', () => {
  it('returns ok: true for an existing directory', async () => {
    const result = await testFileWatchChannel(makeChannel({ directory_path: tmpDir }))
    expect(result).toEqual({ ok: true })
  })

  it('returns ok: false for a missing directory', async () => {
    const result = await testFileWatchChannel(makeChannel({ directory_path: join(tmpDir, 'nope') }))
    expect(result.ok).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns ok: false for a file path', async () => {
    const filePath = join(tmpDir, 'afile.txt')
    await writeFile(filePath, 'x', 'utf-8')
    const result = await testFileWatchChannel(makeChannel({ directory_path: filePath }))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not a directory')
  })
})
