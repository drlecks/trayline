# Trayline — Tech Stack

---

## Shell & Runtime

- **Electron** — desktop wrapper; native file system, subprocess, OS notifications
- **Node.js 20+** — main process
- **TypeScript** — across both processes (main + renderer)
- **Vite** — renderer build tool

---

## UI (Renderer Process)

- **React 18** — renderer framework
- **Tailwind CSS** — styling
- **shadcn/ui** — base components (buttons, dialogs, forms)
- **lucide-react** — icons
- **react-hook-form + zod** — dynamic forms rendered from tray schemas
- **xterm.js** — embedded terminal rendering
- **framer-motion** — small, tasteful animations (status pills, drawer slides)

---

## Backend / System (Main Process)

- **node-pty** — real PTY for spawning `claude` and other CLI agents
- **chokidar** — file system watcher (detects new cards in trays)
- **better-sqlite3** — local indexed cache for run history and audit log
- **archiver / adm-zip** — zip-based project import/export (write / read)
- **node-cron** — scheduler for workers that poll on an interval
- **fast-glob** — folder scanning
- **keytar** — OS keychain access (Keychain on macOS, Credential Manager on Windows, libsecret on Linux); used by the Credentials store to hold passwords for HTTP, IMAP, and SMTP credentials
- **imapflow** — modern IMAP client used by the Source step IMAP channel to fetch emails; promise-based, handles search, seen-flag marking, and clean disconnection
- **nodemailer** — SMTP email sending used by the Outlet step SMTP channel
- **Electron.Notification** (built-in) — OS push notifications when cards need review; guarded by `Notification.isSupported()`
- **app.setBadgeCount / BrowserWindow.setOverlayIcon** (built-in) — dock/taskbar badge showing pending-review count; SVG-drawn overlay on Windows, native badge count on macOS and Linux

---

## Testing

- **Vitest** — test runner for both main-process and shared code. Run with `npm test` (one-shot) or `npm run test:watch`.
- **Test layout** — tests live **co-located** with the code they cover (`foo.ts` ↔ `foo.test.ts`). No separate `__tests__/` folder.
- **Isolation** — `vitest.setup.ts` stubs the `electron` module and points `fs-service.Paths` at a freshly created tmp directory per test run, so tests never touch a developer's real `~/Documents/Trayline`.
- **Mocking external systems** — use `vi.mock` for libraries like `node-cron` and `chokidar`, and `vi.stubGlobal('fetch', ...)` for HTTP. Tests must not depend on real timers or the network.
- **What must have tests** — see the **Testing Policy** section of `CLAUDE.md`. In short: every non-trivial main-process service, every adapter, every rule-encoding shared utility, every data-integrity path, and every bug fix on those paths.

---

## Credentials & Channel I/O

Trayline has a global **Credentials store** (`~/Documents/Trayline/credentials/`) that holds named auth configs for HTTP, IMAP, and SMTP. Non-secret fields (host, port, username, headers, base URL) are written as JSON. Passwords and API keys are stored in the OS keychain via keytar, never on disk.

Three channel service files implement the I/O:

| File | Purpose |
|---|---|
| `src/main/services/credential-service.ts` | CRUD for credentials, keytar read/write, test-connection dispatch |
| `src/main/services/http-channel.ts` | HTTP GET (`fetchHttp`) and HTTP POST (`postHttp`) with token resolution and secret header injection |
| `src/main/services/imap-channel.ts` | IMAP fetch (`fetchEmails`) via imapflow with seen-flag handling |
| `src/main/services/smtp-channel.ts` | SMTP send (`sendEmail`) via nodemailer; auto-detects HTML vs plain text |

Source steps use `fetchHttp` / `fetchEmails` to pre-fetch data before spawning the AI. Outlet steps use `postHttp` / `sendEmail` to dispatch card data after token resolution, with no AI involved.

---

## No External Dependencies at Runtime

