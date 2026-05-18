# Phase N9 — Credentials & Connectors (Source channels, Outlet step)

**Estimate:** 4–6 days

**Depends on:** N8 (skills and MCPs removed)

---

## Goals

Complete the I/O model that makes Trayline self-sufficient with a local AI:

1. **Global Credentials store** — named, typed auth configs stored securely (passwords in keytar, everything else in JSON). Reusable across any workflow.
2. **Source step channels** — Source steps can now choose between HTTP GET or IMAP fetch as their data source, using a stored credential. No more requirement for the AI to "go to the web".
3. **Outlet step** (new step type) — the symmetric opposite of a Source. Sits at the end of a workflow, picks up cards from the tray above it, and dispatches them to the outside world via HTTP POST or SMTP email using a stored credential. No AI involved — pure deterministic I/O.
4. **Workers stay pure** — workers do AI text transformation only. No connectors, no output actions in workers.

**The resulting workflow shape:**
```
[Source] → Tray → [Worker] → Tray → [Worker] → Tray → [Outlet]
   ↑                  ↑                  ↑                  ↑
fetches data     transforms          transforms        sends result
via credential   with AI             with AI           via credential
```

---

## Vocabulary additions

| Term | Meaning |
|---|---|
| **Credential** | A named, globally-stored auth config for one protocol (HTTP, IMAP, or SMTP). Passwords stored in the OS keychain. |
| **Outlet** | A step type that dispatches cards to an external destination (email or HTTP POST). No AI — pure send. Symmetric opposite of Source. |
| **Channel** | The protocol + credential assignment configured on a Source or Outlet step. |

---

## Data model

### Global credentials folder

```
~/Documents/Trayline/credentials/
  <id>/
    credential.json     ← type + non-secret config fields
```

Passwords and API keys are stored in keytar:
`service = 'trayline-credential-<id>'`, `account = '<field-name>'`
They are never written to `credential.json`.

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

Header values of the form `{{secret:key_name}}` are resolved from keytar at execution time and never travel to the renderer.

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

### Updated Source `step.json`

Add a `channel` block; remove the obsolete `mcps` field:

```json
{
  "id": "00-source",
  "kind": "source",
  "name": "GitHub Issues",
  "channel": {
    "type": "http_get",
    "credential_id": "github-api",
    "url_path": "/repos/owner/repo/issues?state=open&since={{last_run_at}}",
    "response_path": ""
  },
  "schedule_cron": "0 * * * *",
  "dedup": { "key": "id", "max_memory": 10000, "first_run": "skip_existing" },
  "execution": { "timeout_seconds": 60, "adapter": "claude-code" },
  "paused": false
}
```

