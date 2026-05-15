import { spawn } from 'child_process'
import { mcpCredentials } from './mcp-credentials'
import { mcpRegistry } from './mcp-registry'

const INIT_TIMEOUT_MS = 15_000

const INIT_MSG =
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'trayline-health-check', version: '1.0.0' },
    },
  }) + '\n'

export async function testConnection(mcpId: string): Promise<{ ok: boolean; error?: string }> {
  const installed = await mcpRegistry.listInstalled()
  const row = installed.find((r) => r.manifest.id === mcpId)
  if (!row) return { ok: false, error: 'MCP is not installed.' }

  const { manifest } = row
  const { credentials_schema, command_template } = manifest

  // Read all credentials from the OS keychain.
  const credValues: Record<string, string> = {}
  for (const cred of credentials_schema) {
    const val = await mcpCredentials.readCredential(mcpId, cred.id)
    if (val) credValues[cred.id] = val
  }

  // Interpolate {credId} placeholders in the command template.
  let cmd = command_template
  for (const [key, val] of Object.entries(credValues)) {
    cmd = cmd.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
  }

  // Remaining credentials (not interpolated) become environment variables.
  const envVars: Record<string, string> = {}
  for (const [key, val] of Object.entries(credValues)) {
    if (!command_template.includes(`{${key}}`)) {
      envVars[key] = val
    }
  }

  const argv = cmd.trim().split(/\s+/).filter(Boolean)
  if (argv.length === 0) return { ok: false, error: 'MCP has an empty command template.' }

  const [executable, ...args] = argv

  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    let settled = false
    let stdoutBuf = ''

    // Use shell:true so npx.cmd (Windows) and other wrappers resolve correctly.
    const proc = spawn(executable, args, {
      env: { ...process.env, ...envVars },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })

    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill()
      resolve({ ok: false, error: 'MCP process did not respond within the health-check timeout.' })
    }, INIT_TIMEOUT_MS)

    proc.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ ok: false, error: `Failed to start MCP process: ${err.message}` })
    })

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      // Scan for a complete JSON-RPC initialize response on any line.
      for (const line of stdoutBuf.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const msg = JSON.parse(trimmed) as Record<string, unknown>
          if (msg.jsonrpc === '2.0' && msg.id === 1 && 'result' in msg) {
            if (settled) return
            settled = true
            clearTimeout(timeout)
            proc.kill()
            resolve({ ok: true })
            return
          }
        } catch {
          // not JSON, keep buffering
        }
      }
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({
        ok: false,
        error: `MCP process exited (code ${code ?? 'unknown'}) before responding to health check.`,
      })
    })

    proc.stdin?.write(INIT_MSG)
  })
}
