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
