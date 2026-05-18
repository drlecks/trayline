# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**Trayline** is an offline-first Electron desktop app for building AI-assisted business workflows visually — no code, no cloud, just folders. Workflows are linear stacks of **Trays** (where cards wait) and **Workers** (where AI processes cards). Everything persists as JSON files on disk; SQLite is an index only.

The app is aimed at non-technical users: assistants, operations managers, support leads — not developers.

---

## Documentation Index

All design decisions, data models, flows, and implementation plans live in `docs/`. Read these before implementing anything non-trivial.

| File | Contents |
|---|---|
| [`docs/app-description.md`](docs/app-description.md) | Concept, vocabulary (authoritative glossary), target users, why it works, MVP scope |
| [`docs/new-feature-revision.md`](docs/new-feature-revision.md) | **Feature compliance rules** — core promise, 5 canonical user personas + test workflows, compliance checklist, active gaps audit. Read before designing any new feature. |
| [`docs/tech-stack.md`](docs/tech-stack.md) | Full tech stack, AI Terminal Adapter interface and architecture |
| [`docs/design-principles.md`](docs/design-principles.md) | UI layout, color system, typography, motion rules, status pill states |
| [`docs/data-model.md`](docs/data-model.md) | Folder structure, all file schemas (card, tray step.json, worker step.json, skill, MCP), atomic card movement rules, audit log schema |
| [`docs/user-flows.md`](docs/user-flows.md) | All UX flows — first launch, workflow author, card creation, worker runs, MCP setup, import/export |
| [`docs/features.md`](docs/features.md) | Detailed feature designs — left rail, tray/worker detail views, card viewer, terminal layers, scheduler, skill finder, error tray |
| [`docs/skills-and-mcps.md`](docs/skills-and-mcps.md) | Full skills + MCP system — validation pipeline, curated catalog, setup wizard steps, execution flow, security model |
| [`docs/implementation/tasks.md`](docs/implementation/tasks.md) | **Master task list** — all phases with done/not-done status |
| [`docs/release.md`](docs/release.md) | CI release pipeline, versioning, code signing, notarization, auto-updates |

### Implementation Phase Files

Each phase in `docs/implementation/` has its own file with detailed tasks and acceptance criteria:

**MVP:** phase-0 through phase-13  
**N2 (Skills & MCPs):** phase-n2-1 through phase-n2-8  
**N3 (Sources & Batch Workers):** phase-n3-1 through phase-n3-4  
**N4 (Observability):** phase-n4-1

---

## Tech Stack (Quick Reference)

- **Electron** + **Node.js 20+** + **TypeScript** (main process)
- **React 18** + **Vite** + **Tailwind CSS** + **shadcn/ui** (renderer)
- **node-pty** — spawning AI CLI agents | **chokidar** — file watching | **better-sqlite3** — audit log
- **keytar** — OS keychain for MCP credentials | **node-cron** — scheduler | **xterm.js** — terminal

---

## Architecture: Key Invariants

### Everything is files
SQLite (`audit.db`) is a fast index — it is always derived from the file system, never the source of truth. If they conflict, the files win.

### AI Terminal Adapter
Workers never call Claude Code directly. They call the `AITerminalAdapter` interface (`src/main/ai-terminals/adapter.ts`). The Claude Code adapter is the default; a mock adapter exists for tests. Adding a new adapter is one file + one registry entry. See [`docs/tech-stack.md`](docs/tech-stack.md) for the full interface.

### Atomic card movement
A card only changes folders when the work producing it has fully completed. Source cards stay in `ready/` during runs. Output is written to `.tmp`, then renamed. The audit log entry is written *before* the file move so it can be replayed. On launch, orphaned runs are marked failed and source cards are left untouched. See [`docs/data-model.md`](docs/data-model.md) for the full protocol.

### MCP credentials
**Never** store MCP credentials in files. Always use `keytar` (OS keychain). `mcp.json` declares what credentials are needed; `state/status.json` stores only boolean flags. This holds for exports too — credentials never travel in a zip.

### Pre-flight before every worker run
Before entering Running state, verify all selected MCPs are in Ready state. If any aren't, abort with `run_aborted_mcp_not_ready` and surface exactly which MCP is blocking. Never let a run fail silently due to missing credentials.

### Skill security
Skills are instructions only (markdown + JSON). Reject any skill install that contains executables (`.exe`, `.sh`, `.bat`, `.dll`, `.so`, binaries). MCP installs from URL require an explicit user checkbox confirmation because they execute code.

---

## Folder Structure Conventions

- Step folders are prefixed with their order index: `01-intake/`, `02-extract/`. Reordering a workflow renumbers these folders.
- The error tray is always `99-errors/` — auto-created, never manually ordered.
- System skills live in `skills/_system/` — restored from app bundle on every launch if missing.
- MCP credentials live in OS keychain, never in `mcps/<id>/`.

---

## Testing Policy

The test suite runs with `npm test` (Vitest). Tests live **co-located** with the code they cover (`foo.ts` ↔ `foo.test.ts`) — this is the project convention; do not introduce a separate `__tests__/` folder.

### When tests are required

A new commit **must** include tests when it adds or significantly changes any of the following:

