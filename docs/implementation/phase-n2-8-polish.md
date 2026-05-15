# Phase N2.8 — Import/Export & Polish

**Estimate:** 4 days

---

## Goals

Extend import/export for MCPs, and fill in remaining empty states and onboarding touches.

---

## Tasks

- [x] **Export `manifest.json` extended** with MCP block:
  - Scans all worker `step.json` files for `mcps` field; writes collected IDs to `manifest.mcps`
  - Credentials and `state/` folder contents **never** exported
- [x] **Import dialog** groups missing dependencies by type:
  - `ImportSuccess` extended with `missingMcps: string[]`
  - `resolveMissingMcps` checks which MCPs from manifest aren't installed
  - Dialog shows Skills and MCPs in labelled sections; installs both via their respective APIs
  - Dialog triggers on `missingMcps.length > 0` as well as `missingSkills.length > 0`
- [ ] **Security confirmation UI for From URL (MCPs):** Deferred — URL install remains "coming soon" stub. From URL requires code execution security UX that is out of scope for this sprint.
- [x] **Empty states** for MCPs screen — already in place: "No MCPs installed. Click Add MCP to browse the catalog."
- [x] **Onboarding tour update** — Top bar step and You're ready step now mention MCPs and point to the MCPs screen
- [x] Audit log MCP events all fire correctly in all flows (mcp_installed, mcp_uninstalled, mcp_configured, mcp_credentials_reset, mcp_health_check_failed, run_aborted_mcp_not_ready)

---

## Acceptance Criteria

- Exporting a project that uses a GitHub MCP produces a `manifest.json` with `mcps: ["github"]`
- Importing that project on a machine without GitHub installed triggers install via the dependency dialog
- Import dialog correctly labels Skills and MCPs sections when both are missing
- Onboarding tour mentions MCPs as a key capability
