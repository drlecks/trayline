import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// ESM-safe __dirname — `package.json` has `"type": "module"`, so the CJS
// `__dirname` global is not available in this config file.
const __dirname = dirname(fileURLToPath(import.meta.url))

// Native and native-adjacent modules that must NOT be bundled into the main
// process JS. They use runtime path resolution (`bindings`, dynamic require)
// that breaks when their .js is rolled into a single bundle. Keep them as
// real `require()` calls against node_modules / asar.unpacked at runtime.
const mainExternals = [
  'electron',
  'better-sqlite3',
  'bindings',
  'electron-store',
  'chokidar',
  'fsevents',
  'fast-glob',
  'node-pty',
]

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'src/main/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/main',
            rollupOptions: {
              external: mainExternals,
            },
          },
        },
      },
      {
        entry: 'src/preload/index.ts',
        vite: {
          build: {
            outDir: 'dist-electron/preload',
            // Electron's preload sandbox loads scripts as CommonJS regardless
            // of the parent package.json's `"type": "module"`. Force CJS output
            // via lib mode so the bundle uses `require('electron')` instead of
            // ESM `import` statements.
            lib: {
              entry: 'src/preload/index.ts',
              formats: ['cjs'],
              fileName: () => 'index.cjs',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@main': resolve(__dirname, 'src/main'),
    },
  },
})
