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
        │   └── _brand-voice.md
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

### Project (`project.json`)

```json
{
  "id": "client-onboarding",
  "name": "client-onboarding",
  "display_name": "Client Onboarding",
  "description": "Intake new clients and route their requests.",
  "created_at": "2026-05-07T14:32:11Z",
  "status": "active",
  "updated_at": "2026-05-13T09:10:22Z"
}
```

- `status` is `"active" | "inactive"`. It does not gate execution today; it's a hook for future scheduling/visibility features and drives the green/red dot on the Project List screen.
- `updated_at` is bumped whenever the project is created, regenerated, or has its status toggled. The Project List screen sorts on this field, descending.
- Both fields are optional on disk for backward compatibility — readers default missing `status` to `"active"` and missing `updated_at` to `created_at`.

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
  "batch_mode": false,
  "batch_max": null,
  "on_success": "advance",
  "on_failure": "send_to_errors"
}
```

When `batch_mode` is `true`, the worker receives all cards currently in the previous step's `ready/` folder as a JSON array (up to `batch_max` items, default unlimited). It produces **one** output card. All source cards are archived after the batch run completes successfully. `batch_mode` is mutually exclusive with `trigger.mode: "on_ready"` — a batch worker must use `scheduled` or `manual` trigger.

### Source `step.json`

```json
{
  "id": "00-source",
  "kind": "source",
  "name": "Instagram Comments",
  "description": "Polls for new comments every 5 minutes",
  "icon": "rss",
  "color": "#4CB87E",
  "schedule_cron": "*/5 * * * *",
  "dedup": {
    "key": "id",
    "max_memory": 10000,
    "first_run": "skip_existing",
    "first_run_n": 10
  },
  "execution": {
    "timeout_seconds": 60,
    "adapter": "claude-code"
  },
  "mcps": [],
  "paused": false
}
```

| Field | Meaning |
|---|---|
| `kind` | Always `"source"` |
| `schedule_cron` | Standard cron expression for how often the source runs |
| `dedup.key` | The field name in each AI-returned JSON item used as the unique identifier |
| `dedup.max_memory` | Maximum number of IDs stored in `seen-ids.json`; oldest entries pruned when exceeded |
| `dedup.first_run` | What to do on the very first run: `skip_existing` (default — fetch but discard all, record IDs only), `process_all` (create cards for everything found), `process_last_n` (create cards for the N most recent) |
| `dedup.first_run_n` | Number of most-recent items to process when `first_run` is `"process_last_n"` |
| `execution.adapter` | Which AI Terminal Adapter to use for this source (overrides global default). Defaults to `claude-code`. |
| `mcps` | List of MCP ids to activate for each source run — same pre-flight and credential-injection rules as workers. *(Pending implementation — N3.1 / N3.2)* |
| `paused` | When `true`, the cron job is not registered at launch and `source:pause` / `source:resume` toggle it |

**Source step folder structure:**
```
00-source/
├── step.json         # Config above
├── source.md         # AI instructions: what to fetch, JSON array output format
├── state/
│   ├── seen-ids.json # [{ id, seen_at }] — deduplicated item IDs, pruned to max_memory
│   └── counters.json # { runs_total, items_found, items_new, last_run_at }
├── runs/
│   └── run_YYYY-MM-DD_NNN/
│       ├── meta.json   # { run_id, status, started_at, ended_at, items_found, items_new, error? }
│       └── output.json # The raw JSON array returned by the AI (on success)
└── cards/
    ├── ready/          # New deduplicated cards, one per new item
    └── archived/       # Cards that have moved downstream
```

A Source step is always the **first** step in a workflow (`00-<slug>`). It has no preceding step to read cards from — it generates cards by polling the world.

**Atomic write protocol for `seen-ids.json`:** Write to `seen-ids.json.tmp` first, then rename to `seen-ids.json`. On app launch, any leftover `.tmp` file is discarded (the last complete `seen-ids.json` remains authoritative).

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
  "id": "github",
  "name": "GitHub",
  "version": "1.0.0",
  "description": "Issues, PRs, repos, and files via Personal Access Token",
  "install_method": "npm",
  "command_template": "npx -y @modelcontextprotocol/server-github",
  "instructions": "Create a Personal Access Token at github.com/settings/tokens with repo and issues scopes.",
  "credentials_schema": [
    { "id": "github_pat", "type": "api_key", "label": "Personal Access Token", "env_var": "GITHUB_PERSONAL_ACCESS_TOKEN" }
  ],
  "has_test": true
}
```

The Setup Wizard is derived entirely from these three fields: `instructions` → info screen, each `credentials_schema` entry → one masked (`api_key`) or plain (`text_field` / `select`) input, and `has_test: true` → connection test screen at the end.

