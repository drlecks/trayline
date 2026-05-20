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

Tabs: **Config** / **Instructions** / **Runs** / **Context**

- **Config**: name, description, command (default `claude`), timeout, trigger mode, schedule cron (if scheduled)
- **Instructions**: full-screen markdown editor for `process.md` with side preview. Token estimate displayed. Variables like `{{card.data}}` and `{{context._brand-voice}}` autocomplete.
- **Runs**: history table, click for detail
- **Context**: context packs checklist:

```
┌──────────────────────────────────────────────────────────────┐
│  Context Packs                                                │
│  ☑ company-info.md    ☐ _brand-voice.md (always included)    │
└──────────────────────────────────────────────────────────────┘
```

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
- Workers list which context files to include in their **Context** tab
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
- Card processed (link), duration, token count if available
- Rendered output preview
- **Show terminal ↓** toggle

**Layer 3 — Embedded terminal**
- xterm.js panel with saved `terminal.log` (replay for completed runs, live stream for active)
- Scroll, search (Ctrl/Cmd+F), copy
- **Interactive typing** — keystrokes flow straight into the running PTY whenever the run is `running` or `awaiting_input`; the panel is read-only after the run ends
- **Open in external terminal** — launches the OS terminal (Windows Terminal / Terminal.app / x-terminal-emulator) in the run directory so the user can re-execute by hand

The user never has to open the terminal to use Trayline. But it's always one click away.

---

## 7.12 Import / Export

- **Export**: zip the project folder. Adds a `manifest.json` at root with version and timestamp. Credentials never export.
- **Import**: extracts to `projects/[id]/` → validates `project.json` exists → runs a security audit for suspicious content → if findings exist, shows a review dialog before committing.
- **Export without runs** option excludes `runs/` folders.

---

## 7.13 Workflow Author

A first-class feature, not just a setup screen. Available whenever the user starts a new workflow.

- Single big textarea, seven rotating example chips — two are source-first examples (clicking fills the textbox)
- **Generate workflow** calls `trayline-author` via AI Terminal Adapter
- During generation: centered loading circle with pre-written warm status messages (pool includes source-aware messages: "Setting up your data source…", "Configuring the schedule…", "Wiring up deduplication…")
- Output: JSON workflow plan materialized to disk by `trayline-scaffold`
- **Post-generation banner**: when the plan includes a Source step, a banner is shown before navigating to the project — it tells the user to open the Source step and write their fetch instructions.
- **Regenerate**: edit description and try again; previous version archived to `<project>/.history/<timestamp>/`
- **Edit before scaffolding** (post-MVP): preview the proposed plan and tweak before files are written

The workflow author understands:
- **Source steps** (`kind: "source"`): generated when the description involves polling, monitoring, or ingesting from an external source on a schedule. The plan includes `schedule_cron`, `dedup.key`, `dedup.first_run`, and a `channel` block (`http_get` or `imap`). No AI is involved in fetching — the runner calls the channel directly. A Worker step immediately after handles AI processing of the raw data.
- **Batch workers** (`batch_mode: true`): generated when the description involves summarising or digesting many items into one output. The plan sets `batch_max` and coerces the trigger to `scheduled` or `manual`.

The author prompt lives in `resources/author-prompt.md` in the app bundle.

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

Two tabs: **Config** and **Runs**.

Source steps are **channel-based**. The runner calls the configured channel directly (HTTP GET or IMAP) and creates cards from the raw response. An optional **Instructions** field allows the AI adapter to shape `card.data` before the card is written — useful when you want structured fields extracted directly from the raw response rather than passing the raw text to a downstream worker.

**Config tab:**

