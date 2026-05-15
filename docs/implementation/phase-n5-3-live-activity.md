# Phase N5.3 — Live Activity

**Estimate:** 2 days

---

## Goals

Surface real-time cross-project activity so users can see what's running across all their projects at a glance — without opening each one. A persistent activity bar on the Project List screen shows live runs, and the top bar gains a global indicator when anything is in flight.

---

## Tasks

- [x] **Global active-runs store in the renderer** (`useActiveRuns` hook or Zustand slice):
  - Subscribes to `run_event` and `source:run-event` IPC push events globally (not just per-project)
  - Maintains a map: `key (project/workflow/step) → { projectName, workflowName, stepName, startedAt, kind: 'worker' | 'source' }`
  - Adds entries on `run_started` / `source_run_started` events; removes them on `run_completed` / `run_failed` / `source_run_completed` / `source_run_failed`
  - Exposed as `activeRuns: ActiveRun[]` to any component

- [x] **Global activity bar** — rendered below the project pill list in `ProjectListScreen` when `activeRuns.length > 0`:
  ```
  ┌─────────────────────────────────────────────────────────────┐
  │  Live activity                                              │
  │  ⚙  Client Onboarding / Extract & Validate  —  Running 14s │
  │  ⚙  Newsletter / Source: HN Stories  —  Running 3s         │
  └─────────────────────────────────────────────────────────────┘
  ```
  - Each row shows: animated spinner · project display name · step name · elapsed time (live counter)
  - Rows are sorted by `startedAt` descending (most recent at top)
  - The bar collapses and disappears when `activeRuns` is empty

- [x] **Top bar activity indicator** — a small pulsing dot on the top bar's right side (near the project switcher) when `activeRuns.length > 0`. Tooltip: `"N runs in progress"`. Clicking it returns to the Project List screen (which shows the activity bar).

- [x] **Source countdown live refresh** — source step left rail cards currently display `next: Xm` from a stale `source:get-state` snapshot. Replace the static read with a 60-second `setInterval` that re-calls `source:get-state` while the source step is selected, keeping the countdown accurate.

- [x] **`project:live-stats` push subscription** — when the renderer is on the Project List screen, subscribe to `run_event` and `source:run-event` to increment/decrement the per-project running-worker counter without polling. (This completes the reactive wiring started in N5.2.)

---

## Acceptance Criteria

- With two projects active and a worker running in each, the activity bar shows two rows with live elapsed timers
- When all runs finish, the activity bar disappears without a page reload
- The top bar dot appears when any worker or source run starts across any project, and disappears when all runs complete
- Source step countdown in the left rail updates within 60 seconds of the cron tick
