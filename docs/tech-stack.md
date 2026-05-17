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
- **node-llama-cpp** (~3.18.1) — in-process GGUF model inference for the local-llm adapter; runs entirely offline after the model is downloaded. Requires `@electron/rebuild` as a dev dependency to compile native bindings against the app's Electron version.
- **chokidar** — file system watcher (detects new cards in trays)
- **better-sqlite3** — local indexed cache for run history and audit log
- **archiver / adm-zip** — zip-based project import/export (write / read)
- **node-cron** — scheduler for workers that poll on an interval
- **fast-glob** — folder scanning
- **keytar** — OS keychain access for MCP credentials (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)
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

## No External Dependencies at Runtime

- No cloud services
- No accounts
- No telemetry
- **One outbound call:** the Skill Finder fetches a public skill index (a single JSON file from a known GitHub repo) when the user opens it
- **Optional one-time download:** the local-llm adapter downloads a GGUF model file (~3–8 GB) from a known URL on first use; all inference after that is fully offline
- MCP credentials live in the OS keychain — never in plain files

---

## AI Terminal Adapter Layer

Workers don't know they're talking to Claude Code specifically. They talk to an **AI Terminal Adapter** — a thin interface that wraps any CLI-based AI agent.

```
src/main/ai-terminals/
├── adapter.ts          # The interface every adapter implements
├── claude-code.ts      # Claude Code adapter (default)
├── local-llm.ts        # Local GGUF model adapter (node-llama-cpp; no MCP support)
├── open-code.ts        # Open Code adapter (future)
├── mock.ts             # Test fake — returns scripted responses
└── registry.ts         # Lookup by name from worker config
```

The `local-llm` adapter uses `node-llama-cpp` for in-process inference. It streams token output, enforces JSON-only output via grammar constraints, and sets `supportsMcps: false` — workers and sources that have MCPs assigned will be blocked from running with this adapter. The model catalog is defined in `app-data/local-models.json` (bundled with the app); downloaded GGUF files live in `~/Documents/Trayline/local-models/`.

The adapter interface:

```typescript
interface AITerminalAdapter {
  id: string;
  displayName: string;
  kind: 'production' | 'mock';
  installUrl?: string;
  /**
   * When false, the adapter cannot use MCP tools. Any worker or source step
   * with MCPs assigned will be blocked from running and shown an inline error.
   * Omitting the field (or setting it to true) means MCPs are supported.
   */
  supportsMcps?: boolean;
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
    skills: SkillDefinition[];
    contextPacks: string[];
    mcps: MCPDefinition[];
    workingDir: string;
    timeout: number;
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

### Provider / model / effort selection

The Settings screen surfaces a Provider list (sourced from `adapterRegistry.list()` filtered by `detectInstalled()`), a Model dropdown (sourced from `adapter.listModels()`), and an Effort dropdown (sourced from `adapter.listEfforts(modelId)`). Selecting a provider re-issues `listModels`; selecting a model re-issues `listEfforts` because some providers tie efforts to specific models. Selections persist as `defaultAdapterId` / `defaultModelByAdapter` / `defaultEffortByAdapter` on the global Settings object. Worker `step.json` may still override these per-step — when present, the per-step fields are authoritative.

The footer shows the active selection as `Provider · Model · Effort · 5h: used/limit · Weekly: used/limit`. Adapters that don't expose `getUsage()` drop the usage segments instead of rendering placeholders. Footer values refresh whenever a worker run completes (the main process broadcasts `adapters:onUsageUpdate`) and via a manual refresh in Settings.

Two production adapters ship with Trayline: **Claude Code** (the default, requires the CLI installed) and **local-llm** (runs a downloaded GGUF model entirely offline via `node-llama-cpp`). The architecture supports any CLI agent from day one — adding a new adapter is a single file plus a registry entry, no engine changes.
