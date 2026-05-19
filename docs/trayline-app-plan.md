# Trayline — Full App Plan

> A visual, offline-first desktop app for building AI workflows out of sources, trays, workers, and outlets — no code, no cloud, just folders.

---

## 1. Concept

Trayline lets a non-technical user build an AI-assisted business workflow visually. Each workflow is a **linear top-to-bottom stack** of four kinds of steps:

- **Sources** — automated ingestion steps that run on a cron schedule, fetch data from the world (HTTP GET or IMAP), and create cards for new items only (deduplication built in). A Source is always the first step when a workflow needs to pull data in automatically.
- **Trays** — places where work waits. A card lands in a tray, a human (or the system) marks it ready, and it moves on.
- **Workers** — automated AI processes that pick up cards from the tray above them, do something, and drop the result in the tray below. Workers optionally run in **batch mode**, receiving all ready cards at once and producing a single consolidated output card.
- **Outlets** — deterministic dispatch steps that sit at the end of a workflow. An Outlet picks up cards from the tray above it and sends them to the outside world (SMTP email or HTTP POST) using a stored **Credential**, with no AI involved. The symmetric opposite of a Source.

Everything lives on disk as folders and JSON files. A whole project is a zip you can share with a colleague.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| **Project** | A self-contained folder containing workflows, context packs, and exports |
| **Workflow** | A linear stack of steps (top to bottom) |
| **Source** | A scheduled ingestion step that fetches data from the world (HTTP GET or IMAP), deduplicates, and creates cards for new items only |
| **Tray** | A holding place for cards; can be auto-approved or human-reviewed |
| **Worker** | An AI step that processes cards using AI instructions in a `process.md` |
| **Batch Worker** | A worker with `batch_mode: true` that receives all ready cards as a JSON array and produces one consolidated output card |
| **Outlet** | A deterministic dispatch step that sends cards to the outside world (SMTP email or HTTP POST) using a stored Credential. No AI — pure send. |
| **Credential** | A named, globally-stored auth config for one protocol (HTTP, IMAP, or SMTP). Passwords stored in the OS keychain, never in files. |
| **Card** | One item moving through the workflow (a request, an invoice, a ticket) |
| **Context Pack** | Markdown files with project knowledge injected into worker prompts |
| **Run** | One execution of a worker or outlet on one card |
| **Audit Log** | The append-only history of everything that happened |
| **AI Terminal Adapter** | The interface that wraps an AI agent (Claude Code CLI, etc.) so workers don't depend on a specific tool |
| **Workflow Author** | The "describe what you want" screen that generates a starting workflow |

---

## 3. Technical Stack

### Shell & Runtime
- **Electron** — desktop wrapper; native file system, subprocess, OS notifications
- **Node.js 20+** — main process
- **TypeScript** — across both processes (main + renderer)
- **Vite** — renderer build tool

### UI
- **React 18** — renderer framework
- **Tailwind CSS** — styling
- **shadcn/ui** — base components (buttons, dialogs, forms)
- **lucide-react** — icons
- **react-hook-form + zod** — dynamic forms rendered from tray schemas
- **xterm.js** — embedded terminal rendering
- **framer-motion** — small, tasteful animations

