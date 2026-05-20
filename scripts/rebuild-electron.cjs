'use strict'
// electron-builder sets npm_execpath to whatever pnpm sets it to —
// which is pnpm.mjs from the pnpm store. Windows can't fork/exec a .mjs
// file; only a Win32 executable (.exe) works. This script replaces
// npm_execpath with pnpm.exe (from the standalone pnpm install at
// %PNPM_HOME%) before invoking electron-builder install-app-deps.
// On macOS/Linux pnpm exposes a real shell script so no fix is needed.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

if (process.platform === 'win32') {
  const execPath = process.env.npm_execpath ?? ''
  if (execPath.endsWith('.mjs') || execPath.endsWith('.cjs')) {
    const pnpmHome = process.env.PNPM_HOME
      ?? path.join(process.env.LOCALAPPDATA ?? '', 'pnpm')
    try {
      const cmdFile = path.join(pnpmHome, 'bin', 'pnpm.CMD')
      const content = fs.readFileSync(cmdFile, 'utf8')
      // pnpm.CMD: @"%~dp0\..\global\v11\<hash>\node_modules\@pnpm\exe\pnpm.exe"  %*
      const m = content.match(/"([^"]+pnpm\.exe)"/i)
      if (m) {
        const binDir = path.join(pnpmHome, 'bin')
        const exePath = path.normalize(
          m[1].replace(/%~dp0/gi, binDir + path.sep),
        )
        if (fs.existsSync(exePath)) {
          process.env.npm_execpath = exePath
        }
      }
    } catch { /* fall through — electron-builder will error on its own */ }
  }
}

execSync('electron-builder install-app-deps', { stdio: 'inherit' })
