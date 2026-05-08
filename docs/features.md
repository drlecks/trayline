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
- Each row: **Retry** / **Edit card and retry** / **Archive**
- Errors don't advance — they're a parking lot

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
- Scroll, search, copy
- **Open in interactive mode** — lets the user type into the running process (only enabled if awaiting input)
- **Open in external terminal** — detach to the OS terminal

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
