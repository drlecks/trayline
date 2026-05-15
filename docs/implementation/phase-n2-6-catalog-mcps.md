# Phase N2.6 — Initial Catalog MCPs

**Estimate:** 1.5 weeks (parallelizable across MCPs)

---

## Goals

Populate the curated MCP catalog and validate the full end-to-end execution path for no-credential MCPs.

> **Scope adjustment:** Gmail and Google Calendar (OAuth) are deferred. OAuth in Electron requires a redirect-URI flow and a registered Google Cloud project — out of scope for this sprint. The priority MCPs are Filesystem and Web Browse (both no-credential), which validate the complete install → configure → execute path without external service accounts. All credential-based MCPs (GitHub, Slack, Notion, Brave Search, Google Drive) are defined in the catalog so they appear in the UI, but their end-to-end execution is completed in a later phase.

---

## Priority MCPs (end-to-end validation)

| MCP | Credential type | Purpose |
|---|---|---|
| **Filesystem** | Directory path (text_field, interpolated into command) | Validates install → wizard → execution path |
| **Web Browse** | None | Validates no-credential process spawn end-to-end |
| ~~Gmail~~ | ~~OAuth (Google)~~ | Deferred — OAuth not in scope |
| ~~Google Calendar~~ | ~~OAuth (shared with Gmail)~~ | Deferred — OAuth not in scope |

---

## Tasks

### Filesystem

- [x] Definition in `mcps-catalog.json`
- [x] Installation functional — `mcp-registry.install()` writes `mcp.json` + `status.json`; `npx -y` lazy-fetches on first use
- [x] Setup wizard wired — `allowed_dirs` text_field collected and interpolated into `command_template` via `buildMcpServersConfig`
- [x] Execution end-to-end — credential injection resolves `{allowed_dirs}` into `args`; passed to Claude Code via `--mcp-config`
- [x] Error handling — pre-flight aborts with `run_aborted_mcp_not_ready` if not configured; runtime failures surface as failed runs in error tray
- [x] `mcp.json` zod-valid — `validateMcpManifest` called on install

### Web Browse

- [x] Definition in `mcps-catalog.json` (`@playwright/mcp@latest`, no credentials)
- [x] Installation functional — no wizard step; auto-marked `configured: true` on install (empty credentials_schema)
- [x] Setup wizard wired — no steps; wizard does not open for no-credential MCPs
- [x] Execution end-to-end — same adapter path as Filesystem; `buildMcpServersConfig` emits `npx -y @playwright/mcp@latest` with no env vars
- [x] Error handling — if Playwright browser download fails, Claude Code reports the error and the run fails to error tray with the message
- [x] `mcp.json` zod-valid

---

## Remaining catalog MCPs (defined, not fully implemented)

Appear in the catalog UI; install and execution validated in a later phase.

- [x] GitHub — defined with PAT credential
- [x] Slack — defined with bot token + team ID
- [x] Notion — defined with integration token
- [x] Fetch — defined, no credentials
- [x] Memory — defined, no credentials

---

## Acceptance Criteria

- Filesystem MCP can be installed, configured (allowed_dirs), and successfully used in a worker run
- Web Browse MCP installs with no setup step and works end-to-end in a worker run (first use downloads Playwright browser)
- All remaining MCPs appear in the catalog UI as installable
- Gmail and Google Calendar are not in the catalog (deferred until OAuth is implemented)
