import keytar from 'keytar'
import type { McpCredentialSchemaEntry } from '../../shared/types'

// keytar service name used for all Trayline credentials.
// Changing this would orphan existing keychain entries.
const KEYTAR_SERVICE = 'trayline'

function accountKey(mcpId: string, credKey: string): string {
  return `mcp:${mcpId}:${credKey}`
}

async function storeCredential(mcpId: string, credKey: string, value: string): Promise<void> {
  await keytar.setPassword(KEYTAR_SERVICE, accountKey(mcpId, credKey), value)
}

async function readCredential(mcpId: string, credKey: string): Promise<string | null> {
  return keytar.getPassword(KEYTAR_SERVICE, accountKey(mcpId, credKey))
}

async function deleteCredential(mcpId: string, credKey: string): Promise<void> {
  await keytar.deletePassword(KEYTAR_SERVICE, accountKey(mcpId, credKey))
}

/** Delete all keychain entries for an MCP given its credential schema. */
async function deleteAllCredentials(mcpId: string, schema: McpCredentialSchemaEntry[]): Promise<void> {
  for (const cred of schema) {
    await keytar.deletePassword(KEYTAR_SERVICE, accountKey(mcpId, cred.id)).catch(() => {})
  }
}

/** Check whether all required credentials are present in the keychain. */
async function areAllConfigured(mcpId: string, schema: McpCredentialSchemaEntry[]): Promise<boolean> {
  for (const cred of schema) {
    const val = await keytar.getPassword(KEYTAR_SERVICE, accountKey(mcpId, cred.id))
    if (!val) return false
  }
  return true
}

export const mcpCredentials = {
  storeCredential,
  readCredential,
  deleteCredential,
  deleteAllCredentials,
  areAllConfigured,
}
