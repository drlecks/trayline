# Trayline — Data Model & Persistence

Everything is files. SQLite is just a fast index built from those files.

---

## Global Folder Structure

```
~/Documents/Trayline/
│
├── app-data/
│   ├── settings.json               # User prefs (theme, default adapter, last opened project, etc.)
│   └── audit.db                    # SQLite — searchable index of all runs
│
├── credentials/
│   └── <id>/
│       └── credential.json         # Type + non-secret config fields (passwords in OS keychain)
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

### Credentials (`credentials/<id>/credential.json`)

Credentials are global (not per-project) and hold non-secret auth config. Passwords and API keys are **never** written to disk — they live in the OS keychain via keytar: `service = 'trayline-credential-<id>'`, `account = '<field-name>'`.

**HTTP credential:**
```json
{
  "id": "github-api",
  "type": "http",
  "name": "GitHub API",
  "base_url": "https://api.github.com",
  "headers": [
    { "name": "Accept", "value": "application/vnd.github.v3+json" },
    { "name": "Authorization", "value": "{{secret:token}}" }
  ],
  "timeout_ms": 15000
}
```
Header values of the form `{{secret:key_name}}` are resolved from keytar at execution time and never reach the renderer.

**IMAP credential:**
```json
{
  "id": "gmail-inbox",
  "type": "imap",
  "name": "Gmail Inbox",
  "host": "imap.gmail.com",
  "port": 993,
  "secure": true,
  "username": "user@gmail.com"
}
```
Password stored in keytar as `account='password'`.

**SMTP credential:**
```json
{
  "id": "gmail-smtp",
  "type": "smtp",
  "name": "Gmail SMTP",
  "host": "smtp.gmail.com",
  "port": 587,
  "secure": false,
  "username": "user@gmail.com",
  "from_name": "Alex",
  "from_address": "user@gmail.com"
}
```
Password stored in keytar as `account='password'`.

### Source `step.json`

```json
{
  "id": "00-source",
  "kind": "source",
  "name": "GitHub Issues",
  "description": "Polls for new issues every hour",
  "icon": "rss",
  "color": "#4CB87E",
  "channel": {
    "type": "http_get",
    "credential_id": "github-api",
    "url_path": "/repos/owner/repo/issues?state=open&since={{last_run_at}}"
  },
  "schedule_cron": "0 * * * *",
  "paused": false
}
```

Source steps are **channel-based**. The runner calls the channel directly (HTTP GET or IMAP) and creates cards. Optionally, an AI prompt can shape the card data before it is written (see `prompt` field below).

`channel` is **required**. When `null`, the source cannot run and will fail with a configuration error.

**HTTP GET behaviour:** one fetch per scheduled run → **one card** created. The full response text (any content type — JSON, HTML, plain text) is stored verbatim in `card.data.body`. There is no JSON parsing, no item extraction, and no dedup. The Worker that follows receives `{{card.data.body}}` and does whatever parsing is needed.

**IMAP channel variant (with dedup):**
```json
{
  "channel": {
    "type": "imap",
    "credential_id": "gmail-inbox",
    "folder": "INBOX",
    "unseen_only": true,
    "max_messages": 50,
    "subject_contains": "",
    "from_contains": ""
  },
  "dedup": {
    "key": "message_id",
    "max_memory": 10000,
    "first_run": "skip_existing",
    "first_run_n": 10
  }
}
```

IMAP creates one card per email, deduplicated by `dedup.key`. `dedup` is only used for IMAP sources — omit it entirely for `http_get`.

`{{last_run_at}}` is a built-in token resolved to the ISO timestamp of the last successful run (from `state/counters.json`), or empty string on first run.

| Field | Meaning |
|---|---|
| `kind` | Always `"source"` |
| `channel` | Required data-source channel (`http_get` or `imap`). `null` means not yet configured. |
| `channel.type` | `"http_get"`: fetches the URL, creates 1 card with `data.body` = full response text. `"imap"`: fetches emails, one card per email. |
| `schedule_cron` | Standard cron expression for how often the source runs |
| `dedup.key` | **IMAP only.** The field name in each email object used as the unique identifier. |
| `dedup.max_memory` | **IMAP only.** Maximum number of IDs stored in `seen-ids.json`; oldest entries pruned when exceeded. |
| `dedup.first_run` | **IMAP only.** What to do on the very first run: `skip_existing` (default), `process_all`, `process_last_n`. |
| `dedup.first_run_n` | **IMAP only.** Number of most-recent emails to process when `first_run` is `"process_last_n"`. |
| `paused` | When `true`, the cron job is not registered at launch and `source:pause` / `source:resume` toggle it |
| `prompt` | **Optional.** If set, the AI adapter processes the raw fetched data using these instructions before `card.data` is written. For HTTP GET: `prefetchedData` = response body. For IMAP: called once per email item. If the AI returns a JSON object it becomes `card.data`; a string is stored as `{ ai_output: "..." }`. Run fails if the AI step fails. |

**Source step folder structure:**
```
00-source/
├── step.json         # Config above (includes channel)
├── state/
│   ├── seen-ids.json # [{ id, seen_at }] — deduplicated item IDs, pruned to max_memory
│   └── counters.json # { runs_total, items_found, items_new, last_run_at }
├── runs/
│   └── run_YYYY-MM-DD_NNN/
│       ├── meta.json   # { run_id, status, started_at, ended_at, items_found, items_new, error? }
│       └── output.json # The fetched JSON array (on success)
└── cards/
    ├── ready/          # Cards created by this source run
    └── archived/       # Cards that have moved downstream
