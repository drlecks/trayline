import type { PlatformAdapter } from './adapter'
import { Win32Adapter } from './win32'
import { DarwinAdapter } from './darwin'
import { LinuxAdapter } from './linux'

export function getPlatformAdapter(): PlatformAdapter {
  switch (process.platform) {
    case 'win32':
      return new Win32Adapter()
    case 'darwin':
      return new DarwinAdapter()
    case 'linux':
      return new LinuxAdapter()
    default:
      throw new Error(`Unsupported platform: ${process.platform}`)
  }
}
