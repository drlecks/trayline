# Trayline — User Flows

---

## 6.1 First Launch

1. Empty state with three options: **Create new project** / **Import project (.zip)** / **Open example project**
2. Picking "Create new" launches the **Workflow Author** flow

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
5. Wizard steps: `info`, `api_key`, `text_field`, `select`, `oauth` (opens browser, captures callback), `test_connection`
6. Credentials stored in OS keychain via keytar — never in plain files
7. If a worker has an MCP marked but not Ready, the rail card shows a ⚠ triangle with tooltip before the user can run it
