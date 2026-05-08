# Phase 1 — Global App Skills & First-Run Bootstrap

**Estimate:** 4 days

---

## Goals

On first launch, lay down the global folder structure and seed the system skills that the rest of the app depends on. Almost every later phase assumes this is in place.

---

## Tasks

- [ ] Detect missing `~/Documents/Trayline/` on first launch and create the full skeleton:
  - `app-data/` (with `settings.json`, empty caches)
  - `skills/`
  - `skills/_system/`
  - `mcps/`
  - `projects/`
- [ ] Bundle the two **system skills** with the Electron app and copy them into `skills/_system/` on first launch:
  - `trayline-scaffold` — materializes a project's folder structure from a JSON workflow plan; includes bundled JSON/MD templates (`tray.step.json`, `worker.step.json`, `process.md`, `workflow.json`)
  - `trayline-author` — master prompt that takes a user's plain-English description and returns a JSON workflow plan
- [ ] Restore system skills from bundled app resources on every launch if missing or corrupted
- [ ] Build the **AI Terminal Adapter** layer:
  - `adapter.ts` interface
  - `claude-code.ts` adapter (spawn via node-pty, stream stdout/stderr, detect install via PATH)
  - `mock.ts` adapter for tests (scripted responses, no real process)
  - `registry.ts` — lookup by id string
- [ ] Build the **runtime project metadata service** — reads/writes `project.json`, lists workflows, lists steps, finds skills, etc. All later phases query through this service, not the file system directly.
- [ ] Minimal "Hello, Trayline is ready" splash that tells the user where its data lives (`~/Documents/Trayline/`)

---

## Acceptance Criteria

- `~/Documents/Trayline/` created on first launch with expected structure
- `skills/_system/trayline-author/` and `skills/_system/trayline-scaffold/` present with valid `skill.json` and `skill.md`
- Mock adapter can be swapped in for the real Claude Code adapter in tests
- Project metadata service can list projects from `projects/` directory
