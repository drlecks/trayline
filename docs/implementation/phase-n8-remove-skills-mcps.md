# Phase N8 — Remove Skills & MCPs

**Estimate:** 2–3 days

**Depends on:** all prior phases (this is a subtraction pass)

---

## Goals

Skills and MCPs were designed for an agentic Claude Code world: skills inject execution instructions, MCPs expose external tool APIs. Neither concept works with local inference — a text-completion model has no execution layer, so skills that run commands silently fail and MCPs are already hard-blocked.

Rather than maintaining two parallel realities, this phase removes both systems entirely. What replaces them:

- **Context packs** (already exist) — per-project markdown files injected as plain text into prompts. These are what skills always should have been: readable instructions with no pretence of execution.
- **Connectors** (Phase N9) — the proper I/O layer for source fetching and output actions.

**What stays untouched:** context packs, the adapter layer, worker `process.md`, the workflow author, `trayline-author` prompt (moved to a plain resource file).

---

## Scope summary

| Area | Action |
|---|---|
| `skill-service.ts` + test | Delete |
| `skill-validator.ts` + test | Delete |
| `system-skills-service.ts` | Delete — templates and author prompt become plain resources |
| `mcp-registry.ts` + test | Delete |
| `mcp-credentials.ts` | Delete |
| `mcp-connection-test.ts` | Delete |
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
| McpScreen badge in MCPs screen (N7) | Remove (whole screen is gone) |
| Export manifest `skills` + `mcps` fields | Remove |
| Import skills/MCPs resolution flow | Remove |
| `security-audit-service.ts` | Delete (only used for skill import scanning) |
| `trayline-author` prompt | Move content to `resources/author-prompt.md` — author-service reads the file directly |
| Scaffold templates | Stay in `resources/` — scaffold-service already reads them directly |
| All docs that reference skills or MCPs | Update in same commit |

---

## Tasks

### 1. Main-process service cleanup

- [ ] Delete `src/main/services/skill-service.ts` and `skill-service.test.ts`
- [ ] Delete `src/main/services/skill-validator.ts` and `skill-validator.test.ts`
- [ ] Delete `src/main/services/system-skills-service.ts`
- [ ] Delete `src/main/services/mcp-registry.ts` and `mcp-registry.test.ts`
- [ ] Delete `src/main/services/mcp-credentials.ts`
- [ ] Delete `src/main/services/mcp-connection-test.ts`
- [ ] Delete `src/main/services/security-audit-service.ts`

### 2. Author service — inline the system prompt

Currently `author-service.ts` loads `trayline-author/skill.md` from the system skills folder. Replace this with a plain resource file:

- [ ] Create `resources/author-prompt.md` — copy the content of `skills/_system/trayline-author/skill.md` verbatim into it
- [ ] In `author-service.ts`, replace `loadSystemSkill('trayline-author')` with a direct `fs.readFile` on `resources/author-prompt.md` (resolve via `app.getAppPath()` in production, `path.join(__dirname, '../../resources/...')` in dev)
- [ ] Remove the `SkillDefinition` import from author-service; pass the prompt body directly as the process file or inline it as a string in the spawn call
- [ ] Verify the workflow author still generates a project end-to-end

### 3. Scaffold service cleanup

- [ ] Remove `import { systemSkillsService }` and the `await systemSkillsService.ensureInstalled()` call from `scaffold-service.ts` — templates are already read directly from `resources/`
- [ ] Remove `skills` and `mcps` fields from the step JSON written by `scaffoldStep()`
- [ ] Remove `unconfiguredMcps` tracking and return value — `ProjectCreateSuccess.unconfiguredMcps` becomes `[]` always (then remove the field entirely in step 6)
- [ ] Remove the `Paths.skills` and `Paths.systemSkills` constants from `fs-service.ts` if they are no longer referenced by anything else

### 4. Adapter interface — remove skills and MCPs from SpawnOptions

- [ ] In `src/main/ai-terminals/adapter.ts`:
  - Remove `SkillDefinition` interface
  - Remove `MCPDefinition` interface
  - Remove `skills: SkillDefinition[]` from `SpawnOptions`
  - Remove `mcps: MCPDefinition[]` from `SpawnOptions`
  - Remove `supportsMcps?: boolean` from `AITerminalAdapter`
