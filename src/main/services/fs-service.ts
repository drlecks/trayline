import { app } from 'electron'
import { join } from 'path'
import fs from 'fs/promises'
import { watch, FSWatcher } from 'chokidar'

const TRAYLINE_ROOT = join(app.getPath('documents'), 'Trayline')

export const Paths = {
  root: TRAYLINE_ROOT,
  appData: join(TRAYLINE_ROOT, 'app-data'),
  projects: join(TRAYLINE_ROOT, 'projects'),
  credentials: join(TRAYLINE_ROOT, 'credentials'),
} as const

async function ensureDir(path: string) {
  await fs.mkdir(path, { recursive: true })
}

async function bootstrap() {
  await ensureDir(Paths.appData)
  await ensureDir(Paths.projects)
  await ensureDir(Paths.credentials)
}

async function readJson<T>(path: string): Promise<T> {
  const raw = await fs.readFile(path, 'utf-8')
  return JSON.parse(raw) as T
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await fs.writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = path + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, path)
}

async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path)
    return true
  } catch {
    return false
  }
}

function watchDir(
  dir: string,
  onAdd: (path: string) => void,
  onUnlink?: (path: string) => void,
): FSWatcher {
  const watcher = watch(dir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 300 },
  })
  watcher.on('add', onAdd)
  if (onUnlink) watcher.on('unlink', onUnlink)
  return watcher
}

export const fsService = {
  bootstrap,
  readJson,
  writeJson,
  writeJsonAtomic,
  exists,
  watchDir,
  paths: Paths,
}
