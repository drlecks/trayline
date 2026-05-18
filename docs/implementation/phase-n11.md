# Phase N11 — Adapter Simplification, Connected AI, & Project UX

**Branch:** `phase/phase-n11`  
**Depends on:** develop (post-N10)

---

## Overview

This phase has eight work areas:

1. **Remove Local LLM adapter** — strip everything: the adapter, download system, UI, and native dependency.
2. **Source & Outlet instructions field** — both steps get a `prompt` field so AI can parse/format data.
3. **Project-level AI permissions** — a permission set that tells the AI adapter which credentials and capabilities it may use.
4. **AI permission-request auto-handling** — capture Claude's permission prompts mid-run and retry automatically (max 3).
5. **Quick AI console** — a lightweight modal for talking to the AI adapter directly.
6. **Default adapter guard** — verify Claude Code is installed at startup; if not, show a clear install modal.
7. **Source cards advance automatically** — confirm and fix the handoff from source `cards/ready/` to the next step.
8. **Project Settings screen** — edit project name and description from the left rail.
9. **Docs refresh** — review and update all files under `docs/` (excluding `docs/implementation/`).

---

## Task List

### N11-A — Remove Local LLM

- [x] **A1** Remove `src/main/ai-terminals/local-llm.ts` and its test `local-llm.test.ts`.
- [x] **A2** Remove `src/main/services/local-model-service.ts` and its test (if any).
- [x] **A3** Remove `src/renderer/components/adapter/ModelDownloadModal.tsx`.
- [x] **A4** Remove `ModelDownloadModal` references from `AdapterSetupScreen.tsx` and `SettingsScreen.tsx`.
- [x] **A5** Remove the `local-llm` entry from `src/main/ai-terminals/registry.ts`.
- [x] **A6** Remove `local-models.json` from `resources/` (if present) and from any bundling config in `vite.config.ts` / `electron-builder` config.
- [x] **A7** Remove `node-llama-cpp` and `@electron/rebuild` from `package.json` and run `npm install` to clean `package-lock.json`.
- [x] **A8** Remove the "Local AI model" section from `SettingsScreen.tsx` (the download/delete UI).
- [x] **A9** Remove the local-llm warning note from `WorkflowAuthorScreen.tsx`.
- [ ] **A10** Update `docs/tech-stack.md` — remove `node-llama-cpp`, `@electron/rebuild`, and the local-llm adapter from all descriptions. Update the adapter list (only Claude Code ships; architecture still supports future adapters).
- [ ] **A11** Update `docs/features.md` — remove section 7.18 "Local AI Model — Download & Management" and section 7.20 "AI Setup Screen (N10)" reference to local-llm being "Recommended". Claude Code is now the sole default adapter.
- [ ] **A12** Update `docs/app-description.md` — remove local-llm from the "Why This Will Work" and vocabulary sections; keep the note that the architecture supports future adapters.
- [ ] **A13** Update `docs/user-flows.md` — remove flow 6.17 "First Launch — Download Local Model".

---

### N11-B — Source & Outlet Instructions Field

Source and Outlet steps gain an optional `prompt` text field in `step.json`. When present, the AI adapter processes the raw fetched/outgoing data using those instructions. When absent, behaviour is unchanged (Source creates cards verbatim; Outlet sends cards verbatim).

**Source with prompt:**  
After the channel fetch, instead of writing `card.data.body` directly, the source runner spawns the AI adapter with the raw response and the `prompt` instructions. The AI returns structured card data. One card is still created per HTTP fetch; IMAP still creates one card per email, but the AI shapes `card.data`.

**Outlet with prompt:**  
Before dispatching via SMTP or HTTP POST, the outlet runner spawns the AI adapter with `card.data` and the `prompt` instructions. The AI returns the formatted body/subject/content that is then sent. Template tokens (`{{card.data.*}}`) still work in the channel config but may be supplemented or replaced by AI-formatted output.

#### Schema changes

