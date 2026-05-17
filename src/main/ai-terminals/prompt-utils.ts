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
