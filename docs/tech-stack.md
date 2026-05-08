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
- **archiver / unzipper** — zip-based project import/export
- **node-cron** — scheduler for workers that poll on an interval
- **fast-glob** — folder scanning
- **keytar** — OS keychain access for MCP credentials (Keychain on macOS, Credential Manager on Windows, libsecret on Linux)

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
