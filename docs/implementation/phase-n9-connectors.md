# Phase N9 — Connectors (HTTP, IMAP, SMTP)

**Estimate:** 4–6 days

**Depends on:** N8 (skills and MCPs removed)

---

## Goals

Replace the MCP/skill I/O model with **Connectors** — typed, credential-backed config blocks that handle deterministic I/O so the AI only does what it is genuinely good at: reasoning on text.

Three connector types ship in this phase:

| Type | Direction | Use |
|---|---|---|
| `http` | In + Out | Source: fetch data from any REST API or web URL. Worker action: POST/PUT result to an external API. |
| `imap` | In | Source: read email from an inbox — one card per message. |
| `smtp` | Out | Worker action: send an email after the AI run completes. |

**Architecture rule:** Connectors handle I/O. The AI handles reasoning. These two concerns never mix — the connector fetches raw data, hands it to the AI as plain text, and the AI's text output is handed back to the connector to act on.

---

## Data model

### Connector file

```
~/Documents/Trayline/connectors/
  <id>/
    connector.json
```

`connector.json` schema (discriminated union on `type`):

```typescript
// HTTP connector — inbound fetch or outbound POST/PUT
interface HttpConnector {
  id: string
  type: 'http'
  name: string
  base_url: string            // e.g. "https://api.github.com"
  default_method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  headers: Array<{
    name: string
    value: string             // plain value, OR "{{secret:key_name}}" to reference keytar
  }>
  timeout_ms: number          // default 15000
}

// IMAP connector — read email inbox
interface ImapConnector {
  id: string
  type: 'imap'
  name: string
  host: string                // e.g. "imap.gmail.com"
  port: number                // e.g. 993
  secure: boolean             // true = TLS, false = STARTTLS
  username: string
  // password stored in keytar: service='trayline-connector-<id>' account='password'
}

// SMTP connector — send email
interface SmtpConnector {
  id: string
  type: 'smtp'
  name: string
  host: string                // e.g. "smtp.gmail.com"
  port: number                // e.g. 587
  secure: boolean             // false = STARTTLS (587), true = TLS (465)
  username: string
  from_name: string
  from_address: string
  // password stored in keytar: service='trayline-connector-<id>' account='password'
}

type Connector = HttpConnector | ImapConnector | SmtpConnector
```

Secret references in HTTP headers use the pattern `{{secret:my_key}}`. The connector service replaces these at execution time by reading from keytar (`service='trayline-connector-<id>'`, `account='my_key'`) before making the request — the raw `{{secret:...}}` string never leaves the main process.

### Source step additions (`step.json`)

```typescript
interface SourceStepConfig {
  // ... existing fields ...
  connector_id?: string        // which connector fetches the raw data
  connector_request?: {
    url_path?: string          // appended to base_url, supports {{variable}} tokens
    method?: 'GET' | 'POST'   // overrides connector default
    body?: string              // JSON body template for POST, supports {{variable}} tokens
  }
  // IMAP-specific filter (ignored for HTTP connectors)
  imap_filter?: {
    folder?: string            // default "INBOX"
    unseen_only?: boolean      // default true
    max_messages?: number      // default 50
    subject_contains?: string
    from_contains?: string
  }
}
```

When `connector_id` is set, the source runner fetches raw data via the connector and passes it to the AI. When absent, the AI fetches data itself (existing Claude Code behaviour — still supported).

### Worker step additions (`step.json`)

```typescript
interface WorkerStepConfig {
  // ... existing fields ...
  output_action?: OutputAction
}

type OutputAction =
  | { connector_id: string; type: 'smtp'; smtp: SmtpActionConfig }
  | { connector_id: string; type: 'http'; http: HttpActionConfig }

interface SmtpActionConfig {
  to: string                   // supports {{card.data.*}} and {{worker.output.*}} tokens
  subject: string
  body: string                 // plain text or HTML; supports template tokens
  reply_to?: string
}

interface HttpActionConfig {
  url_path?: string            // appended to connector base_url; supports tokens
  method?: 'POST' | 'PUT' | 'PATCH'
  body: string                 // JSON template; supports tokens
}
```

