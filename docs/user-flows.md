# Trayline — User Flows

---

## 6.1 First Launch

1. **No projects on disk** → the app opens straight into the **Workflow Author** flow so the user can describe their first workflow.
2. **One or more projects on disk** → the app opens the **Project List** screen.

### Project List screen

A pill list of every project on disk, ordered by `updated_at` descending (most recently changed first). The first item is always a dashed **+ Create new project** pill that launches the Workflow Author flow.

Each project pill shows, left to right:

- A **status dot** — green for `active`, red for `inactive`. Click it to toggle. The toggle writes the new value plus a fresh `updated_at` to the project's `project.json`. Status has no functional gating yet; it's a hook for future scheduling/visibility features.
- The project's **display name** and one-line description.
- A relative timestamp (e.g. *"3h ago"*).
- A trash icon (visible on hover) to delete the project.

Clicking the body of a pill opens the project. The project switcher in the top bar exposes an **All projects** entry that returns to this screen.

### Subsequent launches

The app no longer auto-resumes the last-opened project. The user always sees the Project List (or the Workflow Author when there are no projects) so the choice of which workflow to focus on is explicit. `settings.lastOpenedProject` is still maintained for future use but no longer drives bootstrap routing.

---

## 6.1a Workflow Author — Creating a New Project

The magic-moment first impression. The user lands on a clean centered screen:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         What do you want Trayline to do for you?        │
│                                                         │
│   ┌─────────────────────────────────────────────────┐  │
│   │  Describe your workflow in plain English...     │  │
│   └─────────────────────────────────────────────────┘  │
│                                                         │
│   Need inspiration? Try one of these:                  │
│   • Read incoming sales emails and qualify leads        │
│   • Turn long YouTube videos into short-form scripts    │
│   • Process PDF invoices and post them to my accounting │
│   • Triage support tickets and draft responses          │
│   • Read meeting transcripts and extract action items   │
│                                                         │
│                          [Generate workflow ›]          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

Clicking an example fills the textbox so the user can edit before submitting.

**Local AI model note:** When the active adapter is `local-llm`, a soft warning appears below the textarea: *"Using local AI model. Workflow generation works best with Claude Code — local models may produce simpler or incomplete plans. You can edit the result after creation."* The user can still proceed.

**On submit:**
1. A loading screen with a soft animated circle and rotating status messages: *"Imagining your workflow..."* / *"Sketching out the trays..."* / *"Wiring up the workers..."* / *"Almost there..."*
2. Trayline runs the author prompt (`resources/author-prompt.md`) against the user's description via the AI Terminal Adapter.
3. The author outputs a structured JSON workflow plan: ordered steps with names, descriptions, tray schemas, a draft `process.md` per worker, and a `channel` block per source step.
4. The scaffold service writes that plan to disk — creating the project folder, all step folders, JSON files, and process files from templates.
5. Loading screen fades out. User lands in the project view with the workflow already on the left rail.
   - If the plan includes a Source step: banner tells the user to open it and configure a credential for the channel.
   - Otherwise: banner says *"Here's a starting point for you. Edit anything you want."*

**Regenerate:** A **Regenerate** button at the top of the new project lets the user refine their description and try again. The previous version is archived to `<project>/.history/<timestamp>/`.

---

## 6.2 Building a Workflow Manually

1. Click **+ Add step** at the bottom of the left rail
2. Small modal: **Tray** or **Worker**
3. Inline form: name, description, and (for trays) schema builder, (for workers) `process.md` editor
4. New step appears at the bottom of the rail
5. Drag-to-reorder: drag handle on the left of each step card; releasing renumbers folders on disk

---

## 6.3 Creating a Card Manually

1. Select a tray on the left rail
2. Right panel shows existing cards + **[+ New card]** button
3. Clicking opens a form rendered from the tray's `input_schema`
4. On submit, card lands in `cards/pending/`

---

## 6.4 Reviewing a Card (Manual Approval Tray)

1. Card list shows status badge: `Needs review`
2. Click → full-page card view: rendered fields, attachments, history timeline
3. Three buttons: **Mark ready** / **Send back** (with note) / **Edit** (modify fields, then mark ready)
4. On "Mark ready", card moves to `cards/ready/`. The next step (if a worker) picks it up.

---

## 6.5 A Worker Runs

1. Worker watches the previous step's `cards/ready/` folder via chokidar
2. New file appears → worker spawns its CLI command via node-pty
3. Status pill in the left rail starts pulsing: `⚙ Running`
4. Process writes structured output → worker parses it
5. On success: original card advances, output attached to card, new file written to next step's `pending/` (or `ready/` if next tray is auto-approve)
6. On failure: card moves to `99-errors/` with the error attached

