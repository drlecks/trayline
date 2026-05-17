# Trayline — Feature Designs

---

## 7.0 Project List Screen

The default landing screen on launch when at least one project exists on disk. (When the projects folder is empty, the app opens the Workflow Author flow directly instead.)

- Pill list, ordered by `project.json:updated_at` descending — most recently changed project first.
- The first row is always a dashed **+ Create new project** pill that opens the Workflow Author flow.
- Each project pill shows: status dot · display name · description · relative timestamp · delete (on hover).
- The status dot is **green** for `active`, **red** for `inactive`, and clickable to toggle. Toggling persists `status` and bumps `updated_at` in the project's `project.json`. The status field is a forward-looking hook — it does not gate execution today.
- Clicking the pill body opens the project. The top-bar project switcher exposes an **All projects** entry that returns to this screen.

---

## 7.1 Linear Workflow Editor (Left Rail)

- Vertical stack of step cards, drag-to-reorder
- **+ Add step** button at the bottom
- Connector line between steps (simple vertical line + arrow chevron)
- Selecting a step highlights it and loads its detail view on the right
- Right-click on a step: **Rename**, **Duplicate**, **Delete**, **Insert step above/below**

---

## 7.2 Tray Detail View (Right Panel)

Tabs: **Cards** / **Config** / **Schema**

- **Cards**: filterable list (Pending / Ready / Archived), each row shows summary, status, age. Click → full card view.
- **Config**: name, description, color, approval mode (manual/auto), allow-manual-create toggle
- **Schema**: drag-and-drop field builder. Field types: `text`, `textarea`, `number`, `date`, `select`, `file`, `checkbox`. Each field has label, required toggle, help text.

---

## 7.3 Worker Detail View (Right Panel)

Tabs: **Config** / **Instructions** / **Runs** / **Skills, MCPs & Context**

- **Config**: name, description, command (default `claude`), timeout, trigger mode, schedule cron (if scheduled)
- **Instructions**: full-screen markdown editor for `process.md` with side preview. Token estimate displayed. Variables like `{{card.data}}` and `{{context._brand-voice}}` autocomplete.
- **Runs**: history table, click for detail
- **Skills, MCPs & Context**: three blocks:

```
┌──────────────────────────────────────────────────────────────┐
│  Skills                                                       │
│  ☑ PDF Reader    ☑ CSV Parser    ☐ Email Sender              │
│                                                              │
│  MCPs                                                         │
│  ☑ Gmail                              ✓ Ready                │
│  ☑ Google Calendar           ⚠ Setup needed [Configure ›]    │
│  ☐ Google Drive                                              │
│                                                              │
│  Context Packs                                                │
│  ☑ company-info.md    ☐ _brand-voice.md (always included)    │
└──────────────────────────────────────────────────────────────┘
```

Each MCP shows its current status. If marked but in *Setup needed*, an inline button starts the wizard without leaving the worker screen.

---

## 7.4 Card Viewer / Editor

- Header: card ID, current step, age, history button
- **Fields** section: rendered from the tray's schema, editable if the tray allows
- **Attachments** section: images inline, PDFs as thumbnails, others as filename + download
- **Worker output** section: only present if the card came from a worker — rendered view + raw JSON toggle
- **History timeline**: vertical timeline of every event on this card across the whole workflow
- **Action bar** (sticky bottom): **Mark ready** / **Send back** / **Archive**

---

## 7.5 Run History & Audit Log

- Per-worker view: table of runs with filters (status, date range)
- Global view: top bar → **History** icon → searchable feed of every event across all projects
- Each row expandable to show details
- Export to CSV button

---

## 7.6 Human Review Tray

A tray with `approval_mode: "manual"`. Card sits in `pending/` until a person acts. Action bar:

- **Mark ready** — moves to `ready/`, next step fires
- **Edit & mark ready** — modify fields then advance
- **Send back** — returns card to previous step's `pending/` with a note added to history
- **Archive** — moves to `archived/`, ends the card's journey here

---

## 7.7 Error Tray (`99-errors/`)

Auto-created with every workflow. Hidden by default at the bottom of the left rail under a collapsible **"View errors (N)"** link. The link shows a red count badge when there are pending error cards; clicking it expands to reveal the error tray step card.