Template token resolution: `{{card.data.foo}}` resolves against the input card's data. `{{worker.output.bar}}` resolves against the parsed AI output JSON. Both follow the same dotted-path rules as `renderProcessTemplate` in `prompt-utils.ts`.

---

## Tasks

### 1. Dependencies

- [ ] Add `imapflow` to `dependencies` in `package.json` — modern IMAP client, promise-based
- [ ] Add `nodemailer` to `dependencies` — SMTP sending
- [ ] Add `@types/nodemailer` to `devDependencies`
- [ ] Verify `node-fetch` is not needed — Node 20+ ships native `fetch`; use it directly

### 2. Shared types

- [ ] Add `Connector`, `HttpConnector`, `ImapConnector`, `SmtpConnector` types to `src/shared/types.ts`
- [ ] Add `ConnectorSummary` (the IPC-safe list entry: `id`, `type`, `name`) to `src/shared/types.ts`
- [ ] Add `OutputAction`, `SmtpActionConfig`, `HttpActionConfig` to `src/shared/types.ts`
- [ ] Add `ImapFilter` to `src/shared/types.ts`
- [ ] Extend `SourceStepConfig` with `connector_id?`, `connector_request?`, `imap_filter?`
- [ ] Extend `WorkerStepConfig` with `output_action?`

### 3. `fs-service.ts` — add connector path

- [ ] Add `Paths.connectors` → `path.join(Paths.base, 'connectors')`
- [ ] `fsService.bootstrap()` already creates all `Paths.*` directories — add connectors to the list

### 4. `connector-service.ts` — CRUD

Create `src/main/services/connector-service.ts`:

- [ ] `list(): Promise<Connector[]>` — reads all `connectors/<id>/connector.json` files; skips malformed entries with a console.warn
- [ ] `get(id: string): Promise<Connector | null>`
- [ ] `save(connector: Connector): Promise<void>` — writes `connectors/<id>/connector.json`; creates the folder if absent
- [ ] `delete(id: string): Promise<void>` — removes the folder and all keytar credentials for that connector (iterate over known secret account names per connector type)
- [ ] `resolveSecrets(connector: HttpConnector): Promise<HttpConnector>` — returns a copy of the connector with all `{{secret:key}}` header values replaced by their keytar values; throws a descriptive error if a referenced secret is missing
- [ ] `saveSecret(connectorId: string, account: string, value: string): Promise<void>` — writes to keytar
- [ ] `deleteSecrets(connectorId: string): Promise<void>` — deletes all known accounts for the connector from keytar
- [ ] `testConnection(connectorId: string): Promise<{ ok: boolean; error?: string }>` — see task 8

### 5. `http-connector.ts` — execute HTTP requests

Create `src/main/services/http-connector.ts`:

- [ ] `fetchHttp(connector: HttpConnector, request: ConnectorRequest): Promise<string>` — performs the request using native `fetch`; returns the raw response body as a string (JSON or text); throws on non-2xx status with the status code and response body in the message
- [ ] Resolves `url_path` tokens against the request context before appending to `base_url`
- [ ] Sets all resolved headers on the request
- [ ] Respects `connector.timeout_ms` via `AbortSignal.timeout()`
- [ ] Handles `request.method` override over `connector.default_method`
- [ ] Sets `Content-Type: application/json` automatically when a `body` is present and no Content-Type header is configured

### 6. `imap-connector.ts` — fetch emails

Create `src/main/services/imap-connector.ts`:

- [ ] `fetchEmails(connector: ImapConnector, filter: ImapFilter): Promise<EmailItem[]>` using `imapflow`
- [ ] `EmailItem` shape: `{ uid: string; messageId: string; subject: string; from: string; date: string; body_text: string; body_html?: string }`
- [ ] Retrieves the `password` secret from keytar before connecting
- [ ] Opens the configured folder (default `INBOX`), applies `unseen_only`, `subject_contains`, `from_contains` filters
- [ ] Fetches up to `max_messages` most recent matching messages (newest first)
- [ ] Extracts plain-text body preferentially; falls back to stripping HTML tags if only HTML is available
- [ ] Marks fetched messages as seen only when `unseen_only: true` (so re-runs don't re-process)
- [ ] Disconnects cleanly after fetch

### 7. `smtp-connector.ts` — send email

Create `src/main/services/smtp-connector.ts`:

- [ ] `sendEmail(connector: SmtpConnector, opts: ResolvedSmtpAction): Promise<void>` using `nodemailer`
- [ ] `ResolvedSmtpAction`: `{ to: string; subject: string; body: string; reply_to?: string }`
- [ ] Retrieves `password` from keytar before creating the transport
- [ ] Creates a new nodemailer transport per call (no pooling in V1)
- [ ] Sends as plain text if body contains no HTML tags; otherwise sends as HTML with a text fallback (strip tags)
- [ ] Throws with a descriptive message on SMTP auth failure or connection error

### 8. Connection test helpers

- [ ] HTTP: `testHttpConnector(connector: HttpConnector): Promise<{ ok: boolean; error?: string }>` — makes a HEAD or GET request to `base_url`; any 2xx or 3xx response is considered OK
- [ ] IMAP: `testImapConnector(connector: ImapConnector): Promise<{ ok: boolean; error?: string }>` — opens a connection, runs `LIST "" ""`, disconnects; success = no throw
- [ ] SMTP: `testSmtpConnector(connector: SmtpConnector): Promise<{ ok: boolean; error?: string }>` — calls `transport.verify()`
- [ ] Wire into `connector-service.testConnection()` by dispatching on `connector.type`

### 9. `connector-service.test.ts`

- [ ] Test `list()`: returns connectors from disk; skips malformed entries
- [ ] Test `save()` + `get()`: round-trip a connector object
- [ ] Test `delete()`: folder removed, keytar secrets deleted
- [ ] Test `resolveSecrets()`: replaces `{{secret:token}}` with keytar value; throws on missing secret
- [ ] Mock keytar and the filesystem; do not hit real IMAP/SMTP/HTTP in unit tests

### 10. Source runner — connector integration

In `src/main/services/source-runner.ts`:

- [ ] If `step.connector_id` is set:
  - Load the connector via `connectorService.get(id)`. If not found, abort with `source_run_failed` ("Connector not configured").
  - **HTTP connector**: call `fetchHttp(connector, step.connector_request ?? {})` — pass the raw response string as the "pre-fetched data" to the AI
  - **IMAP connector**: call `fetchEmails(connector, step.imap_filter ?? {})` — serialize the `EmailItem[]` as a JSON string; pass as pre-fetched data
  - Pass the pre-fetched data to the adapter via a new `prefetchedData?: string` field in `SpawnOptions` (or embed it in the rendered prompt — see below)
- [ ] When `prefetchedData` is present, render it into the prompt before the `source.md` instructions:

  ```
  ## Fetched data
  
  <raw response or email JSON>
  
  ---
  
  ## Your task
  
  <source.md content>
  ```

- [ ] When `connector_id` is absent, existing behaviour is unchanged (AI fetches data itself via Claude Code)
- [ ] On connector fetch error (network failure, auth failure), abort the source run with `source_run_failed` and log the connector error — do not spawn the AI

### 11. Worker runner — output action integration

In `src/main/services/worker-runner.ts`:

- [ ] After a successful `runInner()` call (when `result.exitCode === 0`), check if the worker step has `output_action` configured
- [ ] If yes, call `executeOutputAction(action, cardData, result.output)`:
  - Resolve all template tokens in the action config: `{{card.data.*}}` from `cardData`, `{{worker.output.*}}` from `result.output` (parsed JSON)
  - **SMTP action**: load `SmtpConnector`, call `sendEmail(connector, resolvedAction)`
  - **HTTP action**: load `HttpConnector`, call `fetchHttp(connector, resolvedAction)` (fire-and-forget for simple webhooks; log response)
- [ ] If the output action fails (SMTP error, HTTP error): log `worker_output_action_failed` audit event with the error; **do not fail the worker run** — the card still advances. The action failure is visible in the run detail.
- [ ] Add `output_action_error?: string` to the run result meta so the UI can surface it

### 12. Adapter interface — add `prefetchedData`

- [ ] Add optional `prefetchedData?: string` to `SpawnOptions` in `adapter.ts`
- [ ] In `claude-code.ts` `spawn()`: when `prefetchedData` is set, prepend it to the rendered prompt (same format as source runner task 10 above)
- [ ] In `local-llm.ts` `buildFullPrompt()`: when `prefetchedData` is set, include it as a `## Fetched data` section before the process file content

### 13. IPC channels

- [ ] Add `connector` block to `src/shared/ipc-channels.ts`:
  ```typescript
  connector: {
    list:           'connector:list',
    get:            'connector:get',
    save:           'connector:save',
    delete:         'connector:delete',
    saveSecret:     'connector:save-secret',
    testConnection: 'connector:test-connection',
  }
  ```

### 14. IPC handlers

In `src/main/ipc/handlers.ts`:

- [ ] `connector:list` → `connectorService.list()` (returns `ConnectorSummary[]` — no secrets)
- [ ] `connector:get` → `connectorService.get(id)` (returns `Connector` — no secret values substituted)
- [ ] `connector:save` → `connectorService.save(connector)`
- [ ] `connector:save-secret` → `connectorService.saveSecret(connectorId, account, value)` — secrets never travel back to the renderer, only written
- [ ] `connector:delete` → `connectorService.delete(id)`
- [ ] `connector:test-connection` → `connectorService.testConnection(id)` → returns `{ ok, error? }`

### 15. Preload bridge

In `src/preload/index.ts`:

- [ ] Add `connector` namespace to `TraylineAPI`:
  ```typescript
  connector: {
    list: (): Promise<ConnectorSummary[]>
    get: (id: string): Promise<Connector | null>
    save: (connector: Connector): Promise<void>
    saveSecret: (connectorId: string, account: string, value: string): Promise<void>
    delete: (id: string): Promise<void>
    testConnection: (id: string): Promise<{ ok: boolean; error?: string }>
  }
  ```

### 16. Connectors screen — `ConnectorsScreen.tsx`

Replace the deleted `McpsScreen.tsx` with `src/renderer/components/connectors/ConnectorsScreen.tsx`:

- [ ] Header: "Connectors" title + **+ Add connector** button (opens type picker: HTTP / IMAP / SMTP)
- [ ] Installed connectors list: one card per connector showing: type badge (colour-coded), name, and a **Test** button + **⋯** menu (Edit, Delete)
- [ ] **Test** → calls `connector.testConnection(id)` → inline green ✓ or red ✗ with error tooltip
- [ ] **Edit** → opens the setup form pre-populated (same component as add, but in edit mode)
- [ ] **Delete** → confirmation dialog ("Delete will also remove stored credentials.")
- [ ] Empty state: "No connectors yet. Add one to fetch data or send email from your workflows."

### 17. Connector setup forms

Three forms, each rendered inside a `Dialog`:

**`HttpConnectorForm.tsx`:**
- [ ] Fields: Name, Base URL, Default method (select: GET/POST), Timeout (ms)
- [ ] Headers table: Add/remove rows of `{ name, value }`. When `value` starts with `{{secret:`, treat as a secret field — mask with a password input and save via `connector.saveSecret()` separately after the connector JSON is saved
- [ ] Test button (before saving)
- [ ] Save button

**`ImapConnectorForm.tsx`:**
- [ ] Fields: Name, Host, Port (default 993), Secure toggle (default on), Username, Password (masked — saved to keytar on submit)
- [ ] Test button
- [ ] Save button

**`SmtpConnectorForm.tsx`:**
- [ ] Fields: Name, Host, Port (default 587), Secure toggle (default off), Username, Password (masked — saved to keytar on submit), From name, From address
- [ ] Test button
- [ ] Save button

All three forms validate required fields before enabling Save. Show inline error on test failure.

### 18. TopBar navigation

- [ ] Add a **Connectors** nav entry in `TopBar.tsx` (use lucide `Plug` icon or `Network`)
- [ ] Route to `ConnectorsScreen`

### 19. Worker detail panel — Context + Output action

In `WorkerDetailPanel.tsx`, in the **"Context"** tab (renamed in N8):

- [ ] Add an **"Output action"** section below context packs:
  - Connector selector dropdown (lists connectors of type `smtp` or `http` only)
  - When SMTP selected: show `to`, `subject`, `body` template inputs
  - When HTTP selected: show `url_path`, `method`, `body` template inputs
  - Template hint below each field: "Use {{card.data.fieldName}} or {{worker.output.fieldName}}"
  - Clear button to remove the output action

### 20. Source detail panel — Connector assignment

In `SourceDetailPanel.tsx`, in the **Config** tab:

- [ ] Add a **"Data source"** section:
  - Connector selector dropdown (lists connectors of type `http` or `imap` only)
  - When HTTP selected: show `url_path` input (with base URL hint), method override select, body input
  - When IMAP selected: show `folder` (default INBOX), `unseen_only` toggle, `max_messages` input, optional `subject_contains` and `from_contains` filters
  - "No connector — AI fetches data" option (default, existing behaviour)
- [ ] Save config on blur / explicit Save button

### 21. Workflow author — update output

The `trayline-author` prompt currently generates step JSON with `skills` and `mcps` arrays. After N8 removes those fields, update `resources/author-prompt.md` to:

- [ ] Never emit `skills` or `mcps` in step JSON
- [ ] Optionally emit `context_packs: []` if the worker needs reference docs

### 22. Documentation

- [ ] `docs/tech-stack.md` — add `imapflow`, `nodemailer` to backend section; describe connector architecture
- [ ] `docs/features.md` — add section 7.19 Connectors (screen, forms, types); update 7.3 Worker detail (output action) and 7.16 Source detail (data source)
- [ ] `docs/user-flows.md` — add flows: "Add HTTP connector", "Add IMAP connector", "Add SMTP connector", "Source step with connector", "Worker with SMTP output action"
- [ ] `docs/data-model.md` — add `connectors/<id>/connector.json` schema; update `SourceStepConfig` and `WorkerStepConfig` schemas
- [ ] `docs/app-description.md` — add Connector to vocabulary table
- [ ] `docs/implementation/tasks.md` — check off N9 on completion

---

## Acceptance criteria

- `npm run typecheck` passes; `npm test` passes
- A new HTTP connector can be created, saved, and tested from the Connectors screen
- A new IMAP connector can be created with a password; the password is stored in keytar and never appears in `connector.json`
- A new SMTP connector can be created; test sends a verification connection
- A source step with an HTTP connector assigned fetches a real URL on "Run now" and passes the response to the AI; cards are created from the AI's output
- A source step with an IMAP connector fetches messages from the configured inbox; one card is created per new message
- A worker with an SMTP output action sends an email after the AI run, using template tokens from card data and worker output; the email arrives at the configured address
- A worker with an HTTP output action POSTs the worker's JSON output to the configured URL
- Output action failure (bad credentials, network error) does not fail the worker run; the error appears in the run detail
- Removing a connector also removes its keytar credentials
- A source step without a connector behaves identically to before this phase (Claude Code fetches data itself)
- The Connectors nav entry appears in the top bar where MCPs used to be