**Source `step.json`** — add optional field:
```json
{
  "prompt": "Extract the title, author, and publication date from the fetched HTML. Return JSON with keys: title, author, published_at."
}
```

**Outlet `step.json`** — add optional field:
```json
{
  "prompt": "Format the card data as a professional client-facing email. Keep it under 200 words."
}
```

#### Tasks

- [x] **B1** Add `prompt?: string | null` to `SourceStepConfig` in `src/shared/types.ts`.
- [x] **B2** Add `prompt?: string | null` to `OutletStepConfig` in `src/shared/types.ts`.
- [x] **B3** Update `src/main/services/source-runner.ts`: after fetch, if `step.prompt` is set, call `runAIStep` and use its output as `card.data`; verbatim fallback when absent. AI failures fail the run.
- [x] **B4** Update `src/main/services/outlet-runner.ts`: if `step.prompt` is set, call `runAIStep` with `card.data` before dispatch; AI output replaces `card.data` for token resolution.
- [x] **B5** `SourceDetailPanel.tsx` — Instructions textarea added to Config tab; auto-saves on blur.
- [x] **B6** `OutletDetailPanel.tsx` — Instructions textarea added to Config tab; saved via Save button.
- [x] **B7** Updated `resources/templates/source.step.json` to include `"prompt": null`.
- [x] **B8** Updated `resources/templates/outlet.step.json` to include `"prompt": null`.
- [x] **B9** 4 tests added to `source-runner.test.ts` covering AI output shaping, string wrapping, no-prompt fallback, and AI error failure.
- [x] **B10** Updated `docs/data-model.md` — `prompt` field documented for Source and Outlet schemas.
- [x] **B11** Updated `docs/features.md` — sections 7.16 and 7.21 document the Instructions field.

---

### N11-C — Project-Level AI Permissions

Workers currently inherit only the adapter's default capabilities. This task adds a `permissions` block to `project.json` that lists which credentials and capabilities the AI adapter may use. The adapter receives these permissions as part of its spawn options so it can pass them to Claude (e.g., as `--allowedTools`).

**`project.json` additions:**
```json
{
  "permissions": {
    "allow_network": true,
    "allow_shell": false,
    "credential_ids": ["github-api", "gmail-smtp"],
    "notes": "Free-text instructions passed to the AI about what tools are available."
  }
}
```

At worker spawn time, the worker engine reads `project.permissions` and includes it in the `SpawnOptions` so the Claude adapter can translate it to CLI flags or a permissions preamble in the prompt.

#### Tasks

- [ ] **C1** Add `permissions?: ProjectPermissions` to `ProjectMeta` in `src/shared/types.ts`:
  ```typescript
  export interface ProjectPermissions {
    allow_network: boolean
    allow_shell: boolean
    credential_ids: string[]   // credentials the AI may reference by name
    notes?: string             // free-text context given to the AI about what it can do
  }
  ```
- [ ] **C2** Update `src/main/services/project-service.ts` to read/write `permissions` in `project.json` (default to `{ allow_network: false, allow_shell: false, credential_ids: [], notes: '' }` when absent).
- [ ] **C3** Add `project:updatePermissions` IPC channel and handler.
- [ ] **C4** Pass `project.permissions` through to `SpawnOptions` in the worker engine (and source runner when AI is used). The Claude Code adapter translates `allow_network` / `allow_shell` to `--allowedTools` flags, and prepends any listed credentials' names + the `notes` field as a system context block in the prompt.
- [ ] **C5** Update the `AITerminalAdapter.spawn()` interface in `adapter.ts` to accept an optional `permissions?: ProjectPermissions` field in `SpawnOptions`.
- [ ] **C6** Implement in `claude-code.ts`: when `permissions.allow_network` is true, add `--allowedTools Bash(curl:*)` (or equivalent); when `permissions.allow_shell` is true, add `--allowedTools Bash`; prepend credential names and notes as a tool-availability preamble in the process file.
- [ ] **C7** Update `docs/data-model.md` — document the `permissions` block in `project.json`.
- [ ] **C8** Update `docs/tech-stack.md` — note that `SpawnOptions` now carries a `permissions` field.