- **Main-process services** under `src/main/services/` — anything with non-trivial logic (file moves, schema validation, scheduling, watching, install/uninstall, audit-log emission).
- **Adapters** under `src/main/ai-terminals/` — both the interface contract and any new adapter implementation.
- **Shared utilities** under `src/shared/` that encode rules (id parsing, status transitions, schema validation) — anything other than plain type aliases.
- **Anything that touches data integrity** — atomic card movement, counters, the audit log, scaffold/import/export — even when the change feels small. These are the surfaces where regressions silently corrupt user data.
- **Bug fixes for any of the above** — the test must reproduce the bug first (red), then the fix turns it green. No "fix without regression test" for data-path bugs.

### When tests are optional

- Thin pass-through services (e.g. `fs-service`, `settings-store`) that just wrap a single library call.
- IPC handler glue in `src/main/ipc/handlers.ts` — covered indirectly by the service-level tests it delegates to.
- React components and stores in `src/renderer/` — UI is verified manually per the project's design rules. (We may revisit this with component tests later.)

### Conventions

- One `*.test.ts` file per module being tested.
- `vitest.setup.ts` already mocks `electron` and points the services at a fresh tmp directory per test run — use that infrastructure, don't reach for `~/Documents/Trayline` directly.
- Mock external systems (`node-cron`, `chokidar`, `fetch`) with `vi.mock` / `vi.stubGlobal` rather than waiting on real timers / network.
- Each test must be independent — wipe `Paths.projects` (or the relevant subtree) in `beforeEach`. Don't rely on file state leaking between tests.

If a PR touches a service in the "required" list above without adding or updating tests, reviewers should reject it until tests are added.

---

## Keeping Docs in Sync

**Any change to code, features, or design must be accompanied by an update to the relevant `docs/` file(s) in the same commit.** Docs are the source of truth for intent; the code is the implementation of that intent. They must never diverge.

Concretely:
- Changed a file schema or folder layout → update `docs/data-model.md`
- Changed how a UI screen or flow works → update `docs/user-flows.md` and/or `docs/features.md`
- Added, removed, or swapped a library → update `docs/tech-stack.md`
- Changed a color, spacing rule, motion value, or component visual → update `docs/design-principles.md`
- Changed how skills or MCPs are installed, validated, or executed → update `docs/skills-and-mcps.md`
- Changed the adapter interface or the worker execution protocol → update `docs/tech-stack.md`
- Completed a phase task or changed its scope → update the relevant `docs/implementation/phase-*.md` file and check it off in `docs/implementation/tasks.md`
- Changed something that touches the app's core concept or vocabulary → update `docs/app-description.md`
- Added a service or significantly changed an existing one → add or update its co-located `*.test.ts` (see **Testing Policy** above)

If you are unsure which doc file to update, update all plausible ones — a redundant update costs nothing; a stale doc costs confusion and bugs.

---

## Git Branching Workflow

### Branch structure

```
main        ← stable, protected. Never commit here directly.
└── develop ← integration branch. All features merge here via PR.
    └── phase/phase-0-foundations   ← one branch per phase task
    └── phase/phase-1-bootstrap
    └── ...
```

`main` is protected: direct pushes are blocked, force pushes are blocked. The only way code reaches `main` is via a pull request from `develop`.

### Starting a new phase task

**This is mandatory. Do not start implementing without following these steps.**

1. Make sure you are on `develop` and it is up to date:
   ```bash
   git checkout develop
   git pull origin develop
   ```
2. Create and switch to a new branch named after the phase:
   ```bash
   git checkout -b phase/<phase-id>
   # e.g. git checkout -b phase/phase-0-foundations
   ```
3. Read the phase file in `docs/implementation/` and confirm the scope before writing any code.
4. Implement all tasks for that phase on this branch — including any required doc updates (see **Keeping Docs in Sync**).
5. **As each individual task inside the phase is completed, immediately check it off** in the phase file (`- [ ]` → `- [x]`) and include that change in the same commit that implements it.
6. Commit regularly. Each commit should be coherent and leave the branch in a working state.

### Finishing a phase task

1. Push the branch and ask the user to review:
   ```bash
   git push -u origin phase/<phase-id>
   ```
2. Summarise what was done and explicitly ask: *"Ready to review. Let me know if anything needs changing before I merge."*
3. **Do not merge until the user confirms.** Address any feedback with additional commits on the same branch.
4. Once approved, merge into `develop`:
   ```bash
   git checkout develop
   git merge --no-ff phase/<phase-id> -m "Merge phase/<phase-id> into develop"
   git push origin develop
   ```
5. Check off the phase in `docs/implementation/tasks.md` (`- [ ]` → `- [x]`) and commit that change directly on `develop`.
6. Delete the phase branch:
   ```bash
   git branch -d phase/<phase-id>
   git push origin --delete phase/<phase-id>
   ```

### Branch naming

| Work type | Branch name |
|---|---|
| MVP phase | `phase/phase-0-foundations` |
| N2 phase | `phase/phase-n2-1-skills-enhanced` |
| Hotfix on develop | `fix/<short-description>` |

---

## Where to Start

1. Check the current branch — if not on `develop`, run `git checkout develop && git pull origin develop`.
2. Read [`docs/implementation/tasks.md`](docs/implementation/tasks.md) to find the next unchecked phase.
3. Follow the **Git Branching Workflow** above to create the phase branch before touching any code.
4. Open the relevant phase file in `docs/implementation/` for detailed tasks and acceptance criteria.
5. Consult [`docs/data-model.md`](docs/data-model.md) for any file shapes before writing to disk.
6. Consult [`docs/design-principles.md`](docs/design-principles.md) before building any UI component.
