# Phase 10 — Skills & Context Packs

**Estimate:** 1 week  
**Status:** Complete — all features were implemented across Phases 4–8 alongside the worker engine.

---

## Goals

Wire up the skills system and context packs so they are read by workers at run time.

---

## Tasks

- [x] **Skill picker** in worker config — checklist of installed skills in the worker's **Config** tab
- [x] **Skill `skill.md` injection** — at run time, the adapter concatenates selected skills' `skill.md` contents into the prompt
- [x] **Context pack editor** — two-pane editor (file list + markdown editor) accessible via the **Context files** button in the project left rail
- [x] **Context pack picker** in worker config — checklist of context files in `context/`; base files (`_*.md`) are auto-included and shown read-only
- [x] **Variable resolution** in `process.md`:
  - `{{card.data}}` — substituted with the card's `data` object as pretty-printed JSON
  - `{{card.data.fieldName}}` — substituted with the value at that dotted path (strings inlined verbatim, objects JSON-stringified, missing paths → empty string)
  - `{{context.name}}` — substituted with the contents of `context/<name>.md` before the run starts
  - Variable reference chips in the process.md editor (click to copy to clipboard)
- [x] **Skills screen** showing installed skills (basic list; full redesign is N2.1)

---

## How it actually works

### Prompt assembly pipeline (per worker run)

1. `worker-runner.ts` → `resolveProcessVariables()` scans `process.md` for `{{context.x}}` tokens, reads the matching `context/<x>.md` file from disk, and writes the resolved content to `runDir/process.md`.
2. `worker-runner.ts` resolves the skill list: `['trayline-worker-contract', ...worker.skills]` → reads `skill.md` from `Paths.skills/<id>/` or `Paths.systemSkills/<id>/`.
3. `worker-runner.ts` resolves context packs: base files (`_*.md`) are always loaded; worker-selected packs (excluding `_`-prefixed names to prevent duplication) are appended.
4. The adapter's `spawn()` receives `{ processFile, skills, contextPacks, cardData }`.
5. `claude-code.ts` → `renderProcessTemplate()` substitutes `{{card.data}}` and `{{card.data.x}}` tokens in the resolved process body.
6. Final prompt structure (sections separated by `\n\n---\n\n`):
   ```
   ## Skill: trayline-worker-contract
   <skill.md content>
   ---
   ## Skill: <selected-skill-id>
   <skill.md content>
   ---
   ## Context
   <base context file content>
   <selected context pack content>
   ---
   <resolved process.md with card.data substituted>
   ```
7. Prompt is written to `runDir/prompt.txt` and fed to `claude -p < prompt.txt`.

### Skill picker (worker Config tab)

- Located inside the worker's **Config** tab (`WorkerDetailPanel.tsx`), alongside execution settings and trigger mode — not in a separate "Skills, MCPs & Context" tab.
- Dropdown lists all installed skills (user + system) by name.
- Selected skills show with name and truncated description; missing skills are highlighted with a warning badge.
- Skill IDs are persisted to `step.json` → `skills: string[]`.

### Context pack picker (worker Config tab)

- Also in the worker **Config** tab, below the skill picker.
- Base files (`_*.md`) are always shown as read-only (auto-injected at runtime).
- Non-base files can be added via dropdown and removed individually.
- Persisted to `step.json` → `context_packs: string[]`.

### Context pack editor (project sidebar)

- Accessed via the **Context files** button in the project left rail.
- Two-pane layout: file list on the left, markdown editor on the right.
- "New file" button with inline filename input; delete button per file.
- Base files (names starting with `_`) are distinguished with a badge; they cannot be deleted from the UI.
- The editor shows the full file path so users know the variable name to use (`{{context.<name-without-.md>}}`).
- Saves via `project:writeContextFile` IPC → atomic write on disk.

### Variable resolution details

| Variable | Resolved by | When |
|---|---|---|
| `{{card.data}}` | `claude-code.ts renderProcessTemplate()` | At prompt build time (after context vars) |
| `{{card.data.x}}` | `claude-code.ts renderProcessTemplate()` | At prompt build time |
| `{{context.name}}` | `worker-runner.ts resolveProcessVariables()` | Before adapter spawn; written to `runDir/process.md` |

Variable chips in the process.md editor (`WorkerDetailPanel.tsx` Instructions tab) are generated from: `['{{card.data}}', ...contextFiles.map(f => '{{context.' + f.replace(/.md$/, '') + '}}')]`. Clicking a chip copies it to the clipboard.

---

## Acceptance Criteria

- [x] A worker with a skill selected includes the skill's `skill.md` in the prompt sent to the AI
- [x] Context packs selected in the worker config are injected under a `## Context` section in the prompt
- [x] Base context files (`_*.md`) are automatically injected for every run regardless of worker selection
- [x] `{{card.data}}` and `{{card.data.x}}` in `process.md` are resolved at prompt build time
- [x] `{{context.name}}` in `process.md` is resolved by reading the matching context file before the adapter spawns
- [x] A user can create, edit, and delete context pack files from the project sidebar
- [x] Variable chips in the process.md editor show all available `{{card.data}}` and `{{context.x}}` variables and copy on click