---

## 6.6 Watching a Run Live

1. Click the running worker on the left rail
2. Right panel shows: input summary, current status, elapsed time, **Show terminal** toggle
3. Toggle reveals xterm.js panel with live stdout
4. If the CLI prompts for input, status changes to `⚡ Awaiting input` and the terminal becomes interactive

---

## 6.7 Reviewing Run History

1. Select a worker
2. Right panel tabs: **Config** / **Runs** / **Logs**
3. **Runs** tab shows table: time, card, duration, status, result-preview
4. Click a row → modal with full input/output JSON, terminal log, audit entries

---

## 6.9 Importing / Exporting a Project

- **Export**: project menu → **Export as zip**. Bundles the project folder. Includes a `manifest.json` with version and timestamp. **Export without runs** option available.
- **Import**: file menu → **Import project**. Opens zip, extracts to `projects/`. If the project contains suspicious content, a security review dialog is shown before committing.

---

## 6.10 The "My Queue" View

- Top bar **🔔** opens a global queue across all projects
- Shows every card currently sitting in a manual-approval tray
- Grouped by project, sorted by oldest first
- One-click jump to the card

---

## 6.12 Adding a Source Step

1. Click **+ Add step** at the bottom of the left rail
2. Small modal shows three options: **Tray**, **Worker**, **Source**
3. Inline form:
   - **Name** (e.g. "Instagram Comments")
   - **Schedule** — friendly picker ("Every 5 minutes", "Every hour", "Custom") + cron expression preview
   - **Dedup key** — the field name in each item the AI returns that uniquely identifies it (e.g. `id`)
4. Clicking **Create** scaffolds the Source step folder with a default `step.json` (channel: null) and empty `state/` directory
5. The Source step is placed at the top of the workflow rail (Source is always the first step)
6. The **Config** tab opens automatically, highlighting the **Data channel** section in amber because no channel is configured yet
7. User selects a channel type (HTTP GET or IMAP), picks a credential, and fills in the URL path or folder settings
8. User clicks **Run now** to test before relying on the schedule — on success, the runner shows items found and new cards created

---

## 6.14 AI Setup — First Launch

Trayline checks adapter readiness at startup before any other routing:

### No adapter installed

```
App opens → adapter:check-readiness
  └── no production adapter has installed: true
        └── AdapterSetupScreen (full window, no rail or header)
              ├── One card per registered production adapter (mock adapters filtered out)
              │     Currently: Claude Code only
              │       • adapter name + description
              │       • install command in a copyable code block (from blockers[0].fixCommand)
              │       • "Install guide" external link
              │       • [Check again] → calls adapter:recheck inline
              │       • [Setup guide] → opens AdapterSetupWizard modal
              └── When any adapter becomes installed → onReady() → normal routing
```

Header copy: *"Install an AI adapter to get started. Claude Code is the recommended choice."*

### Adapter installed

App routes normally (project list or workflow author). No banner, no gate.

### AdapterSetupWizard (modal)

Available from `AdapterSetupScreen` and from Settings → AI Terminal → "Re-run setup".
Steps are derived from `AdapterReadiness.blockers`:

| State | Steps |
|---|---|
| `not_installed` | Install instructions → Check again → Done |
| installed | Done |

The wizard never runs inference. All steps are informational or trigger a `checkReadiness()` re-check.

---

## 6.15 Notification Click → Jump to Card

When a card lands in a manual-approval tray while the app is in the background:

1. `queue-service` chokidar watcher fires on the new file in `pending/`
2. `notification-service.notifyCardNeedsReview()` is called with project, workflow, tray name, card id, and optional card title extracted from `data.title / data.name / data.subject`
3. Settings are checked: if `notificationSettings.enabled` is false, or the project is in `disabledProjects`, skip
4. Dedup check: if `cardId` is already in the in-session `notified` Set, skip (prevents double-notification if the watcher fires twice)
5. Window focus check: if any BrowserWindow reports `isFocused()`, add to dedup set but do **not** show a notification (the in-app badge is sufficient)
6. `new Notification({ title: trayName, body: cardTitle || 'A card needs your review' }).show()`
7. User clicks the notification:
   - The Electron window is restored (`win.restore()`) and focused
   - Main sends `notification:navigate { projectName, workflowName, cardId }` to the renderer
   - Renderer's `App.tsx` handler fetches the project and scans workflows/steps to find which tray holds the card
   - `setActive(project)` + `setSelectedStepId(stepId)` + `setJumpTarget({ stepId, cardId })` are called in sequence
   - The `CardsTab` component reads `jumpTarget` on mount and scrolls to the card

### Badge / overlay count

