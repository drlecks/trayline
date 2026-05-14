# Phase 9 — Human Review Polish

**Estimate:** 3 days

---

## Goals

Complete the manual card review experience and add the global queue view.

---

## Tasks

- [x] **Card editor** — editable fields (not just read-only viewer) when the tray allows it
- [x] **Send back** flow — returns card to previous step's `pending/` with a note appended to `history[]`
- [x] **Edit & mark ready** — modify fields in the card viewer, then advance in one action
- [x] **Archive** action — moves card to `archived/`, ends the card's journey at this step
- [x] **"My Queue" global view** — top bar 🔔 notification badge:
  - Lists all cards in manual-approval trays across all projects
  - Grouped by project, sorted by oldest first
  - One-click jump to the card
  - Badge count updates reactively via chokidar
- [x] Notifications for items waiting on the user (OS notification via Electron when new card lands in a manual tray)

---

## Acceptance Criteria

- User can edit a card's fields and mark it ready in one flow
- Send back returns the card to the correct previous step with the note in history
- The My Queue badge count is correct and updates in real time
- OS notification fires when a card lands in a manual-approval tray
