# Phase 12 — Errors & Retry

**Estimate:** 2 days

---

## Goals

Make the error tray useful and give users clear paths to recover from failures.

---

## Tasks

- [x] **Error tray UI** — `99-errors/` tray shown at the bottom of the left rail under a "View errors (N)" collapsible link (hidden by default)
- [x] Error tray card list — shows: original card summary, error message, which worker failed, timestamp
- [x] **Retry** action — reruns the failing worker on the original card; moves card from `99-errors/pending` back to the worker's input tray `ready/` and the watcher re-triggers the worker
- [x] **Edit card and retry** — opens the card editor, lets the user modify fields, then retries
- [x] **Archive** action on error cards — parks the card permanently, removes from error count
- [x] **Failure notifications** — OS notification when a run fails (configurable in settings)
- [x] Error count badge on the left rail "View errors" link updates reactively
- [x] **No `ready` state for error cards** — the cards view in `99-errors/` only shows Pending and Archived tabs; errors never advance on their own
- [x] **Tone-coloured history timeline** — events in the card viewer use red/amber/green/neutral to match the project's global colour discipline

---

## Acceptance Criteria

- Failed cards appear in `99-errors/` with the error message visible
- Retry re-queues the card and triggers the worker
- Edit card and retry allows field modification before rerun
- Error count badge is accurate and updates in real time
