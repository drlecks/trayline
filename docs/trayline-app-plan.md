# Trayline — Full App Plan (MVP)

> A visual, offline-first desktop app for building AI workflows out of trays and workers — no code, no cloud, just folders.

---

## 1. Concept Recap

Trayline lets a non-technical user build an AI-assisted business workflow visually. Each workflow is a **linear top-to-bottom stack** of two kinds of steps:

- **Trays** — places where work waits. A card lands in a tray, a human (or the system) marks it ready, and it moves on.
- **Workers** — automated AI processes that pick up cards from the tray above them, do something, and drop the result in the tray below.

Everything lives on disk as folders and JSON files. A whole project is a zip you can share with a colleague.

---

## 2. Vocabulary (final)

| Term | Meaning |
|---|---|
| **Project** | A self-contained folder containing workflows, context packs, and exports |
| **Workflow** | A linear stack of steps (top to bottom) |
| **Tray** | A holding place for cards; can be auto-approved or human-reviewed |
| **Worker** | An AI step that processes cards using skills + a `process.md` |
| **Card** | One item moving through the workflow (a request, an invoice, a ticket) |
| **Skill** | A reusable capability that a worker uses (e.g. "read PDF", "send email"). Installed globally; assigned per-worker. |
| **System Skill** | A skill that ships with the app and powers app-level operations (`trayline-author`, `trayline-scaffold`) |
| **Context Pack** | Markdown files with project knowledge injected into worker prompts |
| **Run** | One execution of a worker on one card |
| **Audit Log** | The append-only history of everything that happened |
| **AI Terminal Adapter** | The interface that wraps a CLI agent (Claude Code, Open Code, etc.) so workers don't depend on a specific tool |
| **Workflow Author** | The "describe what you want" screen that generates a starting workflow |

---

## 3. Technical Stack

### Shell & runtime
- **Electron** — desktop wrapper, gives us native file system, subprocess, and OS notifications
- **Node.js 20+** — main process
- **TypeScript** — across both processes
- **Vite** — renderer build tool

### UI
- **React 18** — renderer
- **Tailwind CSS** — styling
- **shadcn/ui** — base components (buttons, dialogs, forms)
- **lucide-react** — icons
- **react-hook-form + zod** — dynamic forms from tray schemas
- **xterm.js** — embedded terminal rendering
- **framer-motion** — small, tasteful animations (status pills, drawer slides)

### Backend / system
- **node-pty** — real PTY for spawning `claude` and other CLI agents
- **chokidar** — file system watcher (detects new cards in trays)
- **better-sqlite3** — local indexed cache for run history and audit log
- **archiver / unzipper** — zip-based project import/export
- **node-cron** — scheduler for workers that poll on an interval
- **fast-glob** — folder scanning

### No external dependencies at runtime
- No cloud services
- No accounts
- No telemetry
- The only outbound call: the **Skill Finder** fetches a public skill index (a single JSON file from a known GitHub repo) when the user opens it

---

## 4. Project Persistence — Folder Structure

Everything is files. SQLite is just a fast index built from those files.

The whole Trayline world lives in the user's Documents folder so it's discoverable, backup-friendly, and lets the user open a project folder directly in Finder/Explorer if they ever need to.

```
~/Documents/Trayline/                 # All Trayline data lives here
│
├── app-data/
│   ├── settings.json                 # User prefs, theme, default CLI command
│   ├── skills-index-cache.json       # Last fetched skill catalog
│   └── audit.db                      # SQLite — searchable index of all runs
│
├── skills/                           # Globally installed skills (shared by all projects)
│   ├── pdf-reader/
│   │   ├── skill.json                # id, version, description, tools[]
│   │   └── skill.md                  # Instructions injected into worker prompts
│   ├── email-sender/
│   ├── csv-parser/
│   │
│   └── _system/                      # App-bundled "system skills" (read-only, ship with the app)
│       ├── trayline-scaffold/        # Used to scaffold a new project's folder structure
│       │   ├── skill.json
│       │   ├── skill.md
│       │   └── templates/            # JSON/MD templates for trays, workers, cards
│       │       ├── tray.step.json
│       │       ├── worker.step.json
│       │       ├── process.md
│       │       └── workflow.json
│       │
│       └── trayline-author/          # Used to generate a workflow from a user description
│           ├── skill.json
│           └── skill.md              # Master prompt for the "describe your workflow" feature
│
└── projects/
    └── client-onboarding/            # One project
        ├── project.json              # id, name, description, created_at
        ├── README.md                 # Free-form notes for humans
        │
        ├── context/                  # Context Packs
        │   ├── company-info.md
        │   ├── _brand-voice.md
        │   └── pricing.md
        │
        ├── workflows/
        │   └── new-client-intake/    # One workflow
        │       ├── workflow.json     # name, ordered list of step IDs
        │       │
        │       └── steps/            # All trays and workers, flat
        │           ├── 01-intake/    # A tray
        │           │   ├── step.json
        │           │   └── cards/
        │           │       ├── pending/
        │           │       │   └── card_2026-05-07_001.json
        │           │       ├── ready/      # Marked ready, awaiting next worker
        │           │       └── archived/
        │           │
        │           ├── 02-extract/   # A worker
        │           │   ├── step.json
        │           │   ├── process.md
        │           │   └── runs/
        │           │       └── run_2026-05-07_001/
        │           │           ├── input.json
        │           │           ├── output.json
        │           │           ├── terminal.log
        │           │           └── meta.json
        │           │
        │           ├── 03-review/    # A tray (human review)
        │           ├── 04-send-email/ # A worker
        │           └── 99-errors/    # Auto-generated error tray
        │
        └── exports/                  # Generated zip files for sharing
```

