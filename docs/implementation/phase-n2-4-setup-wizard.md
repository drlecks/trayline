# Phase N2.4 — Setup Wizard

**Estimate:** 1 week  
**High risk:** OAuth in Electron has OS-specific quirks (deep-link handling, ephemeral local server, browser open)

---

## Goals

A generic, reusable setup wizard that any MCP can drive through its `setup_steps` declaration.

---

## Tasks

- [x] **Generic wizard component** — linear next/back/cancel modal with progress bar; reads `setup_steps` from `mcp.json`
- [x] **Step type: `info`** — text display with optional external links
- [x] **Step type: `text_field`** — non-secret input (e.g. workspace URL), saved to OS keychain via keytar
- [x] **Step type: `api_key`** — secret text input (masked), saved to OS keychain via keytar
- [x] **Step type: `select`** — dropdown of options (e.g. region)
- [x] **Step type: `oauth`**:
  - Spin up an ephemeral local HTTP server on a random port to capture the OAuth callback
  - Open the OS browser at the provider's authorization URL (with correct scopes, state, PKCE)
  - Wait for callback, exchange code for tokens
  - Store tokens in OS keychain under `credential_id`
  - Support at least: `provider: "google"` (OAuth 2.0 with PKCE) and generic OAuth 2.0 with PKCE
  - UI shows *"Waiting for you to authorize in your browser..."* with a **Cancel** button
  - Handle timeout (after 5 minutes, cancel and show error)
- [x] **Step type: `test_connection`**:
  - Spawn the MCP process in dry-run/health-check mode
  - Ping it with a standard test request
  - Show result: success or error message
  - Allow user to go back and re-enter credentials if it fails
- [x] Aborting the wizard at any step: nothing is persisted mid-wizard — MCP stays in its previous state
- [x] Auto-chain wizard after install from catalog (if the MCP has `setup_steps`)
- [x] **Reset credentials** in the MCP detail panel re-runs the wizard from the start

---

## Acceptance Criteria

- Completing the Gmail wizard (info → oauth → test_connection) results in MCP status changing to ✓ Ready
- OAuth token is stored in OS keychain and not present in any file
- Cancelling mid-wizard leaves the MCP in *Setup needed*
- `test_connection` failure lets the user go back and fix credentials
- Works on macOS, Windows, and Linux (with libsecret)

---

## Implementation Notes

- OAuth flow: `mcp-oauth.ts` — ephemeral HTTP server on random port, PKCE (SHA-256), 5-minute timeout, stores full token JSON in keychain
- Google OAuth MCPs (drive/gmail/calendar) updated in catalog to require user's own `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Desktop app type from Google Cloud Console); `client_id_key` / `client_secret_key` fields on the oauth step tell the handler which keychain entries to read
- Connection test: `mcp-connection-test.ts` — spawns MCP with `shell:true`, sends JSON-RPC `initialize`, waits up to 15 s for a response
- Cancel cleanup: wizard always calls `mcp:delete-credentials` on cancel (no-op if nothing committed)
- Credentials flow: in-memory until the step before `oauth`/`test_connection`, then committed to keychain via `mcp:save-credential`
- `McpSetupStep` type extended with `client_id_key?` and `client_secret_key?` optional fields
