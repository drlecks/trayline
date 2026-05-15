# Phase N2.5 — Worker Engine Integration (MCPs)

**Estimate:** 1 week  
**High risk:** Clean integration of MCP lifecycle into the AI Terminal Adapter without leaking MCP details into the worker engine.

---

## Goals

MCPs participate in worker runs. Workers with unconfigured MCPs are blocked before execution starts.

> **Note — Source step MCP gap:** Source steps (`source-runner.ts`) currently hard-code `mcps: []` and `SourceStepConfig` has no `mcps` field. This means a source step cannot poll an external API (e.g. Instagram comments) via an MCP. The workaround is OS environment variables, but the proper fix is to extend this phase (or add a follow-on task) to support MCP injection in source runs using the same pre-flight + credential-injection path as workers.

---

## Tasks

- [ ] Add `mcps: string[]` field to worker `step.json` schema
- [ ] **Skills, MCPs & Context tab** in worker detail — three-block layout:
  - Skills checklist (existing)
  - MCPs checklist with status badge per MCP and inline **Configure ›** button if not Ready
  - Context packs checklist (existing)
- [ ] **Rail warning indicator** — workers with MCPs in non-Ready state show a small amber triangle on their rail card with tooltip *"[MCP name] needs setup"*
- [ ] **Pre-flight check in AI Terminal Adapter `spawn()`:**
  1. Resolve each MCP id from `~/Documents/Trayline/mcps/`
  2. If any MCP is not installed or not in Ready state → **abort before entering Running state**
  3. Log `run_aborted_mcp_not_ready` audit event
  4. UI shows which MCP is blocking (not a generic error)
- [ ] **Credential injection** — credentials read from keychain and injected as environment variables or passed via stdin as declared by each MCP's `mcp.json`
- [ ] **Claude Code adapter extension** — translate `mcps: MCPDefinition[]` in `spawn()` opts into the correct MCP config format that Claude Code CLI expects (flag or config file)
- [ ] MCP processes launched as subprocesses of the agent (not of Trayline), following standard MCP model
- [ ] MCP processes terminated when the agent exits
- [ ] **`meta.json` in run folder** records active MCPs: `"mcps_active": ["gmail", "google-calendar"]`
- [ ] Run summary (Layer 2) shows "MCPs used: Gmail, Calendar"
- [ ] **Mock adapter updated** — simulates MCPs without launching real processes; scriptable responses for testing

---

## Acceptance Criteria

- A worker with Gmail MCP enabled and configured successfully passes Gmail tools to the Claude Code adapter
- A worker with an unconfigured MCP does not enter Running state; the UI shows which MCP is blocking
- `meta.json` correctly lists active MCPs after a run
- Mock adapter can simulate MCP presence for integration tests
