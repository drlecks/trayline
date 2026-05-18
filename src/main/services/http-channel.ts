import { credentialService } from './credential-service'
import type { HttpCredential, HttpGetChannel, HttpPostChannel, HttpErrorDetail } from '../../shared/types'

/** Thrown when the server returns a non-2xx status. Carries full diagnostic context. */
export class HttpChannelError extends Error {
  readonly detail: HttpErrorDetail
  constructor(detail: HttpErrorDetail) {
    super(`HTTP ${detail.status} ${detail.statusText} — ${detail.url}`)
    this.name = 'HttpChannelError'
    this.detail = detail
  }
}

function resolveTokensInString(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => tokens[key] ?? '')
}

function buildHeaders(credential: HttpCredential): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const h of credential.headers) {
    headers[h.name] = h.value
  }
  return headers
}

export async function fetchHttp(
  credential: HttpCredential,
  channel: HttpGetChannel,
  tokens: Record<string, string>,
): Promise<string> {
  const resolved = await credentialService.resolveSecrets(credential)
  const urlPath = resolveTokensInString(channel.url_path, tokens)
  const url = resolved.base_url.replace(/\/$/, '') + (urlPath.startsWith('/') ? urlPath : '/' + urlPath)
  const headers = buildHeaders(resolved)

  const controller = new AbortController()
  const timeout = resolved.timeout_ms > 0 ? resolved.timeout_ms : 15000
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response: Response
  try {
    response = await fetch(url, { method: 'GET', headers, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }

  const body = await response.text()
  if (!response.ok) {
    throw new HttpChannelError({
      url,
      status: response.status,
      statusText: response.statusText,
      responseBody: body.slice(0, 4096),
    })
  }
  return body
}

export async function postHttp(
  credential: HttpCredential,
  channel: HttpPostChannel,
  tokens: Record<string, string>,
): Promise<void> {
  const resolved = await credentialService.resolveSecrets(credential)
  const urlPath = resolveTokensInString(channel.url_path, tokens)
  const url = resolved.base_url.replace(/\/$/, '') + (urlPath.startsWith('/') ? urlPath : '/' + urlPath)
  const headers = buildHeaders(resolved)
  const method = channel.method ?? 'POST'

  let bodyStr: string | undefined
  if (channel.body) {
    bodyStr = resolveTokensInString(channel.body, tokens)
    headers['Content-Type'] ??= 'application/json'
  }

  const controller = new AbortController()
  const timeout = resolved.timeout_ms > 0 ? resolved.timeout_ms : 15000
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  let response: Response
  try {
    response = await fetch(url, { method, headers, body: bodyStr, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${body.slice(0, 200)}`)
  }
}

export async function testHttpCredential(credential: HttpCredential): Promise<{ ok: boolean; error?: string }> {
  try {
    const resolved = await credentialService.resolveSecrets(credential)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    let response: Response
    try {
      response = await fetch(resolved.base_url, { method: 'HEAD', headers: buildHeaders(resolved), signal: controller.signal })
    } finally {
      clearTimeout(timeoutId)
    }
    if (response.ok || (response.status >= 300 && response.status < 400)) return { ok: true }
    return { ok: false, error: `HTTP ${response.status} ${response.statusText}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
