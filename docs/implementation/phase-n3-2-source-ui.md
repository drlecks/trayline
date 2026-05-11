# Phase N3.2 — Source Step UI

**Estimate:** 1 week

**Depends on:** Phase N3.1 (Source Engine)

---

## Goals

Build the full UI for Source steps: the left rail card with live status, the Source detail panel (instructions editor + config), the "Add Source step" flow, and run history. The engine is already complete; this phase wires the renderer to its IPC events.

---

## Tasks

### Add Step Flow

- [ ] Update the **+ Add step** modal to include a third option: **Source** (with `rss` icon, green accent, description: "Fetch new data on a schedule")
- [ ] When **Source** is chosen, show an inline creation form:
  - Name field
  - Schedule picker (friendly labels + cron expression preview beneath)
  - Dedup key field (with placeholder `id`)
- [ ] On submit: call a new IPC handler `source:create` that scaffolds the step folder (writes `step.json`, blank `source.md`, creates `state/` and `cards/ready/` and `cards/archived/`)
- [ ] New Source step is inserted at position 0 in the workflow (always first); all existing steps are renumbered on disk
- [ ] After creation, the Source detail panel opens automatically on the **Source** (instructions) tab

### Left Rail Card (`SourceStepCard` component)

- [ ] Create `src/renderer/components/project/SourceStepCard.tsx`
- [ ] Display: `rss` icon, step name, status line
- [ ] Status line variants:
  - Never run: `Not run yet` (gray)
  - Running: `⚙ Fetching...` (animated pulse, green accent)
  - Done: `N new · M seen` (green, fades to gray after 30s)
  - Failed: `⚠ Failed` (red triangle)
  - Paused: `⏸ Paused` (gray)
  - Idle/scheduled: `next: Xm` — countdown to next scheduled run, updated every second
- [ ] Subscribe to `source:run-started`, `source:run-completed`, `source:run-failed` IPC events to update live state
- [ ] Poll `source:get-state` on mount and on focus to initialise counters + next-run time
- [ ] Clicking the card selects it and loads the Source detail panel in the right canvas

### Source Detail Panel (`SourceDetailPanel` component)

- [ ] Create `src/renderer/components/project/SourceDetailPanel.tsx`
- [ ] Two top-level tabs: **Source** and **Config**

**Source tab:**
- [ ] Full-screen markdown editor for `source.md` (reuse the same editor component as Worker instructions)
- [ ] Side preview toggle
- [ ] Token estimate displayed (reuse worker token estimate logic)
- [ ] Auto-save on blur; dirty indicator when unsaved changes exist
- [ ] Prompt hint shown when `source.md` is blank: *"Write instructions for what the AI should fetch. Specify the JSON output format and which field is the unique ID."*

**Config tab:**
- [ ] Name field (editable, auto-saves to `step.json`)
- [ ] Description field
- [ ] Schedule picker: friendly labels dropdown ("Every minute", "Every 5 minutes", "Every 15 minutes", "Every hour", "Every day at 9am", "Custom") + cron expression input that updates when a preset is chosen; editable directly for custom expressions; cron expression rendered in plain English beneath the input (use a cron-parser library)
- [ ] Dedup key field
- [ ] Max memory field (number input, default 10000)
- [ ] First run mode: radio group (`skip_existing` / `process_all` / `process_last_n`) with an N input that appears when `process_last_n` is selected
- [ ] Adapter selector (dropdown of registered adapters, default `claude-code`)
- [ ] Timeout field (seconds)
- [ ] **Run now** button — calls `source:run-now`; button shows spinner while running; disabled if already running
- [ ] **Pause schedule** / **Resume schedule** toggle button — calls `source:pause` / `source:resume`; updates visual state immediately
- [ ] All config fields auto-save on blur; show unsaved indicator if not yet persisted

**Runs sub-section (inside Config tab or as a third tab):**
- [ ] Table of past source runs pulled from the audit log via `audit:query` IPC
- [ ] Columns: Time, Duration, Items found, Items new, Status (✓ / ⚠)
- [ ] Click a row → expand detail: raw AI output snippet, list of new item IDs created, error message if failed
- [ ] Empty state: "No runs yet. Click Run now to test."

### Schedule Picker Component

- [ ] Create `src/renderer/components/shared/SchedulePicker.tsx` — reusable for both Source and Worker scheduled trigger
- [ ] Props: `value: string` (cron expression), `onChange: (cron: string) => void`
- [ ] Renders friendly label dropdown + raw cron input + human-readable description
- [ ] Validate cron expression on change; show inline error for invalid expressions

### Live State Wiring

- [ ] Subscribe to `source:run-started` → set status to Running, start elapsed timer
- [ ] Subscribe to `source:run-completed` → update `items_new`, `items_found`, set Done state, schedule fade after 30s
- [ ] Subscribe to `source:run-failed` → set Failed state, surface error message in detail panel
- [ ] Next-run countdown: compute from `nextRunAt` returned by `source:get-state`; update every second via `setInterval`

---

## Acceptance Criteria

- The **+ Add step** modal offers a Source option; choosing it creates the step folder and opens the detail panel
- The left rail card accurately reflects all status states and the countdown updates in real time
- Writing `source.md` and clicking **Run now** triggers a source run; the left rail card transitions through Running → Done with correct item counts
- All Config fields save correctly to `step.json` and round-trip through the UI on reload
- Pause/resume persists across app restarts
- The Runs table shows an accurate history of past runs
- The schedule picker validates cron expressions and shows a plain-English description