- After every `add`/`unlink` event in `queue-service`, `notificationService.refreshBadgeCount()` is called
- `refreshBadgeCount` queries `queueService.getPending()` and passes the count to `updateBadgeCount`
- macOS: `app.setBadgeCount(n)` — red dot with number on the dock icon
- Windows: `BrowserWindow.setOverlayIcon` with an SVG-drawn red circle (cleared when count is 0)
- Linux: `app.setBadgeCount(n)` (Unity/GNOME badge; no-op on other desktops)
- On app startup (`orchestrator.mountAll` done), `refreshBadgeCount()` is called once to restore the badge from any pre-existing pending cards

---

## 6.13 A Source Step Runs

Triggered automatically by the cron scheduler, or manually via **Run now**:

1. **Scheduler fires** — node-cron matches the `schedule_cron` expression and triggers the source runner
2. **Check channel** — if `channel` is null (not configured), the run is marked failed immediately with a clear configuration error
3. **Fetch via channel** — source runner calls the channel directly (no AI):
   - `http_get`: fetches the URL (base + `url_path`); the entire response text (any content type) becomes `card.data.body` in a single new card — one run, one card, no parsing, no dedup
   - `imap`: reads `state/seen-ids.json` into memory (empty on first run), fetches emails matching the folder/filter settings, deduplicates by `dedup.key`
4. **Create cards** — each new item is written to `cards/ready/` with an audit entry before the file is created (replayable on crash)
5. **Persist dedup index (IMAP only)** — write the updated seen set to `state/seen-ids.json.tmp`, then rename to `state/seen-ids.json` (atomic); prune oldest entries if length exceeds `max_memory`
6. **Update counters** — write `state/counters.json` with updated `runs_total`, `items_found`, `items_new`, `last_run_at`
7. **Emit completion event** — IPC event fires to the renderer
8. **Next step picks up cards** — the Worker step following the Source has a chokidar watcher on `<source-step>/cards/ready/` (resolved from `workflow.json:step_ids[i-1]`); new card files trigger the worker automatically, with no user action required

**IMAP first run (`first_run: skip_existing`):**
- All emails are added to the seen index but no cards are created
- On subsequent runs, only emails with IDs not in the index become cards

**On crash mid-run (IMAP):**
- If the app crashes before `seen-ids.json` is written, the `seen-ids.json.tmp` file is the signal — on next launch, if `.tmp` exists, the runner discards it and replays using the last good `seen-ids.json`
- Cards already written to `ready/` in a crashed run may be duplicates on the next run; this is acceptable (at-least-once delivery) and noted in the audit log

---

## 6.18 Adding a Credential

```
Top bar → Credentials button (KeyRound icon)
  └── CredentialsScreen — empty state or list
        └── [+ Add] → type picker: HTTP / IMAP / SMTP
              ├── HTTP form → Name, Base URL, Timeout, Headers
              │     └── [Test connection] → inline ✓ or ✗ with error
              │     └── [Save] → credential.json written; passwords in keytar
              ├── IMAP form → Name, Host, Port, Secure, Username, Password
              │     └── [Test connection] → opens IMAP connection
              │     └── [Save]
              └── SMTP form → Name, Host, Port, Secure, Username, Password,
                              From name, From address
                    └── [Test connection] → SMTP verify
                    └── [Save]
```

---

## 6.19 Configuring a Source Channel

After adding a Credential, the user can assign it to a Source step:

```
ProjectScreen → select Source step
  └── Source detail panel → Config tab → Data channel section (amber if unconfigured)
        ├── Channel type selector
        ├── "HTTP GET" selected
        │     ├── Credential selector (HTTP credentials only)
        │     ├── URL path field — appended to credential base URL
        │     │     Hint: "Use {{last_run_at}} for incremental fetches"
        │     └── Response path (optional) — dot-path to array inside JSON
        └── "IMAP inbox" selected
              ├── Credential selector (IMAP credentials only)
              ├── Folder (default: INBOX), Max messages, Unseen only toggle
              └── Optional Subject / From filters
  └── Changes auto-save on blur — step.json updated immediately
  └── [Run now] — fetches via channel, creates cards (no AI involved here)
```

---

## 6.20 Adding and Configuring an Outlet Step

```
ProjectScreen → + Add step (bottom of left rail)
  └── Step type picker → Outlet
        └── Scaffold creates step.json + runs/ folder
              (no cards/ — outlet consumes from previous tray)

Select Outlet step → OutletDetailPanel → Config tab
  ├── Channel type selector: SMTP email / HTTP POST
  ├── Credential selector (filters to matching type)
  │     └── If empty: link to Credentials screen
  ├── Template fields (To/Subject/Body for SMTP; URL/Method/Body for HTTP POST)
  │     All fields support {{card.data.*}} tokens
  └── [Save]
```

