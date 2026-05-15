# Phase N2.2 — MCP Foundations

**Estimate:** 1 week

---

## Goals

Create the data layer and services for the MCP system.

---

## Tasks

- [x] Create `~/Documents/Trayline/mcps/` in the bootstrap (extend Phase 1)
- [x] Seed `app-data/mcps-catalog.json` from bundled app resources on first launch (curated catalog of ~10 MCPs)
- [x] Define zod schema for `mcp.json` (required fields: `id`, `name`, `version`, `description`, `install_method`, `command_template`, `credentials_schema`, `setup_steps`)
- [x] Implement `MCPRegistry` service:
  - List installed MCPs (from `~/Documents/Trayline/mcps/`)
  - List catalog MCPs (from `mcps-catalog.json`)
  - List registry MCPs (from remote JSON, with cache in `mcps-index-cache.json`)
  - Read MCP status from `mcps/<id>/state/status.json`
  - Calculate effective health state (configured + last health check result)
- [x] Integrate `keytar` for OS keychain access:
  - Store credential: `keytar.setPassword('trayline', credentialId, value)`
  - Read credential: `keytar.getPassword('trayline', credentialId)`
  - Delete credential: `keytar.deletePassword('trayline', credentialId)`
  - Document Linux fallback if libsecret is unavailable
- [x] Audit log events for MCPs: `mcp_installed`, `mcp_uninstalled`, `mcp_configured`, `mcp_credentials_reset`, `mcp_health_check_failed`, `run_aborted_mcp_not_ready`

---

## Acceptance Criteria

- `MCPRegistry` correctly lists installed and catalog MCPs
- Credentials stored via keytar are not present in any file on disk
- Audit log correctly records MCP lifecycle events