---

### N11-D — AI Permission-Request Auto-Handling

When Claude Code is running as a worker and encounters a permission prompt (e.g. *"Allow this tool to use the network? [y/N]"*), the current behaviour is to block awaiting user input. This task makes the runner detect these prompts, respond automatically with a permanent allow, and retry the run up to 3 times if the answer alone is not enough to complete the task.

Detection: scan the live stdout stream for lines matching known Claude Code permission-prompt patterns (e.g. lines ending with `[y/N]` or containing `"Allow"` and `"?"` in a single line). The exact patterns will be tuned during implementation based on Claude Code's actual output.

#### Tasks

- [ ] **D1** In `src/main/ai-terminals/claude-code.ts`, add a `detectPermissionPrompt(line: string): boolean` utility that recognises Claude Code permission-request lines.
- [ ] **D2** In the session stream consumer (worker runner), when a permission prompt is detected: send `"y\n"` via `session.sendInput()`; log an `ai_permission_auto_accepted` audit event; increment a per-run retry counter.
- [ ] **D3** If the retry counter exceeds 3 in a single run, abort the run with a `run_failed` result and error code `max_permission_retries_exceeded` — surface this clearly in the UI.
- [ ] **D4** Add `ai_permission_auto_accepted` to `AuditEvent` in `src/shared/types.ts`.
- [ ] **D5** Write unit tests: mock a PTY session that emits permission prompt lines; verify the runner responds with `y`, emits the audit event, and retries; verify hard failure after 3 retries.
- [ ] **D6** Update `docs/tech-stack.md` — document the permission-auto-accept loop and retry cap.

---

### N11-E — Quick AI Console

A lightweight modal accessible from the top bar (or via keyboard shortcut `⌘/Ctrl+Shift+A`) for sending a one-shot prompt to the active AI adapter and seeing the raw response. Useful for quick lookups, testing prompts, or debugging.

