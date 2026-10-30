import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { Paths } from './fs-service'
import { exportService } from './export-service'

async function makeProject(name: string) {
  const dir = join(Paths.projects, name)
  await fs.mkdir(join(dir, 'workflows'), { recursive: true })
  await fs.writeFile(join(dir, 'project.json'), JSON.stringify({ id: name, name }), 'utf-8')
}

/** Build an export zip by hand, as an untrusted third party could. */
function writeZip(folder: string, projectJson: unknown): string {
  const zip = new AdmZip()
  zip.addFile('manifest.json', Buffer.from('{}'))
  zip.addFile(`${folder}/project.json`, Buffer.from(JSON.stringify(projectJson)))
  const zipPath = join(tmpdir(), `trayline-test-${Date.now()}-${Math.random()}.zip`)
  zip.writeZip(zipPath)
  return zipPath
}

describe('exportService import', () => {
  beforeEach(async () => {
    await fs.rm(Paths.projects, { recursive: true, force: true })
    await fs.mkdir(Paths.projects, { recursive: true })
  })

  it('round-trips an exported project', async () => {
    await makeProject('acme')
    const zipPath = join(tmpdir(), `trayline-test-${Date.now()}.zip`)
    await exportService.exportProject('acme', { includeCards: false }, zipPath)
    await fs.rm(join(Paths.projects, 'acme'), { recursive: true })

    const result = await exportService.importProject(zipPath)

    expect(result).toEqual({ ok: true, projectName: 'acme' })
    expect(existsSync(join(Paths.projects, 'acme', 'project.json'))).toBe(true)
  })

  it.each([
    ['parent traversal', '../escaped'],
    ['nested traversal', 'a/../../escaped'],
    ['nested path', 'a/b'],
    ['backslash path', 'a\\b'],
    ['dot', '.'],
    ['dot-dot', '..'],
    ['empty', ''],
  ])('rejects a project.json name that is not a single folder name (%s)', async (_label, name) => {
    const zipPath = writeZip('evil', { name })

    await expect(exportService.importProject(zipPath)).rejects.toThrow(/Invalid export/)
    expect(existsSync(join(Paths.projects, '..', 'escaped'))).toBe(false)
    expect(await fs.readdir(Paths.projects)).toEqual([])
  })
})
