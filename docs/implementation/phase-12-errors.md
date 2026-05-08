# Phase 12 — Errors & Retry

**Estimate:** 2 days

---

## Goals

Make the error tray useful and give users clear paths to recover from failures.

---

## Tasks

- [ ] **Error tray UI** — `99-errors/` tray shown at the bottom of the left rail under a "View errors (N)" collapsible link (hidden by default)
- [ ] Error tray card list — shows: original card summary, error message, which worker failed, timestamp
- [ ] **Retry** action — reruns the failing worker on the original card; moves card from `99-errors/` back to the worker's input tray `ready/` and triggers the worker
- [ ] **Edit card and retry** — opens the card editor, lets the user modify fields, then retries
- [ ] **Archive** action on error cards — parks the card permanently, removes from error count
- [ ] **Failure notifications** — OS notification when a run fails (configurable in settings)
- [ ] Error count badge on the left rail "View errors" link updates reactively

---

## Acceptance Criteria

- Failed cards appear in `99-errors/` with the error message visible
- Retry re-queues the card and triggers the worker
- Edit card and retry allows field modification before rerun
- Error count badge is accurate and updates in real time
