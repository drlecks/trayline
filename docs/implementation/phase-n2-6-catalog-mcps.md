# Phase N2.6 — Initial Catalog MCPs

**Estimate:** 1.5 weeks (parallelizable across MCPs)

---

## Goals

Implement at least four curated catalog MCPs end-to-end to validate all credential types and the full execution path.

---

## Priority MCPs (validate all paths)

| MCP | Credential type | Purpose |
|---|---|---|
| **Filesystem** | None | Validates simplest path — no credentials |
| **Web Browse** | None | Validates real process spawn without credentials |
| **Gmail** | OAuth (Google) | Validates full OAuth wizard flow |
| **Google Calendar** | OAuth (shared with Gmail) | Validates shared credential OAuth (same flow, different scopes) |

---

## Tasks per MCP

For each of the four priority MCPs:

- [ ] Definition in `mcps-catalog.json` (id, name, description, install_method, command_template, credentials_schema, setup_steps)
- [ ] Installation functional (npm/binary download, isolated folder)
- [ ] Setup wizard steps wired (specific to each MCP's credential requirements)
- [ ] Execution works end-to-end from a worker run
- [ ] Error handling when the MCP fails (startup failure, auth error, network error mid-run)
- [ ] `mcp.json` in the MCP's catalog definition is complete and zod-valid

---

## Remaining catalog MCPs (define but don't fully implement in this phase)

These should be defined in `mcps-catalog.json` so they appear in the UI as available, but their install and execution can be completed after beta:

- Google Drive
- GitHub
- Slack
- Notion
- Fetch
- Memory

---

## Acceptance Criteria

- All four priority MCPs can be installed, configured, and successfully used in a worker run
- Filesystem and Web Browse work without any credential setup
- Gmail OAuth flow completes and tokens are stored in the keychain
- Google Calendar reuses the Google OAuth credentials correctly
- Remaining MCPs appear in the catalog UI as installable but are not yet testable end-to-end
