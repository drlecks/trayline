# Phase N2.4 — Setup Wizard

**Estimate:** 1 week

---

## Goals

A generic, reusable setup wizard that any MCP can drive through three fields in its `mcp.json`:
`instructions` (plain text intro), `credentials_schema` (list of required credentials), and `has_test` (whether to run a connection test at the end).

No OAuth. All credentials are simple key/value pairs (API keys, tokens, usernames) stored in the OS keychain via keytar.

---

## Tasks

- [x] **Generic wizard component** — linear next/back/cancel modal with progress bar
- [x] **Dynamic step generation** — wizard builds `InternalStep[]` at runtime from `manifest.instructions`, `manifest.credentials_schema`, and `manifest.has_test`; no `setup_steps` array in `mcp.json`
- [x] **Step type: `info`** — plain text display from `manifest.instructions`
- [x] **Step type: `credential`** — one input per `credentials_schema` entry; masked for `kind: 'api_key'`, plain for `kind: 'text_field'`
- [x] **Step type: `test_connection`** — spawns the MCP process, sends JSON-RPC `initialize`, waits up to 15 s
- [x] Credentials held in memory during wizard; committed to OS keychain immediately before test step (or on Finish if no test)
- [x] Aborting the wizard at any step: calls `mcp:delete-credentials` to clean up partial keychain state
- [x] Auto-chain wizard after install from catalog when `credentials_schema.length > 0`
- [x] **Reset credentials** in the MCP detail panel re-runs the wizard from the start
- [x] `mcp-connection-test.ts` — `testConnection(mcpId)`: reads manifest + reads all credentials from keychain, interpolates `{credId}` placeholders in `command_template`, remaining credentials become env vars, spawns with `shell: true`

---

## Acceptance Criteria

- Completing the GitHub wizard (instructions → token input → test_connection) results in MCP status changing to ✓ Ready
- Completing the Filesystem wizard (instructions → folder path input) results in ✓ Ready without a test step
- All credentials stored exclusively in OS keychain — never present in any file
- Cancelling mid-wizard leaves the MCP in *Setup needed*
- `test_connection` failure shows an error and lets the user retry
- Works on macOS, Windows, and Linux (with libsecret)

---

## Implementation Notes

- `McpSetupWizard.tsx` builds `InternalStep[]` from the manifest — no stored step declarations
- `mcp-credentials.ts` — `deleteAllForMcp(mcpId)` uses `keytar.findCredentials` to purge all credentials for an MCP without needing the schema
- `mcp-connection-test.ts` — spawns MCP with `shell: true`, sends JSON-RPC `initialize`, 15 s timeout
- Catalog updated to schema v2: removed `setup_steps`, added `instructions` + `has_test`; removed Google Drive and Google Calendar; Gmail uses SMTP + App Password
