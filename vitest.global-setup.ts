import { execSync, spawnSync } from 'node:child_process'
import { existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

// better-sqlite3 must be compiled against whichever Node.js ABI is running the tests,
// but npm install downloads the Electron-compiled prebuilt (different ABI).
// This globalSetup swaps in the correct binary before tests run and restores
// the Electron binary after — no manual steps needed.

const SQLITE_DIR = join(process.cwd(), 'node_modules', 'better-sqlite3')
const RELEASE_DIR = join(SQLITE_DIR, 'build', 'Release')
const BINARY       = join(RELEASE_DIR, 'better_sqlite3.node')
// Backups live outside build/ so node-gyp's clean step doesn't delete them.
const ELECTRON_BIN = join(SQLITE_DIR, 'better_sqlite3.electron.node')
const NODE_BIN     = join(SQLITE_DIR, `better_sqlite3.nodejs-abi${process.versions.modules}.node`)

let didSwap = false

export async function setup() {
  const probe = spawnSync(process.execPath, ['-e', `require(${JSON.stringify(BINARY)})`], {
    encoding: 'utf8',
    timeout: 10000,
  })

  if (probe.status === 0) return // binary already matches this Node.js ABI

  console.log(
    `\n[vitest] better-sqlite3 is compiled for Electron, not Node.js ${process.version} ` +
    `(ABI ${process.versions.modules}). Fixing...`,
  )

  if (existsSync(BINARY)) copyFileSync(BINARY, ELECTRON_BIN)

  if (existsSync(NODE_BIN)) {
    console.log('[vitest] Using cached Node.js binary.\n')
    copyFileSync(NODE_BIN, BINARY)
  } else {
    console.log('[vitest] Compiling from source (one-time per Node.js version, ~30s)...\n')
    execSync('npx node-gyp rebuild --release', { cwd: SQLITE_DIR, stdio: 'inherit' })
    if (existsSync(BINARY)) copyFileSync(BINARY, NODE_BIN)
  }

  didSwap = true
}

export async function teardown() {
  if (didSwap && existsSync(ELECTRON_BIN)) {
    copyFileSync(ELECTRON_BIN, BINARY)
    console.log('\n[vitest] Restored Electron binary for better-sqlite3.')
  }
}
