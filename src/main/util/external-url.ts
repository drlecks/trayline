// Links the app hands to the operating system. A window can ask to open any URL, including ones from card content
// written by an AI worker, and shell.openExternal passes it to whatever handles the scheme: file: opens a local file,
// a custom protocol can start another program. Only web and mail links leave the app.

const ALLOWED_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/** True when `url` parses and uses a scheme that is safe to open in the user's browser or mail client. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol)
  } catch {
    return false
  }
}
