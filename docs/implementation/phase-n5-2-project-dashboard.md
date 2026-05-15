# Phase N5.2 — Project Dashboard

**Estimate:** 3 days

---

## Goals

Transform the Project List screen from a static pill list into a live control panel. Each project pill shows real activity (running workers, pending/error card counts), the status dot is a true start/stop switch wired to orchestration, and blocking conditions (no adapter, MCPs unconfigured) are surfaced with an amber state.

---

## Tasks

- [ ] **`project:live-stats` IPC handler** — scans all workflows for a given project and returns:
  ```ts
  {
    pendingCards: number   // cards in pending/ across all tray steps
    readyCards: number     // cards in ready/ across all tray and source steps
    errorCards: number     // cards in 99-errors/cards/pending/
    runningWorkers: number // workers currently in-flight (from workerRunner.activeRuns())
    runningSources: number // sources currently in-flight (from sourceRunner.activeRuns())
  }
  ```
  Both `workerRunner` and `sourceRunner` need to expose `activeRuns(): string[]` (list of step IDs currently running) if not already present.

- [ ] **`project:check-readiness` IPC handler** — returns `{ ready: boolean, blockers: string[] }`:
  - Blocker: no production AI adapter installed → `"No AI adapter installed"`
  - Blocker: worker requires an MCP whose `state/status.json` has `configured: false` → `"MCP 'github' not configured"`
  - `blockers` is empty when `ready: true`

- [ ] **Project pill live stats display**: each pill in `ProjectListScreen` polls `project:live-stats` on mount and refreshes:
  - On the `project:status-changed` IPC event for this project
  - On `run_event` and `source:run-event` IPC push events (no full poll needed — increment/decrement the local counter)
  - Display: `⚙ 2 running  •  5 pending  •  ⚠ 1 error` — shown below the description line, only when at least one counter is non-zero

- [ ] **Status dot state machine** — the dot in each pill reflects:
  - Green + idle: `mounted === true`, no running workers/sources
  - Green + animated pulse: `mounted === true`, `runningWorkers + runningSources > 0`
  - Amber: `mounted === true` but `check-readiness` returns `ready: false` — shows a tooltip listing blockers on hover
  - Red: `mounted === false` (inactive)
  - Clicking the dot calls `project:setStatus` and updates immediately via the `project:status-changed` event (no need to refetch the full list)

- [ ] **Reactive update on `project:status-changed`**: renderer subscribes to this IPC push event in `ProjectListScreen` and updates the affected pill's `mounted` + `status` in local state without re-fetching the whole list

- [ ] **"Pause all" / "Resume all" controls** — two small buttons at the top-right of the project list:
  - **Pause all**: sets every active project to inactive (calls `project:setStatus('inactive')` for each)
  - **Resume all**: sets every inactive project to active
  - Buttons are disabled while any status change is in-flight

---

## Acceptance Criteria

- Project list shows live running-worker count while a worker is executing
- Status dot goes amber when a required MCP is not configured, green when all clear
- Clicking the red dot on an inactive project makes it go green and immediately starts processing cards in `ready/`
- "Pause all" stops all active projects; "Resume all" restarts them
- Toggling a project active/inactive from the list does not require navigating away or refreshing
