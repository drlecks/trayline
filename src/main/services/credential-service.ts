import { join } from 'path'
import fs from 'fs/promises'
import keytar from 'keytar'
import { fsService, Paths } from './fs-service'
import type { Credential, CredentialSummary, HttpCredential, ImapCredential, SmtpCredential } from '../../shared/types'

function keytarService(credentialId: string): string {
  return `trayline-credential-${credentialId}`
}

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true } catch { return false }
}

async function list(): Promise<Credential[]> {
  if (!(await pathExists(Paths.credentials))) return []
  const entries = await fs.readdir(Paths.credentials, { withFileTypes: true })
  const out: Credential[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    try {
      const c = await fsService.readJson<Credential>(join(Paths.credentials, e.name, 'credential.json'))
      out.push(c)
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[credential-service] skipping malformed credential: ${e.name}`)
    }
  }
  return out
}

async function get(id: string): Promise<Credential | null> {
  const p = join(Paths.credentials, id, 'credential.json')
  if (!(await pathExists(p))) return null
  try { return await fsService.readJson<Credential>(p) } catch { return null }
}

async function save(credential: Credential): Promise<void> {
  const dir = join(Paths.credentials, credential.id)
  await fs.mkdir(dir, { recursive: true })
  await fsService.writeJsonAtomic(join(dir, 'credential.json'), credential)
}

async function deleteCredential(id: string): Promise<void> {
  const dir = join(Paths.credentials, id)
  if (await pathExists(dir)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  // Remove all keytar entries for this credential
  try {
    const service = keytarService(id)
    const creds = await keytar.findCredentials(service)
    for (const c of creds) {
      await keytar.deletePassword(service, c.account)
    }
  } catch { /* non-fatal */ }
}

async function saveSecret(credentialId: string, account: string, value: string): Promise<void> {
  await keytar.setPassword(keytarService(credentialId), account, value)
}

/** Resolve `{{secret:key_name}}` header values from keytar for HTTP credentials. */
async function resolveSecrets(credential: HttpCredential): Promise<HttpCredential> {
  const resolvedHeaders = await Promise.all(
    credential.headers.map(async (h) => {
      const match = h.value.match(/^\{\{secret:(.+)\}\}$/)
      if (!match) return h
      const key = match[1]
      const secret = await keytar.getPassword(keytarService(credential.id), key)
      if (secret === null) throw new Error(`Secret not set for credential "${credential.name}": ${key}`)
      return { name: h.name, value: secret }
    }),
  )
  return { ...credential, headers: resolvedHeaders }
}

/** Get the keytar password (account='password') for IMAP/SMTP credentials. */
async function getPassword(credentialId: string): Promise<string> {
  const password = await keytar.getPassword(keytarService(credentialId), 'password')
  if (password === null) throw new Error(`Password not set for credential: ${credentialId}`)
  return password
}

async function testConnection(credentialId: string): Promise<{ ok: boolean; error?: string }> {
  const credential = await get(credentialId)
  if (!credential) return { ok: false, error: 'Credential not found' }

  try {
    if (credential.type === 'http') {
      const { testHttpCredential } = await import('./http-channel')
      return await testHttpCredential(credential as HttpCredential)
    } else if (credential.type === 'imap') {
      const { testImapCredential } = await import('./imap-channel')
      return await testImapCredential(credential as ImapCredential)
    } else if (credential.type === 'smtp') {
      const { testSmtpCredential } = await import('./smtp-channel')
      return await testSmtpCredential(credential as SmtpCredential)
    }
    return { ok: false, error: `Unknown credential type: ${(credential as Credential).type}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function toSummary(c: Credential): CredentialSummary {
  return { id: c.id, type: c.type, name: c.name }
}

export const credentialService = {
  list,
  get,
  save,
  delete: deleteCredential,
  saveSecret,
  resolveSecrets,
  getPassword,
  testConnection,
  toSummary,
}