```
┌──────────────────────────────────────────────────────────────┐
│  DATA CHANNEL                         [Required]             │
│  Channel type  [HTTP GET ▼]                                  │
│                                                              │
│  [HTTP GET selected]                                         │
│  Credential   [GitHub API ▼]  (HTTP credentials only)        │
│  URL path     [/repos/owner/repo/issues?since={{last_run_at}}]│
│               Appended to credential base URL.               │
│               Use {{last_run_at}} for incremental fetches.   │
│  Response path [data.items        ]  (optional — dot-path)   │
│                Leave blank if root is already an array.      │
│                                                              │
│  [IMAP selected]                                             │
│  Credential   [Gmail Inbox ▼]  (IMAP credentials only)       │
│  Folder       [INBOX]                                        │
│  Max messages [50]    [☑] Unseen only                        │
│  Subject contains  [______]   From contains  [______]        │
├──────────────────────────────────────────────────────────────┤
│  Name          [GitHub Issues                    ]           │
│  Description   [Polls for new issues every hour  ]           │
│                                                              │
│  Schedule      [Every hour                 ▼] [Custom...]   │
│                cron: 0 * * * *                               │
│                                                              │
│  DEDUPLICATION                                               │
│  Dedup key     [id                          ]               │
│  Max memory    [10000                       ]               │
│                                                              │
│  First run     ○ Skip existing (default)                     │
│                ○ Process all                                 │
│                ○ Process last N  [N: ___]                    │
├──────────────────────────────────────────────────────────────┤
│  INSTRUCTIONS (optional)                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Extract the title, author, and date from the HTML.  │   │
│  │ Return JSON with keys: title, author, published_at. │   │
│  └──────────────────────────────────────────────────────┘   │
│  If set, the AI parses the raw fetched data using these      │
│  instructions before creating the card.                      │
└──────────────────────────────────────────────────────────────┘
```

When `channel` is `null` (not yet configured), the channel section is highlighted in amber with a **Required** badge. The source cannot run until a channel is configured.

**Schedule picker** shows friendly labels ("Every 5 minutes", "Every hour", "Every day at 9am", "Custom") and renders the resulting cron expression below the picker so users can verify it.

**First run** mode only applies the very first time the source runs (when `seen-ids.json` is empty or absent). After the first run it has no effect.

**Run now** fires the source immediately, outside the cron schedule.

**Pause schedule** suspends the cron without deleting the step. The left rail card shows `⏸ Paused`.

### Run History

The **Runs** tab shows a table of past source runs:

| Column | Content |
|---|---|
| Time | ISO timestamp |
| Duration | seconds |
| Items found | Total items fetched from the channel |
| Items new | Cards created this run |
| Status | ✓ / ⚠ |

Clicking a row expands error details with a copy button.

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

## 7.18 Onboarding Tour

A one-time guided tour that runs the first time the user launches the app. Implemented as an overlay with a dimmed backdrop and a highlight ring around the currently-described region.

- Walks through: the welcome screen, the top bar, the left rail of workflow steps, the right detail panel, and a closing card.
- The tour reads `data-tour="..."` attributes on key DOM regions (`topbar`, `left-rail`, `detail-panel`) so its position adapts to the current screen.
- "Skip tour" and the final "Done" button both flip `settings.onboardingComplete` to `true`. The tour will not auto-launch again.
- A **Run onboarding tour** button under **Settings → Help** re-triggers it whenever the user wants a refresher.

---

## 7.20 Credentials Screen

Accessible from the **Credentials** button (KeyRound icon) in the top bar.

Lists all saved credentials with type badge, name, and action buttons:

| Badge color | Type |
|---|---|
| Blue | HTTP |
| Indigo | IMAP |
| Violet | SMTP |

Actions on each row: **Test** (inline ✓/✗), **Edit** (opens form pre-populated), **Delete** (confirmation: "This will also delete stored passwords.").

**Add credential** button (+ icon, top right) opens a type picker: HTTP / IMAP / SMTP, then the matching form:

**HTTP form:** Name, Base URL, Timeout (ms, default 15000). Headers table — name + value rows, Add/Remove. Values matching `{{secret:...}}` switch to a masked input and are stored via keytar rather than in the JSON file.

**IMAP form:** Name, Host, Port (default 993), Secure toggle (on by default), Username, Password (masked — stored in keytar, never shown again after save).

**SMTP form:** Name, Host, Port (default 587), Secure toggle (off by default), Username, Password (masked), From name, From address.

All forms include a **Test connection** button that calls `credential:test-connection` and shows the result inline before saving.

Empty state: *"No credentials yet. Add one to connect your workflows to external services."*

---

## 7.24 Outlet Step

### Left Rail Card

```
┌────────────┐
│ ✈ Send Report │   ← name, Send icon, purple strip
│ smtp        │   ← channel type badge
└────────────┘
```

Status states:

| State | Display |
|---|---|
| Idle | Outlet name + channel type badge |
| Running | `→ Sending…` — animated purple pulse on icon |
| Done | `✓ Sent 2m ago` — green, fades after 30s |
| Failed | `⚠ Failed` — red triangle, dashed border |

### Outlet Detail Panel (Right Canvas)

Two tabs: **Config** and **Runs**.

