# Phase N5.1 — Orchestration Engine

**Estimate:** 2 days

---

## Goals

Make `project.status` a real on/off gate for orchestration. Today all three mounting services (`watcher-service`, `scheduler-service`, `source-scheduler`) mount every project at startup regardless of status. This phase wires status to actual start/stop: only active projects run on launch, and toggling status immediately mounts or unmounts that project.

---

## Tasks

- [x] **`orchestrator` service** (`src/main/services/orchestrator.ts`):
  - `mountProject(name)` — mounts watchers + scheduler + source-scheduler + queue for all of the project's workflows. No-op if already mounted.
  - `unmountProject(name)` — reverses all mounts. No-op if not mounted.
  - `isMounted(name) → boolean`
  - `mountAll()` — reads all projects, filters to `status === 'active'`, calls `mountProject` for each
  - `unmountAll()` — calls `unmountProject` for every currently mounted project
  - Internal `mounted: Set<string>` tracks which projects are currently live

- [x] **Replace the four separate `mountAll()` / `stopAll()` calls** in `src/main/index.ts`:
  - Startup `whenReady`: replace `watcherService.mountAll()` + `schedulerService.mountAll()` + `sourceScheduler.mountAll()` + `queueService.mountAll()` with a single `await orchestrator.mountAll()`
  - `before-quit`: replace the four unmount/stop calls with `await orchestrator.unmountAll()`

- [x] **Remove the local `mountProject` helper from `handlers.ts`** and replace all callers (`project:create`, `project:import`, `project:importCommit`, `project:openExample`) with `orchestrator.mountProject(projectName)`

- [x] **Wire `project:setStatus` handler** in `handlers.ts`: after writing status to disk, call `orchestrator.mountProject(name)` (active) or `orchestrator.unmountProject(name)` (inactive), then broadcast `project:status-changed` to all renderer windows: `{ name, status, mounted: boolean }`

- [x] **`project:get-orchestration` IPC handler** — returns `{ name, mounted: boolean }` for a given project name. Used by the renderer to show accurate state on initial load.

- [x] **Tests** for `orchestrator.ts`:
  - `mountAll` only mounts active projects (inactive ones stay unmounted)
  - `mountProject` is idempotent (double-mount is a no-op)
  - `unmountProject` tears down all four services for that project
  - Setting status to inactive via the mock handler triggers unmount; active triggers mount

---

## Acceptance Criteria

- On launch with two projects (one active, one inactive), only the active project's watchers/schedulers fire
- Toggling the inactive project to active immediately mounts its watchers without restarting the app
- Toggling the active project to inactive immediately stops its watchers and cron tasks
- Cards in an inactive project's `ready/` folders are not processed until the project is re-activated
