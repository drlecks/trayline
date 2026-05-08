# Phase 3 — Trays + Manual Cards

**Estimate:** 1.5 weeks

---

## Goals

Full tray management and the manual card creation/review loop.

---

## Tasks

- [ ] **Add tray step** modal flow (name, description, approval mode)
- [ ] **Schema builder** — drag-and-drop field builder in Tray Config tab
  - Field types: `text`, `textarea`, `number`, `date`, `select`, `file`, `checkbox`
  - Each field: label, required toggle, help text
- [ ] **Dynamic form render** from tray schema using `react-hook-form` + `zod`
- [ ] **Create card manually** — renders the dynamic form, writes `card_<timestamp>_<n>.json` to `cards/pending/`
- [ ] **Card list view** in right panel — filterable by Pending / Ready / Archived, shows summary, status badge, age
- [ ] **Card viewer** (read-only first) — fields, attachments section, worker output section (empty for manual trays), history timeline
- [ ] **Mark ready** action — atomically moves card from `pending/` to `ready/`; logs to audit log
- [ ] **Card history timeline** — vertical timeline rendered from `history[]` in the card JSON
- [ ] Audit log writes: `card_created`, `card_marked_ready`
- [ ] Tray `state/` folder writes: counters (`counters.json`)
- [ ] Tray status indicator in left rail — shows count of pending + ready cards, amber dot if overdue

---

## Acceptance Criteria

- User can add a tray, define its schema, create a card via the form, and mark it ready
- Card file is in `ready/` after marking ready
- Audit log contains correct entries
- Tray left-rail card shows the correct card count