- [ ] Update `claude-code.ts` — remove all MCP handling from `spawn()`: the `mcps` array construction, env-var injection, `--mcp-config` flag
- [ ] Update `local-llm.ts` — remove `supportsMcps: false` field; `spawn()` already ignores skills/mcps
- [ ] Update `mock.ts` — remove any skills/mcps handling

### 5. Worker runner cleanup

- [ ] In `src/main/services/worker-runner.ts`:
  - Delete `resolveSkill()` function
  - Delete `resolveMcps()` function
  - Remove the skill-resolution loop (lines that build `skills: []` for spawn)
  - Remove the MCP pre-flight check block (the `if (mcpIds.length > 0)` block added in N7)
  - Remove `import { mcpRegistry }`, `import { mcpCredentials }`, `import type { MCPDefinition }`
  - Pass `skills: []` temporarily if needed for backward compat, then remove the field entirely once adapter.ts is updated
- [ ] Update worker `runInner` to spawn with no skills/mcps args
- [ ] Update `worker-runner.test.ts` — remove tests that cover MCP pre-flight; keep the rest

### 6. Source runner cleanup

- [ ] In `src/main/services/source-runner.ts`:
  - Remove `mcps?: string[]` from `SourceStepConfig` (or the runtime read of it)
  - Remove the MCP pre-flight check block (`if (mcpIds.length > 0)`)
  - Remove `import { mcpRegistry }`, `import { mcpCredentials }`
  - Spawn the adapter with no mcps

### 7. Shared types cleanup

- [ ] In `src/shared/types.ts`:
  - Remove `SkillCatalogEntry`, `SkillInstallState`, `InstalledSkill` (and any other skill-specific types)
  - Remove `McpCatalogEntry`, `McpInstallState`, `McpStatus`, `McpCredentialsSchema` (and any MCP-specific types)
  - Remove `unconfiguredMcps: string[]` from `ProjectCreateSuccess`
  - Remove `skills` and `mcps` fields from `WorkerStepConfig`
  - Remove `mcps` from `SourceStepConfig`
  - Remove `skills` and `mcps` from the export manifest type (`ExportManifest`)
  - Remove `skillsRequired` from any import-related types

### 8. IPC layer cleanup

- [ ] In `src/shared/ipc-channels.ts`:
  - Remove entire `skills` block
  - Remove entire `mcp` block
- [ ] In `src/main/ipc/handlers.ts`:
  - Remove all `ipcMain.handle('skills:*', ...)` handlers
  - Remove all `ipcMain.handle('mcp:*', ...)` handlers
  - Remove imports of skill-service, skill-validator, mcp-registry, mcp-credentials, mcp-connection-test, security-audit-service
- [ ] In `src/preload/index.ts`:
  - Remove `skills` namespace
  - Remove `mcp` namespace
  - Remove their TypeScript type declarations from the `TraylineAPI` interface

### 9. Renderer — delete screens and dialogs

- [ ] Delete `src/renderer/components/skills/SkillsScreen.tsx`
- [ ] Delete `src/renderer/components/mcps/McpsScreen.tsx`
- [ ] Delete `src/renderer/components/mcps/McpSetupWizard.tsx`
- [ ] Delete `src/renderer/components/projects/ImportMissingSkillsDialog.tsx`
- [ ] Delete `src/renderer/components/projects/ImportSecurityAuditDialog.tsx`

### 10. Renderer — TopBar navigation

- [ ] In `src/renderer/components/layout/TopBar.tsx`:
  - Remove the **Skills** nav entry (icon + click handler)
  - Remove the **MCPs** nav entry (icon + click handler)
  - Remove any `screen === 'skills'` or `screen === 'mcps'` routing

### 11. Renderer — Worker detail panel

- [ ] In `src/renderer/components/project/WorkerDetailPanel.tsx`:
  - Rename the **"Skills, MCPs & Context"** tab to **"Context"**
  - Remove the Skills checklist block
  - Remove the MCPs checklist block (including the inline `⚠ Setup needed` configure button)
  - Keep only the Context Packs checklist
  - Remove any `runTriggerError` logic that references MCPs (the generic error state stays — just remove the "Go to Settings" link copy that mentions MCPs)

