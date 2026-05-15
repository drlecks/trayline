import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { vi } from 'vitest'

// keytar is a native module that requires libsecret on Linux and the OS
// keychain on macOS/Windows — none of which are available in Vitest.
// Stub it out globally so every test suite gets a working in-memory store.
vi.mock('keytar', () => {
  const store = new Map<string, string>()
  const key = (service: string, account: string) => `${service}:${account}`
  return {
    default: {
      setPassword: vi.fn(async (s: string, a: string, v: string) => { store.set(key(s, a), v) }),
      getPassword: vi.fn(async (s: string, a: string) => store.get(key(s, a)) ?? null),
      deletePassword: vi.fn(async (s: string, a: string) => { store.delete(key(s, a)) }),
      findCredentials: vi.fn(async (s: string) =>
        [...store.entries()]
          .filter(([k]) => k.startsWith(`${s}:`))
          .map(([k, password]) => ({ account: k.slice(s.length + 1), password }))
      ),
    },
  }
})

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
