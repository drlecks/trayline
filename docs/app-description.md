# Trayline — App Description & Objectives

> A visual, offline-first desktop app for building AI workflows out of trays and workers — no code, no cloud, just folders.

---

## Concept

Trayline lets a non-technical user build an AI-assisted business workflow visually. Each workflow is a **linear top-to-bottom stack** of three kinds of steps:

- **Sources** — automated ingestion steps that run on a cron schedule, fetch data from the world via AI, and create cards for new items only (deduplication built in). A Source is always the first step when a workflow needs to pull data in automatically.
- **Trays** — places where work waits. A card lands in a tray, a human (or the system) marks it ready, and it moves on.
- **Workers** — automated AI processes that pick up cards from the tray above them, do something, and drop the result in the tray below. Workers optionally run in **batch mode**, receiving all ready cards at once and producing a single consolidated output card.

Everything lives on disk as folders and JSON files. A whole project is a zip you can share with a colleague.

---

## Vocabulary

| Term | Meaning |
|---|---|
| **Project** | A self-contained folder containing workflows, context packs, and exports |
| **Workflow** | A linear stack of steps (top to bottom) |
| **Source** | A scheduled ingestion step that fetches data from the world via AI, deduplicates, and creates cards for new items only |
| **Tray** | A holding place for cards; can be auto-approved or human-reviewed |
| **Worker** | An AI step that processes cards using skills + a `process.md` |
| **Batch Worker** | A worker with `batch_mode: true` that receives all ready cards as a JSON array and produces one consolidated output card |
| **Card** | One item moving through the workflow (a request, an invoice, a ticket) |
| **Skill** | A reusable capability that a worker uses (e.g. "read PDF", "send email"). Installed globally; assigned per-worker. |
| **System Skill** | A skill that ships with the app and powers app-level operations (`trayline-author`, `trayline-scaffold`) |
| **MCP** | Model Context Protocol server — a process that exposes tools and resources to an AI agent. Managed as installable, configurable dependencies. |
| **Context Pack** | Markdown files with project knowledge injected into worker prompts |
| **Run** | One execution of a worker on one card |
| **Audit Log** | The append-only history of everything that happened |
| **AI Terminal Adapter** | The interface that wraps a CLI agent (Claude Code, Open Code, etc.) so workers don't depend on a specific tool |
| **Workflow Author** | The "describe what you want" screen that generates a starting workflow |
| **Credential Set** | The credentials (OAuth tokens, API keys, etc.) that an MCP needs to function. Stored in the OS keychain, never in plain JSON. |
| **Setup Wizard** | The guided step-by-step flow that an MCP defines for configuration (e.g. open the browser for OAuth, paste an API key). |

---

## Target Users

Trayline is **not** for programmers. It is for people who manage real processes in real companies and who until now depended on IT to automate anything. The control returns to whoever truly knows the process.

- **Executive assistants** — manage requests, document meetings, filter urgent vs. deferrable — without unnecessary keyboard work.
- **Operations managers** — automate processing of invoices, contracts, and reports. The team only reviews exceptions.
- **Customer support managers** — AI classifies and drafts. The human team approves and sends. Volume that once required five people now handled by one.
- **Legal or financial practices** — extract data from documents, organize files, prepare drafts. With a fully audited, traceable history.

---

## Why This Will Work

- **Files on disk = trust.** Non-engineers can still inspect what's happening. IT departments will approve it. Backups are trivial.
- **Linear-only = approachable.** Branching graphs scare people. A stack of steps is something everyone has built (Trello columns, email rules, etc.).
- **Sources + trays + workers = one mental model.** It's not "nodes and connections", it's "data comes in, it waits, a thing happens, it waits again." Sources handle automatic ingestion with built-in memory so the same item is never processed twice. That maps to how offices actually work.
- **Terminal is hidden but available.** Power users get full debug access. Everyone else never sees it.
- **Offline = no pricing dread.** The app itself costs nothing to run. The only API costs come from whichever CLI agent the user points it at, and they manage that themselves.

---

## Out of Scope for MVP

- Branching / parallel flows (only linear)
- Multi-user collaboration / sync
- Cloud hosting
- A built-in marketplace for skills (only the GitHub-fetched index)
- Plugins or custom step types
- Mobile / web version
- Built-in MCP server hosting (skills can wrap MCP, but Trayline doesn't ship one)