```

A Source step is always the **first** step in a workflow (`00-<slug>`). It has no preceding step to read cards from — it generates cards by polling the world.

**Atomic write protocol for `seen-ids.json` (IMAP):** Write to `seen-ids.json.tmp` first, then rename to `seen-ids.json`. On app launch, any leftover `.tmp` file is discarded (the last complete `seen-ids.json` remains authoritative).

### Outlet `step.json`

```json
{
  "id": "05-send-report",
  "kind": "outlet",
  "name": "Send Report Email",
  "description": "Emails the processed report to the client",
  "color": "#8B5CF6",
  "icon": "send",
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

**HTTP POST channel variant:**
```json
{
  "channel": {
    "type": "http_post",
    "credential_id": "freshdesk-api",
    "url_path": "/tickets/{{card.data.ticket_id}}",
    "method": "POST",
    "body": "{ \"status\": 2, \"reply\": {{card.data.reply | json}} }"
  }
}
```

**Optional AI instructions:** If `"prompt"` is set, the AI adapter runs against `card.data` before the channel dispatch. If it returns a JSON object, that object replaces `card.data` for token resolution; string output is merged in as `card.data.ai_output`. The run fails if the AI step fails.

```json
{
  "prompt": "Format the card data as a professional client-facing email. Keep it under 200 words."
}
```

**Template tokens** in `to`, `subject`, `body`, and `url_path`:
- `{{card.data.field}}` — the value of a specific field from the card's data
- `{{card.data}}` — the full card data object as pretty-printed JSON
- `{{card.data | json}}` — the full card data object as a compact JSON string (useful inside a JSON body)

**Outlet step folder structure:**
```
05-send-report/
├── step.json
└── runs/
    └── run_YYYY-MM-DD_NNN/
        └── meta.json   # { run_id, status, started_at, ended_at, card_id, channel_type, error? }
```

An Outlet has no `cards/` subfolder — it consumes cards from the tray above it and archives them after a successful dispatch. On failure the card moves to `99-errors/`, exactly like a failed worker.

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
├── step.json                  # Config (includes channel)
├── state/
│   ├── seen-ids.json          # IMAP only: [{id: "...", seen_at: "ISO"}], capped at dedup.max_memory
│   └── counters.json          # {runs_total, items_found, items_new, last_run_at}
├── runs/
│   └── run_YYYY-MM-DD_NNN/
│       ├── meta.json          # Run metadata (status, times, counts, error)
│       ├── output.txt         # http_get: full response text
│       └── output.json        # imap: fetched email array
└── cards/
    ├── ready/                 # Cards created by this source run, consumed by the next step
    └── archived/              # Cards already processed downstream
```

The source fetches data directly via its `channel` — no AI involved. A **Worker** step immediately after processes the cards with AI.

- **`http_get`**: one run → one card. `card.data.body` holds the full response text verbatim.
- **`imap`**: one run → one card per new email (deduplicated). `card.data` holds the email fields.

#### `seen-ids.json` (IMAP only)

```json
[
  { "id": "msg_12345", "seen_at": "2026-05-11T09:00:00Z" },
  { "id": "msg_12346", "seen_at": "2026-05-11T09:00:00Z" }
]
```

- Entries are appended after each IMAP run.
- When the array length exceeds `dedup.max_memory`, the oldest entries (by `seen_at`) are pruned.
- Written atomically: written to `seen-ids.json.tmp`, then renamed. A crash mid-write never corrupts the dedup index.

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

**AI terminal events:** `ai_terminal_clear_failed` — written when the post-run `adapter.clearContext()` call throws. Non-fatal: the run's own outcome (`run_completed` / `run_failed`) is recorded separately and remains authoritative. The `details_json` carries `{ run_id, adapter, error }`.

**Source events:** `source_run_started`, `source_run_completed`, `source_run_failed`, `source_item_new`

| Event | `details_json` shape |
|---|---|
| `source_run_started` | `{ "schedule_cron": "*/5 * * * *" }` |
| `source_run_completed` | `{ "items_found": 12, "items_new": 3, "duration_ms": 4210 }` |
| `source_run_failed` | `{ "error": "AI returned invalid JSON", "duration_ms": 1100 }` |
| `source_item_new` | `{ "item_id": "comment_12347", "card_id": "card_2026-05-11_007" }` — one row per new card created |
