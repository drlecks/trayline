# Phase N8 — Remove Skills & MCPs

**Estimate:** 2–3 days

**Depends on:** all prior phases (this is a subtraction pass)

---

## Goals

Skills and MCPs were designed for an agentic Claude Code world: skills inject execution instructions, MCPs expose external tool APIs. Neither concept works with local inference — a text-completion model has no execution layer, so skills that run commands silently fail and MCPs are already hard-blocked.

Rather than maintaining two parallel realities, this phase removes both systems entirely. What replaces them:

- **Context packs** (already exist) — per-project markdown files injected as plain text into prompts. These are what skills always should have been: readable instructions with no pretence of execution.
- **Credentials + Outlets** (Phase N9) — the proper I/O layer, as dedicated step types and a global credential store.

**What stays untouched:** context packs, the adapter layer, worker `process.md`, the workflow author, `trayline-author` prompt (moved to a plain resource file).

---

## Scope summary

| Area | Action |
|---|---|
| `skill-service.ts` + test | Delete |
| `skill-validator.ts` + test | Delete |
| `system-skills-service.ts` | Delete — author prompt becomes `resources/author-prompt.md` |
| `mcp-registry.ts` + test | Delete |
| `mcp-credentials.ts` | Delete |
| `mcp-connection-test.ts` | Delete |
| `security-audit-service.ts` | Delete (only used for skill import scanning) |
| `SkillsScreen.tsx` | Delete |
| `McpsScreen.tsx` | Delete |
| `McpSetupWizard.tsx` | Delete |
| `ImportMissingSkillsDialog.tsx` | Delete |
| `ImportSecurityAuditDialog.tsx` | Delete |
| `SpawnOptions.skills` + `SpawnOptions.mcps` | Remove fields |
| `supportsMcps` on adapter | Remove field |
| Worker step `step.json` `skills` / `mcps` fields | Remove |
| Source step `step.json` `mcps` field | Remove |
| `unconfiguredMcps` from `ProjectCreateSuccess` | Remove |
| IPC channels `skills:*` and `mcp:*` | Remove |
| Skills / MCPs nav entries in TopBar | Remove |
| Worker detail "Skills, MCPs & Context" tab | Rename to "Context", strip skill + MCP blocks |
| Workflow author post-gen MCP warning banner | Remove |
| Settings MCP warning on adapter switch | Remove |
| Export manifest `skills` + `mcps` fields | Remove |
| Import skills/MCPs resolution flow | Remove |
| All non-implementation docs | Review and update — see task 18 |

---

## Tasks

### 1. Main-process service cleanup

- [x] Delete `src/main/services/skill-service.ts` and `skill-service.test.ts`
- [x] Delete `src/main/services/skill-validator.ts` and `skill-validator.test.ts`
- [x] Delete `src/main/services/system-skills-service.ts`
- [x] Delete `src/main/services/mcp-registry.ts` and `mcp-registry.test.ts`
- [x] Delete `src/main/services/mcp-credentials.ts`
- [x] Delete `src/main/services/mcp-connection-test.ts`
- [x] Delete `src/main/services/security-audit-service.ts`

### 2. Author service — inline the system prompt

- [x] Create `resources/author-prompt.md` — author prompt as a plain resource file
- [x] In `author-service.ts`, read directly from `resources/author-prompt.md` (via `app.isPackaged` path resolution)
- [x] Remove the `SkillDefinition` import; pass the prompt body as plain text

### 3. Scaffold service cleanup

- [x] Remove `systemSkillsService` import and call from `scaffold-service.ts`
- [x] Remove `skills` and `mcps` fields from step JSON written by `scaffoldStep()`
- [x] Remove `unconfiguredMcps` tracking and return value
- [x] Remove `Paths.skills` and `Paths.systemSkills` from `fs-service.ts`
- [x] Move templates to `resources/templates/`; update `scaffold-service.ts` path resolution

### 4. Adapter interface — remove skills and MCPs from SpawnOptions

- [x] Remove `SkillDefinition`, `MCPDefinition`, `skills`, `mcps` from `adapter.ts`
- [x] Remove `supportsMcps` from `AITerminalAdapter`
- [x] Remove all MCP handling from `claude-code.ts` `spawn()`
- [x] Remove `supportsMcps: false` from `local-llm.ts`

### 5. Worker runner cleanup

- [x] Remove `resolveSkill()`, `resolveMcps()`, skill-resolution loop, and MCP pre-flight from `worker-runner.ts`
- [x] Update `worker-runner.test.ts` — remove MCP pre-flight test cases

### 6. Source runner cleanup

- [x] Remove `mcps?: string[]` and MCP pre-flight from `source-runner.ts`

### 7. Shared types cleanup

