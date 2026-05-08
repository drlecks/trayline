# Trayline — Data Model & Persistence

Everything is files. SQLite is just a fast index built from those files.

---

## Global Folder Structure

```
~/Documents/Trayline/
│
├── app-data/
│   ├── settings.json               # User prefs (theme, default adapter, last opened project, etc.)
│   ├── skills-index-cache.json     # Last fetched skill catalog
│   ├── mcps-index-cache.json       # Last fetched MCP registry
│   ├── mcps-catalog.json           # Curated MCP list (bundled in app, copied on first launch)
│   └── audit.db                    # SQLite — searchable index of all runs
│
├── skills/
│   ├── pdf-reader/
│   │   ├── skill.json              # id, version, description, tools[]
│   │   └── skill.md                # Instructions injected into worker prompts
│   ├── email-sender/
│   │
│   └── _system/                    # App-bundled system skills (read-only, restored on launch if missing)
│       ├── trayline-scaffold/
│       │   ├── skill.json
│       │   ├── skill.md
│       │   └── templates/          # JSON/MD templates for trays, workers, cards
│       │       ├── tray.step.json
│       │       ├── worker.step.json
│       │       ├── process.md
│       │       └── workflow.json
│       └── trayline-author/
│           ├── skill.json
│           └── skill.md
│
├── mcps/
│   ├── gmail/
│   │   ├── mcp.json                # id, version, description, command, credentials schema, setup steps
│   │   ├── README.md
│   │   └── state/
│   │       ├── status.json         # { "configured": true, "last_health_check": "...", "last_error": null }
│   │       └── logs/
│   └── ...
│
└── projects/
    └── client-onboarding/
        ├── project.json
        ├── README.md
        ├── context/
        │   ├── company-info.md
        │   └── brand-voice.md
        ├── workflows/
        │   └── new-client-intake/
        │       ├── workflow.json
        │       └── steps/
        │           ├── 01-intake/
        │           ├── 02-extract/
        │           ├── 03-review/
        │           ├── 04-send-email/
        │           └── 99-errors/
        └── exports/
```

### Why Prefixed Folder Names (`01-intake`, `02-extract`)

Workflows are linear — the prefix encodes order on disk. Reordering the workflow renumbers folders. This makes the folder structure self-documenting and git-friendly.

---

## File Shapes

### Card (`card_2026-05-07_001.json`)

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

Cards live in three subfolders: `pending/`, `ready/`, `archived/`.

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
  "mcps": ["gmail", "google-calendar"],
  "context_packs": ["company-info.md", "brand-voice.md"],
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

### Skill `skill.json`

```json
{
  "id": "pdf-reader",
  "name": "PDF Reader",
  "version": "1.2.0",
  "description": "Extract text and tables from PDF files",
  "_trayline": {
    "source": "catalog | url | system | local",
    "source_url": "https://github.com/user/pdf-reader",
    "installed_at": "2026-05-08T10:14:22Z",
    "installed_from_commit": "a3f9c12"
  }
}
```

### MCP `mcp.json`

```json
{
  "id": "gmail",
  "name": "Gmail",
  "version": "1.0.0",
  "description": "Read, search and send Gmail messages",
  "install_method": "npm",
  "command_template": "...",
  "credentials_schema": [...],
  "setup_steps": [
    { "id": "intro", "type": "info", "title": "Connect Gmail", "body": "..." },
    { "id": "oauth", "type": "oauth", "provider": "google", "scopes": ["gmail.readonly", "gmail.send"], "credential_id": "google_oauth_token" },
    { "id": "verify", "type": "test_connection", "title": "Verifying connection..." }
  ]
}
```

**Credentials are never in `mcp.json`.** They live in the OS keychain (keytar). `state/status.json` only stores flags (`configured: true/false`), never the secret itself.

### App settings (`app-data/settings.json`)

User-level preferences shared across projects. Lives at `~/Documents/Trayline/app-data/settings.json` so the whole Trayline directory is self-contained — backing it up is a single folder copy.

```json
{
  "theme": "system",
  "defaultCliCommand": "claude",
  "defaultAdapterId": "claude-code",
  "notificationsEnabled": true,
  "lastOpenedProject": "client-onboarding"
}
```

| Field | Meaning |
|---|---|
| `theme` | `light` / `dark` / `system`. Persists across launches. |
| `defaultCliCommand` | The CLI binary the worker engine spawns by default. |
| `defaultAdapterId` | Which AI Terminal Adapter is active by default. |
| `notificationsEnabled` | Whether OS notifications fire on completed/failed runs. |
| `lastOpenedProject` | Folder id of the project the user had open when the app last closed. On launch, the renderer reads this and reopens that project automatically (if it still exists on disk). `null` means the user was on the welcome screen. |

The renderer writes `lastOpenedProject` whenever the active project changes (open / switch / close). When a project is deleted, the field is cleared.

---

## Step Folder Structure

### Tray

```
01-intake/
├── step.json
├── state/
│   ├── counters.json          # { "received_total": 142, "today": 7 }
│   ├── conversations/         # Chat-based intake threads
│   └── notes.json
└── cards/
    ├── pending/
    ├── ready/
    └── archived/
```

### Worker

```
02-extract/
├── step.json
├── process.md
├── state/
│   ├── conversation/
│   │   └── messages.jsonl     # Persistent conversation transcript (optional)
│   ├── counters.json
│   └── memory.md              # Free-form notes the worker can read/write between runs
└── runs/
    └── run_2026-05-07_001/
        ├── input.json
        ├── output.json
        ├── terminal.log
        └── meta.json
```

---

## Atomic Card Movement & Crash Safety

A card never gets moved partway. The rule: **a card only changes folders when the work that produced it has fully completed.**

- A worker reads its input from the previous tray's `ready/` folder. It does **not** delete the source card while it's running.
- The worker writes its output to `runs/run_xxx/output.json.tmp` and only renames it once the run finishes successfully.
- Only after a successful, fully-flushed run does Trayline perform the source card's move (out of `ready/`) and the destination card's create (into the next step's `pending/`). Both happen in a single transactional step logged to the audit log before the file move — so the move can be replayed if interrupted.
- On next launch, Trayline scans for orphaned `runs/*` folders without a `meta.json` marked `finished` and treats them as failed — the source card is still in `ready/`, untouched, ready to retry.

**User-visible guarantee: closing the app while a worker is mid-process loses the run-in-progress, but never loses or duplicates a card.**

---

## Audit Log (SQLite — `audit.db`)

| Column | Type |
|---|---|
| id | TEXT PK |
| timestamp | TEXT (ISO) |
| project_id | TEXT |
| workflow_id | TEXT |
| step_id | TEXT |
| card_id | TEXT |
| event | TEXT |
| actor | TEXT (`user` or `system`) |
| details_json | TEXT |

**Card events:** `card_created`, `card_marked_ready`, `run_started`, `run_completed`, `run_failed`, `card_approved`, `card_rejected`

**MCP events:** `mcp_installed`, `mcp_uninstalled`, `mcp_configured`, `mcp_credentials_reset`, `mcp_health_check_failed`, `run_aborted_mcp_not_ready`