**Config tab:**

```
┌──────────────────────────────────────────────────────────────┐
│  Channel type    [SMTP email]  [HTTP POST]                    │
│                                                              │
│  Credential      [Gmail SMTP ▼]                              │
│  (Only SMTP credentials shown when SMTP type selected)       │
│                                                              │
│  [SMTP fields]                                               │
│  To         [{{card.data.email}}                ]            │
│  Subject    [{{card.data.subject}}              ]            │
│  Body       [{{card.data}}                      ]            │
│                                                              │
│  [HTTP POST fields]                                          │
│  URL path   [/api/notify/{{card.data.id}}       ]            │
│  Method     [POST ▼]                                         │
│  Body       [{"data": {{card.data | json}}}     ]            │
│                                                              │
│  Available tokens:                                           │
│  {{card.data.field}}  — specific field value                 │
│  {{card.data}}        — full card as pretty JSON             │
│  {{card.data | json}} — full card as compact JSON string     │
│                                                              │
│  INSTRUCTIONS (optional)                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Format the card as a professional client email.     │   │
│  │ Keep it under 200 words.                            │   │
│  └──────────────────────────────────────────────────────┘   │
│  If set, the AI formats card.data using these instructions   │
│  before the channel dispatch.                                │
│                                                              │
│  [Save]                                                      │
└──────────────────────────────────────────────────────────────┘
```

**Runs tab:** table of past outlet runs:

| Column | Content |
|---|---|
| Time | When the run fired |
| Card | Card ID (truncated) |
| Channel | smtp / http_post |
| Status | ✓ Completed / ✗ Failed + error preview |

---

## 7.19 Keyboard Shortcuts

A small set of global shortcuts wired through `useGlobalShortcuts`. They are skipped while the user is typing in an input or contenteditable element, with the deliberate exception of the command palette (which uses the same global shortcut convention as Slack, VS Code, etc.).

| Shortcut | Action |
|---|---|
| ⌘/Ctrl+N | New card in the selected tray |
| ⌘/Ctrl+, | Open Settings |
| ⌘/Ctrl+K | Open the command palette |
| ⌘/Ctrl+/ | Open the keyboard-shortcuts reference dialog |

The **command palette** (⌘/Ctrl+K) is a quick-jump search: type to filter steps in the current workflow, other projects, and the Settings / Shortcuts screens. ↑/↓ navigate, Enter activates.

A **Keyboard shortcuts** button under **Settings → Help** opens the same reference dialog as ⌘/Ctrl+/.

---

## 7.25 AI Setup Screen

When no production AI adapter is installed, the full-window `AdapterSetupScreen` shows before any other UI. It blocks routing until at least one adapter reports `installed: true`.

- One card is rendered per registered **production** adapter (mock adapters are always filtered out at the IPC layer and never shown).
- Each card shows: adapter name, description, install-command code block (from `blockers[0].fixCommand`), install-guide link, **[Check again]** button, **[Setup guide]** button.
- Currently the only production adapter is **Claude Code**. The screen is generic — additional adapters appear automatically when added to the registry.
- Header copy: *"Install an AI adapter to get started. Claude Code is the recommended choice."*

---

## 7.23 Quick AI Console (N11)

A lightweight modal for sending a one-shot prompt to the active AI adapter and seeing the raw streaming response. Accessible via the **Terminal** icon button in the top bar or the keyboard shortcut **Ctrl+Shift+A** (⌘+Shift+A on macOS).

