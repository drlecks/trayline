# Phase 10 — Scheduler

**Estimate:** 3 days

---

## Goals

Allow workers to run on a schedule instead of (or in addition to) being triggered by ready cards.

---

## Tasks

- [ ] **`node-cron` integration** in the main process — register/deregister cron jobs as workers are configured
- [ ] **Trigger mode UI** in Worker Config tab:
  - **On ready** (default) — fires when a card lands in previous tray's `ready/`
  - **Scheduled** — fires on a cron schedule, processes any cards in `ready/`
  - **Manual only** — never fires automatically
- [ ] **Friendly cron picker UI:**
  - Preset options: "Every hour", "Every day at 9am", "Every weekday at 9am", "Every 15 minutes"
  - "Custom" option reveals a cron expression input field with validation
- [ ] **"Run now"** button in worker detail view — manually triggers the worker regardless of trigger mode
- [ ] **Next scheduled run time** displayed in worker config when trigger is `scheduled`
- [ ] Cron schedules persist in `step.json` → `trigger.schedule_cron`
- [ ] Cron jobs reloaded on app launch from all `step.json` files

---

## Acceptance Criteria

- A worker set to "Every hour" fires every hour when the app is running
- The friendly picker produces the correct cron expression
- "Run now" triggers the worker immediately
- Next run time is shown correctly in the UI
