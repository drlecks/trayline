# Phase N3.1 — Source Engine

**Estimate:** 1–1.5 weeks

---

## Goals

Build the complete backend for Source steps: scheduling, AI execution, JSON parsing, deduplication, atomic state persistence, crash recovery, and audit logging. No UI in this phase — the engine must be fully testable via unit/integration tests before the UI lands.

---

## Tasks

### Data & Schema

- [x] Add `"kind": "source"` to the step discriminated union in `src/shared/worker-run.ts` (or equivalent shared types file)
- [x] Define TypeScript types for `SourceStepConfig`, `SeenIdsEntry`, `SourceCounters`, and `SourceRunMeta`
- [x] Add `source.step.json` template to `resources/system-skills/trayline-scaffold/templates/`
- [x] Add `source.md` starter template (with prompt hints) to `resources/system-skills/trayline-scaffold/templates/`

### Scheduler Integration

- [x] Extend the existing scheduler service (or create `src/main/services/source-scheduler.ts`) to support Source step cron jobs
- [x] On app launch, scan all workflow step folders for `step.json` files with `"kind": "source"` and register their cron jobs
- [x] On Source step create/update/delete, dynamically add/remove/update the corresponding cron job without requiring a restart
- [x] Pause/resume API: `sourceScheduler.pause(stepId)` / `sourceScheduler.resume(stepId)` — persists paused state to `step.json` as `"paused": true`
- [x] Prevent overlapping runs: if a source run is still in progress when the next cron tick fires, skip that tick and log a warning to `state/counters.json`

### Source Runner

- [x] Create `src/main/services/source-runner.ts`
- [x] `runSource(stepPath, stepConfig)` function:
  - [x] Read `state/seen-ids.json`; if absent, treat as empty (first run)
  - [x] Detect first-run state: `seen-ids.json` absent or empty → apply `dedup.first_run` policy
  - [x] Spawn AI adapter via the `AITerminalAdapter` interface with `source.md` as the instruction file and no card input
  - [x] Capture full stdout; on exit, attempt to parse as JSON array
  - [x] If parse fails: emit `source_run_failed`, write error to audit log, return early — do not mutate state
  - [x] Dedup loop: for each item, extract `item[dedup.key]`; skip if key already in seen set; create card for new items
  - [x] Card creation: write `card_<timestamp>_<n>.json` to `cards/ready/` using the standard card schema (`created_by: "source"`, `source_step: stepId`)
  - [x] `first_run: skip_existing` — add all item IDs to seen set but create no cards
  - [x] `first_run: process_all` — create cards for all items and add IDs to seen set
  - [x] `first_run: process_last_n` — sort items by their position in the array, take the last N, create cards for those only, add all IDs to seen set
- [x] Atomic seen-ids write: write to `seen-ids.json.tmp`, rename to `seen-ids.json`; prune to `dedup.max_memory` (oldest by `seen_at`) before writing
- [x] Update `state/counters.json` after each run: increment `runs_total`, update `items_found`, `items_new`, `last_run_at`
- [x] Emit IPC events to renderer: `source:run-started`, `source:run-completed`, `source:run-failed` (mirrors existing worker IPC pattern)

### Audit Log

- [x] Write `source_run_started` event at run start
- [x] Write `source_run_completed` event with `{ items_found, items_new, duration_ms }` on success
- [x] Write `source_run_failed` event with `{ error, duration_ms }` on failure
- [x] Write one `source_item_new` event per new card created, with `{ item_id, card_id }`

### Crash Recovery

- [x] On app launch, for each Source step folder: check for `state/seen-ids.json.tmp`; if present, discard it (the rename never completed — the last good `seen-ids.json` is authoritative)
- [ ] Check for any cards in `cards/ready/` that have no corresponding `source_item_new` audit entry — log a warning but do not delete (at-least-once delivery is acceptable)

### IPC

- [x] Add IPC handlers in `src/main/ipc/handlers.ts`:
  - [x] `source:run-now` — trigger an immediate run outside the schedule
  - [x] `source:pause` — pause the cron job
  - [x] `source:resume` — resume the cron job
  - [x] `source:get-state` — return `{ counters, seenCount, paused, nextRunAt }`
- [x] Expose new channels in `src/preload/index.ts`
- [x] Add channel constants to `src/shared/ipc-channels.ts`

### Tests

- [x] Unit test: `runSource` with a mock adapter returning valid JSON array — assert correct cards created, seen-ids written, counters updated
- [x] Unit test: `runSource` with adapter returning invalid JSON — assert no state mutation, `source_run_failed` logged
- [x] Unit test: dedup logic — items already in seen set are skipped
- [x] Unit test: `max_memory` pruning — oldest entries evicted when limit exceeded
- [x] Unit test: `first_run: skip_existing` — no cards created, all IDs added to seen set
- [x] Unit test: `first_run: process_all` — all cards created
- [x] Unit test: `first_run: process_last_n` — correct N cards created
- [x] Unit test: crash recovery — `.tmp` file present on launch is discarded
- [ ] Integration test: scheduler fires cron, source runner executes, cards appear in `ready/`

---

## Acceptance Criteria

- A Source step with a valid `source.md` and schedule runs on time and creates exactly one card per new unique item
- Items already in `seen-ids.json` are never re-created as cards
- A crash during the seen-ids write (simulated by leaving `.tmp`) is recovered cleanly on next launch
- `source_run_failed` is emitted and no state is mutated when the AI returns non-JSON output
- All four `first_run` policy modes produce the correct card count on the first run
- The scheduler does not allow overlapping runs of the same source