---

## 6.21 An Outlet Runs

Triggered automatically when a card arrives in the Outlet's preceding tray's `ready/` folder (watched by the watcher service, same as workers):

```
Card arrives in prev-tray/cards/ready/card-id.json
  └── watcher fires → outletRunner.runOutlet()
        ├── Write run meta: status=running
        ├── Emit outlet:run-started (left rail shows "Sending…" pulse)
        ├── Load card from ready/
        ├── Load credential from credentials/<id>/
        ├── Resolve {{card.data.*}} tokens in channel config
        ├── Dispatch:
        │     ├── smtp → nodemailer transport.sendMail()
        │     └── http_post → fetch POST to base_url + url_path
        │
        ├── Success path:
        │     ├── Archive card to prev-tray/cards/archived/
        │     ├── Write meta: status=completed, ended_at
        │     └── Emit outlet:run-completed (left rail shows "Sent ✓")
        │
        └── Failure path:
              ├── Write meta: status=failed, error
              ├── Move card to 99-errors/cards/ready/
              └── Emit outlet:run-failed (left rail shows "⚠ Failed")
```

---

## 6.22 First Project — Guided Onboarding (N10)

Triggered automatically after the Workflow Author generates a project and the user clicks "Open project":

```
WorkflowAuthorScreen — PostGenBanner → [Open project]
  └── setJustCreatedProject(projectName)
  └── setActive(project) → ProjectScreen loads

ProjectScreen — no step selected + active.name === justCreatedProject
  └── FirstProjectGuide renders in the right panel (non-blocking)
        ├── Source-based workflow:
        │     1. "Open your Source step" [Go to Source →]
        │     2. "Add a credential if your source needs one"
        │     3. "Click Run now to test your Source"
        └── Manual-intake workflow:
              1. "Open the first tray" [Go to tray →]
              2. "Mark the card as ready"
              3. "Check the next tray for results"

User actions that dismiss the guide:
  ├── Clicks any step in the left rail → setSelectedStepId → clears justCreatedProject
  ├── Clicks "Dismiss" → setJustCreatedProject(null)
  └── Clicks "Take a quick tour" → dispatches trayline:open-tour → OnboardingTour opens
        └── On close → user returns to project with guide still visible (if not yet dismissed)
```

**Note:** The `OnboardingTour` no longer fires automatically on app boot. It is purely opt-in — triggered from the first-project guide or from **Settings → Help → Run onboarding tour**.

---

## 6.23 Editing Project Settings (N11)

```
ProjectScreen — user clicks "Project settings" (bottom of left rail)
  └── showProjectSettings = true; showContextEditor = false; selectedStepId = null
  └── ProjectSettingsPanel renders in the right canvas

User edits Name and/or Description
  └── Clicks [Save] (or presses Enter in the Name field)
        ├── window.trayline.project.updateMeta(active.name, { display_name, description })
        ├── IPC: project:updateMeta → projectService.updateMeta()
        │     └── Reads project.json, merges patch, bumps updated_at
        │     └── Writes to .tmp then renames to project.json (atomic)
        ├── setActive({ ...active, ...updated }) — store reflects new name immediately
        ├── refreshProjects() — project list pill updates
        └── Shows "Saved ✓" for 2 seconds

Clicking any step card in the left rail
  └── setSelectedStepId(id); showContextEditor = false; showProjectSettings = false
```

---

## 6.24 Quick AI Query (N11)

```
User presses Ctrl+Shift+A   ─OR─   clicks the Terminal icon in TopBar
  └── setAiConsoleOpen(true) → <QuickAIConsoleModal open={true} />

Modal opens (idle state):
  ├── Prompt textarea (auto-focused, placeholder: "Ask anything…")
  └── [Ask] button (disabled until textarea non-empty)

User types prompt and presses [Ask] (or Ctrl+Enter):
  └── status = 'running'; response area cleared
  └── window.trayline.ai.query(prompt)
        └── IPC: ai:query → handlers.ts
              ├── Spawns active adapter in a temp directory
              ├── Streams stdout → emits ai:query-chunk events to renderer
              │     └── window.trayline.ai.onChunk(chunk) → appends to response text
              └── On done → resolves; status = 'done'
              └── On error → rejects; status = 'error', shows error message

User can dismiss at any time:
  ├── Clicks [×] or presses Escape → onOpenChange(false)
  └── If status === 'running': window.trayline.ai.abort() → kills active session

Response present:
  └── [Copy] button copies response text to clipboard; shows "Copied" for 1.5 s
```

- Modal is stateless — no history persists between opens.
- Each open is a fresh session; the previous response is not shown.