- No cloud services
- No accounts
- No telemetry

---

## PlatformAdapter Layer

All platform-specific OS integration is isolated in `src/main/platform/`. `index.ts` calls only the `PlatformAdapter` interface — no `process.platform` switches outside this folder.

```
src/main/platform/
├── adapter.ts      # PlatformAdapter interface, TrayState type, PlatformCallbacks type
├── registry.ts     # getPlatformAdapter() — switches on process.platform, returns the right impl
├── win32.ts        # Windows: notification-area tray, left-click = show window
├── darwin.ts       # macOS: menu-bar tray, left-click = context menu (platform norm), dock-click = show window
└── linux.ts        # Linux: DE tray, static context menu (popUpContextMenu() is unreliable across DEs)
```

Key behaviours:
- **Close → hide.** The window's close button hides the window instead of quitting. `isQuitting` flag in `index.ts` distinguishes a real Quit (from the tray menu) from a close-button press.
- **Single-instance enforcement.** `app.requestSingleInstanceLock()` is called before `app.whenReady()`. A duplicate instance quits immediately; the `second-instance` event fires `surfaceWindow()` on the surviving instance.
- **Tray icon.** Created via Electron's built-in `Tray` API — no extra npm dependency. Icon path shared via `src/main/util/app-icon.ts`.
- **Context menu.** Resume All / Stop All / Quit. Resume All and Stop All enabled/disabled state is kept in sync with the orchestrator via `updateTrayState(state: TrayState)`.

**Linux caveat:** On GNOME without the AppIndicator Shell Extension the tray icon may not appear — this is a known upstream Electron / GNOME limitation. The window can still be re-opened by launching the app again (single-instance catches it and surfaces the window).

---

## AI Terminal Adapter Layer

Workers don't know they're talking to Claude Code specifically. They talk to an **AI Terminal Adapter** — a thin interface that wraps any CLI-based AI agent.

```
src/main/ai-terminals/
├── adapter.ts          # The interface every adapter implements
├── claude-code.ts      # Claude Code adapter (default, currently the only production adapter)
├── mock.ts             # Test fake — returns scripted responses
└── registry.ts         # Lookup by name from worker config
```

One production adapter ships with Trayline: **Claude Code** (requires the CLI installed). The architecture is designed for more — adding a new adapter (OpenCode, Copilot, etc.) is a single file plus a registry entry. Mock adapters are never exposed in any user-facing UI; they are filtered at the IPC layer.

The adapter interface:

```typescript
interface AITerminalAdapter {
  id: string;
  displayName: string;
  kind: 'production' | 'mock';
  installUrl?: string;
  /**
   * Returns structured readiness without running any inference.
   * Checks only what is cheaply detectable: binary presence, version, and any
   * adapter-specific structural preconditions (e.g. local server reachable).
   * Never consumes API tokens.
   */
  checkReadiness(): Promise<AdapterReadiness>;
  /** @deprecated Use checkReadiness() instead. */
  detectInstalled(): Promise<boolean>;
  /** @deprecated Use checkReadiness() instead. */
  getVersion(): Promise<string | null>;
  /** Models the user can pick for this provider. */
  listModels(): Promise<ModelInfo[]>;
  /** Effort tiers for the given model. Return [] for providers that don't expose tiers. */
  listEfforts(modelId: string): Promise<EffortInfo[]>;
  /** Optional rolling-window usage telemetry (e.g. Claude Code 5h / weekly). */
  getUsage?(): Promise<AdapterUsageSnapshot | null>;
  /** Invokes the provider's "/clear" so the next run starts with empty history. */
  clearContext(): Promise<void>;
  spawn(opts: {
    processFile: string;
    cardData: object;
    contextPacks: string[];
    workingDir: string;
    timeout: number;
    prefetchedData?: string;
    /** Project-level permissions. Claude Code translates to --allowedTools flags + a permissions preamble in the prompt. */
    permissions?: ProjectPermissions;
  }): Promise<AISession>;
}

interface AdapterReadiness {
  adapterId: string;
  installed: boolean;
  version: string | null;
  blockers: AdapterBlocker[];  // empty = ready to run
  checkedAt: number;
}

interface AdapterBlocker {
  kind: AdapterBlockerKind;  // 'not_installed' | (extensible)
  message: string;
  fixUrl?: string;
  fixCommand?: string;
}

interface AISession {
  pid: number;
  stdout: AsyncIterable<string>;
  stderr: AsyncIterable<string>;
  awaitingInput: boolean;
  sendInput(text: string): Promise<void>;
  kill(): Promise<void>;
  result(): Promise<AISessionResult>;
}
```