Or with an IMAP channel:

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
  }
}
```

When `channel` is absent the source runner falls back to the existing behaviour (AI fetches data itself — requires Claude Code).

`{{last_run_at}}` is a built-in template token resolved by the source runner to the ISO timestamp of the last successful run (from `state/counters.json`), or empty string on first run.

### New Outlet `step.json`

```json
{
  "id": "05-send-report",
  "kind": "outlet",
  "name": "Send Report Email",
  "description": "Emails the processed report to the client",
  "icon": "send",
  "color": "#8B5CF6",
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

Or HTTP POST:

```json
{
  "channel": {
    "type": "http_post",
    "credential_id": "freshdesk-api",
    "url_path": "/tickets/{{card.data.ticket_id}}",
    "body": "{ \"status\": 2, \"reply\": {{card.data.reply | json}} }"
  }
}
```

Template tokens: `{{card.data.*}}` resolves against the card that triggered the outlet. `{{card.data | json}}` serialises the entire card data object as a JSON string.

**Outlet step folder structure:**
```
05-send-report/
├── step.json
└── runs/
    └── run_YYYY-MM-DD_NNN/
        └── meta.json   # { run_id, status, started_at, ended_at, card_id, channel_type, error? }
```

An Outlet has no `cards/` subfolder — it consumes cards from the tray above it and archives them after dispatch. On failure the card moves to `99-errors/` exactly like a failed worker.

### Updated ExportManifest

Remove `skills` and `mcps` fields (done in N8). No new fields needed — credentials are global and are never bundled in exports (same security model as old MCP credentials).

---

## Tasks

### 1. Dependencies

- [x] Add `imapflow` to `dependencies` — modern IMAP client, promise-based
- [x] Add `nodemailer` + `@types/nodemailer` to `dependencies` / `devDependencies`
- [x] Confirm `fetch` is available natively (Node 20+ — no `node-fetch` needed)

### 2. Shared types

- [x] Add `HttpCredential`, `ImapCredential`, `SmtpCredential`, `Credential` (discriminated union) to `src/shared/types.ts`
- [x] Add `CredentialSummary` (`{ id, type, name }`) — the safe IPC-list type (no secret values)
- [x] Add `SourceChannel` (`HttpGetChannel | ImapChannel`), extend `SourceStepConfig` with `channel?: SourceChannel`
- [x] Add `OutletChannel` (`SmtpChannel | HttpPostChannel`), add `OutletStepConfig` with `id`, `kind: 'outlet'`, `name`, `description?`, `color?`, `icon?`, `channel: OutletChannel`, `on_failure`
- [x] Add `OutletRunMeta` (`run_id`, `status`, `started_at`, `ended_at`, `card_id`, `channel_type`, `error?`)
- [x] Update `StepConfig` union type to include `OutletStepConfig`

### 3. `fs-service.ts`

- [x] Add `Paths.credentials` → `path.join(Paths.base, 'credentials')`
- [x] `fsService.bootstrap()` creates the directory on launch

### 4. `credential-service.ts`

Create `src/main/services/credential-service.ts`:

- [x] `list(): Promise<Credential[]>` — reads all `credentials/<id>/credential.json`; skips malformed entries with a warning
- [x] `get(id: string): Promise<Credential | null>`
- [x] `save(credential: Credential): Promise<void>` — writes JSON; creates folder if absent
- [x] `delete(id: string): Promise<void>` — removes folder, deletes all keytar entries for that credential
- [x] `saveSecret(credentialId: string, account: string, value: string): Promise<void>` — keytar write
- [x] `resolveSecrets(credential: HttpCredential): Promise<HttpCredential>` — replaces `{{secret:key}}` header values with keytar values; throws with a clear message on missing secret
- [x] `getPassword(credentialId: string): Promise<string>` — reads `account='password'` from keytar for IMAP/SMTP; throws if not set
- [x] `testConnection(credentialId: string): Promise<{ ok: boolean; error?: string }>` — dispatches to the appropriate test function below

### 5. `http-channel.ts`

Create `src/main/services/http-channel.ts`:

- [x] `fetchHttp(credential: HttpCredential, channel: HttpGetChannel, tokens: Record<string, string>): Promise<string>` — performs a GET; returns raw response body (JSON or text string); throws on non-2xx with status + body in message
- [x] `postHttp(credential: HttpCredential, channel: HttpPostChannel, tokens: Record<string, string>): Promise<void>` — performs a POST/PUT; throws on non-2xx
- [x] Both functions: resolve `{{...}}` tokens in `url_path` and `body` before making the request; apply resolved headers; respect `timeout_ms` via `AbortSignal.timeout()`
- [x] `testHttpCredential(credential: HttpCredential): Promise<{ ok: boolean; error?: string }>` — HEAD request to `base_url`; 2xx or 3xx = OK

### 6. `imap-channel.ts`

Create `src/main/services/imap-channel.ts`:

- [x] `fetchEmails(credential: ImapCredential, channel: ImapChannel): Promise<EmailItem[]>` using `imapflow`
- [x] `EmailItem`: `{ uid: string; messageId: string; subject: string; from: string; date: string; body_text: string }`
- [x] Gets password via `credentialService.getPassword(credential.id)`
- [x] Opens the configured `folder` (default `INBOX`), applies `unseen_only`, `subject_contains`, `from_contains` filters, fetches up to `max_messages` most recent matching messages
- [x] Extracts plain-text body preferentially; strips HTML tags as fallback
- [x] Marks messages as seen only when `unseen_only: true`
- [x] Disconnects cleanly after fetch
- [x] `testImapCredential(credential: ImapCredential): Promise<{ ok: boolean; error?: string }>` — connects, runs `LIST "" ""`, disconnects

### 7. `smtp-channel.ts`

Create `src/main/services/smtp-channel.ts`:

- [x] `sendEmail(credential: SmtpCredential, opts: ResolvedSmtpOpts): Promise<void>` using `nodemailer`
- [x] `ResolvedSmtpOpts`: `{ to: string; subject: string; body: string }`
- [x] Gets password via `credentialService.getPassword(credential.id)`
- [x] Sends as plain text when body has no HTML tags; otherwise sends as HTML with auto-generated text fallback
- [x] Throws with a descriptive message on auth failure or connection error
- [x] `testSmtpCredential(credential: SmtpCredential): Promise<{ ok: boolean; error?: string }>` — calls `transport.verify()`

### 8. Token template helper

- [x] Add `resolveTokens(template: string, data: Record<string, unknown>): string` to `prompt-utils.ts` (or a new `template-utils.ts`)
- [x] Supports `{{card.data.foo}}`, `{{card.data.foo | json}}` (serialises as JSON string), `{{card.data}}` (full object as JSON)
- [x] Used by both the Outlet runner and the HTTP channel for URL/body templates

### 9. Source runner — channel integration

In `src/main/services/source-runner.ts`:

- [x] If `step.channel` is set:
  - Load credential via `credentialService.get(channel.credential_id)`. If not found → abort `source_run_failed` ("Credential not found")
  - **`http_get`**: call `fetchHttp(credential, channel, { last_run_at: counters.last_run_at ?? '' })` — store raw response string
  - **`imap`**: call `fetchEmails(credential, channel)` — serialise `EmailItem[]` as a JSON string
  - Prepend fetched data to the AI prompt as a `## Fetched data` section before the `source.md` content
  - On fetch error → abort `source_run_failed` with the error message; do not spawn the AI
- [x] When `step.channel` is absent → existing behaviour (AI fetches itself; Claude Code only)

### 10. Outlet runner

Create `src/main/services/outlet-runner.ts`:

- [x] `runOutlet(stepPath: string, stepConfig: OutletStepConfig, card: CardData): Promise<void>`
- [x] Resolve all `{{card.data.*}}` tokens in the channel config (to, subject, body / url_path, body)
- [x] Dispatch:
  - `type: 'smtp'` → load `SmtpCredential`, call `sendEmail(credential, resolvedOpts)`
  - `type: 'http_post'` → load `HttpCredential`, call `postHttp(credential, resolvedChannel, tokens)`
- [x] On success: write `meta.json` with `status: 'completed'`, move card to `archived/`
- [x] On failure: write `meta.json` with `status: 'failed'` + `error` message, emit `outlet_run_failed` audit event, move card to `99-errors/` (same protocol as worker failure)
- [x] Emit IPC events: `outlet:run-started`, `outlet:run-completed`, `outlet:run-failed`

### 11. `outlet-runner.test.ts`

- [x] Test: SMTP outlet resolves tokens from card data and calls `sendEmail` with correct args
- [x] Test: HTTP POST outlet resolves URL path + body tokens, calls `postHttp`
- [x] Test: credential not found → `outlet_run_failed`, card to errors, no send attempt
- [x] Test: send failure → `outlet_run_failed`, card to errors
- [x] Test: success → card archived, `outlet:run-completed` event emitted
- [x] All tests mock `sendEmail`, `postHttp`, and the credential service — no real network calls

### 12. Orchestrator / watcher integration

- [x] In `src/main/services/orchestrator.ts` (or watcher-service): register a file watcher for Outlet steps on the previous tray's `cards/ready/` — same mechanism as workers
- [x] When a new card file appears, call `runOutlet(stepPath, config, card)`
- [x] Outlet steps do not have a `trigger.mode` — they always fire on ready (no scheduled/manual mode needed in V1)

### 13. Scaffold service — Outlet support

- [x] Add `outlet.step.json` template to `resources/templates/`
- [x] `scaffoldStep()` handles `kind: 'outlet'` — creates the folder with `step.json` and `runs/` subdirectory (no `cards/` or `process.md`)

### 14. IPC channels

- [x] Add `credential` block to `src/shared/ipc-channels.ts`:
  ```typescript
  credential: {
    list:           'credential:list',
    get:            'credential:get',
    save:           'credential:save',
    delete:         'credential:delete',
    saveSecret:     'credential:save-secret',
    testConnection: 'credential:test-connection',
  }
  ```
- [x] Add `outlet` block:
  ```typescript
  outlet: {
    runNow:      'outlet:run-now',
    onStarted:   'outlet:run-started',
    onCompleted: 'outlet:run-completed',
    onFailed:    'outlet:run-failed',
  }
  ```

### 15. IPC handlers

In `src/main/ipc/handlers.ts`:

- [x] `credential:list` → `credentialService.list()` — returns `CredentialSummary[]` (no secrets, no header values)
- [x] `credential:get` → `credentialService.get(id)` — returns `Credential` (no resolved secrets; `{{secret:key}}` placeholders intact)
- [x] `credential:save` → `credentialService.save(credential)`
- [x] `credential:save-secret` → `credentialService.saveSecret(credentialId, account, value)` — write-only, no read-back
- [x] `credential:delete` → `credentialService.delete(id)`
- [x] `credential:test-connection` → `credentialService.testConnection(id)` → `{ ok, error? }`
- [x] `outlet:run-now` → `outletRunner.runOutlet(...)` (manual trigger for testing)

### 16. Preload bridge

- [x] Add `credential` and `outlet` namespaces to `TraylineAPI` in `src/preload/index.ts`
- [x] `credential.list()`, `credential.get(id)`, `credential.save(c)`, `credential.saveSecret(id, account, value)`, `credential.delete(id)`, `credential.testConnection(id)`
- [x] `outlet.runNow(projectName, stepId)`
- [x] `outlet.onStarted(cb)`, `outlet.onCompleted(cb)`, `outlet.onFailed(cb)` — event subscriptions returning unsubscribe functions

### 17. Credentials screen — `CredentialsScreen.tsx`

New screen replacing the deleted MCPs screen:

- [x] Header: "Credentials" title + **+ Add** button (opens type picker: HTTP / IMAP / SMTP)
- [x] List of saved credentials: one card per credential showing type badge (colour-coded), name, and **Test** + **⋯** (Edit / Delete) controls
- [x] **Test** → calls `credential.testConnection(id)` → inline ✓ or ✗ with error detail
- [x] **Edit** → opens the form pre-populated
- [x] **Delete** → confirmation: "This will also delete stored passwords."
- [x] Empty state: "No credentials yet. Add one to connect your workflows to external services."

### 18. Credential setup forms

Three forms, each in a `Dialog`:

**`HttpCredentialForm.tsx`:**
- [x] Fields: Name, Base URL, Timeout (ms, default 15000), Default method (GET/POST)
- [x] Headers table: name + value rows, Add/Remove. When value matches `{{secret:...}}` pattern or user clicks "Mark as secret", the value field switches to a masked password input and is saved via `credential.saveSecret()` after the main save
- [x] Test button → `credential.testConnection(id)`
- [x] Save

**`ImapCredentialForm.tsx`:**
- [x] Fields: Name, Host, Port (default 993), Secure toggle (on by default), Username, Password (always masked — saved to keytar on submit, never shown again)
- [x] Test button
- [x] Save

**`SmtpCredentialForm.tsx`:**
- [x] Fields: Name, Host, Port (default 587), Secure toggle (off by default), Username, Password (masked), From name, From address
- [x] Test button
- [x] Save

### 19. TopBar navigation

- [x] Add a **Credentials** nav entry in `TopBar.tsx` (lucide `KeyRound` icon) in the slot where MCPs used to be

### 20. Source detail panel — channel config

In `SourceDetailPanel.tsx`, Config tab, add a **"Data source"** section:

- [x] Channel type selector: "AI fetches data (default)" / "HTTP GET" / "IMAP inbox"
- [x] **HTTP GET selected**: credential selector (lists HTTP credentials) + URL path field with hint text "appended to the credential's base URL; use {{last_run_at}} for incremental fetches"
- [x] **IMAP selected**: credential selector (lists IMAP credentials) + folder field (default INBOX) + unseen only toggle + max messages + optional subject/from filters
- [x] **AI fetches data**: no additional fields (existing behaviour)
- [x] Save writes the `channel` field to `step.json`

### 21. Outlet step — left rail card

- [x] Icon: lucide `Send` (or `ArrowUpRight`)
- [x] Color: purple (`#8B5CF6` default)
- [x] Status states on the left rail card:

  | State | Display |
  |---|---|
  | Idle | Outlet name + channel type badge |
  | Running | `⟶ Sending…` animated |
  | Done | `✓ Sent N min ago` — green, fades after 30s |
  | Failed | `⚠ Failed` — red triangle |

### 22. Outlet detail panel — `OutletDetailPanel.tsx`

Right-side panel when the Outlet step is selected:

- [x] Two tabs: **Config** and **Runs**
- [x] **Config tab:**
  - Channel type selector (SMTP / HTTP POST)
  - Credential selector (filters by type)
  - **SMTP fields**: To, Subject, Body — all support template tokens; show token hint below each field
  - **HTTP POST fields**: URL path, Method selector, Body template
  - Token reference sidebar or collapsible hint: "Available tokens: {{card.data.field_name}}, {{card.data | json}}"
  - Save button
- [x] **Runs tab:** table of past outlet runs — time, card, channel type, status (✓ / ✗), error preview on hover

### 23. Workflow author — update

- [x] Update `resources/author-prompt.md` to never emit `skills` or `mcps` in step JSON (done in N8 task 2)
- [x] Extend the author prompt to understand `kind: "outlet"` — when the user's description ends with "send email" or "post to webhook", the generated plan should include an Outlet step as the last step

### 24. Documentation — full review and update

After all implementation tasks are done, update every relevant doc to reflect the new model:

- [x] **`docs/app-description.md`**
  - Add `Outlet` and `Credential` to the vocabulary table
  - Update workflow shape description to include Outlet as a valid final step
  - Update "Why This Will Work" to mention deterministic I/O via credentials

- [x] **`docs/data-model.md`**
  - Add `credentials/` to the Global Folder Structure diagram
  - Add `Credential credential.json` schema section (HTTP, IMAP, SMTP variants)
  - Add `Outlet step.json` schema section with full field table
  - Update `Source step.json` to add the `channel` field and remove `mcps`
  - Update Worker `step.json` — confirm no connector fields (clean)
  - Add Outlet folder structure diagram

- [x] **`docs/features.md`**
  - Add section 7.19: Credentials screen (list, test, add, edit, delete; three form types)
  - Add section 7.20: Outlet step (left rail card states, detail panel tabs, template tokens)
  - Update section 7.16 Source step — add "Data source" config block to the Config tab mockup
  - Update section 7.3 Worker Detail View — remove all MCP/skill content; show clean Context-only tab

- [x] **`docs/user-flows.md`**
  - Add flow: "Add a credential" (HTTP / IMAP / SMTP — test → save)
  - Add flow: "Add a Source with HTTP GET channel" — config → test run → cards created
  - Add flow: "Add a Source with IMAP channel" — config → test → cards from inbox
  - Add flow: "Add an Outlet step" — type → credential → template → save
  - Add flow: "An Outlet runs" — card arrives in tray → Outlet fires → dispatched → card archived

- [x] **`docs/tech-stack.md`**
  - Add `imapflow` and `nodemailer` to the backend section
  - Add a "Credentials & Channel I/O" subsection describing the credential store and the three channel service files

- [x] **`docs/design-principles.md`**
  - Add Outlet to the left rail step card visual variants
  - Add the `#8B5CF6` purple as the Outlet step accent color

- [x] **`docs/implementation/tasks.md`** — check off N9 on completion

---

## Acceptance criteria

- `npm run typecheck` passes; `npm test` passes
- A new HTTP credential can be created with an API key stored in keytar; test connection succeeds
- A new IMAP credential can be created; test opens inbox connection successfully
- A new SMTP credential can be created; test verifies the transport
- A source step with HTTP GET channel assigned fetches a real URL on "Run now" and creates cards from the AI's parsed output
- A source step with IMAP channel fetches inbox messages and creates one card per new message
- An Outlet step with SMTP channel sends an email to the configured address when a card arrives; the email body contains the resolved template tokens from card data
- An Outlet step with HTTP POST channel posts the card data to the configured URL; `{{card.data | json}}` is correctly serialised
- Outlet failure (bad credentials, network error) moves the card to 99-errors; the run meta records the error; no retry loop
- Deleting a credential removes its keytar password; any Source or Outlet referencing it shows an error on next run
- A source step with no channel set behaves identically to pre-N9 (Claude Code fetches data itself)
- The workflow author produces plans that include an Outlet step when the description mentions email sending or webhook posting
- Credentials screen is accessible from the top bar; the MCPs screen is gone
- No doc outside `docs/implementation/` contains stale references to skills or MCPs
