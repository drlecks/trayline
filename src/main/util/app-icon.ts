import { app } from 'electron'
import { join } from 'path'

export function resolveAppIcon(): string {
  const packaged = join(process.resourcesPath, 'icon-fill-128.png')
  if (app.isPackaged) return packaged
  return join(process.cwd(), 'resources', 'icon-fill-128.png')
}
