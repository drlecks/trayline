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

- [ ] Delete `src/main/services/skill-service.ts` and `skill-service.test.ts`
- [ ] Delete `src/main/services/skill-validator.ts` and `skill-validator.test.ts`
- [ ] Delete `src/main/services/system-skills-service.ts`
- [ ] Delete `src/main/services/mcp-registry.ts` and `mcp-registry.test.ts`
- [ ] Delete `src/main/services/mcp-credentials.ts`
- [ ] Delete `src/main/services/mcp-connection-test.ts`
- [ ] Delete `src/main/services/security-audit-service.ts`

### 2. Author service — inline the system prompt

Currently `author-service.ts` loads `trayline-author/skill.md` from the system skills folder. Replace this with a plain resource file:

- [ ] Create `resources/author-prompt.md` — copy the content of `skills/_system/trayline-author/skill.md` verbatim
- [ ] In `author-service.ts`, replace `loadSystemSkill('trayline-author')` with a direct `fs.readFile` on `resources/author-prompt.md` (resolve via `app.getAppPath()` in production, `path.join(__dirname, '../../resources/...')` in dev)
- [ ] Remove the `SkillDefinition` import; pass the prompt body as plain text in the spawn call
- [ ] Verify the workflow author still generates a project end-to-end after this change

### 3. Scaffold service cleanup

- [ ] Remove `import { systemSkillsService }` and the `await systemSkillsService.ensureInstalled()` call from `scaffold-service.ts` — templates are already read directly from `resources/`
- [ ] Remove `skills` and `mcps` fields from the step JSON written by `scaffoldStep()`
- [ ] Remove `unconfiguredMcps` tracking and return value — `ProjectCreateSuccess.unconfiguredMcps` becomes `[]` always, then remove the field in task 7
- [ ] Remove `Paths.skills` and `Paths.systemSkills` constants from `fs-service.ts` if nothing else references them

### 4. Adapter interface — remove skills and MCPs from SpawnOptions

- [ ] In `src/main/ai-terminals/adapter.ts`:
  - Remove `SkillDefinition` interface
  - Remove `MCPDefinition` interface
  - Remove `skills: SkillDefinition[]` from `SpawnOptions`
  - Remove `mcps: MCPDefinition[]` from `SpawnOptions`
  - Remove `supportsMcps?: boolean` from `AITerminalAdapter`
- [ ] In `claude-code.ts` `spawn()`: remove all MCP handling — the `mcps` array construction, env-var injection, `--mcp-config` flag
- [ ] In `local-llm.ts`: remove `supportsMcps: false` field; `spawn()` already ignores both
- [ ] In `mock.ts`: remove any skills/mcps handling

### 5. Worker runner cleanup

- [ ] In `src/main/services/worker-runner.ts`:
  - Delete `resolveSkill()` function
  - Delete `resolveMcps()` function
  - Remove the skill-resolution loop from `runInner()`
  - Remove the MCP pre-flight check block added in N7
  - Remove `import { mcpRegistry }`, `import { mcpCredentials }`, `import type { MCPDefinition }`
- [ ] Update `worker-runner.test.ts` — remove MCP pre-flight test cases; keep all others

### 6. Source runner cleanup

- [ ] In `src/main/services/source-runner.ts`:
  - Remove `mcps?: string[]` from the runtime config read
  - Remove the MCP pre-flight check block
  - Remove `import { mcpRegistry }`, `import { mcpCredentials }`

### 7. Shared types cleanup

- [ ] In `src/shared/types.ts`:
  - Remove `SkillCatalogEntry`, `SkillInstallState`, `InstalledSkill`, and all other skill-specific types
  - Remove `McpCatalogEntry`, `McpInstallState`, `McpStatus`, `McpCredentialsSchema`, and all MCP-specific types
  - Remove `unconfiguredMcps: string[]` from `ProjectCreateSuccess`
  - Remove `skills` and `mcps` fields from `WorkerStepConfig`
  - Remove `mcps` from `SourceStepConfig`
  - Remove `skills` and `mcps` from `ExportManifest`
  - Remove `skillsRequired` and any import-related skill/MCP types

### 8. IPC layer cleanup

- [ ] In `src/shared/ipc-channels.ts`: remove the entire `skills` block and the entire `mcp` block
- [ ] In `src/main/ipc/handlers.ts`: remove all `ipcMain.handle('skills:*', ...)` and `ipcMain.handle('mcp:*', ...)` handlers; remove the imports of the deleted services
- [ ] In `src/preload/index.ts`: remove the `skills` namespace and the `mcp` namespace from both the implementation and the `TraylineAPI` type declaration

### 9. Renderer — delete screens and dialogs

- [ ] Delete `src/renderer/components/skills/SkillsScreen.tsx`
- [ ] Delete `src/renderer/components/mcps/McpsScreen.tsx`
- [ ] Delete `src/renderer/components/mcps/McpSetupWizard.tsx`
- [ ] Delete `src/renderer/components/projects/ImportMissingSkillsDialog.tsx`
- [ ] Delete `src/renderer/components/projects/ImportSecurityAuditDialog.tsx`

### 10. Renderer — TopBar navigation

- [ ] In `src/renderer/components/layout/TopBar.tsx`:
  - Remove the **Skills** nav entry
  - Remove the **MCPs** nav entry
  - Remove any `screen === 'skills'` or `screen === 'mcps'` routing

### 11. Renderer — Worker detail panel

