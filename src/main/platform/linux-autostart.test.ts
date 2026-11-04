import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { autostartPath, buildDesktopEntry, setLinuxAutostart } from './linux-autostart'

describe('autostartPath', () => {
  it('places the entry under <configHome>/autostart', () => {
    expect(autostartPath('/home/u/.config')).toBe('/home/u/.config/autostart/trayline.desktop')
  })
})

describe('buildDesktopEntry', () => {
  it('writes a valid desktop entry pointing at the binary', () => {
    const entry = buildDesktopEntry('/opt/Trayline/Trayline.AppImage')
    expect(entry).toContain('[Desktop Entry]')
    expect(entry).toContain('Type=Application')
    expect(entry).toContain('Exec="/opt/Trayline/Trayline.AppImage"')
  })

  it('escapes shell-special characters and field codes in the path', () => {
    const entry = buildDesktopEntry('/home/u/My "Apps"/$x`y`\\100%.AppImage')
    expect(entry).toContain('Exec="/home/u/My \\"Apps\\"/\\$x\\`y\\`\\\\100%%.AppImage"')
  })
})

describe('setLinuxAutostart', () => {
  let file: string

  beforeEach(() => {
    file = join(mkdtempSync(join(tmpdir(), 'trayline-autostart-')), 'autostart', 'trayline.desktop')
  })

  it('creates the autostart directory and entry when enabled', () => {
    setLinuxAutostart(true, '/usr/bin/trayline', file)
    expect(fs.readFileSync(file, 'utf-8')).toBe(buildDesktopEntry('/usr/bin/trayline'))
  })

  it('removes the entry when disabled', () => {
    setLinuxAutostart(true, '/usr/bin/trayline', file)
    setLinuxAutostart(false, '/usr/bin/trayline', file)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('disabling is a no-op when no entry exists', () => {
    expect(() => setLinuxAutostart(false, '/usr/bin/trayline', file)).not.toThrow()
  })
})
