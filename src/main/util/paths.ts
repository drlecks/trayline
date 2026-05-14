// ESM-safe equivalents of CommonJS __dirname / __filename, plus small
// cross-platform path helpers. Imported by the main process where we used
// to write `__dirname` directly — that variable does not exist when
// `package.json` has `"type": "module"`, so we derive it from import.meta.

import { fileURLToPath } from 'url'
import { dirname } from 'path'

/**
 * Returns the directory of the calling module's source file.
 *
 * Pass `import.meta.url` from the caller. We can't reach `import.meta`
 * in this helper itself — ESM rules say each module owns its own
 * `import.meta`, so the caller has to hand it to us.
 */
export function dirnameFromMeta(metaUrl: string): string {
  return dirname(fileURLToPath(metaUrl))
}