- [ ] Rename the **"Skills, MCPs & Context"** tab to **"Context"**
- [ ] Remove the Skills checklist block
- [ ] Remove the MCPs checklist block (including the inline configure button)
- [ ] Keep only the Context Packs checklist
- [ ] Remove the `runTriggerError` MCP-specific "Go to Settings" copy (keep the generic error state for other failures)

### 12. Renderer — Source detail panel

- [ ] Remove the MCPs checklist block
- [ ] Remove the MCP-specific `runTriggerError` copy

### 13. Renderer — Workflow author screen

- [ ] Remove `unconfiguredMcps` from `PostGenBanner` props and rendering
- [ ] Simplify post-gen body: only source vs. no-source branches; no MCP branch

### 14. Renderer — Settings screen

- [ ] Remove the `localLlmMcpWarning` state and the amber callout that fires when switching to local-llm with MCP-using workers

### 15. Renderer — remaining references

- [ ] `OnboardingTour.tsx` — remove any step referencing skills or MCPs
- [ ] `WelcomeSplash.tsx` — remove skills/MCPs references
- [ ] `CommandPalette.tsx` — remove commands that open skills or MCPs screens
- [ ] `ExportProjectDialog.tsx` — remove skills/MCPs from export manifest description
- [ ] `ProjectListScreen.tsx` — remove import flow that resolves missing skills/MCPs
- [ ] `ProjectScreen.tsx` — remove screen routing for `'skills'` and `'mcps'`
- [ ] `project-store.ts` — remove `setUnconfiguredMcps`, `unconfiguredMcps`, and skills/MCPs screen routing

### 16. App data and resources cleanup

- [ ] Remove `app-data/mcps-catalog.json` from bundled resources
- [ ] Remove `app-data/skills-index-cache.json` from bundled resources / first-launch seeding
- [ ] Remove `skills/_system/` folder from bundled resources (after moving the author prompt in task 2)
- [ ] Check electron-builder config — remove any `skills/` or `mcps/` directory from `extraResources` or `files` globs

### 17. Tests

- [ ] Run `npm test` after each major deletion group — fix broken imports before moving on
- [ ] Remove test assertions that cover MCP pre-flight (worker-runner, source-runner)
- [ ] Remove test assertions that cover skill resolution
- [ ] All remaining tests must pass with zero skips

### 18. Documentation — full review of all non-implementation docs

Go through each doc file below. The goal is that after this task, no doc references skills or MCPs as current features. Update language that assumes Claude Code is the only AI option where relevant.

- [ ] **`docs/app-description.md`**
  - Remove `Skill`, `MCP`, `Setup Wizard`, and `Credential Set` from the vocabulary table
  - Add `Context Pack` to vocabulary if not already present
  - Update the Worker definition to remove "skills + a `process.md`" — just "AI instructions in a `process.md`"
  - Update "Why This Will Work" — remove any mention of MCPs or skills

- [ ] **`docs/data-model.md`**
  - Remove the `skills/` and `mcps/` folders from the Global Folder Structure diagram
  - Remove `Skill skill.json` schema section
  - Remove `MCP mcp.json` schema section
  - Remove `skills` and `mcps` fields from Worker `step.json` example
  - Remove `mcps` field from Source `step.json` example
  - Remove `skills` and `mcps` from `ExportManifest` schema
  - Update the `app-data/` listing to remove `skills-index-cache.json`, `mcps-index-cache.json`, `mcps-catalog.json`

- [ ] **`docs/design-principles.md`**
  - Remove any layout rules or color assignments specific to Skills or MCPs screens
  - Verify the TopBar icon list no longer includes Skills or MCPs entries

- [ ] **`docs/features.md`**
  - Remove section 7.11 (Skill Finder) entirely
  - Remove section 7.12 Import/Export sub-points about skills/MCPs
  - In section 7.3 Worker Detail View, rename the "Skills, MCPs & Context" tab to "Context" and rewrite the tab content description (skills checklist and MCPs checklist gone, only context packs)
  - In section 7.18 (Local AI Model from N7), remove the "MCPs screen badge" subsection and the Settings MCP conflict warning
  - Remove any other inline MCPs/skills references throughout

- [ ] **`docs/tech-stack.md`**
  - Remove `keytar` from the backend listing (it was added for MCP credentials; verify nothing else uses it — if the credential store in N9 will use keytar too, keep it but update the description)
  - Remove `SkillDefinition` and `MCPDefinition` from the `SpawnOptions` interface block
  - Remove `supportsMcps` from the `AITerminalAdapter` interface block
  - Update the adapter file listing comment for `local-llm.ts` (remove "no MCP support" note — moot)

- [ ] **`docs/user-flows.md`**
  - Remove section 6.8 (Installing a Skill)
  - Remove section 6.11 (Setting Up an MCP)
  - Update section 6.1a (Workflow Author) — remove the MCP branch from the post-generation banner description
  - Update section 6.5 (A Worker Runs) — remove MCP pre-flight step from the flow
  - Update section 6.14 (AI Setup) — remove "Setup guide" / `AdapterSetupWizard` references for non-local adapters (the wizard was MCP-adjacent; the adapter setup screen simplifies)
  - Remove any "unconfigured MCPs" language throughout

- [ ] **`docs/skills-and-mcps.md`**
  - Delete this file entirely — it describes two systems that no longer exist

- [ ] **`docs/release.md`**
  - Scan for any skills or MCPs references (code-signing, packaging, first-launch seeding) and remove/update

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
