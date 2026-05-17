import { app } from 'electron'
import fs from 'fs/promises'
import { createWriteStream } from 'fs'
import https from 'https'
import http from 'http'
import { join } from 'path'
import type { LocalModelEntry, ModelDownloadProgress } from '../../shared/types'

interface CatalogEntry {
  id: string
  label: string
  description: string
  filename: string
  url: string
  sizeMb: number
  sizeBytes: number
  recommended: boolean
  minRamMb: number
}

function getModelsDir(): string {
  return join(app.getPath('userData'), 'trayline-models')
}

function getResourcesPath(): string {
  // In dev: process.resourcesPath points to <project>/resources, but
  // extraResources places files alongside app.asar. In prod the file is at
  // process.resourcesPath/local-models.json. In dev Vite serves from root, so
  // fall back to the source location.
  return process.resourcesPath ?? ''
}

let _catalog: CatalogEntry[] | null = null

async function getCatalog(): Promise<CatalogEntry[]> {
  if (_catalog) return _catalog
  const candidates = [
    join(getResourcesPath(), 'local-models.json'),
    join(process.cwd(), 'src', 'main', 'ai-terminals', 'local-models.json'),
  ]
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf-8')
      _catalog = JSON.parse(raw) as CatalogEntry[]
      return _catalog
    } catch { /* try next */ }
  }
  _catalog = []
  return _catalog
}

async function ensureModelsDir(): Promise<string> {
  const dir = getModelsDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

async function isDownloaded(filename: string): Promise<boolean> {
  try {
    await fs.access(join(getModelsDir(), filename))
    return true
  } catch {
    return false
  }
}

function getModelPath(filename: string): string {
  return join(getModelsDir(), filename)
}

async function listWithStatus(): Promise<LocalModelEntry[]> {
  const catalog = await getCatalog()
  const results: LocalModelEntry[] = []
  for (const entry of catalog) {
    let downloaded = false
    let downloadedAt: number | undefined
    try {
      const stat = await fs.stat(join(getModelsDir(), entry.filename))
      downloaded = true
      downloadedAt = stat.mtimeMs
    } catch { /* not downloaded */ }
    results.push({ ...entry, downloaded, downloadedAt })
  }
  return results
}

// In-flight download state
const inFlight = new Map<string, AbortController>()

async function downloadModel(
  modelId: string,
  onProgress: (p: ModelDownloadProgress) => void,
): Promise<void> {
  const catalog = await getCatalog()
  const entry = catalog.find((e) => e.id === modelId)
  if (!entry) throw new Error(`Unknown model id: ${modelId}`)

  const dir = await ensureModelsDir()
  const partPath = join(dir, `${entry.filename}.part`)
  const finalPath = join(dir, entry.filename)

  const controller = new AbortController()
  inFlight.set(modelId, controller)

  try {
    await streamDownload(entry.url, partPath, entry.sizeBytes, onProgress, controller.signal)
    await fs.rename(partPath, finalPath)
  } catch (err) {
    // Clean up partial file on error or cancellation
    try { await fs.unlink(partPath) } catch { /* ignore */ }
    inFlight.delete(modelId)
    throw err
  }
  inFlight.delete(modelId)
}

function streamDownload(
  url: string,
  destPath: string,
  expectedBytes: number,
  onProgress: (p: ModelDownloadProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Download cancelled')); return }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      req.destroy(new Error('Download cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const protocol = url.startsWith('https') ? https : http

    // Follow one level of redirect (HuggingFace CDN uses 302)
    const makeRequest = (targetUrl: string) => {
      const req = protocol.get(targetUrl, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const location = res.headers.location
          if (!location) { cleanup(); reject(new Error('Redirect with no Location header')); return }
          res.resume()
          makeRequest(location)
          return
        }
        if (res.statusCode !== 200) {
          cleanup()
          reject(new Error(`HTTP ${res.statusCode} downloading model`))
          return
        }

        const total = parseInt(res.headers['content-length'] ?? '0', 10) || expectedBytes
        let downloaded = 0
        const out = createWriteStream(destPath)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
          onProgress({ modelId: '', downloadedBytes: downloaded, totalBytes: total, percent })
        })

        res.pipe(out)

        out.on('finish', () => { cleanup(); resolve() })
        out.on('error', (e) => { cleanup(); reject(e) })
        res.on('error', (e) => { cleanup(); reject(e) })
      })

      req.on('error', (e) => { cleanup(); reject(e) })
      return req
    }

    const req = makeRequest(url)
    // Store req reference so abort can destroy it
    signal.addEventListener('abort', () => req.destroy(new Error('Download cancelled')), { once: true })
  })
}

function cancelDownload(modelId: string): void {
  const controller = inFlight.get(modelId)
  if (controller) {
    controller.abort()
    inFlight.delete(modelId)
  }
}

async function deleteModel(modelId: string): Promise<void> {
  const catalog = await getCatalog()
  const entry = catalog.find((e) => e.id === modelId)
  if (!entry) throw new Error(`Unknown model id: ${modelId}`)
  try {
    await fs.unlink(join(getModelsDir(), entry.filename))
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}

async function cleanupStaleParts(): Promise<void> {
  try {
    const dir = getModelsDir()
    await fs.mkdir(dir, { recursive: true })
    const entries = await fs.readdir(dir)
    for (const name of entries) {
      if (name.endsWith('.part')) {
        try { await fs.unlink(join(dir, name)) } catch { /* ignore */ }
      }
    }
  } catch { /* models dir may not exist yet — fine */ }
}

export const localModelService = {
  getCatalog,
  listWithStatus,
  isDownloaded,
  getModelPath,
  downloadModel,
  cancelDownload,
  deleteModel,
  cleanupStaleParts,
}