**UI:**
```
┌─────────────────────────────────────────────────────────┐
│  Quick AI                                         [×]    │
│  ─────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Ask anything…                                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                              [Ask ›]     │
│  ─────────────────────────────────────────────────────  │
│  Response                                                │
│  ┌─────────────────────────────────────────────────┐    │
│  │  (AI response rendered here, markdown-aware)    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

- The modal is stateless — no history is persisted between opens.
- Uses the active adapter's `spawn()` with a minimal system prompt and the user's input.
- Streams response text into the response area in real time.
- A **Copy** button appears when a response is present.
- The modal can be dismissed any time; an in-flight request is aborted.

#### Tasks

- [ ] **E1** Add `QuickAIConsoleModal.tsx` in `src/renderer/components/ai/`.
- [ ] **E2** Add `ai:query` IPC channel: accepts `{ prompt: string }`, spawns the active adapter, streams back `ai:query-chunk` events, then emits `ai:query-done` or `ai:query-error`.
- [ ] **E3** Wire the modal open via a **Terminal** icon button in `TopBar.tsx` and the keyboard shortcut `⌘/Ctrl+Shift+A` in `useGlobalShortcuts`.
- [ ] **E4** Add `ai:query`, `ai:query-chunk`, `ai:query-done`, `ai:query-error` to `IPC` in `ipc-channels.ts` and to the preload bridge.
- [ ] **E5** Update `docs/features.md` — add section 7.22 "Quick AI Console".
- [ ] **E6** Update `docs/user-flows.md` — add flow 6.23 "Quick AI Query".

---

### N11-F — Adapter Setup Screen Cleanup

Keep the existing `AdapterSetupScreen` / `AdapterSetupWizard` abstraction — future adapters (OpenCode, Copilot, etc.) will plug in through the same pattern. The only changes here are:

1. **Hide mock adapter** — `kind: 'mock'` adapters must never appear in the setup screen or Settings. Filter them out at the list layer.
2. **Remove local-llm branches** — the `isLocalLlm` fork in `AdapterSetupScreen.tsx` (Download button, ModelDownloadModal, "Recommended" badge logic, sort-to-top) is deleted now that local-llm is gone. Every adapter renders through the same generic card.
3. **Generic card layout** — the single card shape is: adapter name · description · install-command code block (from `blockers[0].fixCommand`) · install-guide link · **[Check again]** + **[Setup guide]** buttons. No adapter-specific special cases.
4. **Updated copy** — the screen header no longer references the local model. New subtitle: *"Install an AI adapter to get started. Claude Code is the recommended choice."* (Claude Code is currently the only production adapter; the screen is ready to list more when added to the registry.)

#### Tasks

- [x] **F1** In `AdapterSetupScreen.tsx`: remove the `isLocalLlm` conditional branches, the `ModelDownloadModal` import and usage, the local-llm sort priority, and the "Recommended" / "Power user" badge logic. Render all production adapters through a single generic card template.
- [x] **F2** In `AdapterSetupScreen.tsx`: update the header subtitle copy (see above).
- [x] **F3** In `AdapterSetupScreen.tsx`: filter the adapter list to `kind === 'production'` only — `kind: 'mock'` adapters must never appear.
- [x] **F4** In `src/main/ai-terminals/registry.ts` (or wherever `adapters:list` is handled): ensure the IPC handler already filters mock adapters before returning, so no renderer code needs to defend against it independently.
- [x] **F5** In `SettingsScreen.tsx`: remove any `local-llm`-specific UI blocks (Local AI model section, download/delete model links). The provider dropdown already reads from the registry, so it will naturally show only Claude Code once local-llm is removed in N11-A.
- [ ] **F6** Update `docs/user-flows.md` — update flow 6.14 "AI Setup — First Launch": remove local-llm card description, describe the generic single-card layout, note that currently only Claude Code is shown.
- [ ] **F7** Update `docs/features.md` — update section 7.20 "AI Setup Screen": remove local-llm "Recommended" / CLI "Power user" distinction; describe the generic card; note current adapter set is Claude Code only.

---

### N11-G — Source Cards Auto-Advance

When a source run completes, the cards it creates land in `<source-step>/cards/ready/`. The next step in the workflow (typically a Worker) watches the **previous step**'s `cards/ready/` folder. Verify this handoff is correctly wired for Source steps — Source is at position `00-`, so the Worker at position `01-` must watch `00-<slug>/cards/ready/`.

If the watcher in `step-service.ts` / `worker-engine` uses a relative path that only looks at the immediately preceding folder, this may already work. If not, fix it.

#### Tasks

- [ ] **G1** Trace the watcher setup in `src/main/services/step-service.ts` (or wherever workers register their chokidar paths) and confirm the watched path is derived from the step's actual preceding step in the workflow — not an assumed adjacent folder.
- [ ] **G2** Write an integration test in `source-runner.test.ts`: run a source, verify a card appears in `cards/ready/`, then verify the mock worker engine receives the file-add event and processes it.
- [ ] **G3** If the watcher path is wrong, fix `step-service.ts` / `worker-engine.ts` to correctly resolve `prevStep.dir + '/cards/ready/'` for Source steps.
- [ ] **G4** Update `docs/user-flows.md` flow 6.13 "A Source Step Runs" to explicitly state that the following Worker's chokidar watcher picks up the new cards automatically.

---

### N11-H — Project Settings Screen

Add **Project Settings** as a named destination in the left rail (above "Context files") that opens a right-panel editor for the current project's `name` / `display_name` and `description`.

**Left rail addition:**

```
[ ⚙  Project settings ]    ← new, above Context files
[ 📄  Context files    ]
[ ↺   Regenerate       ]
```

**Project Settings panel (right canvas):**

```
┌──────────────────────────────────────────────────────────────┐
│  Project Settings                                            │
│  ─────────────────────────────────────────────────────────  │
│  Name          [Client Onboarding           ]                │
│                                                              │
│  Description   [Intake new clients and route…]               │
│                                                              │
│                                              [Save]          │
└──────────────────────────────────────────────────────────────┘
```

Saving writes the updated `display_name` and `description` to `project.json` and bumps `updated_at`. The project switcher and project list screen reflect the new name immediately.

#### Tasks

- [x] **H1** Add `project:updateMeta` IPC channel: accepts `{ projectName, displayName, description }`, updates `project.json` atomically.
- [x] **H2** Add `ProjectSettingsPanel.tsx` in `src/renderer/components/project/` with Name + Description form.
- [x] **H3** In `ProjectScreen.tsx`: add `showProjectSettings` state, "Project settings" left-rail button, render `ProjectSettingsPanel` in the right canvas when active.
- [x] **H4** Update `docs/features.md` — added section 7.22 "Project Settings Panel".
- [x] **H5** Update `docs/user-flows.md` — added flow 6.23 "Editing Project Settings".

---

### N11-I — Docs Refresh

Review every file under `docs/` (excluding `docs/implementation/`) for staleness after the N11 changes above. Update any section that describes removed features (local-llm, multi-adapter setup), or that is missing the new features (Source/Outlet instructions, Quick AI console, project permissions, project settings).

- [ ] **I1** `docs/app-description.md` — verify vocabulary, target users, and feature list are consistent with N11 (no local-llm, correct Source/Outlet/Worker descriptions).
- [ ] **I2** `docs/tech-stack.md` — remove local-llm stack entries; add Quick AI Console IPC channels; update `SpawnOptions` and adapter interface docs.
- [ ] **I3** `docs/data-model.md` — add `prompt` to Source/Outlet schemas; add `permissions` to `project.json` schema.
- [ ] **I4** `docs/features.md` — remove 7.18 Local AI Model, update 7.16 Source and 7.21 Outlet for instructions field, remove 7.20 AI Setup multi-adapter layout, add 7.22 Quick AI Console, add 7.23 Project Settings Panel.
- [ ] **I5** `docs/user-flows.md` — update 6.14 AI Setup, remove 6.17 Local Model Download, update 6.13 Source Step Run (auto-advance), add 6.23 Quick AI Query, add 6.24 Editing Project Settings.
- [ ] **I6** `docs/design-principles.md` — confirm no local-llm-specific design rules remain; add any N11-specific UI patterns (Quick AI console style, Project Settings panel).

---

## Acceptance Criteria

- `npm test` passes with no new failures.
- `node-llama-cpp` is absent from `package.json`; no import of `local-llm` anywhere in the codebase.
- A Source step with `prompt` set runs the AI and creates cards with AI-structured `card.data`; without `prompt` it behaves exactly as before.
- An Outlet step with `prompt` set invokes the AI before dispatching; without `prompt` it dispatches verbatim as before.
- `project.json` can carry a `permissions` block; the Claude adapter reflects `allow_network` / `allow_shell` as CLI flags.
- Claude Code permission prompts mid-run are auto-accepted; after 3 retries the run fails cleanly with a clear error code.
- Quick AI console opens from the top bar button and `⌘/Ctrl+Shift+A`; responses stream in real time; closing aborts any in-flight request.
- On first launch without any production adapter installed, `AdapterSetupScreen` blocks routing until an adapter reports installed. Currently that means Claude Code; the screen is generic and will list additional adapters as they are added to the registry.
- `kind: 'mock'` adapters never appear in `AdapterSetupScreen` or the Settings provider list.
- Cards created by a Source step are automatically picked up by the following Worker step without any user action.
- "Project settings" in the left rail opens a panel where the user can rename and re-describe the project; the project list reflects the change immediately.
- All `docs/` files (excluding `docs/implementation/`) are consistent with the implemented behaviour.
