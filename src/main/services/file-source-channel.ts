// File-watch source channel — scans a local directory for new files and
// returns their contents as FileItems (one card per file). The source runner
// deduplicates against seen-ids.json using file_path as the unique key.

import fs from 'fs/promises'
import { join, extname, resolve as resolvePath } from 'path'
import type { FileWatchChannel } from '../../shared/types'

export interface FileItem {
  /** Absolute path — used as the dedup key. */
  file_path: string
  filename: string
  extension: string
  /** UTF-8 text content of the file. */
  content: string
  size_bytes: number
  modified_at: string
  created_at: string
}

/** Matches a filename against a simple glob pattern (supports * wildcard). */
function matchPattern(filename: string, pattern: string): boolean {
  if (!pattern || pattern === '*') return true
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`, 'i').test(filename)
}

async function collectFiles(
  dirPath: string,
  pattern: string,
  recursive: boolean,
  results: FileItem[],
): Promise<void> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = resolvePath(join(dirPath, entry.name))
    if (entry.isDirectory()) {
      if (recursive) await collectFiles(fullPath, pattern, recursive, results)
      continue
    }
    if (!entry.isFile()) continue
    if (!matchPattern(entry.name, pattern)) continue

    try {
      const stat = await fs.stat(fullPath)
      if (stat.size > 10 * 1024 * 1024) continue  // skip files > 10 MB
      const content = await fs.readFile(fullPath, 'utf-8')
      results.push({
        file_path: fullPath,
        filename: entry.name,
        extension: extname(entry.name),
        content,
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
        created_at: stat.birthtime.toISOString(),
      })
    } catch {
      // skip unreadable or binary files
    }
  }
}

export async function scanFiles(channel: FileWatchChannel): Promise<FileItem[]> {
  const dirPath = resolvePath(channel.directory_path)
  const pattern = channel.file_pattern ?? '*'
  const recursive = channel.include_subdirs ?? false

  try {
    await fs.access(dirPath)
  } catch {
    throw new Error(`Directory not accessible: ${dirPath}`)
  }

  const results: FileItem[] = []
  await collectFiles(dirPath, pattern, recursive, results)
  return results
}

export async function testFileWatchChannel(channel: FileWatchChannel): Promise<{ ok: boolean; error?: string }> {
  const dirPath = resolvePath(channel.directory_path)
  try {
    const stat = await fs.stat(dirPath)
    if (!stat.isDirectory()) return { ok: false, error: 'Path is not a directory' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
