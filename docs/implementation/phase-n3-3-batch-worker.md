# Phase N3.3 — Batch Worker Mode

**Estimate:** 0.5–1 week

**Depends on:** Phase N3.1 (Source Engine), Phase 4 (Workers + CLI Execution)

---

## Goals

Add `batch_mode` to workers. When enabled, the worker receives all ready cards from the preceding step as a single JSON array and produces one output card. This unlocks digest/summary patterns (e.g., "summarise all today's Hackernews stories into one email").

---

## Tasks

### Data Model

- [x] Add `batch_mode: boolean` (default `false`) and `batch_max: number | null` (default `null`) to the Worker `step.json` schema in `src/shared/worker-run.ts` (and `WorkerStepJson` in `worker-runner.ts`)
- [x] Validate on read in `runNow`: if `batch_mode: true` and trigger was `on_ready`, the UI auto-switches to `manual` and the scaffold service coerces new scaffolded steps
- [x] Update `resources/system-skills/trayline-scaffold/templates/worker.step.json` to include `batch_mode: false` and `batch_max: null` so all scaffolded workers have explicit defaults

### Worker Engine Changes (`src/main/services/worker-runner.ts`)

- [x] `runNow` checks `worker.batch_mode` and routes to `triggerBatchRun` instead of per-card `triggerRun`
- [x] If `batch_mode: false`: existing single-card behaviour, no change
- [x] If `batch_mode: true`:
  - [x] Collect all card files from the previous step's `cards/ready/` (sorted alphabetically = created_at order)
  - [x] If `batch_max` is set, take only the first `batch_max` cards
  - [x] If zero cards are present, return `{ triggered: 0 }` (no-op)
  - [x] Build the batch input object: `{ cards: [{ id, data }, ...], count: N }`
  - [x] Pass the batch input to the AI adapter as `cardData` (same adapter interface, different input shape)
  - [x] On success: write single output card to next step; archive all input cards (move from `ready/` to `archived/`)
  - [x] On failure: leave all input cards in `ready/` untouched (user can retry)
  - [x] Write `run_started` and `run_completed`/`run_failed` audit events with `{ batch: true, card_count: N }` in `details_json`

### Crash Safety

- [x] Batch runs follow the same atomic output protocol as single-card runs: output written to `.tmp`, renamed on success
- [x] Input cards remain in `ready/` until after a successful rename — a crash mid-run leaves them in `ready/` for retry
- [x] On launch, existing `recoverOrphanedRuns` marks interrupted batch runs as failed; input cards are already safe in `ready/` (they were never moved)

### IPC

- [x] No new IPC channels required — batch runs reuse all existing worker run IPC events
- [x] `WorkerRunEvent.finished` includes `batchCardCount?: number` so the renderer can show the card count from the last batch run

### Worker Detail Panel — Config Tab Changes

- [x] Add a **Batch mode** toggle switch in the Config tab (below Trigger mode) — uses a pure CSS toggle button
- [x] When toggled on:
  - [x] Show **Max cards per run** number input (placeholder: "No limit")
  - [x] Automatically switch Trigger mode to `manual` if it was `on_ready`; disable the `on_ready` option while batch mode is on
- [x] When toggled off: `on_ready` option re-enabled
- [x] Both `batch_mode` and `batch_max` saved to `step.json` on the existing Save button

### Left Rail Card Visual

- [x] When `batch_mode: true`, the Worker step card in the left rail shows a `Layers` icon (lucide-react) instead of `Cpu`
- [x] Status line shows `batch: N` after a completed batch run (card count from `batchCardCount` in the `finished` event)

---

## Acceptance Criteria

- A worker with `batch_mode: true` collects all ready cards from the previous step, passes them as a JSON array to the AI adapter, and produces exactly one output card
- All input cards are archived on success and left untouched on failure
- A crash between output write and input archive (simulated) is recovered cleanly: input cards remain in `ready/`
- Setting `batch_mode: true` in the UI automatically prevents `on_ready` trigger selection
- `batch_max` correctly limits the number of cards consumed per run
- The left rail card shows the stacked-cards icon and the card count from the last batch run
- A batch worker with zero ready cards skips its run silently (no error, no audit failure event)