### Backend / System
- **node-pty** — real PTY for spawning `claude` and other CLI agents
- **chokidar** — file system watcher (detects new cards in trays)
- **better-sqlite3** — local indexed cache for run history and audit log
- **archiver / adm-zip** — zip-based project import/export (write / read)
- **node-cron** — scheduler for sources and scheduled workers
- **fast-glob** — folder scanning
- **keytar** — OS keychain access for credential passwords (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
- **imapflow** — modern IMAP client used by Source IMAP channels
- **nodemailer** — SMTP email sending used by Outlet SMTP channels

### No External Dependencies at Runtime
- No cloud services
- No accounts
- No telemetry
- The only outbound calls are the workflow steps themselves (Source fetches, Outlet sends, AI adapter)

---

## 4. Project Persistence — Folder Structure

Everything is files. SQLite is just a fast index built from those files. The whole Trayline world lives in the user's Documents folder so it's discoverable, backup-friendly, and inspectable.

```
~/Documents/Trayline/
│
├── app-data/
│   ├── settings.json               # User prefs (theme, default adapter, etc.)
│   └── audit.db                    # SQLite — searchable index of all runs
│
├── credentials/
│   └── <id>/
│       └── credential.json         # Type + non-secret config (passwords in OS keychain)
│
└── projects/
    └── client-onboarding/
        ├── project.json
        ├── README.md
        ├── context/
        │   ├── company-info.md
        │   └── _brand-voice.md     # '_' prefix = auto-included in all workers
        ├── workflows/
        │   └── new-client-intake/
        │       ├── workflow.json
        │       └── steps/
        │           ├── 00-source/       # Source: polls IMAP or HTTP
        │           ├── 01-intake/       # Tray: cards wait for human or auto
        │           ├── 02-extract/      # Worker: AI processes each card
        │           ├── 03-review/       # Tray: human review
        │           ├── 04-send-email/   # Outlet: SMTP dispatch
        │           └── 99-errors/       # Auto-created error tray
        └── exports/
```

### Why Prefixed Folder Names (`01-intake`, `02-extract`)

Workflows are linear — the prefix encodes order on disk. Reordering the workflow renumbers folders. This makes the folder structure self-documenting and git-friendly.

### Key File Shapes

**Card:**
```json
{
  "id": "card_2026-05-07_001",
  "created_at": "2026-05-07T14:32:11Z",
  "created_by": "manual | webhook | worker",
  "source_step": "01-intake",
  "data": { "client_name": "Acme Corp", "request_details": "..." },
  "history": [
    { "at": "...", "step": "01-intake", "event": "created" },
    { "at": "...", "step": "01-intake", "event": "marked_ready", "by": "user" }
  ]
}
```

**Tray `step.json`:**
```json
{
  "id": "01-intake", "kind": "tray",
  "name": "New Client Intake",
  "approval_mode": "manual | auto",
  "input_schema": { "fields": [...] },
  "allow_manual_create": true
}
```

**Worker `step.json`:**
```json
{
  "id": "02-extract", "kind": "worker",
  "name": "Extract & Validate",
  "context_packs": ["company-info.md"],
  "execution": { "timeout_seconds": 180 },
  "trigger": { "mode": "on_ready | scheduled | manual" },
  "batch_mode": false, "batch_max": null,
  "on_success": "advance", "on_failure": "send_to_errors"
}
```

**Source `step.json`:**
```json
{
  "id": "00-source", "kind": "source",
  "name": "GitHub Issues",
  "channel": {
    "type": "http_get",
    "credential_id": "github-api",
    "url_path": "/repos/owner/repo/issues?since={{last_run_at}}"
  },
  "schedule_cron": "0 * * * *",
  "paused": false
}
```

**Outlet `step.json`:**
```json
{
  "id": "04-send-email", "kind": "outlet",
  "name": "Send Report Email",
  "channel": {
    "type": "smtp",
    "credential_id": "gmail-smtp",
    "to": "{{card.data.client_email}}",
    "subject": "{{card.data.subject}}",
    "body": "{{card.data.content}}"
  },
  "on_failure": "send_to_errors"
}
```

For full schema details see [`docs/data-model.md`](data-model.md).

### Card Movement Is Atomic and Crash-Safe

A card never gets moved partway. The rule: **a card only changes folders when the work that produced it has fully completed.**

- A worker reads its input from the previous tray's `ready/` folder — it does **not** delete the source card while running.
- Output is written to `.tmp`, then renamed. The audit log entry is written *before* the file move so it can be replayed.
- On next launch, orphaned `runs/*` folders without a completed `meta.json` are treated as failed — the source card is still in `ready/`, untouched.

**User-visible guarantee:** closing the app while a worker is mid-process loses the run-in-progress, but never loses or duplicates a card.

### AI Terminal Adapter

Workers don't know they're talking to Claude Code specifically. They talk to an **AI Terminal Adapter** — a thin interface that wraps any CLI-based AI agent. Adding a new adapter (OpenCode, Copilot, etc.) is one file plus one registry entry.

```
src/main/ai-terminals/
├── adapter.ts      # The interface every adapter implements
├── claude-code.ts  # Claude Code adapter (default; currently the only production adapter)
├── mock.ts         # Test fake — returns scripted responses
└── registry.ts     # Lookup by name from worker config
```

See [`docs/tech-stack.md`](tech-stack.md) for the full interface and post-run clear protocol.

---

## 5. Visual Design Patterns

### Overall Feel

**Clean, calm, generous spacing.** This is a productivity tool used daily by non-engineers. It should feel closer to Notion or Linear than to a developer IDE. No dark grids, no node-graph chaos.

### Layout (Main Window)

```
┌─────────────────────────────────────────────────────────────────┐
│ [≡] Trayline  ·  Client Onboarding  ▼              [⚙] [🔔3] [🔑]│  ← top bar
├──────────────┬──────────────────────────────────────────────────┤
│              │                                                  │
│  WORKFLOW    │              SELECTED STEP DETAIL                │
│              │                                                  │
│  ┌────────┐  │   ┌──────────────────────────────────────────┐  │
│  │⌁ Source│  │   │  📥 New Client Intake                    │  │
│  │ next:3m│  │   │  Tray · Manual approval                  │  │
│  └────────┘  │   │  ────────────────────────────────────────│  │
│      ↓       │   │  3 cards waiting                         │  │
│  ┌────────┐  │   │  [+ New card]                            │  │
│  │📥 Intake│  │   │  • Acme Corp request    [Review ›]       │  │
│  │  3 ●    │  │   │  • Beta Ltd inquiry     [Review ›]       │  │
│  └────────┘  │   │  • Gamma redesign       [Ready ✓]        │  │
│      ↓       │   │  [Edit step config]                      │  │
│  ┌────────┐  │   └──────────────────────────────────────────┘  │
│  │⚙ Extract│  │                                                  │
│  │  idle   │  │                                                  │
│  └────────┘  │                                                  │
│      ↓       │                                                  │
│  ┌────────┐  │                                                  │
│  │📧 Send  │  │                                                  │
│  │  ✓      │  │                                                  │
│  └────────┘  │                                                  │
│  [+ Add step]│                                                  │
├──────────────┴──────────────────────────────────────────────────┤
│                  claude-code · claude-opus-4-5 · auto · 5h 12%  │  ← footer
└─────────────────────────────────────────────────────────────────┘
```

- **Left rail** — the workflow as a vertical stack of step cards. Each card shows name, type icon, and a live status indicator.
- **Right canvas** — when a step is selected, this panel shows everything about it: its cards, config, runs.
- **Top bar** — project switcher, notifications, credentials, settings.
- **Footer** — always present. Right side: active Provider · Model · Effort and rolling usage indicators.

### Step Card Visual States

Each step card has a **colored type strip** on the left (icon in white) and a **content area** on the right:
- Source → green strip (`#3FA86E`)
- Tray → blue strip (`#3F7CE0`)
- Worker → violet strip (`#6E50D8`)
- Outlet → purple strip (`#8B5CF6`)
- Error tray → red strip (`#CC3338`)

### Color Discipline

- Sources = green / Trays = blue / Workers = violet / Outlets = purple / Errors = red
- Amber, red, and green are **reserved for live status** only — never used as type identity colors
- Background: `#FAFAF9` (warm off-white) light / `#0F0F0F` dark

### Typography

- **Inter** for UI · **JetBrains Mono** for terminal, JSON, and code
- Sizes: 13px secondary, 14px body & rail titles, 18px panel headers, 24px page titles
- Rail width: 288 px — wide enough for two-line labels without truncation

For full design details see [`docs/design-principles.md`](design-principles.md).

---

## 6. UX Flows

### 6.1 First Launch
1. **No projects on disk** → opens directly into the Workflow Author flow
2. **Projects on disk** → opens the Project List screen (pill list ordered by `updated_at` descending; first item is always **+ Create new project**)

### 6.2 Creating a Project — Workflow Author
1. User describes a workflow in plain English; seven rotating example chips for inspiration
2. Trayline runs the author prompt via the AI Terminal Adapter
3. Author outputs a structured JSON plan: ordered steps, schemas, draft `process.md` per worker, `channel` block per source
4. Scaffold service writes the plan to disk (project folder, step folders, JSON files, process files)
5. User lands in the project with the workflow already on the left rail
   - If the plan includes a Source step: banner tells the user to open it and configure a credential
   - Otherwise: *"Here's a starting point for you. Edit anything you want."*
6. **Regenerate** archives the previous version to `<project>/.history/<timestamp>/`

### 6.3 Building a Workflow Manually
1. Click **+ Add step** → choose **Tray**, **Worker**, **Source**, or **Outlet**
2. Fill in the inline form; step appears at the bottom of the rail
3. Drag-to-reorder renumbers folders on disk

### 6.4 Credentials
1. Top bar → Credentials (KeyRound icon)
2. **+ Add** → pick type: **HTTP**, **IMAP**, or **SMTP**
3. Fill form → **Test connection** inline → **Save** (passwords go to OS keychain, never to disk files)

### 6.5 Configuring a Source
1. Select Source step → Config tab → Data channel section (amber if unconfigured)
2. Pick channel type: **HTTP GET** or **IMAP**
3. Pick credential, fill URL path / folder settings
4. Configure schedule and dedup settings
5. **Run now** to test before relying on the schedule

### 6.6 A Worker Runs
1. Worker watches the previous step's `cards/ready/` via chokidar
2. New file appears → adapter spawns claude CLI via node-pty
3. Status pill pulses: `⚙ Running`
4. On success: source card archived, output card created in next step
5. On failure: source card sent to `99-errors/`

### 6.7 Watching a Run Live
1. Click the running worker; toggle **Show terminal** to reveal the xterm.js panel
2. Keystrokes flow into the PTY when the run is `running` or `awaiting_input`
3. **Open in external terminal** launches the OS terminal in the run directory

### 6.8 An Outlet Runs
1. Card arrives in Outlet's preceding tray's `ready/`
2. Outlet runner loads card, resolves `{{card.data.*}}` tokens, dispatches via SMTP or HTTP POST
3. On success: card archived. On failure: card sent to `99-errors/`

### 6.9 Human Review Tray
- **Mark ready** — moves to `ready/`, next step fires
- **Edit & mark ready** — modify fields then advance
- **Send back** — returns to previous step's `pending/` with a note
- **Archive** — ends the card's journey

### 6.10 Importing / Exporting
- **Export**: zip the project folder + `manifest.json` with version and timestamp. Credentials never travel.
- **Import**: extract to `projects/` → validate `project.json` → security audit → commit.

For full flow details see [`docs/user-flows.md`](user-flows.md).

---

## 7. Feature Designs

### 7.1 Linear Workflow Editor (Left Rail)
- Vertical stack of step cards, drag-to-reorder (renumbers folders on disk)
- **+ Add step** button at the bottom
- Connector line between steps (vertical line + arrow chevron)
- Selecting a step loads its detail view on the right

### 7.2 Tray Detail View
Tabs: **Cards** / **Config** / **Schema**
- **Cards**: filterable list (Pending / Ready / Archived). Click → full card view.
- **Config**: name, description, color, approval mode, allow-manual-create toggle
- **Schema**: drag-and-drop field builder (text, textarea, number, date, select, file, checkbox)

### 7.3 Worker Detail View
Tabs: **Config** / **Instructions** / **Runs** / **Context**
- **Config**: name, description, timeout, trigger mode, schedule cron, batch mode toggle
- **Instructions**: full-screen markdown editor for `process.md` with side preview
- **Runs**: history table, click for full run detail (input/output JSON, terminal log)
- **Context**: checklist of project context pack files to inject into this worker's prompts

### 7.4 Source Step Detail View
Tabs: **Config** / **Runs**
- **Config**: channel type (HTTP GET or IMAP) → credential picker → URL/folder settings → schedule picker → dedup settings → optional AI instructions
- Runs table: time, duration, items found, items new, status

### 7.5 Outlet Step Detail View
Tabs: **Config** / **Runs**
- **Config**: channel type (SMTP / HTTP POST) → credential picker → template fields with `{{card.data.*}}` tokens → optional AI formatting instructions
- Runs table: time, card, channel type, status

### 7.6 Card Viewer / Editor
- Header: card ID, current step, age, history button
- **Fields**: rendered from tray schema; editable if the tray allows
- **Worker output**: structured view + raw JSON toggle (when card came from a worker)
- **History timeline**: every event across the whole workflow, color-coded by tone
- **Action bar**: **Mark ready** / **Send back** / **Archive**

### 7.7 Error Tray (`99-errors/`)
- Hidden by default, revealed by a collapsible **"View errors (N)"** link
- Each failed card shows: original summary, error message, which worker failed, age
- Actions: **Retry** / **Edit and retry** / **Archive**

### 7.8 Context Packs
- `context/` folder in the project root holds markdown files
- Files with `_` prefix are auto-included in all workers
- Workers select additional files in their **Context** tab
- At run time, included files are concatenated into the prompt under `## Context`

### 7.9 Credentials Screen
- Accessible from top bar (KeyRound icon)
- Badges: HTTP (blue), IMAP (indigo), SMTP (violet)
- Actions: **Test** (inline ✓/✗) / **Edit** / **Delete**
- Add form: type picker → type-specific fields → **Test connection** → **Save**

### 7.10 Terminal Integration
Three layers — the user never has to open a terminal to use Trayline, but it's always one click away:

**Layer 1 — Status pill** (left rail): `idle` / `⚙ Running 14s` / `⚡ Awaiting input` / `✓ Done 2m ago` / `⚠ Failed`

**Layer 2 — Run summary card** (right panel): ✓/✗ outcome, card link, duration, rendered output preview, **Show terminal** toggle

**Layer 3 — Embedded terminal**: xterm.js with `terminal.log` replay (or live stream). Interactive keystrokes when the run is active. **Open in external terminal** for hands-on debugging.

### 7.11 Scheduler (Per-Worker)
- **On ready** (default) — fires when a card lands in the previous tray's `ready/`
- **Scheduled** — fires on a cron schedule; processes all ready cards (mandatory for batch workers)
- **Manual only** — fires only when the user clicks **Run now**

### 7.12 Workflow Author
- Single big textarea; seven rotating example chips (two are source-first examples)
- **Generate workflow** calls the author prompt via AI Terminal Adapter
- Centered loading circle with pre-written rotating status messages
- JSON plan output is materialized to disk by the scaffold service
- **Regenerate**: archives previous version, tries again with edited description

### 7.13 Batch Worker Mode
- **Batch mode** toggle in worker Config tab
- When on: worker receives all ready cards as a JSON array (up to `batch_max`); produces one output card; trigger must be `scheduled` or `manual`
- Use case: daily digest, weekly report, batch translation

### 7.14 Import / Export
- **Export**: zip the project folder + `manifest.json`. Credentials never export.
- **Import**: extract → validate → security audit → commit
- **Export without runs** excludes `runs/` folders

### 7.15 Persistent Footer
- Provider · Model · Effort — always visible (right side)
- 5h window and Weekly window usage percentages (hidden if adapter doesn't expose `getUsage()`)
- Values turn amber at 80 %
- Refreshes on every run completion

For full feature details see [`docs/features.md`](features.md).

---

## 8. Implementation Plan

Detailed per-phase task lists and acceptance criteria live in [`docs/implementation/tasks.md`](implementation/tasks.md) and the individual phase files in `docs/implementation/`.

### MVP (Phases 0–13)
| Phase | Focus |
|---|---|
| 0 | Foundations: Electron + Vite + React + TypeScript scaffold, settings store, fs service, SQLite audit log |
| 1 | Bootstrap: global folder structure, AI Terminal Adapter layer, runtime project metadata service |
| 2 | Projects & Workflow Author: project list, workflow author screen, scaffold service, project switcher |
| 3 | Trays + Manual Cards: schema builder, dynamic form render, card creation, mark-ready, history timeline |
| 4 | Workers + CLI Execution: worker config, `process.md` editor, file watcher, adapter spawn, atomic card movement, crash recovery |
| 5 | Terminal Integration: xterm.js panel, live streaming, interactive mode, open in external terminal |
| 6 | Scheduler: per-worker cron trigger, schedule picker UI |
| 7 | Terminal Configuration: Settings screen with provider / model / effort pickers, footer usage display |
| 8 | (Reserved) |
| 9 | Human Review Polish: card editor, send-back flow, My Queue global view, OS notifications |
| 10 | Context Packs: context pack editor, worker context picker, `{{context.x}}` variable resolution |
| 11 | Import / Export: zip export with manifest, import flow with security audit, "export without runs" |
| 12 | Errors & Retry: error tray UI, retry / edit-and-retry flows, failure notifications |
| 13 | Polish & Beta: empty states, onboarding tour, keyboard shortcuts, CI build pipelines |

### Post-MVP (N-series)
| Phase | Focus |
|---|---|
| N2 | Sources & Outlets: Source step (HTTP GET + IMAP channels), Outlet step (SMTP + HTTP POST), Credential store, Batch Worker mode |
| N3 | (Observability / Run History & Audit Log UI) |
| N4 | (Additional phases as needed) |

---

## 9. Out of Scope (MVP & Current Plan)

- Branching / parallel flows (only linear)
- Multi-user collaboration / sync
- Cloud hosting
- Plugins or custom step types
- Mobile / web version
- Built-in marketplace or installable extensions — capabilities come from AI prompts (`process.md`) and Credentials, not from installable packages

---

## 10. Why This Will Work

- **Files on disk = trust.** Non-engineers can still inspect what's happening. IT departments will approve it. Backups are trivial.
- **Linear-only = approachable.** Branching graphs scare people. A stack of steps is something everyone has built (Trello columns, email rules, etc.).
- **Sources + trays + workers + outlets = one mental model.** It's not "nodes and connections", it's "data comes in, it waits, a thing happens, it waits again, it goes out." That maps to how offices actually work.
- **Terminal is hidden but available.** Power users get full debug access. Everyone else never sees it.
- **Offline = no pricing dread.** The app itself costs nothing to run. The only API costs come from whichever AI adapter the user points it at.
- **Credentials live in the OS keychain.** IT can approve Trayline because secrets never touch a file — not even in exports.
