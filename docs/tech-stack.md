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

- **Effect** — typed effect system for main-process service orchestration, dependency injection, resource cleanup, retries, and explicit domain errors
- **node-pty** — real PTY for spawning `claude` and other CLI agents
- **chokidar** — file system watcher (detects new cards in trays)
- **better-sqlite3** — local indexed cache for run history and audit log
- **archiver / unzipper** — zip-based project import/export
- **node-cron** — scheduler for workers that poll on an interval
- **fast-glob** — folder scanning
- **keytar** — OS keychain access for MCP credentials (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)

---

## Effect Usage Guidelines

Trayline uses **Effect** first in the Electron main process, where most high-risk side effects live: file system writes, SQLite mutations, subprocess execution, watchers, scheduler jobs, import/export, and AI adapter calls.

- Use `Effect` for new main-process service methods that touch files, SQLite, subprocesses, timers, watchers, network, or OS resources.
- Model recoverable failures as typed domain errors instead of throwing generic `Error` values.
- Keep domain transformations pure where practical, and wrap side effects at the boundary.
- Prefer Effect services/layers for dependencies such as file system access, audit log access, AI adapters, clocks, IDs, settings, and path resolution.
- IPC handlers are the bridge back to Electron: run Effect programs at the handler boundary and convert typed failures into stable renderer-facing error shapes.
- Renderer code can keep React, Zustand, and `Promise`-based IPC calls unless a screen has enough async orchestration to justify a small Effect wrapper.
- Existing Promise-based code can remain until it is touched for feature work, but new Phase 4+ backend code should follow the Effect style.

The migration is intentionally incremental. The goal is better reliability and testability around side effects, not a whole-app rewrite.

---

## No External Dependencies at Runtime

- No cloud services
- No accounts
- No telemetry
- **One outbound call:** the Skill Finder fetches a public skill index (a single JSON file from a known GitHub repo) when the user opens it
- MCP credentials live in the OS keychain — never in plain files

---

## AI Terminal Adapter Layer

Workers don't know they're talking to Claude Code specifically. They talk to an **AI Terminal Adapter** — a thin interface that wraps any CLI-based AI agent.

```
src/main/ai-terminals/
├── adapter.ts          # The interface every adapter implements
├── claude-code.ts      # Claude Code adapter (default)
├── open-code.ts        # Open Code adapter (future)
├── mock.ts             # Test fake — returns scripted responses
└── registry.ts         # Lookup by name from worker config
```

The adapter interface:

```typescript
interface AITerminalAdapter {
  id: string;
  displayName: string;
  detectInstalled(): Promise<boolean>;
  getVersion(): Promise<string | null>;
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

The Claude Code adapter is the only one shipping in MVP, but the architecture supports any CLI agent from day one. Adding a new adapter is a single file plus a registry entry — no engine changes.
