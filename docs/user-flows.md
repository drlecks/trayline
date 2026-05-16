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

**On submit:**
1. A loading screen with a soft animated circle and rotating status messages: *"Imagining your workflow..."* / *"Sketching out the trays..."* / *"Wiring up the workers..."* / *"Picking the right skills..."* / *"Almost there..."*
2. Trayline runs the system skill `trayline-author` against the user's description via the AI Terminal Adapter.
3. `trayline-author` outputs a structured JSON workflow plan: ordered trays and workers, each with name, description, tray schemas, recommended skills, MCPs, and a draft `process.md` per worker.
4. The system skill `trayline-scaffold` writes that plan to disk — creating the project folder, all step folders, JSON files, and process files from templates.
5. Loading screen fades out. User lands in the project view with the workflow already on the left rail.
   - If no MCPs need setup: banner says *"Here's a starting point for you. Edit anything you want."*
   - If MCPs need setup: banner says *"Here's a starting point. To run it, set up Gmail and Calendar — click any worker with a ⚠ to start."*

**Regenerate:** A **Regenerate** button at the top of the new project lets the user refine their description and try again. The previous version is archived to `<project>/.history/<timestamp>/`.

**Why two system skills, not one:** authoring (creative) and scaffolding (mechanical) are separate concerns. They can be evolved independently, and power users can override the master prompt in `trayline-author/skill.md` to bias the author toward their domain.

---

## 6.2 Building a Workflow Manually

1. Click **+ Add step** at the bottom of the left rail
2. Small modal: **Tray** or **Worker**
3. Inline form: name, description, and (for trays) schema builder, (for workers) skill picker + `process.md` editor
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

## 6.8 Installing a Skill

1. Top bar → **Skills**
2. Two tabs: **Installed** and **+ Add skill**
3. **Browse catalog** tab: fetches JSON index from GitHub URL (configurable), search box, list with **Install** per skill
4. **From URL** tab: paste a GitHub repo, zip URL, or raw `skill.json` URL — Trayline validates before accepting (see `docs/skills-and-mcps.md`)
5. Skill is installed to `~/Documents/Trayline/skills/` and available in any worker's skill picker

---

## 6.9 Importing / Exporting a Project

- **Export**: project menu → **Export as zip**. Bundles the project folder. Includes a `manifest.json` listing required skills and MCPs. **Export without runs** option available.
- **Import**: file menu → **Import project**. Opens zip, extracts to `projects/`. If skills or MCPs in `manifest.json` aren't installed, shows a dialog: "This project needs 2 skills and 1 MCP you don't have. Install them now?" — installs and chains setup wizards for any MCPs that need credentials.

---

## 6.10 The "My Queue" View

- Top bar **🔔** opens a global queue across all projects
- Shows every card currently sitting in a manual-approval tray
- Grouped by project, sorted by oldest first
- One-click jump to the card

---

## 6.11 Setting Up an MCP

1. Top bar → **MCPs**
2. Installed MCPs shown with status badges (✓ Ready / ⚠ Setup needed / ⚠ Auth expired / ✗ Error / ⏸ Disabled)
3. Available (not installed) MCPs from the curated catalog shown below
4. **Install** → chains to **Setup Wizard** (linear next/back/cancel modal)
5. Wizard steps are derived from `mcp.json` fields: `instructions` → info screen; each `credentials_schema` entry → one masked input (`api_key`) or plain input (`text_field` / `select`); `has_test: true` → connection test screen at the end. No OAuth flows — all credentials are simple key/value pairs.
6. Credentials stored in OS keychain via keytar — never in plain files
7. If a worker has an MCP marked but not Ready, the rail card shows a ⚠ triangle with tooltip before the user can run it

---

## 6.12 Adding a Source Step

1. Click **+ Add step** at the bottom of the left rail
2. Small modal shows three options: **Tray**, **Worker**, **Source**
3. Inline form:
   - **Name** (e.g. "Instagram Comments")
   - **Schedule** — friendly picker ("Every 5 minutes", "Every hour", "Custom") + cron expression preview
   - **Dedup key** — the field name in each item the AI returns that uniquely identifies it (e.g. `id`)
4. Clicking **Create** scaffolds the Source step folder with a blank `source.md`, default `step.json`, and empty `state/` directory
5. The Source step is placed at the top of the workflow rail (Source is always the first step)
6. The **Source** tab opens automatically so the user can write their `source.md`
7. A prompt hint appears in the editor: *"Write instructions for what the AI should fetch. End with: Return ONLY the JSON array. No explanations, no markdown fences."*
8. User clicks **Run now** to test before relying on the schedule — the terminal panel shows the raw AI output and the dedup results

---

## 6.14 AI Setup — First Launch

Trayline checks adapter readiness at startup before any other routing:

### No adapter installed

```
App opens → adapter:check-readiness
  └── no production adapter has installed: true
        └── AdapterSetupScreen (full window, no rail or header)
              ├── One card per registered production adapter
              │     • install command in a copyable code block
              │     • "Open install guide" link
              │     • [Check again] → calls adapter:recheck inline
              │     • [Setup guide] → opens AdapterSetupWizard modal
              └── When any adapter becomes installed → onReady() → normal routing
```

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

## 6.13 A Source Step Runs

Triggered automatically by the cron scheduler, or manually via **Run now**:

1. **Scheduler fires** — node-cron matches the `schedule_cron` expression and triggers the source runner
2. **Load dedup state** — source runner reads `state/seen-ids.json` into memory; if the file is absent (first run), the set is empty
3. **Spawn AI adapter** — source runner spawns the configured adapter (e.g. `claude-code`) with `source.md` as the process instructions, no card input
4. **AI returns JSON array** — the adapter exits; the runner parses the output as a JSON array; if the output is not valid JSON or is not an array, the run is marked `source_run_failed` and the error is written to the audit log
5. **Dedup loop** — for each item in the array:
   - Extract `item[dedup.key]`
   - If the key is already in `seen-ids`, skip
   - If the key is new: write a card JSON file to `cards/ready/`, append `{ id, seen_at }` to the in-memory seen set, emit a `source_item_new` audit event
6. **Persist dedup index** — write the updated seen set to `state/seen-ids.json.tmp`, then rename to `state/seen-ids.json` (atomic); prune oldest entries if length exceeds `max_memory`
7. **Update counters** — write `state/counters.json` with updated `runs_total`, `items_found`, `items_new`, `last_run_at`
8. **Emit completion event** — IPC event fires to the renderer; the left rail card updates to show "N new · M seen"
9. **Next step picks up cards** — the step after the Source (typically a Tray or Worker) has a chokidar watcher on `cards/ready/`; new files trigger normal card handling

**On first run (`first_run: skip_existing`):**
- All items are added to the seen index but no cards are created
- The left rail shows "0 new · N seen (first run — existing items skipped)"
- On subsequent runs, only items with IDs not in the index become cards

**On crash mid-run:**
- If the app crashes after AI output but before `seen-ids.json` is written, the `seen-ids.json.tmp` file is the signal — on next launch, if `.tmp` exists, the runner discards it and replays using the last good `seen-ids.json`
- Cards already written to `ready/` in a crashed run may be duplicates on the next run; this is acceptable (at-least-once delivery) and noted in the audit log
