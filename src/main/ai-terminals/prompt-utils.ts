// Matches all ANSI / VT100 escape sequences emitted by a PTY:
//   OSC:   ESC ] ... (BEL | ESC \)       e.g. \x1B]0;claude\x07
//   CSI:   ESC [ [0-?]* [ -/]* [@-~]    e.g. \x1B[?9001h  \x1B[>4m  \x1B[<u]
//   Other: ESC [@-Z\-_]
//   Stray control chars conpty/Windows occasionally injects
// [0-?] = 0x30-0x3F covers 0-9 : ; < = > ? (the full CSI param range).
// eslint-disable-next-line no-control-regex
export const ANSI_RE = /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)|\x1B\[[0-?]*[ -/]*[@-~]|\x1B[@-Z\\-_]|[\x07\x00-\x06\x0E-\x1A\x1C-\x1F]/g

/** Strip all ANSI/VT100 escape sequences and stray control characters. */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)|\x1B\[[0-?]*[ -/]*[@-~]|\x1B[@-Z\\-_]|[\x07\x00-\x06\x0E-\x1A\x1C-\x1F]/g, '')
}

/**
 * Strip ANSI sequences then extract and parse a JSON value from raw AI
 * terminal output. Tries, in order:
 *   1. Markdown code fence  ```(json)? ... ```
 *   2. First balanced { } or [ ] block (AI wrote prose around the JSON)
 *   3. The whole cleaned string
 * Throws SyntaxError if no valid JSON can be found.
 */
export function parseAiJsonOutput(raw: string): unknown {
  const clean = stripAnsi(raw)
  if (!clean.trim()) throw new Error('AI produced no output')
  const fence = clean.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) return JSON.parse(fence[1].trim())
  const bracket = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (bracket) {
    try { return JSON.parse(bracket[1]) } catch { /* fall through to full parse */ }
  }
  return JSON.parse(clean.trim())
}

/**
 * Substitute `{{card.data}}`, `{{card.data.<path>}}`, and `{{card.data | json}}`
 * tokens in a template string with values from the card payload.
 *
 * - `{{card.data}}` → the full payload as pretty-printed JSON.
 * - `{{card.data | json}}` → the full payload as a compact JSON string (escaped for embedding).
 * - `{{card.data.foo}}` → the value at that path; strings inlined verbatim,
 *   objects/arrays JSON-stringified. Missing paths render as empty string.
 *
 * Used by outlet-runner (URL/body templates) and worker process templates.
 */
export function resolveTokens(template: string, cardData: Record<string, unknown>): string {
  // {{card.data | json}} — full object as compact JSON string
  let result = template.replace(/\{\{\s*card\.data\s*\|\s*json\s*\}\}/g, JSON.stringify(cardData))

  // {{card.data.foo}} — dotted path
  result = result.replace(/\{\{\s*card\.data\.([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
      return undefined
    }, cardData)
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  })

  // {{card.data}} — full pretty-printed JSON
  result = result.replace(/\{\{\s*card\.data\s*\}\}/g, JSON.stringify(cardData, null, 2))

  return result
}

/**
 * Substitute `{{card.data}}` and `{{card.data.<dotted.path>}}` tokens in a
 * worker's process.md body with values from the card payload.
 *
 * - `{{card.data}}` → the full payload pretty-printed as JSON.
 * - `{{card.data.foo}}` → the value at that path; strings are inlined verbatim,
 *   objects/arrays are JSON-stringified. Missing paths render as empty string.
 *
 * The regex tolerates internal whitespace (e.g. `{{ card.data.foo }}`).
 */
export function renderProcessTemplate(body: string, cardData: object): string {
  const data = cardData as Record<string, unknown>
  const dotted = body.replace(/\{\{\s*card\.data\.([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
      return undefined
    }, data)
    if (value === undefined || value === null) return ''
    if (typeof value === 'string') return value
    return JSON.stringify(value)
  })
  return dotted.replace(/\{\{\s*card\.data\s*\}\}/g, JSON.stringify(data, null, 2))
}