**Card list** shows for each failed card:
- Original card summary (first field value)
- Error message (from the `run_failed` history entry's note)
- Which worker failed (step id from that history entry)
- How long ago it failed

**Actions on each pending error card:**
- **Retry** — moves the card back into the tray feeding the worker that failed; the watcher re-triggers the run automatically
- **Edit and retry** — opens the card in an editor using the source tray's field schema, lets the user modify values, then retries
- **Archive** — parks the card permanently, removes it from the error count

Cards in the error tray are only ever **pending** (waiting for the user) or **archived** (parked permanently) — there is no `ready` state, since errors do not advance on their own.

The card viewer's history timeline is colour-coded by tone: red for `run_failed`, amber for `sent_back`, green for `run_completed` / `marked_ready`, neutral grey for routine events. This mirrors the project-wide colour discipline in `design-principles.md`.

**Failure notifications** — when a run fails, an OS notification is shown (if the platform supports it). This can be toggled in Settings → Notifications.

---

## 7.7a Notifications & Badge (N6.3)

### OS push notifications

When a card lands in a manual-approval tray while the app is not focused:
- An OS notification fires with the tray name as title and the card's title/subject/name (from `data`) as body (falls back to "A card needs your review")
- Clicking the notification restores the app window and navigates directly to the card in the appropriate tray panel
- Notifications are deduplicated per session: the same `cardId` will not trigger a second notification until `clearNotified` is called (which happens when the card is approved or discarded)
- If the app window is currently focused, notifications are suppressed (the in-app badge and queue bell are sufficient)
- Requires `Notification.isSupported()` to be true; silently no-ops on platforms without notification support

### Badge / taskbar overlay

Shows the total number of cards waiting for review:
- **macOS** — red dot with number on the dock icon (`app.setBadgeCount`)
- **Windows** — red circle with count drawn as SVG via `BrowserWindow.setOverlayIcon`; cleared when count is 0
- **Linux** — `app.setBadgeCount` (visible on Unity/GNOME; no-op on other desktops)
- Count is refreshed after every card-state change (add/remove in pending dirs) and once at app startup

### Settings → Notifications

| Control | Behaviour |
|---|---|
| Global toggle "Notify when cards need review" | Turns all OS notifications on/off; badge is unaffected |
| Per-project toggles (shown when global is on) | Suppress notifications from a specific project without affecting others |
| "Clear notification history" button | Empties the in-session dedup set so the same cards can re-notify (useful after a session break) |

---

## 7.8 Context Packs

- `context/` folder in the project root holds markdown files
- Workers list which context files to include in their **Skills, MCPs & Context** tab
- At run time, included files are concatenated into the prompt under a `## Context` section
- A simple file editor in the project sidebar lets the user create/edit context packs
- Examples: company FAQ, brand voice guide, common product list, escalation rules

---

## 7.9 Scheduler (Per-Worker)

**Trigger modes:**
- **On ready** (default) — fires when a card lands in the previous tray's `ready/`
- **Scheduled** — fires on a cron schedule, processes any cards in the previous tray's `ready/`
- **Manual only** — never fires automatically; user clicks **Run now**

Cron shown as a friendly picker: "Every hour", "Every weekday at 9am", "Custom (cron expression)".

---

## 7.10 Terminal Integration (Three Layers)

**Layer 1 — Status pill** (left rail step card)

| State | Appearance |
|---|---|
| idle | gray dot |
| running | `⚙ Running 14s` — animated, accent color |
| awaiting input | `⚡ Awaiting input` — pulsing amber |
| done | `✓ Done 2m ago` — green check, fades after 30s |
| failed | `⚠ Failed` — red triangle |

**Layer 2 — Run summary card** (default right panel after a run)
- ✓ or ✗ outcome with one-line reason
- Card processed (link), skills used, MCPs active, duration, token count if available
- Rendered output preview
- **Show terminal ↓** toggle

**Layer 3 — Embedded terminal**
- xterm.js panel with saved `terminal.log` (replay for completed runs, live stream for active)
- Scroll, search (Ctrl/Cmd+F), copy
- **Interactive typing** — keystrokes flow straight into the running PTY whenever the run is `running` or `awaiting_input`; the panel is read-only after the run ends
- **Open in external terminal** — launches the OS terminal (Windows Terminal / Terminal.app / x-terminal-emulator) in the run directory so the user can re-execute by hand

The user never has to open the terminal to use Trayline. But it's always one click away.

---

## 7.11 Skill Finder

- Top bar → **Skills** (lucide `Package` icon) → opens the Skills screen
- **Installed** section lists installed user skills (not `_system`) with **Update** / **Uninstall**
  - **Uninstall** is disabled with a tooltip naming the workers when any worker still references the skill in its `step.json` → `skills: []`
  - **Update** is shown for skills installed from the catalog or a URL
- **+ Add skill** opens a modal with two tabs
  - **Browse catalog** — fetches `https://raw.githubusercontent.com/trayline/trayline-skills/main/index.json`, falls back to the cached copy at `app-data/skills-index-cache.json` when offline. Search box filters across name, description, and tags
  - **From URL** — pastes a base URL containing `skill.json` and `skill.md`; phase 8 only accepts those two files, full validation (executable rejection, multi-file skills) lands in N2.1
- Catalog entry shape used by phase 8:
  - `{ id, name, version, description, author?, tags?, base_url, files? }`
  - `base_url` is a directory URL (trailing slash optional); `files` defaults to `["skill.json", "skill.md"]`
- Installed `skill.json` records the install source in `_trayline.source` (`catalog` / `url` / `system` / `local`) and `_trayline.source_url` so **Update** knows where to re-fetch from

---

## 7.12 Import / Export

- **Export**: zip the project folder. Add `manifest.json` at root listing skills (id + version) and MCPs the project uses. Credentials never export.
- **Import**: extracts to `projects/[id]/` → reads manifest → checks installed skills and MCPs → if missing, dialog groups them: "This project needs 2 skills and 1 MCP you don't have. Install them now?" — installs, then chains setup wizards for MCPs.
- **Export without runs** option excludes `runs/` folders.

---

## 7.13 Workflow Author

A first-class feature, not just a setup screen. Available whenever the user starts a new workflow.

- Single big textarea, seven rotating example chips — two are source-first examples (clicking fills the textbox)
- **Generate workflow** calls `trayline-author` via AI Terminal Adapter
- During generation: centered loading circle with pre-written warm status messages (pool includes source-aware messages: "Setting up your data source…", "Configuring the schedule…", "Wiring up deduplication…")
- Output: JSON workflow plan materialized to disk by `trayline-scaffold`
- **Post-generation banner**: when the plan includes a Source step, a banner is shown before navigating to the project — it tells the user to open the Source step and write their fetch instructions. If unconfigured MCPs are also required, the banner names them.
- **Regenerate**: edit description and try again; previous version archived to `<project>/.history/<timestamp>/`
- **Edit before scaffolding** (post-MVP): preview the proposed plan and tweak before files are written

The `trayline-author` skill understands:
- **Source steps** (`kind: "source"`): generated when the description involves polling, monitoring, or ingesting from an external source on a schedule. The plan includes `schedule_cron`, `dedup.key`, `dedup.first_run`, and a draft `source.md`.
- **Batch workers** (`batch_mode: true`): generated when the description involves summarising or digesting many items into one output. The plan sets `batch_max` and coerces the trigger to `scheduled` or `manual`.

The author skill is in `skills/_system/` — power users can edit the master prompt to bias it toward their domain.

---

## 7.14 System Skills (`skills/_system/`)

Two skills ship with the app. Restored from bundled app resources on every launch if missing or corrupted.

- **`trayline-author`** — takes a free-text description, returns a structured workflow plan (JSON: ordered steps, schemas, recommended skills and MCPs per worker, draft `process.md` per worker)
- **`trayline-scaffold`** — takes a workflow plan and writes it to disk using bundled JSON/MD templates; can be overridden by power users to add custom defaults to every project

---

## 7.15 Persistent Footer

A thin strip rendered at the bottom of every screen, always visible. The right side shows the active adapter selection and rolling usage indicators.

**What it shows (right side):**
- **Provider · Model · Effort** — the active AI Terminal Adapter, selected model, and effort tier. Always visible.
- **5h window** — percentage of the 5-hour rolling rate-limit window consumed. Hidden for adapters that don't implement `getUsage()`.
- **Weekly window** — percentage of the weekly rate-limit window consumed. Hidden when unavailable.

**Behaviour:**
- Values refresh whenever a worker run completes (main process broadcasts `adapters:onUsageUpdate`) and via manual refresh in Settings
- Usage values ≥ 80 % render in amber to flag impending throttling
- Adapters without `getUsage()` show only the Provider · Model · Effort segment; no placeholder dashes

**Left half:** currently empty, reserved for future use (project breadcrumbs, sync status, version, etc.).

See `docs/design-principles.md` → **Footer** and `docs/tech-stack.md` → **Provider / model / effort selection** for the full specification.

---

## 7.16 Source Step

### Left Rail Card

The Source step card in the left rail displays:

```
┌────────────┐
│ ⌁ Comments │   ← name, rss icon
│ 5 new · 23 seen │   ← after last run
│ next: 3m   │   ← countdown to next scheduled run
└────────────┘
```

Status states on the left rail card:

| State | Display |
|---|---|
| Idle (scheduled) | countdown to next run: `next: 3m` |
| Running | `⚙ Fetching...` — animated, accent color |
| Done | `5 new · 23 seen` — green accent, fades to normal after 30s |
| Failed | `⚠ Failed` — red triangle; last error shown in detail panel |
| Never run | `Not run yet` — gray |

### Source Detail Panel (Right Canvas)

Two tabs: **Source** and **Config**.

**Source tab** — full-screen markdown editor for `source.md`. Same editor as the Worker instructions editor (side preview, token estimate, variable autocomplete). The user writes what the AI should fetch and the exact JSON output format it must return.

**Config tab:**

```
┌──────────────────────────────────────────────────────────────┐
│  Name          [Instagram Comments              ]            │
│  Description   [Polls for new comments every 5 min]          │
│                                                              │
│  Schedule      [Every 5 minutes            ▼] [Custom...]   │
│                cron: */5 * * * *                             │
│                                                              │
│  Dedup key     [id                          ]               │
│  Max memory    [10000                       ]               │
│                                                              │
│  First run     ○ Skip existing (default)                     │
│                ○ Process all                                 │
│                ○ Process last N  [N: ___]                    │
│                                                              │
│  Adapter       [claude-code ▼]   Timeout [60s]              │
│                                                              │
│  MCPs          ☑ Instagram                     ✓ Ready       │
│                ☐ GitHub                                      │
│                                                              │
│  [Run now]   [Pause schedule]                               │
└──────────────────────────────────────────────────────────────┘
```

**Schedule picker** shows friendly labels ("Every 5 minutes", "Every hour", "Every day at 9am", "Custom") and renders the resulting cron expression below the picker so users can verify it.

**First run** mode only applies the very first time the source runs (when `seen-ids.json` is empty or absent). After the first run it has no effect.

**Adapter selector** — dropdown of all installed AI Terminal Adapters. Defaults to the global default. Per-source overrides persist in `step.json → execution.adapter`. *(Pending implementation — see N3.2)*

**MCPs** — a checklist of installed MCPs the source can activate for its runs. Source steps follow the same pre-flight and credential-injection rules as workers: if a selected MCP is not Ready, the run is aborted before starting. *(Pending implementation — see N3.1 / N3.2)*

**Run now** fires the source immediately, outside the cron schedule. Useful for testing `source.md` before relying on the schedule.

**Pause schedule** suspends the cron without deleting the step. The left rail card shows `⏸ Paused`.

### Run History

A **Runs** sub-tab (inside the Config tab, or a third top-level tab) shows a table of past source runs:

| Column | Content |
|---|---|
| Time | ISO timestamp |
| Duration | ms or seconds |
| Items found | Total items the AI returned |
| Items new | Cards created this run |
| Status | ✓ / ⚠ |

Clicking a row shows the raw AI output, the list of new IDs found, and any error detail.

---

## 7.17 Batch Worker Mode

Workers have an optional **Batch mode** toggle in their Config tab. When enabled:

- The worker receives **all** cards currently in the previous step's `ready/` folder as a JSON array (up to `batch_max` items).
- It produces **one** output card.
- All input cards are archived after the batch run completes successfully.
- The trigger must be `scheduled` or `manual` — batch workers do not fire on individual card arrivals.

### Config Tab (Batch toggle)

```
┌──────────────────────────────────────────────────────────────┐
│  Batch mode    [●  On]                                        │
│  Max cards     [50    ]   (leave blank for no limit)          │
└──────────────────────────────────────────────────────────────┘
```

When batch mode is on, the left rail card shows a stacked-cards icon to distinguish it visually from a single-card worker.

### Typical use case

A Source step polls Hackernews every 30 minutes and creates one card per new story. A Batch Worker runs once a day on a schedule, picks up all accumulated story cards, and produces a single digest email card. The digest worker's `process.md` receives the full array and summarises everything into one output.

### Input format

The batch worker's AI receives a JSON object:

```json
{
  "cards": [
    { "id": "card_001", "data": { ... } },
    { "id": "card_002", "data": { ... } }
  ],
  "count": 2
}
```

The `process.md` instructs the AI how to synthesise the array into one output.

---

## 7.18 Local AI Model — Download & Management

When the **local-llm** adapter is registered, several UI surfaces expose model management.

### AdapterSetupScreen — local-llm card

The `AdapterSetupScreen` (shown when no adapter is ready at startup) renders one card per registered production adapter. The local-llm card diverges from the standard card in three ways:

1. **No "Install guide" link** — there is no external install; the model is downloaded inside the app.
2. **"Download local model" button** — opens the `ModelDownloadModal`. Only shown when no model has been downloaded yet.
3. **"Check again" button** — shown instead when a model is already downloaded. Triggers `adapter.recheck()` to update readiness without re-downloading.

### ModelDownloadModal

A four-state dialog reachable from `AdapterSetupScreen` and from Settings → Local AI model.

| State | UI |
|---|---|
| `idle` | Radio list of available models (from `local-models.json` catalog). Each row shows label, description, file size in MB, and "Recommended" / "Downloaded" badges. |
| `downloading` | Progress bar (downloaded / total bytes and %). Cancel link. Dialog cannot be dismissed while downloading. |
| `complete` | Green check, "Model ready" heading, "Start using Trayline" button — calls `localModel.recheckAdapter()` then `onReady()`. |
| `error` | Error description, "Try again" button returns to idle. |

The `onOpenChange` prop is blocked during `downloading` state (both outside-click and Escape key) to prevent partial downloads from being abandoned silently.

### Settings → Local AI model

A dedicated section in Settings (visible only when local-llm is in the adapter registry) shows:

- List of already-downloaded models with their label and a **Delete** button per model.
- A "Download another model" link (when at least one is downloaded) or a "Download a model now" link (when none are).
- Both links open `ModelDownloadModal`.

### Workflow Author warning

When the active adapter is `local-llm`, a soft amber note appears below the textarea in the Workflow Author screen:

> **Using local AI model.** Workflow generation works best with Claude Code — local models may produce simpler or incomplete plans. You can edit the result after creation.

### MCPs screen badge

Each installed MCP in the MCPs screen shows a "Not available with local AI model" badge when the active adapter has `supportsMcps: false`. The badge is informational — it does not block installation or configuration.

---

## 7.18 Onboarding Tour

A one-time guided tour that runs the first time the user launches the app. Implemented as an overlay with a dimmed backdrop and a highlight ring around the currently-described region.

- Walks through: the welcome screen, the top bar, the left rail of workflow steps, the right detail panel, and a closing card.
- The tour reads `data-tour="..."` attributes on key DOM regions (`topbar`, `left-rail`, `detail-panel`) so its position adapts to the current screen.
- "Skip tour" and the final "Done" button both flip `settings.onboardingComplete` to `true`. The tour will not auto-launch again.
- A **Run onboarding tour** button under **Settings → Help** re-triggers it whenever the user wants a refresher.

---

## 7.19 Keyboard Shortcuts

A small set of global shortcuts wired through `useGlobalShortcuts`. They are skipped while the user is typing in an input or contenteditable element, with the deliberate exception of the command palette (which uses the same global shortcut convention as Slack, VS Code, etc.).

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+N | New card in the selected tray |
| ⌘/Ctrl+, | Open Settings |
| ⌘/Ctrl+K | Open the command palette |
| ⌘/Ctrl+/ | Open the keyboard-shortcuts reference dialog |

The **command palette** (⌘/Ctrl+K) is a quick-jump search: type to filter steps in the current workflow, other projects, and the Settings / Skills / Shortcuts screens. ↑/↓ navigate, Enter activates.

A **Keyboard shortcuts** button under **Settings → Help** opens the same reference dialog as ⌘/Ctrl+/.
