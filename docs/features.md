# Trayline — Feature Designs

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
- **Instructions**: full-screen markdown editor for `process.md` with side preview. Token estimate displayed. Variables like `{{card.data}}` and `{{context.brand-voice}}` autocomplete.
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
│  ☑ company-info.md    ☐ brand-voice.md                       │
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

Auto-created with every workflow. Hidden by default at the bottom of the left rail under a "View errors (2)" link.

- Lists failed runs with the original card and error message
- Cards in the error tray are only ever **pending** (waiting for the user) or **archived** (parked permanently) — there is no `ready` state, since errors do not advance on their own
- Each pending card offers two actions: **Retry** (moves the card back into the tray feeding the worker that failed, re-triggering the run via the watcher) and **Archive**
- The card viewer's history timeline is colour-coded by tone: red for `run_failed`, amber for `sent_back`, green for `run_completed` / `marked_ready`, neutral grey for routine events. This mirrors the project-wide colour discipline in `design-principles.md`.

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

- Top bar → **Skills** → **+ Add skill** → **Browse catalog** tab
- Fetches `https://raw.githubusercontent.com/[org]/trayline-skills/main/index.json`
- Index: list of `{id, name, description, version, download_url, tags}`
- Offline-friendly: if the index can't be fetched, the cached version is used
- **Installed** section shows installed skills with **Update** / **Uninstall**

---

## 7.12 Import / Export

- **Export**: zip the project folder. Add `manifest.json` at root listing skills (id + version) and MCPs the project uses. Credentials never export.
- **Import**: extracts to `projects/[id]/` → reads manifest → checks installed skills and MCPs → if missing, dialog groups them: "This project needs 2 skills and 1 MCP you don't have. Install them now?" — installs, then chains setup wizards for MCPs.
- **Export without runs** option excludes `runs/` folders.

---

## 7.13 Workflow Author

A first-class feature, not just a setup screen. Available whenever the user starts a new workflow.

- Single big textarea, five rotating example chips (clicking fills the textbox)
- **Generate workflow** calls `trayline-author` via AI Terminal Adapter
- During generation: centered loading circle with pre-written warm status messages
- Output: JSON workflow plan materialized to disk by `trayline-scaffold`
- **Regenerate**: edit description and try again; previous version archived to `<project>/.history/<timestamp>/`
- **Edit before scaffolding** (post-MVP): preview the proposed plan and tweak before files are written

The author skill is in `skills/_system/` — power users can edit the master prompt to bias it toward their domain.

---

## 7.14 System Skills (`skills/_system/`)

Two skills ship with the app. Restored from bundled app resources on every launch if missing or corrupted.

- **`trayline-author`** — takes a free-text description, returns a structured workflow plan (JSON: ordered steps, schemas, recommended skills and MCPs per worker, draft `process.md` per worker)
- **`trayline-scaffold`** — takes a workflow plan and writes it to disk using bundled JSON/MD templates; can be overridden by power users to add custom defaults to every project

---

## 7.15 Persistent Footer

A thin strip rendered at the bottom of every screen, always visible. The right side shows live AI usage indicators that refresh on a 10-second poll.

**What it shows (right side):**
- **5h window** — percentage of the active AI agent's 5-hour rolling rate-limit window consumed
- **Weekly window** — percentage of the agent's weekly rate-limit window consumed

**Behaviour:**
- Polls the main process every 10 seconds via the `usage:get` IPC channel
- Values ≥ 80 % render in amber to flag impending throttling
- When usage data is unavailable (no agent installed, fetch failed, MVP placeholder mode), each indicator shows `—`
- Hovering the indicators shows a tooltip with the data source (`claude-code` / `placeholder` / `unavailable`) and the timestamp of the last snapshot

**Data source:**
- The footer queries `usageService.getSnapshot()` in the main process.
- **Currently:** returns `{ fiveHourPct: null, weeklyPct: null, source: 'unavailable' }` — Claude Code does not surface window state through any non-interactive entry point, so we render `—` instead of fabricating numbers.
- **Phase 4 plan:** as the worker engine spawns Claude Code runs, accumulate the per-call token usage from the CLI's JSON envelope (`usage.input_tokens` + `output_tokens`) into rolling 5-hour and 7-day buckets. This gives a lower bound that's accurate for Trayline-spawned work; usage from the user's other Claude Code sessions remains invisible.
- **Long-term:** if Anthropic ships a CLI flag or subcommand that prints true window state, swap that in.

**Left half:** currently empty, reserved for future use (project breadcrumbs, sync status, version, etc.).

See `docs/design-principles.md` → **Footer** for visual specification.

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
│  [Run now]   [Pause schedule]                               │
└──────────────────────────────────────────────────────────────┘
```

**Schedule picker** shows friendly labels ("Every 5 minutes", "Every hour", "Every day at 9am", "Custom") and renders the resulting cron expression below the picker so users can verify it.

**First run** mode only applies the very first time the source runs (when `seen-ids.json` is empty or absent). After the first run it has no effect.

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