### Post-run clear protocol

Every worker run — success **or** failure — ends with the runner invoking `adapter.clearContext()` before releasing the adapter back to the pool. This prevents transcript history from one card carrying into the next and burning tokens. Clear failures are non-fatal: the runner writes an `ai_terminal_clear_failed` audit row and the run outcome stands.

### Permission auto-accept loop

While a worker session is running, the worker runner scans the stdout stream for Claude Code permission-request prompts (e.g. `[y/N]` style or TUI numbered-choice boxes). When detected, the runner:

1. Sends the appropriate confirmation input (`y\n` or `1\n`) via `session.sendInput()`.
2. Writes an `ai_permission_auto_accepted` audit row with the retry counter.
3. Increments a per-run retry counter.

If the counter reaches **3** and a fourth prompt is detected, the runner calls `session.kill()` and sets `runError = 'max_permission_retries_exceeded'`, failing the run cleanly. The source card lands in `99-errors/`.

Detection lives in `detectPermissionPrompt(rawText: string): boolean` (exported from `claude-code.ts`). The function strips ANSI escape sequences before pattern matching, so it works on raw PTY output. The companion `permissionPromptResponse(rawText)` picks the right reply (`y\n` vs `1\n`) based on the same patterns.

### Provider / model / effort selection

The Settings screen surfaces a Provider list (sourced from `adapterRegistry.list()` filtered by `detectInstalled()`), a Model dropdown (sourced from `adapter.listModels()`), and an Effort dropdown (sourced from `adapter.listEfforts(modelId)`). Selecting a provider re-issues `listModels`; selecting a model re-issues `listEfforts` because some providers tie efforts to specific models. Selections persist as `defaultAdapterId` / `defaultModelByAdapter` / `defaultEffortByAdapter` on the global Settings object. Worker `step.json` may still override these per-step — when present, the per-step fields are authoritative.

The footer shows the active selection as `Provider · Model · Effort · 5h: used/limit · Weekly: used/limit`. Adapters that don't expose `getUsage()` drop the usage segments instead of rendering placeholders. Footer values refresh whenever a worker run completes (the main process broadcasts `adapters:onUsageUpdate`) and via a manual refresh in Settings.

**Claude Code** is the default and currently only production adapter. The architecture supports any CLI agent from day one — adding a new adapter is a single file plus a registry entry, no engine changes.

### Quick AI Console IPC channels

The Quick AI Console is a lightweight one-shot query modal that fires outside the workflow engine. It uses a dedicated IPC surface:

| Channel | Direction | Description |
|---|---|---|
| `ai:query` | invoke (renderer → main) | Spawn the active adapter with the given prompt string. Streams `ai:query-chunk` events to the renderer until done. Resolves when the session exits. |
| `ai:abort` | send (renderer → main) | Kill any in-flight Quick AI session immediately. |
| `ai:query-chunk` | push (main → renderer) | One stdout chunk from the active session, forwarded in real time. |

The handler in `src/main/ipc/handlers.ts` spawns the adapter into a temp directory, iterates its stdout async iterator, and broadcasts each chunk. On close the temp directory is cleaned up. There is at most one Quick AI session alive at a time; starting a new query while one is running first kills the old one.
