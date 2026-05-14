# Phase N3.2 — Source Step UI

**Estimate:** 1 week

**Depends on:** Phase N3.1 (Source Engine)

---

## Goals

Build the full UI for Source steps: the left rail card with live status, the Source detail panel (instructions editor + config), the "Add Source step" flow, and run history. The engine is already complete; this phase wires the renderer to its IPC events.

---

## Tasks

### Add Step Flow

- [x] Update the **+ Add step** modal to include a third option: **Source** (with `rss` icon, green accent, description: "Fetch new data on a schedule")
- [x] When **Source** is chosen, show an inline creation form:
  - Name field
  - Schedule picker (friendly labels + cron expression preview beneath)
  - Dedup key field (with placeholder `id`)
- [x] On submit: call a new IPC handler `source:create` that scaffolds the step folder (writes `step.json`, blank `source.md`, creates `state/` and `cards/ready/` and `cards/archived/`)
- [x] New Source step is inserted at position 0 in the workflow (always first); all existing steps are renumbered on disk
- [x] After creation, the Source detail panel opens automatically on the **Source** (instructions) tab

### Left Rail Card (`SourceStepCard` component)

- [x] Source card rendering integrated into `StepCard` in `src/renderer/components/project/ProjectScreen.tsx` (no separate file needed — existing card component is parameterised by step kind)
- [x] Display: `rss` icon, step name, status line
- [x] Status line variants:
  - Never run: `Not run yet` (gray)
  - Running: `⚙ Fetching...` (animated pulse, green accent)
  - Done: `N ready` card count badge
  - Paused: `⏸ Paused` (gray, via SourceDetailPanel header)
  - Idle/scheduled: countdown shown in SourceDetailPanel header
- [x] Subscribe to `source:run-event` IPC channel to update live running state in left rail
- [x] Poll card counts on mount to initialise `ready` count display
- [x] Clicking the card selects it and loads the Source detail panel in the right canvas

### Source Detail Panel (`SourceDetailPanel` component)

- [x] Create `src/renderer/components/project/SourceDetailPanel.tsx`
- [x] Three top-level tabs: **Source**, **Config**, **Runs**

**Source tab:**
- [x] Side-by-side markdown editor + live preview for `source.md`
- [x] Dirty indicator (Save/Reset buttons enabled only when content differs from saved)
- [x] Prompt hint shown when `source.md` is blank: *"Write instructions for what the AI should fetch. Specify the JSON output format and which field is the unique ID."*
- [ ] Token estimate displayed

**Config tab:**
- [x] Name field (editable, auto-saves to `step.json` on blur)
- [x] Description field
- [x] Schedule picker (friendly presets + Custom raw input + plain-English description)
- [x] Dedup key field
- [x] Max memory field (number input, default 10000)
- [x] First run mode: dropdown (`skip_existing` / `process_all` / `process_last_n`) with N input appearing when `process_last_n` is selected
- [ ] Adapter selector (dropdown of registered adapters, default `claude-code`)
- [x] Timeout field (seconds)
- [x] **Run now** button — calls `source:run-now`; disabled while running; guarded by provider-ready check
- [x] **Pause schedule** / **Resume schedule** toggle button — calls `source:pause` / `source:resume`; updates visual state immediately

**Runs tab (separate from Config):**
- [x] Table of past source runs from `source:list-runs` (sorted newest first)
- [x] Columns: Time, Duration, Items found, Items new, Status (✓ / ⚠)
- [x] Click a row → expand detail with error message when failed
- [x] Empty state: "No runs yet. Click Run now to test."
- [x] Auto-refreshes after each run completes via `source:run-event` subscription

### Schedule Picker Component

- [x] Create `src/renderer/components/shared/SchedulePicker.tsx` — reusable for both Source and Worker scheduled trigger
- [x] Props: `value: string` (cron expression), `onChange: (cron: string) => void`, `label?: string`
- [x] Renders friendly label dropdown + raw cron input (shown for Custom only) + human-readable description
- [x] Validate cron expression on change; show inline error for invalid expressions

### Live State Wiring

- [x] Subscribe to `source:run-event` → `type: 'started'` sets Running state in both left rail and detail panel
- [x] Subscribe to `source:run-event` → `type: 'completed'` refreshes counters, clears Running state
- [x] Subscribe to `source:run-event` → `type: 'failed'` clears Running state
- [x] Next-run countdown: computed from `nextRunAt` returned by `source:get-state`; `setInterval` updates every second via `NextRunCountdown` component

---

## Acceptance Criteria

- The **+ Add step** modal offers a Source option; choosing it creates the step folder and opens the detail panel
- The left rail card accurately reflects all status states and the countdown updates in real time
- Writing `source.md` and clicking **Run now** triggers a source run; the left rail card transitions through Running → Done with correct item counts
- All Config fields save correctly to `step.json` and round-trip through the UI on reload
- Pause/resume persists across app restarts
- The Runs table shows an accurate history of past runs
- The schedule picker validates cron expressions and shows a plain-English description
