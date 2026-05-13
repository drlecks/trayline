# Phase N4.1 — Run History & Audit Log UI

**Estimate:** 3 days

---

## Goals

Surface run history and the audit log to the user.

---

## Tasks

- [ ] **Per-worker Runs tab** — table of runs with filters (status, date range)
  - Columns: timestamp, card ID, duration, status, result preview
  - Click a row → detail modal
- [ ] **Run detail modal** — full input/output JSON (pretty-printed), terminal log (xterm replay), audit entries for this run
- [ ] **Global History view** — top bar History icon → searchable feed of every event in the audit log across all projects
  - Filter by project, step, event type, date range
  - Each row expandable to show `details_json`
- [ ] **Export to CSV** button on global history view
- [ ] Search by card ID, step name, event type

---

## Acceptance Criteria

- Per-worker Runs tab shows all historical runs for that worker
- Clicking a run opens a modal with the full input/output and terminal replay
- Global history shows events across all projects with working filters
- CSV export contains the correct columns and data