### Why prefixed folder names (`01-intake`, `02-extract`)
Because workflows are linear, the prefix encodes order on disk. Reordering the workflow renumbers folders. This makes the folder structure self-documenting and git-friendly.

### Card file shape
```json
{
  "id": "card_2026-05-07_001",
  "created_at": "2026-05-07T14:32:11Z",
  "created_by": "manual | webhook | worker",
  "source_step": "01-intake",
  "data": {
    "client_name": "Acme Corp",
    "request_details": "Need a website redesign...",
    "attachments": ["./attachments/brief.pdf"]
  },
  "history": [
    { "at": "2026-05-07T14:32:11Z", "step": "01-intake", "event": "created" },
    { "at": "2026-05-07T14:35:02Z", "step": "01-intake", "event": "marked_ready", "by": "user" },
    { "at": "2026-05-07T14:35:03Z", "step": "02-extract", "event": "run_started" }
  ]
}
```

### Tray `step.json`
```json
{
  "id": "01-intake",
  "kind": "tray",
  "name": "New Client Intake",
  "description": "Where new client requests land",
  "color": "#4F8EF7",
  "icon": "inbox",
  "approval_mode": "manual | auto",
  "input_schema": {
    "fields": [
      { "id": "client_name", "label": "Client Name", "type": "text", "required": true },
      { "id": "request_details", "label": "Request", "type": "textarea", "required": true },
      { "id": "attachments", "label": "Attachments", "type": "file", "required": false, "multiple": true }
    ]
  },
  "allow_manual_create": true,
  "webhook_enabled": false
}
```

Each tray has its own `state/` subfolder for any persistent data the tray needs to track between sessions: counters, last-seen timestamps for incoming sources, deduplication keys, draft conversations the user started but didn't submit. This keeps state local to the step that owns it — no global blob to corrupt.

```
01-intake/
├── step.json
├── state/
│   ├── counters.json         # e.g. { "received_total": 142, "today": 7 }
│   ├── conversations/        # If a tray ever spawns its own AI conversation (e.g. a
│   │                         #   chat-based intake), each thread is a file here
│   │   └── thread_xxx.json
│   └── notes.json            # Free-form key/value scratchpad for this step
└── cards/
    ├── pending/
    ├── ready/
    └── archived/
```

### Worker `step.json`
```json
{
  "id": "02-extract",
  "kind": "worker",
  "name": "Extract & Validate",
  "description": "Reads the intake card and structures it",
  "color": "#F7A14F",
  "icon": "cpu",
  "skills": ["pdf-reader", "csv-parser"],
  "context_packs": ["company-info.md"],
  "execution": {
    "command": "claude",
    "args": ["--no-color"],
    "timeout_seconds": 180,
    "retry_attempts": 1
  },
  "trigger": {
    "mode": "on_ready | scheduled | manual",
    "schedule_cron": null
  },
  "on_success": "advance",
  "on_failure": "send_to_errors"
}
```

Each worker also has its own `state/` subfolder. This holds the worker's ongoing AI conversation history (so a long-running worker can have memory across runs if its `process.md` says so), counters, and any per-worker data:

```
02-extract/
├── step.json
├── process.md
├── state/
│   ├── conversation/         # Persistent conversation transcript (optional)
│   │   └── messages.jsonl    # Append-only JSONL of every message turn
│   ├── counters.json         # { "runs_total": 87, "successful": 84, "failed": 3 }
│   └── memory.md             # Free-form notes the worker can read/write between runs
└── runs/
    └── run_2026-05-07_001/
        ├── input.json
        ├── output.json
        ├── terminal.log
        └── meta.json
```