**UI layout:**
```
┌─────────────────────────────────────────────────────────┐
│  Quick AI                                         [×]   │
│  ─────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Ask anything… (Ctrl+Enter to send)             │   │
│  └─────────────────────────────────────────────────┘   │
│                                              [Ask ›]    │
│  ─────────────────────────────────────────────────────  │
│  Response                                  [Copy]       │
│  ┌─────────────────────────────────────────────────┐   │
│  │  (streamed response rendered in monospace)      │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Behaviour:**
- Stateless — no history is persisted between opens.
- The prompt textarea is focused when the modal opens.
- Ctrl+Enter (⌘+Enter) submits the prompt without clicking Ask.
- Response text streams in real time as the AI adapter emits chunks.
- A **Copy** button appears once a response is present.
- Closing the modal while a request is in flight calls `window.trayline.ai.abort()` which kills the underlying AI session.

**IPC:**
- `ai:query` — invoke from renderer with `prompt: string`; main spawns the adapter, streams `ai:query-chunk` events, resolves when done.
- `ai:abort` — send from renderer to kill any in-flight session.
- `ai:query-chunk` — push from main with each stdout chunk.

---

## 7.22 Project Settings Panel (N11)

Accessible from the **Project settings** button at the bottom of the left rail (above "Context files"). Clicking it clears any selected step and opens `ProjectSettingsPanel` in the right canvas.

**Fields:**
- **Name** — editable text input, pre-filled from `active.display_name`. Pressing Enter saves.
- **Description** — resizable textarea, pre-filled from `active.description`.

**Save behaviour:**
- **[Save]** button is disabled while saving or if the Name field is empty.
- On success: updates the project store (`setActive`) and refreshes the project list (`refreshProjects`). Shows "Saved ✓" inline for 2 seconds.
- Writes via `window.trayline.project.updateMeta()` → `project:updateMeta` IPC → `projectService.updateMeta()` → atomic `.tmp` rename on disk.

**Active state:** The button is highlighted (same treatment as the Context files button) while the panel is open.

---

## 7.21 First-Project Guide (N10)

A lightweight, non-blocking guide that appears in the right panel the first time a user opens a project generated by the Workflow Author. It replaces the generic "Select a step on the left" empty state for freshly-created projects only.

**Trigger:** `justCreatedProject` in the project store is set when the user clicks "Open project" in the post-generation banner. It is cleared when the user selects any step or clicks "Dismiss".

**Content (Source-based workflow):**
1. Open your Source step — with a "Go to Source →" link that selects it.
2. Add a credential if your source needs one — points toward the Credentials screen.
3. Click "Run now" to test your Source.

**Content (Manual-intake workflow):**
1. Open the first tray — with a "Go to tray →" link.
2. Mark the card as ready — workers pick it up automatically.
3. Check the next tray for results.

**Footer:** "Take a quick tour" button dispatches `trayline:open-tour` to open the `OnboardingTour` overlay. "Dismiss" clears `justCreatedProject`.

The `OnboardingTour` no longer auto-fires on app boot. It is purely opt-in: via the first-project guide or **Settings → Help → Run onboarding tour**.


---

## 7.23 System Tray & Background Mode (N12)

Trayline runs as a background-service application. Closing the window does not quit the process — workflows keep running.

### Close-to-tray behaviour

Pressing the window's **×** close button hides the window instead of destroying it. The Trayline process stays alive and the orchestrator continues mounting/watching all active workflows. A `window:close` IPC call (from the custom title bar) follows the same path — it calls `win.close()` which the interceptor catches.

To truly quit, the user must choose **Quit** from the tray context menu.

### System tray icon

A tray icon is present whenever the app is running:

| Platform | Location | Left-click | Right-click |
|---|---|---|---|
| Windows | Notification area (bottom-right) | Show & focus window | Context menu |
| macOS | Menu bar (top-right) | Context menu (macOS norm) | Context menu |
| Linux | DE tray area | Show & focus window | Context menu (static — set via `setContextMenu`, not `popUpContextMenu`) |

Tooltip: `"Trayline"`.

### Context menu

```
Resume All   [disabled when all active projects are mounted]
Stop All     [disabled when no projects are mounted]
─────────────
Quit
```

**Resume All** — calls `orchestrator.mountAll()` then refreshes the tray state.  
**Stop All** — calls `orchestrator.unmountAll()` then refreshes the tray state.  
**Quit** — sets `isQuitting = true` then calls `app.quit()`, which triggers `before-quit` → `orchestrator.unmountAll()` + `platformAdapter.destroy()`.

The enabled/disabled state of Resume All and Stop All is kept in sync via `refreshTrayState()` in `index.ts`, which is called after every mount/unmount operation (at startup, after tray actions, and after any IPC handler that mounts or unmounts a project).

### Single-instance enforcement

`app.requestSingleInstanceLock()` is called before `app.whenReady()`. If a second Trayline process is launched:
- The second process receives `false` from `requestSingleInstanceLock()` and immediately calls `app.quit()`.
- The `second-instance` event fires on the surviving (first) process, calling `platformAdapter.surfaceWindow()` to bring the existing window to the front.

### macOS dock icon

On macOS, clicking the dock icon while the window is hidden calls `surfaceWindow()` (registered via `app.on('activate', ...)`). The dock icon is always visible while the process is running — `app.dock.hide()` is deliberately **not** called, so Cmd+Tab still shows Trayline.