- [x] Remove all skill/MCP types from `src/shared/types.ts`
- [x] Remove `unconfiguredMcps` from `ProjectCreateSuccess`
- [x] Remove `skills`/`mcps` fields from `WorkerStepConfig` and `SourceStepConfig`
- [x] Simplify `ExportManifest` to `{ trayline_version, exported_at }`
- [x] Remove `mcps_active` from `WorkerRunMeta` in `src/shared/worker-run.ts`
- [x] Remove `skills`/`mcps` from `PlanWorkerStep` in `src/shared/workflow-plan.ts`

### 8. IPC layer cleanup

- [x] Remove `skills:*` and `mcp:*` channels from `src/shared/ipc-channels.ts`
- [x] Remove all `skills:*` and `mcp:*` handlers from `src/main/ipc/handlers.ts`
- [x] Remove `skills` and `mcp` namespaces from `src/preload/index.ts`

### 9. Renderer — delete screens and dialogs

- [x] Delete `src/renderer/components/skills/SkillsScreen.tsx`
- [x] Delete `src/renderer/components/mcps/McpsScreen.tsx`
- [x] Delete `src/renderer/components/mcps/McpSetupWizard.tsx`
- [x] Delete `src/renderer/components/projects/ImportMissingSkillsDialog.tsx`
- [x] Delete `src/renderer/components/projects/ImportSecurityAuditDialog.tsx`

### 10. Renderer — TopBar navigation

- [x] Remove Skills and MCPs nav entries from `TopBar.tsx`

### 11. Renderer — Worker detail panel

- [x] Rename "Skills, MCPs & Context" tab to "Context"
- [x] Remove Skills and MCPs checklist blocks
- [x] Keep only Context Packs checklist

### 12. Renderer — Source detail panel

- [x] Remove MCPs checklist block from `SourceDetailPanel.tsx`

### 13. Renderer — Workflow author screen

- [x] Remove `unconfiguredMcps` from `PostGenBanner` and simplify post-gen body

### 14. Renderer — Settings screen

- [x] Remove `localLlmMcpWarning` state and amber callout

### 15. Renderer — remaining references

- [x] `OnboardingTour.tsx` — updated tour steps
- [x] `WelcomeSplash.tsx` — removed skills/MCPs references
- [x] `CommandPalette.tsx` — removed `nav:skills` command
- [x] `ExportProjectDialog.tsx` — updated description
- [x] `ProjectListScreen.tsx` — removed missing-skills flow
- [x] `ProjectScreen.tsx` — removed screen routing for `'skills'` and `'mcps'`
- [x] `project-store.ts` — removed skills/MCPs state

### 16. App data and resources cleanup

- [x] Remove `app-data/mcps-catalog.json` from bundled resources
- [x] Remove `skills/_system/` folder from bundled resources
- [x] Templates moved to `resources/templates/`
- [x] Electron-builder config cleaned of skills/mcps paths

### 17. Tests

- [x] All 134 tests pass with zero failures
- [x] Removed MCP pre-flight test cases from `worker-runner.test.ts`
- [x] Updated `scaffold-service.test.ts`, `registry.test.ts`, `local-llm.test.ts`

### 18. Documentation — full review of all non-implementation docs

- [x] **`docs/app-description.md`** — updated vocabulary, removed Skill/MCP/Setup Wizard/Credential Set
- [x] **`docs/data-model.md`** — removed skills/ and mcps/ folders, Skill/MCP schemas, updated Worker and Source step.json examples, removed MCP audit events
- [x] **`docs/design-principles.md`** — removed skills/MCPs from top bar and iconography
- [x] **`docs/features.md`** — removed 7.11 (Skill Finder), updated 7.12, 7.13, 7.14 (removed system skills), 7.3 (renamed tab), 7.16 (removed MCPs), 7.18 (removed MCPs badge)
- [x] **`docs/tech-stack.md`** — updated keytar description, removed skills/MCPs from adapter interface, updated local-llm comment
- [x] **`docs/user-flows.md`** — removed 6.8 and 6.11, updated 6.1a, 6.2, 6.9
- [x] **`docs/skills-and-mcps.md`** — deleted
- [x] **`docs/release.md`** — no changes needed (no skills/MCPs references)

---

## Acceptance criteria

- `npm run typecheck` passes with zero errors
- `npm test` passes — no tests reference removed services
- Workflow author generates a project with no `skills` or `mcps` keys in any step.json file
- Worker detail panel shows only a "Context" tab (no skills list, no MCPs list)
- TopBar has no Skills or MCPs nav entries
- Exporting a project produces a manifest with no `skills` or `mcps` keys
- Importing a project does not prompt about missing skills or MCPs
- `resources/author-prompt.md` exists and the workflow author still generates valid projects
- `app-data/mcps-catalog.json` and `skills/` do not exist in the packaged app
- No doc outside `docs/implementation/` mentions skills or MCPs as a current feature
