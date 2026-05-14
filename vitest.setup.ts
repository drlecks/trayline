import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

// Per-test-run isolated Trayline data dir. Each `npm test` gets a fresh tmp
// directory; tests that touch the file system point fs-service.Paths at it
// via the electron mock below.
const testRoot = mkdtempSync(join(tmpdir(), 'trayline-test-'))
process.env.__TRAYLINE_TEST_DOCS__ = testRoot

// The real `electron` package only loads inside an Electron host, and our
// services pull `app.getPath('documents')` at module-evaluation time.
// Replace the package surface with the minimum set of stubs the services need.
vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'documents') return process.env.__TRAYLINE_TEST_DOCS__!
      return process.env.__TRAYLINE_TEST_DOCS__!
    },
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
  Notification: class {
    static isSupported() { return false }
    show() {}
  },
}))
