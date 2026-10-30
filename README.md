# Trayline

**Visual AI workflow automation for people who work, not people who code.**

Trayline is an offline-first desktop app that lets you build AI-assisted business workflows without writing a line of code, without a cloud subscription, and without needing IT. You describe what you want, Trayline builds the workflow, and your work starts moving on its own.

> **Status:** Active development — not yet released. Watch this repo for updates.

---

## How it works

Every workflow in Trayline is a vertical stack of two kinds of steps:

```
  ┌─────────────────┐
  │  📥  Intake      │  ← Tray: work lands here and waits
  │   3 cards        │
  └────────┬─────────┘
           ↓
  ┌─────────────────┐
  │  ⚙   Extract    │  ← Worker: AI reads the card and structures it
  │   running...     │
  └────────┬─────────┘
           ↓
  ┌─────────────────┐
  │  👤  Review      │  ← Tray: a human checks before moving on
  │   1 waiting      │
  └────────┬─────────┘
           ↓
  ┌─────────────────┐
  │  📧  Send reply  │  ← Worker: AI drafts and sends the response
  │   idle           │
  └─────────────────┘
```

- **Trays** are holding places. A card arrives (a form submission, a PDF, an email), a person or the system marks it ready, and it moves on.
- **Workers** are AI steps. They pick up a card, do something with it (extract data, draft a reply, classify a request), and drop the result into the next tray.

Everything is stored as folders and JSON files on your computer. A whole project is a zip you can share with a colleague. No accounts. No servers. No telemetry.

---

## What you can build with it

- Read incoming sales emails, qualify the lead, and draft a response for your team to approve and send
- Process PDF invoices — extract the data, validate it, and post it to your accounting tool
- Triage support tickets, classify them by urgency, and prepare draft replies
- Turn meeting transcripts into structured action item lists
- Monitor a GitHub repo for new issues, classify them, and route them to the right team member

If you can describe the process in plain English, Trayline can turn it into a workflow. You describe what you want; Trayline generates the structure; you run it.

---

## Features

- **Workflow Author** — describe your process in plain English; Trayline uses AI to generate the workflow structure for you
- **Visual workflow editor** — a clean left rail showing every step, drag-to-reorder, click to configure
- **Tray schema builder** — define the shape of work items with a drag-and-drop field builder (text, file, date, select, etc.)
- **Worker instructions** — write your worker's prompt in plain Markdown; variables like `{{card.data}}` are resolved at run time
- **Embedded terminal** — the AI terminal is always one click away, never in your face
- **Skills** — reusable capability packs (read a PDF, parse a CSV) you install once and assign to any worker
- **MCPs** — connect workers to real-world services: Gmail, Google Calendar, Google Drive, GitHub, Slack, and more
- **Context packs** — inject your company knowledge (brand voice, pricing, escalation rules) into any worker's prompt
- **Human review trays** — any tray can require a human to approve before the workflow continues
- **Run history** — every card, every run, every decision is logged and auditable
- **Import / export** — share workflows as zip files; required skills and MCPs are listed in the manifest
- **Offline-first** — the only outbound network call is fetching the optional skills catalog

---

## Built on

| Layer | Technology |
|---|---|
| Desktop shell | Electron |
| Runtime | Node.js 20+, TypeScript |
| UI | React 18, Vite, Tailwind CSS, shadcn/ui |
| AI terminal | node-pty (spawns Claude Code or any CLI agent) |
| File watching | chokidar |
| Local database | better-sqlite3 (audit log index) |
| Credentials | keytar (OS keychain — never plain files) |
| Terminal display | xterm.js |
| Animations | framer-motion |
| Icons | lucide-react |

Trayline wraps CLI AI agents (Claude Code by default) through an **AI Terminal Adapter** interface, so the core engine doesn't depend on any specific agent. Open Code, Aider, and others can be added without touching the workflow engine.

---

## Getting started (development build)

Trayline has not yet shipped a user-facing release. If you want to run it locally from source:

**Prerequisites**
- Node.js 22.12+, 24 or 26 (`.nvmrc` pins 22, the version CI uses). Electron and `@electron/rebuild` need 22.12 or newer.
- [pnpm](https://pnpm.io) 11 (`npm i -g pnpm@11`, or `corepack enable`)
- A working installation of [Claude Code](https://claude.ai/code) (or another supported CLI agent) on your `PATH`
- **Linux only:** a C/C++ toolchain and libsecret headers to build the native modules (`better-sqlite3`, `keytar`, `node-pty`). On Debian/Ubuntu:
  ```bash
  sudo apt install build-essential python3 pkg-config libsecret-1-dev
  ```
  Storing credentials needs a running Secret Service (GNOME Keyring or KWallet), which every mainstream desktop provides.

```bash
git clone https://github.com/drlecks/trayline.git
cd trayline
pnpm install
pnpm dev
```

The app will open. On first launch it creates `~/Documents/Trayline/` and seeds the system skills. Everything else is self-contained.

**Build for your platform**

```bash
pnpm build             # compile TypeScript + Vite
pnpm dist:mac          # macOS (universal binary)
pnpm dist:win          # Windows (NSIS installer)
pnpm dist:linux        # Linux (AppImage)
```

**Run tests**

```bash
pnpm test              # unit tests (mock AI adapter, no real CLI required)
```

---

## Project structure

Data lives in `~/Documents/Trayline/`. The full folder layout — including how cards move between trays and how runs are stored — is documented in [`docs/data-model.md`](docs/data-model.md).

---

## Roadmap

Implementation is organized into phases. The current status of each is tracked in [`docs/implementation/tasks.md`](docs/implementation/tasks.md).

---

## Contributing

Pull requests are welcome. For significant changes, please open an issue first to discuss the approach.

A few things to know before diving in:

- The AI Terminal Adapter is the central abstraction. Worker logic should never call Claude Code (or any specific CLI) directly.
- Card movement is atomic — always follow the write-then-rename protocol described in `docs/data-model.md`.
- MCP credentials belong in the OS keychain via `keytar`. If you're touching anything credential-related, they must never touch the file system.
- The mock AI adapter (`src/main/ai-terminals/mock.ts`) exists specifically so tests can run without a real CLI agent installed.

The full architectural context is in [`docs/`](docs/) and [`CLAUDE.md`](CLAUDE.md).

---

## License

Trayline is released under the **GNU General Public License v3.0 (GPLv3)**.

In plain English:

- You can **use** Trayline for anything, including at a company, for free.
- You can **modify** it however you want.
- You can **redistribute** it — original or modified.
- If you redistribute a modified version, it **must also be GPLv3** and you must make the source available.
- There is **no warranty** — use it at your own risk.

See the [full license text](https://www.gnu.org/licenses/gpl-3.0.txt) for the legal version.
