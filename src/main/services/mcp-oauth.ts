import { shell } from 'electron'
import * as http from 'http'
import * as crypto from 'crypto'
import * as net from 'net'
import { mcpCredentials } from './mcp-credentials'

// One pending flow per MCP at most.
const pendingFlows = new Map<string, { cancel: () => void }>()

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo
      server.close(() => resolve(addr.port))
    })
    server.on('error', reject)
  })
}

function buildPkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

interface OAuthStartOptions {
  clientIdKey?: string
  clientSecretKey?: string
}

export async function startOAuth(
  mcpId: string,
  credId: string,
  provider: string,
  scopes: string[],
  opts: OAuthStartOptions = {},
): Promise<void> {
  // Cancel any existing flow for this MCP before starting a new one.
  pendingFlows.get(mcpId)?.cancel()

  if (provider !== 'google') {
    throw new Error(`Unsupported OAuth provider: "${provider}". Only "google" is supported.`)
  }

  const clientIdKey = opts.clientIdKey ?? 'GOOGLE_CLIENT_ID'
  const clientSecretKey = opts.clientSecretKey ?? 'GOOGLE_CLIENT_SECRET'

  const clientId = await mcpCredentials.readCredential(mcpId, clientIdKey)
  if (!clientId) {
    throw new Error('OAuth Client ID is not configured. Complete the previous wizard steps first.')
  }
  const clientSecret = await mcpCredentials.readCredential(mcpId, clientSecretKey)

  const port = await getFreePort()
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const { verifier, challenge } = buildPkce()
  const state = crypto.randomBytes(16).toString('hex')

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  })
  const authUrl = `${GOOGLE_AUTH_URL}?${authParams.toString()}`

  return new Promise<void>((resolve, reject) => {
    let settled = false
    let server: http.Server | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    function cleanup() {
      if (timeoutId) clearTimeout(timeoutId)
      server?.close()
      pendingFlows.delete(mcpId)
    }

    function cancel() {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error('OAuth flow cancelled'))
    }

    pendingFlows.set(mcpId, { cancel })

    server = http.createServer((req, res) => {
      if (!req.url?.startsWith('/callback')) {
        res.writeHead(404)
        res.end()
        return
      }

      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error || !code || returnedState !== state) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<html><body><h2>Authorization failed. You can close this tab and return to Trayline.</h2></body></html>')
        if (!settled) {
          settled = true
          cleanup()
          reject(new Error(error ?? 'OAuth failed: missing code or state mismatch'))
        }
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<html><body><h2>Authorization successful! You can close this tab and return to Trayline.</h2></body></html>')

      void (async () => {
        try {
          const body: Record<string, string> = {
            client_id: clientId!,
            code,
            code_verifier: verifier,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
          }
          if (clientSecret) body.client_secret = clientSecret

          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(body).toString(),
          })

          if (!tokenRes.ok) {
            const errText = await tokenRes.text().catch(() => tokenRes.status.toString())
            throw new Error(`Token exchange failed (${tokenRes.status}): ${errText}`)
          }

          const tokens = await tokenRes.json() as Record<string, unknown>
          // Store the full token payload as JSON so it can be refreshed later.
          await mcpCredentials.storeCredential(mcpId, credId, JSON.stringify(tokens))

          if (!settled) {
            settled = true
            cleanup()
            resolve()
          }
        } catch (e) {
          if (!settled) {
            settled = true
            cleanup()
            reject(e)
          }
        }
      })()
    })

    server.listen(port, '127.0.0.1', () => {
      void shell.openExternal(authUrl)
    })

    // 5-minute timeout.
    timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error('OAuth flow timed out. Please try again.'))
      }
    }, 5 * 60 * 1000)
  })
}

export function cancelOAuth(mcpId: string): void {
  pendingFlows.get(mcpId)?.cancel()
}