### 12. Renderer — Source detail panel

- [ ] In `src/renderer/components/project/SourceDetailPanel.tsx`:
  - Remove the MCPs checklist block
  - Remove the MCP-specific `runTriggerError` copy

### 13. Renderer — Workflow author screen

- [ ] In `src/renderer/components/author/WorkflowAuthorScreen.tsx`:
  - Remove `unconfiguredMcps` from the `PostGenBanner` props and rendering
  - Simplify the post-gen body text: no MCP branch, no source+MCP branch — just source vs. no-source

### 14. Renderer — Settings screen

- [ ] In `src/renderer/components/settings/SettingsScreen.tsx`:
  - Remove the `localLlmMcpWarning` state and the callout that fires when switching to local-llm with MCP workers

### 15. Renderer — remaining references

- [ ] Audit `OnboardingTour.tsx` — remove any step that references skills or MCPs
- [ ] Audit `WelcomeSplash.tsx` — remove skills/MCPs references
- [ ] Audit `CommandPalette.tsx` — remove any commands that open skills or MCPs screens
- [ ] Audit `ExportProjectDialog.tsx` — remove skills/MCPs from export manifest description
- [ ] Audit `ProjectListScreen.tsx` — remove import flow that resolves missing skills/MCPs
- [ ] Audit `ProjectScreen.tsx` — remove screen routing for `'skills'` and `'mcps'`
- [ ] Audit `project-store.ts` — remove `setUnconfiguredMcps`, `unconfiguredMcps`, and skills/MCPs screen routing

### 16. App data and resources cleanup

- [ ] Remove `app-data/mcps-catalog.json` (the curated MCP catalog)
- [ ] Remove `skills/_system/` folder from bundled resources (after moving the author prompt in task 2)
- [ ] Remove the `Paths.skills` and `Paths.systemSkills` paths from `fs-service.ts` if nothing else uses them

### 17. Tests

- [ ] Run `npm test` after each major deletion group — fix any broken imports before moving on
- [ ] Remove test assertions that specifically cover MCP pre-flight (in `worker-runner.test.ts` and `source-runner.test.ts`)
- [ ] Remove test assertions that cover skill resolution
- [ ] All 194 (now N) tests must pass on completion — no skipped tests

### 18. Documentation

- [ ] `docs/tech-stack.md` — remove skills section, remove MCP section, update adapter SpawnOptions description
- [ ] `docs/features.md` — remove section 7.11 (Skill Finder), remove MCP sections from 7.3 Worker Detail View; rename "Skills, MCPs & Context" tab to "Context" everywhere
- [ ] `docs/user-flows.md` — remove 6.8 (Installing a Skill), 6.11 (Setting Up an MCP); update 6.1a Workflow Author (no MCP banner), update 6.5/6.6 (no MCP pre-flight)
- [ ] `docs/skills-and-mcps.md` — delete this file entirely
- [ ] `docs/data-model.md` — remove `skills` and `mcps` fields from step.json schema; remove export manifest skills/mcps
- [ ] `docs/app-description.md` — remove MCP and Skill from vocabulary table; update worker description
- [ ] `docs/design-principles.md` — remove any Skills/MCPs UI rules
- [ ] `docs/implementation/tasks.md` — check off N8 on completion

---

## Acceptance criteria

- `npm run typecheck` passes with zero errors
- `npm test` passes — no tests reference removed services
- Workflow author generates a project with no skills or MCP references in step.json files
- Worker detail panel shows only a "Context" tab (no skills, no MCPs)
- TopBar has no Skills or MCPs nav entries
- Exporting a project produces a zip with no `skills` or `mcps` keys in manifest
- Importing a project does not prompt about missing skills or MCPs
- The local-llm adapter runs a worker end-to-end with no MCP pre-flight code path
- `resources/author-prompt.md` exists and contains the trayline-author prompt
- `app-data/mcps-catalog.json` does not exist in the built app