**Credentials are never in `mcp.json`.** They live in the OS keychain (keytar). `state/status.json` only stores flags (`configured: true/false`), never the secret itself.

**Trayline does not support OAuth-based MCPs.** All credentials are simple key/value pairs (API keys, tokens, file paths) stored in the OS keychain via keytar. MCPs that require a browser-based OAuth flow are intentionally excluded.

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
| `lastOpenedProject` | Folder id of the project the user had open when the app last closed. Maintained for future use — the app always opens to the Project List on launch regardless of this value. `null` when no project has been opened yet. |

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

### Source

```
00-source/
├── step.json
├── source.md                  # AI instructions — what to fetch and how to format output
├── state/
│   ├── seen-ids.json          # [{id: "...", seen_at: "ISO"}], capped at dedup.max_memory
│   └── counters.json          # {runs_total, items_found, items_new, last_run_at}
└── cards/
    ├── ready/                 # New deduplicated items, consumed by the next step
    └── archived/              # Items already processed downstream
```

`source.md` instructs the AI what to fetch and specifies the exact JSON output format. It must include the field that matches `dedup.key`. Example:

```markdown
# Instagram Comments

Use the Instagram MCP to read all comments on post {{config.post_url}}.

For each comment, output a JSON array item with:
- id: the comment's unique ID (string, used for deduplication)
- author: username (string)
- text: comment content (string)
- posted_at: ISO 8601 timestamp

Return ONLY the JSON array. No explanations, no markdown fences.
```

#### `seen-ids.json`

```json
[
  { "id": "comment_12345", "seen_at": "2026-05-11T09:00:00Z" },
  { "id": "comment_12346", "seen_at": "2026-05-11T09:00:00Z" }
]
```

- Entries are appended after each run.
- When the array length exceeds `dedup.max_memory`, the oldest entries (by `seen_at`) are pruned.
- The file is written atomically: written to `seen-ids.json.tmp`, then renamed. This means a crash mid-write never corrupts the dedup index.

---

## Atomic Card Movement & Crash Safety

A card never gets moved partway. The rule: **a card only changes folders when the work that produced it has fully completed.**

- A worker reads its input from the previous tray's `ready/` folder. It does **not** delete the source card while it's running.
- The worker writes its output to `runs/run_xxx/output.json.tmp` and only renames it once the run finishes successfully.
- Only after a successful, fully-flushed run does Trayline perform the source card's move (out of `ready/`) and the destination card's create (into the next step's `pending/`). Both happen in a single transactional step logged to the audit log before the file move — so the move can be replayed if interrupted.
- On next launch, Trayline scans for orphaned `runs/*` folders without a `meta.json` marked `finished` and treats them as failed — the source card is still in `ready/`, untouched, ready to retry.

**User-visible guarantee: closing the app while a worker is mid-process loses the run-in-progress, but never loses or duplicates a card.**

---

## Worker Output Contract

Every worker run produces a single JSON object on stdout. The shape is decided by the worker's `process.md`, but Trayline reserves one top-level key, `trayline_error`, as the **failure envelope**:

```json
{
  "trayline_error": {
    "code": "<short_snake_case>",
    "message": "<one-line human-readable explanation>",
    "details": "<optional longer explanation>"
  }
}
```

When the parsed output contains `trayline_error`, the worker-runner treats the run as **failed** regardless of the process exit code: it writes a `run_failed` audit entry with `code: message` as the error note, leaves `output.json` unwritten, and moves the source card into the project's error tray (`99-errors/cards/pending/`). The error tray card preserves the original `card.data`; the failure note lives in `card.history`.

Workers are taught this contract by the bundled `trayline-worker-contract` system skill, which the runner injects automatically into every worker prompt — per-worker `process.md` files only need to *remind* the agent to use the envelope when it cannot complete the task.

Success replies must **not** include `trayline_error`. The contract is exclusive: either the worker returns its task-specific success shape, or it returns the failure envelope.

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

**AI terminal events:** `ai_terminal_clear_failed` — written when the post-run `adapter.clearContext()` call throws. Non-fatal: the run's own outcome (`run_completed` / `run_failed`) is recorded separately and remains authoritative. The `details_json` carries `{ run_id, adapter, error }`.

**Source events:** `source_run_started`, `source_run_completed`, `source_run_failed`, `source_item_new`

| Event | `details_json` shape |
|---|---|
| `source_run_started` | `{ "schedule_cron": "*/5 * * * *" }` |
| `source_run_completed` | `{ "items_found": 12, "items_new": 3, "duration_ms": 4210 }` |
| `source_run_failed` | `{ "error": "AI returned invalid JSON", "duration_ms": 1100 }` |
| `source_item_new` | `{ "item_id": "comment_12347", "card_id": "card_2026-05-11_007" }` — one row per new card created |
