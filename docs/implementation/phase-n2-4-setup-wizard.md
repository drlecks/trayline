# Phase N2.4 — Setup Wizard

**Estimate:** 1 week  
**High risk:** OAuth in Electron has OS-specific quirks (deep-link handling, ephemeral local server, browser open)

---

## Goals

A generic, reusable setup wizard that any MCP can drive through its `setup_steps` declaration.

---

## Tasks

- [ ] **Generic wizard component** — linear next/back/cancel modal with progress bar; reads `setup_steps` from `mcp.json`
- [ ] **Step type: `info`** — text display with optional external links
- [ ] **Step type: `text_field`** — non-secret input (e.g. workspace URL), saved to `mcps/<id>/state/`
- [ ] **Step type: `api_key`** — secret text input (masked), saved to OS keychain via keytar
- [ ] **Step type: `select`** — dropdown of options (e.g. region)
- [ ] **Step type: `oauth`**:
  - Spin up an ephemeral local HTTP server on a random port to capture the OAuth callback
  - Open the OS browser at the provider's authorization URL (with correct scopes, state, PKCE)
  - Wait for callback, exchange code for tokens
  - Store tokens in OS keychain under `credential_id`
  - Support at least: `provider: "google"` (OAuth 2.0 with PKCE) and generic OAuth 2.0 with PKCE
  - UI shows *"Waiting for you to authorize in your browser..."* with a **Cancel** button
  - Handle timeout (after 5 minutes, cancel and show error)
- [ ] **Step type: `test_connection`**:
  - Spawn the MCP process in dry-run/health-check mode
  - Ping it with a standard test request
  - Show result: success or error message
  - Allow user to go back and re-enter credentials if it fails
- [ ] Aborting the wizard at any step: nothing is persisted mid-wizard — MCP stays in its previous state
- [ ] Auto-chain wizard after install from catalog (if the MCP has `setup_steps`)
- [ ] **Reset credentials** in the MCP detail panel re-runs the wizard from the start

---

## Acceptance Criteria

- Completing the Gmail wizard (info → oauth → test_connection) results in MCP status changing to ✓ Ready
- OAuth token is stored in OS keychain and not present in any file
- Cancelling mid-wizard leaves the MCP in *Setup needed*
- `test_connection` failure lets the user go back and fix credentials
- Works on macOS, Windows, and Linux (with libsecret)
