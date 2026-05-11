# Phase N3.3 — Batch Worker Mode

**Estimate:** 0.5–1 week

**Depends on:** Phase N3.1 (Source Engine), Phase 4 (Workers + CLI Execution)

---

## Goals

Add `batch_mode` to workers. When enabled, the worker receives all ready cards from the preceding step as a single JSON array and produces one output card. This unlocks digest/summary patterns (e.g., "summarise all today's Hackernews stories into one email").

---

## Tasks

### Data Model

- [ ] Add `batch_mode: boolean` (default `false`) and `batch_max: number | null` (default `null`) to the Worker `step.json` schema in `src/shared/worker-run.ts` (or equivalent)
- [ ] Validate on read: if `batch_mode: true` and `trigger.mode: "on_ready"`, log a warning and coerce trigger to `"manual"` (batch workers must not fire on individual card arrivals)
- [ ] Update `skills/_system/trayline-scaffold/templates/worker.step.json` to include `batch_mode: false` and `batch_max: null` so all scaffolded workers have explicit defaults

### Worker Engine Changes (`src/main/services/worker-runner.ts`)

- [ ] Before spawning a run, check `stepConfig.batch_mode`
- [ ] If `batch_mode: false`: existing single-card behaviour, no change
- [ ] If `batch_mode: true`:
  - [ ] Collect all card files from the previous step's `cards/ready/` directory (sorted by `created_at`)
  - [ ] If `batch_max` is set, take only the first `batch_max` cards
  - [ ] If zero cards are present, skip the run (no-op, log to counters)
  - [ ] Build the batch input object: `{ cards: [...], count: N }` — each card entry includes `id` and `data`
  - [ ] Pass the batch input to the AI adapter as the run input (same adapter interface, different input shape)
  - [ ] On success: write the single output card to the next step's folder; archive all input cards (move from `ready/` to `archived/`)
  - [ ] On failure: leave all input cards in `ready/` untouched (user can retry)
  - [ ] Write `run_started` and `run_completed`/`run_failed` audit events with `{ batch: true, card_count: N }` in `details_json`

### Crash Safety

- [ ] Batch runs follow the same atomic output protocol as single-card runs: output written to `.tmp`, renamed on success
- [ ] Input cards remain in `ready/` until after a successful rename — a crash mid-run leaves them in `ready/` for retry
- [ ] On launch, orphaned batch run folders (no `meta.json` marked `finished`) are treated as failed; input cards confirmed to still be in `ready/` are left untouched

### IPC

- [ ] No new IPC channels required — batch runs reuse all existing worker run IPC events
- [ ] `worker:get-status` response includes `batch_mode: true` so the renderer can show the correct UI variant

### Worker Detail Panel — Config Tab Changes

- [ ] Add a **Batch mode** toggle switch in the Config tab (below Trigger mode)
- [ ] When toggled on:
  - Show **Max cards** number input (placeholder: "No limit")
  - Show an informational note: "This worker will process all ready cards at once and produce one output card. Trigger must be Scheduled or Manual."
  - Automatically switch the Trigger mode selector to `scheduled` if it was `on_ready`; disable the `on_ready` option while batch mode is on
- [ ] When toggled off: restore previous trigger mode, hide batch-specific fields
- [ ] Both `batch_mode` and `batch_max` auto-save to `step.json` on change

### Left Rail Card Visual

- [ ] When `batch_mode: true`, the Worker step card in the left rail shows a stacked-cards icon (e.g., `layers` from lucide-react) next to the step name to distinguish it from single-card workers at a glance
- [ ] Status line on last run: `✓ Done (batch: N cards)` so the user can see how many cards were consumed

---

## Acceptance Criteria

- A worker with `batch_mode: true` collects all ready cards from the previous step, passes them as a JSON array to the AI adapter, and produces exactly one output card
- All input cards are archived on success and left untouched on failure
- A crash between output write and input archive (simulated) is recovered cleanly: input cards remain in `ready/`
- Setting `batch_mode: true` in the UI automatically prevents `on_ready` trigger selection
- `batch_max` correctly limits the number of cards consumed per run
- The left rail card shows the stacked-cards icon and the card count from the last batch run
- A batch worker with zero ready cards skips its run silently (no error, no audit failure event)