Whether a worker actually keeps memory across runs is up to its `process.md`. By default, each run is independent. But for workers like a "weekly summary" that need continuity, the conversation file is a simple way to give them long-term state without any extra plumbing.

### Audit log row (SQLite)
| Column | Type |
|---|---|
| id | TEXT PK |
| timestamp | TEXT (ISO) |
| project_id | TEXT |
| workflow_id | TEXT |
| step_id | TEXT |
| card_id | TEXT |
| event | TEXT (`card_created`, `card_marked_ready`, `run_started`, `run_completed`, `run_failed`, `card_approved`, `card_rejected`) |
| actor | TEXT (`user` or `system`) |
| details_json | TEXT |

### Card movement is atomic and crash-safe

A card never gets moved partway. The rule is: **a card only changes folders when the work that produced it has fully completed.**

Concretely:
- A worker reads its input from the previous tray's `ready/` folder. It does **not** delete the source card while it's running.
- The worker writes its output to a temp location (`runs/run_xxx/output.json.tmp`) and only renames it to the final name once the run finishes successfully.
- Only after a successful, fully-flushed run does Trayline perform the source card's move (out of `ready/`) and the destination card's create (into the next step's `pending/`). Both happen in a single transactional step that's logged to the audit log before the file move so the move can be replayed if interrupted.
- If the app is force-quit mid-run, on next launch Trayline scans for any orphaned `runs/*` folders without a `meta.json` marked `finished` and treats them as failed — the source card is still sitting in `ready/` untouched, ready to be retried.

The user-visible guarantee: **closing the app while a worker is mid-process loses the run-in-progress, but never loses or duplicates a card.**

### AI Terminal Abstraction Layer

Workers don't know they're talking to Claude Code specifically. They talk to an **AI Terminal Adapter** — a thin interface that wraps any CLI-based AI agent.

This is critical for two reasons: (a) we want to support Open Code, Aider, Goose, and future agents without rewriting the worker engine, and (b) we want to be able to test workers against a fake/mock adapter for development.

```
src/main/ai-terminals/
├── adapter.ts                # The interface every adapter implements
├── claude-code.ts            # Claude Code adapter (default)
├── open-code.ts              # Open Code adapter (future)
├── mock.ts                   # Test fake — returns scripted responses
└── registry.ts               # Lookup by name from worker config
```

The adapter interface (simplified):

```typescript
interface AITerminalAdapter {
  id: string;                                    // e.g. "claude-code"
  displayName: string;                           // e.g. "Claude Code"
  detectInstalled(): Promise<boolean>;           // Is the CLI on the user's PATH?
  getVersion(): Promise<string | null>;
  
  // Spawn a session for one card. Returns a handle the engine can stream from
  // and write input to (for interactive prompts). The adapter handles all the
  // CLI-specific quirks: flags, env vars, prompt formatting, output parsing.
  spawn(opts: {
    processFile: string;          // path to process.md
    cardData: object;             // the card's JSON payload
    skills: SkillDefinition[];    // resolved skill content to inject
    contextPacks: string[];       // resolved context file contents
    workingDir: string;           // the run's folder
    timeout: number;
  }): Promise<AISession>;
}

interface AISession {
  pid: number;
  stdout: AsyncIterable<string>;   // streamed output, line-buffered
  stderr: AsyncIterable<string>;
  awaitingInput: boolean;          // true if the CLI is blocked on a prompt
  sendInput(text: string): Promise<void>;
  kill(): Promise<void>;
  result(): Promise<AISessionResult>;  // resolves when the process exits
}
```

The Claude Code adapter is the only one shipping in MVP — but the architecture is in place from day one. Worker config refers to an adapter by id (`"adapter": "claude-code"`), and the registry resolves it. Adding a new adapter later is a single file plus a registry entry — no engine changes.

In settings, the user picks a default adapter and can override it per-worker. If the chosen adapter isn't installed on the system, the worker shows a clear "Claude Code not found — install it from anthropic.com" message instead of failing silently.

---

## 5. Visual Design Patterns

### Overall feel
**Clean, calm, generous spacing.** This is a productivity tool used daily by non-engineers. It should feel closer to Notion or Linear than to a developer IDE. No dark grids, no node-graph chaos.

### Layout (main window)
```
┌─────────────────────────────────────────────────────────────────┐
│ [≡] Trayline  ·  Client Onboarding  ▼              [⚙] [🔔3] [👤]│  ← top bar
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  WORKFLOW    │              SELECTED STEP DETAIL                │
│              │                                                  │
│  ┌────────┐  │   ┌──────────────────────────────────────────┐  │
│  │📥 Intake│  │   │  📥 New Client Intake                    │  │
│  │  3 ●    │  │   │  Tray · Manual approval                  │  │
│  └────────┘  │   │  ────────────────────────────────────────│  │
│      ↓       │   │                                          │  │
│  ┌────────┐  │   │  3 cards waiting                         │  │
│  │⚙ Extract│  │   │  [+ New card]                           │  │
│  │  idle   │  │   │                                          │  │
│  └────────┘  │   │  • Acme Corp request    [Review ›]       │  │
│      ↓       │   │  • Beta Ltd inquiry     [Review ›]       │  │
│  ┌────────┐  │   │  • Gamma redesign       [Ready ✓]        │  │
│  │👤 Review│  │   │                                          │  │
│  │  1 ●    │  │   │  [Edit step config]                      │  │
│  └────────┘  │   │                                          │  │
│      ↓       │   └──────────────────────────────────────────┘  │
│  ┌────────┐  │                                                  │
│  │📧 Send  │  │                                                  │
│  │  ✓      │  │                                                  │
│  └────────┘  │                                                  │
│              │                                                  │
│  [+ Add step]│                                                  │
│              │                                                  │
└──────────────┴──────────────────────────────────────────────────┘
```

- **Left rail** — the workflow as a vertical stack of step cards. Each card shows its name, type icon, and a live status indicator (count of cards / running / idle / error).
- **Right canvas** — when a step is selected, this panel shows everything about it: its cards, its config, its runs.
- **Top bar** — project switcher, settings, notifications.

### Status indicators on step cards (left rail)
- **Tray** — shows count of cards in `pending` + `ready`. A small dot turns amber if anything is overdue (SLA), red if errors.
- **Worker** — shows `idle`, `running ⚙`, `failed ⚠`, with last run time underneath.

### Step card visual states
- **Default** — soft background, light border
- **Selected** — accent left border (4px), slightly raised shadow
- **Running** — animated subtle pulse on the icon
- **Error** — red dot in corner

### Color discipline
- One accent color per project, set in project settings (default soft blue)
- Trays = blue family / Workers = violet family / Errors = red — but desaturated, not vivid (amber/red/green reserved for status)
- Background: `#FAFAF9` (warm off-white) light, `#0F0F0F` dark
- Generous whitespace — minimum 24px around content blocks

### Typography
- **Inter** for UI
- **JetBrains Mono** for terminal, JSON, and code
- Sizes: 13px UI, 14px body, 18px headers, 24px page titles
- Line height 1.5 minimum

### Iconography
- lucide-react throughout
- Consistent set per concept: `inbox` for trays, `cpu` for workers, `alert-triangle` for errors, `clock` for scheduled, `user` for human review

### Motion
- 150ms ease-out for hovers and selection
- 200ms slide-up for the run summary drawer
- A pulsing dot (1.5s loop) for running states
- Nothing flashy. Motion communicates state, never decorates.

---

## 6. UX Flows

### 6.1 First launch
1. Empty state with three options: **Create new project** / **Import project (.zip)** / **Open example project**
2. Picking "Create new" launches the **Workflow Author** flow (see 6.1a)

### 6.1a Creating a new project — the Workflow Author flow

This is the magic-moment first impression. The user lands on a clean centered screen:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│         What do you want Trayline to do for you?        │
│                                                         │
│   ┌─────────────────────────────────────────────────┐  │
│   │                                                 │  │
│   │  Describe your workflow in plain English...     │  │
│   │                                                 │  │
│   │                                                 │  │
│   │                                                 │  │
│   └─────────────────────────────────────────────────┘  │
│                                                         │
│   Need inspiration? Try one of these:                  │
│                                                         │
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

When the user clicks an example, it fills the textbox so they can edit before submitting.

**On submit:**

1. A friendly loading screen appears with a soft animated circle and rotating status messages:
   - *"Imagining your workflow..."*
   - *"Sketching out the trays..."*
   - *"Wiring up the workers..."*
   - *"Picking the right skills..."*
   - *"Almost there..."*
2. In the background, Trayline runs the system skill `trayline-author` against the user's description. This skill is shipped with the app, lives in `~/Documents/Trayline/skills/_system/trayline-author/`, and is invoked via the same AI Terminal Adapter as any other worker.
3. `trayline-author` outputs a structured JSON workflow plan: ordered list of trays and workers, each with name, description, tray schemas, recommended skills, and a draft `process.md` for every worker.
4. Trayline then calls the second system skill, `trayline-scaffold`, which writes that plan to disk — creating the project folder under `~/Documents/Trayline/projects/<project-name>/`, materializing all the step folders, JSON files, and process files from templates.
5. Loading screen fades out. The user lands directly in the project view, with a fully-built workflow already on the left rail and a small banner: *"Here's a starting point for you. Edit anything you want."*

**Why two system skills, not one:** authoring and scaffolding are separate concerns. The author skill is creative (what should the workflow look like?). The scaffold skill is mechanical (write these files in this layout). Splitting them means the user could later regenerate just the *plan* on a different model, or scaffold the same plan into different folder layouts, without rewriting both.

**If the user hates the result:** there's a **Regenerate** button at the top of the new project that lets them refine their description and try again. The previous version is archived to `<project>/.history/` so nothing is truly lost.

### 6.2 Building a workflow
1. User clicks **+ Add step** at the bottom of the left rail
2. A small modal: **Tray** (work waits here) or **Worker** (AI does something)
3. After picking, an inline form: name, description, and (for trays) a schema builder, (for workers) skill picker + process.md editor
4. New step appears at the bottom of the rail
5. Reordering: drag handle on the left of each step card; releasing renumbers folders on disk

### 6.3 Creating a card manually
1. Select a tray on the left rail
2. Right panel shows existing cards + **[+ New card]** button
3. Clicking opens a form rendered from the tray's `input_schema`
4. On submit, card lands in `cards/pending/` and appears in the list

### 6.4 Reviewing a card (manual approval tray)
1. Card list shows status badge: `Needs review`
2. Click → full-page card view: rendered fields, attachments, history timeline
3. Three buttons: **Mark ready** (advances), **Send back** (with note, returns to previous step or closes), **Edit** (modify fields, then mark ready)
4. On "Mark ready", card moves to `cards/ready/`. The next step (if a worker) picks it up.

### 6.5 A worker runs
1. Worker watches the previous step's `cards/ready/` folder via chokidar
2. New file appears → worker spawns its CLI command via node-pty
3. Status pill in the left rail starts pulsing: `⚙ Running`
4. Process writes structured output → worker parses it
5. On success: original card advances (gets new entry in its history), output is attached to the card, new file written to next step's `cards/pending/` (or `ready/` if the next tray is auto-approve)
6. On failure: card moves to `99-errors/` with the error attached

### 6.6 Watching a run live
1. Click the running worker on the left rail
2. Right panel shows: input summary, current status, elapsed time, **Show terminal** toggle
3. Toggling reveals xterm.js panel with live stdout
4. If the CLI prompts for input, status changes to `⚡ Awaiting input` and the terminal becomes interactive

### 6.7 Reviewing run history
1. Select a worker
2. Right panel has tabs: **Config** / **Runs** / **Logs**
3. **Runs** tab shows table: time, card, duration, status, result-preview
4. Click a row → modal with full input/output JSON, terminal log, audit entries

### 6.8 Installing a skill
1. Top bar → **⚙** → **Skills**
2. Two tabs: **Installed** and **Find skills**
3. **Find skills** fetches a JSON index from a GitHub URL (configurable)
4. Search box, list of available skills with descriptions
5. **Install** → downloads the skill folder into `~/Documents/Trayline/skills/`
6. Skill is now available in any worker's skill picker

### 6.9 Importing/exporting a project
- **Export**: project menu → **Export as zip**. Bundles the project folder. Includes a `manifest.json` listing required skills with versions.
- **Import**: file menu → **Import project**. Opens zip, extracts to `projects/`. If skills referenced in `manifest.json` aren't installed, shows a dialog: "This project needs 3 skills you don't have. Install them now?"

### 6.10 The "My Queue" view
- Top bar **🔔** opens a global queue across all projects
- Shows every card currently sitting in a manual-approval tray
- Grouped by project, sorted by oldest first
- One-click jump to the card

---

## 7. Feature Designs

### 7.1 Linear Workflow Editor (left rail)
- Vertical stack of step cards, drag-to-reorder
- **+ Add step** button at the bottom
- Connector line drawn between steps (simple vertical line + arrow chevron)
- Selecting a step highlights it and loads its detail view on the right
- Right-click on a step: **Rename**, **Duplicate**, **Delete**, **Insert step above/below**

### 7.2 Tray Detail View (right panel)
Tabs: **Cards** / **Config** / **Schema**
- **Cards**: filterable list (Pending / Ready / Archived), each row shows summary, status, age. Click → full card view.
- **Config**: name, description, color, approval mode (manual/auto), allow-manual-create toggle
- **Schema**: drag-and-drop field builder. Field types: text, textarea, number, date, select, file, checkbox. Each field has label, required toggle, help text.

### 7.3 Worker Detail View (right panel)
Tabs: **Config** / **Instructions** / **Runs** / **Skills & Context**
- **Config**: name, description, command (default `claude`), timeout, trigger mode, schedule cron (if scheduled)
- **Instructions**: full-screen markdown editor for `process.md`, with a side preview. Token estimate displayed. Variables like `{{card.data}}` and `{{context._brand-voice}}` autocomplete.
- **Runs**: history table, click for detail
- **Skills & Context**: checklist of installed skills + checklist of context pack files. What's checked gets injected into the prompt.

### 7.4 Card Viewer / Editor
- Header: card ID, current step, age, history button
- **Fields** section: rendered from the tray's schema, editable if the tray allows
- **Attachments** section: file previews (images inline, PDFs as thumbnails, others as filename + download)
- **Worker output** section: only present if the card came from a worker. Shows structured output as a clean rendered view + raw JSON toggle.
- **History timeline**: vertical timeline of every event on this card across the whole workflow
- **Action bar** (sticky bottom): **Mark ready** / **Send back** / **Archive**

### 7.5 Run History & Audit Log
- Per-worker view: table of runs with filters (status, date range)
- Global view: top bar → **History** icon → searchable feed of every event in the audit log across all projects
- Each row expandable to show details
- Export to CSV button

### 7.6 Human Review Tray
A tray with `approval_mode: "manual"` is automatically a human review tray. The card sits in `pending/` until a person clicks **Mark ready**. The action bar offers:
- **Mark ready** — moves to `ready/`, next step fires
- **Edit & mark ready** — modify fields then advance
- **Send back** — returns card to previous step's `pending/` with a note added to history
- **Archive** — moves to `archived/`, ends the card's journey here

### 7.7 Error Tray (`99-errors/`)
Auto-created with every workflow. Hidden by default at the bottom of the left rail under a small "View errors (2)" link.
- Lists failed runs with the original card and the error message
- Each row: **Retry** (reruns the failing worker) / **Edit card and retry** / **Archive**
- Errors aren't a regular step — they don't advance — they're a parking lot

### 7.8 Context Packs
- A `context/` folder in the project root holds markdown files
- Workers list which context files to include in their **Skills & Context** tab
- At run time, included files are concatenated into the prompt under a `## Context` section
- A simple file editor in the project sidebar lets the user create/edit context packs
- Examples: company FAQ, brand voice guide, common product list, escalation rules

### 7.9 Scheduler (per-worker)
- In Worker config, **Trigger mode**:
  - **On ready** (default) — fires when a card lands in the previous tray's `ready/`
  - **Scheduled** — fires on a cron schedule, processes any cards in the previous tray's `ready/`
  - **Manual only** — never fires automatically; user clicks **Run now** in the worker view
- Cron is shown as a friendly picker: "Every hour", "Every weekday at 9am", "Custom (cron expression)"
- Useful for workers that poll an external source via a skill (e.g. "check Gmail every 15min")

### 7.10 Terminal Integration (the critical UX)
Three layers, as before:

**Layer 1 — The status pill**
A compact chip in the left rail step card. States:
- `idle` — gray dot
- `⚙ Running 14s` — animated, accent color
- `⚡ Awaiting input` — pulsing amber
- `✓ Done 2m ago` — green check, fades after 30s
- `⚠ Failed` — red triangle

**Layer 2 — Run summary card** (default detail view)
When a run completes or fails, the worker's right panel shows a clean summary:
- ✓ or ✗ outcome with one-line reason
- Card processed (link)
- Skills used
- Duration, token count if available
- Rendered output preview
- **Show terminal ↓** toggle

**Layer 3 — Embedded terminal**
Below the summary, xterm.js panel renders the saved `terminal.log`. For a live run, it streams live. The user can:
- Scroll, search, copy
- Click **Open in interactive mode** to actually type into the running process (only enabled if the run is awaiting input)
- Click **Open in external terminal** to detach to the OS terminal

The user never has to open the terminal to use Trayline. But it's always one click away.

### 7.11 Skill Finder
- Settings → Skills → **Find skills** tab
- Fetches `https://raw.githubusercontent.com/[org]/trayline-skills/main/index.json`
- Index is a simple JSON: list of `{id, name, description, version, download_url, tags}`
- Search box filters
- Each skill row: **Install** button → downloads zip, extracts to `~/Documents/Trayline/skills/[id]/`
- **Installed** tab shows what's installed with **Update** / **Uninstall**
- All offline-friendly: if the index can't be fetched, the cached version is used

### 7.12 Import / Export
- **Export**: zip the project folder. Add `manifest.json` at root listing skills (id + version) the project uses.
- **Import**: prompts for zip → extracts to `projects/[id]/` → reads manifest → checks installed skills → if missing, dialog with **Install missing skills** button
- Card data, run history, context packs all travel with the zip
- For privacy: an **Export without runs** option excludes the `runs/` folders

### 7.13 Workflow Author (the "describe what you want" creator)

A first-class feature, not just a setup screen. After MVP, users will return to it whenever they start a new workflow.

- A single big text area, soft-focused, with a generous placeholder
- Five rotating example chips below; clicking fills the textbox
- A **Generate workflow** button that calls the `trayline-author` system skill via the AI Terminal Adapter
- During generation: a centered loading circle with rotating warm status messages ("Imagining...", "Sketching the trays...", "Wiring workers...", "Picking skills..."). These are pre-written, not generated, so they feel intentional rather than random.
- Output: a JSON workflow plan that `trayline-scaffold` materializes to disk
- The user lands in their new project with the full structure already on screen
- **Regenerate** lets the user edit their description and try again; previous version archived to `<project>/.history/<timestamp>/`
- **Edit before scaffolding** (post-MVP): a step where the user previews the proposed plan and tweaks names/skills before files are written

The author skill is just a regular skill in `skills/_system/` — the same machinery that runs every other worker. This means power users can edit the master prompt to bias the author toward their domain (e.g. always include an error-notification step).

### 7.14 System Skills (`skills/_system/`)

Two skills ship with the app and live in a special read-only namespace. They're the engine behind app-level operations that need AI but aren't part of any user workflow.

- **`trayline-author`** — Takes a free-text description, returns a structured workflow plan (JSON: ordered steps, schemas, recommended skills per worker, draft `process.md` content for each worker).
- **`trayline-scaffold`** — Takes a workflow plan and writes it to disk. Uses the bundled JSON/MD templates to materialize every folder and file. This is mostly mechanical (template substitution), but it runs as a skill so power users can later override it (e.g. to add a custom default tray to every project).

System skills are restored from the bundled app resources on every launch if missing or corrupted, so the user can't accidentally break the app by deleting one. The user can still inspect them in `~/Documents/Trayline/skills/_system/` and copy from them to learn how skills are structured.

---

## 8. Implementation Plan (by phase)

### Phase 0 — Foundations (1 week)
- Electron + Vite + React + TypeScript scaffold
- Tailwind + shadcn/ui set up
- Window chrome, top bar, dark/light theme toggle
- Settings store (electron-store)
- File system service (read/write/watch via chokidar)
- SQLite init, audit log schema, simple insert/query API

### Phase 1 — Global App Skills & First-Run Bootstrap (4 days)
On first launch, the app needs to lay down the global folder structure and seed the system skills that the rest of the app depends on. This phase exists because almost every later phase assumes these are in place.

- On first launch, detect a missing `~/Documents/Trayline/` and create the full skeleton: `app-data/`, `skills/`, `projects/`
- Bundle the two **system skills** with the Electron app and copy them into `skills/_system/` on first launch:
  - `trayline-scaffold` — knows how to materialize a project's folder structure (trays, workers, cards subfolders, state subfolders, `99-errors` tray) from a JSON workflow plan, using the bundled JSON/MD templates
  - `trayline-author` — the master prompt that takes a user's plain-English description and returns a JSON workflow plan
- Build the **AI Terminal Adapter** layer (interface + Claude Code adapter + mock adapter for tests). All AI work — including the system skills above — goes through this layer.
- Build the **runtime project metadata service** that knows how to read/write `project.json`, list workflows, list steps, find skills, etc. Every later phase queries through this service rather than touching the file system directly.
- A minimal "Hello, Trayline is ready" splash that tells the user where its data lives (`~/Documents/Trayline/`)

### Phase 2 — Projects & Workflow Author (1.5 weeks)
- Project list / open / delete UI
- **Workflow Author** screen: textbox + example chips, calls `trayline-author` then `trayline-scaffold`
- Loading states with rotating "Imagining...", "Sketching..." messages
- Project lands in `~/Documents/Trayline/projects/<project-name>/` with a fully scaffolded workflow visible in the left rail
- "Regenerate" flow that archives the previous version to `<project>/.history/`
- Top bar project switcher
- Settings → general (default AI adapter, theme)

### Phase 3 — Trays + Manual Cards (1.5 weeks)
- Add tray step (modal flow)
- Schema builder (drag-and-drop fields)
- Render dynamic form from schema (react-hook-form + zod)
- Create card manually
- Card list view in right panel
- Card viewer (read-only first)
- Mark ready → moves card between folders (atomic)
- Card history timeline
- Audit log writes for create / mark_ready
- Tray `state/` folder writes (counters, etc.)

### Phase 4 — Workers + CLI Execution (2 weeks)
- Add worker step
- Worker config UI
- `process.md` editor (basic markdown with preview)
- File watcher detects ready cards, triggers worker via the AI Terminal Adapter
- Adapter spawns Claude Code (or chosen adapter), streams stdout/stderr to `terminal.log`
- Output parsing (expect JSON in stdout)
- Worker `state/` folder: counters, optional persistent conversation
- Atomic card movement: source card stays in `ready/` until run finishes successfully; on app crash mid-run, source card untouched
- Card advances on success, lands in error tray on failure
- Status pill on step card with all states
- Run summary view in right panel
- Crash-recovery scan on app launch: orphaned runs marked failed

### Phase 5 — Terminal Integration (1 week)
- xterm.js panel with log replay
- Live streaming for active runs
- Interactive mode for input-prompting workers
- "Open in external terminal" button
- Token estimate display

### Phase 6 — Scheduller
- Allow workers to run on a schedule instead of (or in addition to) being triggered by ready cards.

### Phase 7 — Terminal Configuration (3 days)
- Settings screen with AI provider / model / effort pickers (each dropdown refreshes from the adapter when the prior selection changes)
- Footer summary: `Provider · Model · Effort · 5h: <u/l> · Weekly: <u/l>`
- Adapter API additions: `listModels`, `listEfforts`, `getUsage`, `clearContext`
- Call `clearContext()` after every worker run (success or failure) to keep token usage down

### Phase 8 — Skill Finder (3 days)
- Settings → Skills tabs (Installed / Find)
- Fetch remote index, cache locally
- Install / uninstall / update flow
- Loading + offline states

### Phase 9 — Human Review Polish (3 days)
- Card editor (not just viewer)
- Send-back flow with note
- "My Queue" global view in top bar
- Notifications for items waiting on the user

### Phase 10 — Skills & Context Packs (1 week)
- Global skills folder UI (already created in Phase 1)
- Skill picker in worker config
- Context pack editor + picker
- Variable resolution in `process.md`

### Phase 11 — Import / Export (4 days)
- Zip export with manifest
- Import flow with skill check
- "Export without runs" option
- Example project bundled with the app

### Phase 12 — Errors & Retry (2 days)
- Error tray UI
- Retry / edit-and-retry flows
- Failure notifications

### Phase 13 — Polish & Beta (1 week)
- Empty states everywhere
- Onboarding tour for first-time users
- Keyboard shortcuts
- Bug bash
- Build pipelines for macOS, Windows, Linux

### Phase N4.1 — Run History & Audit Log UI (3 days, post-MVP)
- Per-worker Runs tab
- Global History view
- Filters, search, CSV export
- Click to expand run details modal

**Total MVP estimate: ~12–14 weeks for one full-time developer, faster with two.**

---

## 9. Out of Scope for MVP

- Branching / parallel flows (only linear)
- Multi-user collaboration / sync
- Cloud hosting
- A built-in marketplace for skills (only the GitHub-fetched index)
- Plugins or custom step types
- Mobile / web version
- Built-in MCP server hosting (skills can wrap MCP, but Trayline doesn't ship one)

These are all reasonable v2 candidates once the core loop is loved.

---

## 10. Why This Will Work

- **Files on disk = trust**. Non-engineers can still inspect what's happening. IT departments will approve it. Backups are trivial.
- **Linear-only = approachable**. Branching graphs scare people. A stack of steps is something everyone has built (Trello columns, email rules, etc.).
- **Trays + workers = one mental model.** It's not "nodes and connections", it's "a thing waits, then a thing happens, then another thing waits." That maps to how offices actually work.
- **Terminal is hidden but available**. Power users get full debug access. Everyone else never sees it.
- **Offline = no pricing dread**. The app itself costs nothing to run. The only API costs come from whichever CLI agent the user points it at, and they manage that themselves.

That's the plan.
