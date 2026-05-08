# Phase 5 — Terminal Integration

**Estimate:** 1 week

---

## Goals

Full embedded terminal experience for watching and interacting with worker runs.

---

## Tasks

- [ ] **xterm.js panel** in worker detail — replays `terminal.log` for completed runs
- [ ] **Live streaming** for active runs — connect xterm.js to the running node-pty session
- [ ] **Interactive mode** for input-prompting workers:
  - Detect when CLI process is blocked on input (parse stdout for prompts, or monitor pty state)
  - Status changes to `⚡ Awaiting input`
  - Terminal becomes interactive (user can type)
  - `awaitingInput` flag on `AISession` interface
- [ ] **"Open in external terminal"** button — detach to the OS terminal (system shell opens with the run's working directory)
- [ ] **Token estimate display** in run summary — if the adapter can surface this from the CLI output
- [ ] **Show terminal ↓** toggle in run summary card (Layer 2) that reveals the xterm.js panel (Layer 3)
- [ ] Scroll, search, and copy in the terminal panel

---

## Acceptance Criteria

- Completed runs show a scrollable, searchable `terminal.log` replay in the terminal panel
- Active runs stream live output
- When a worker awaits input, the user can type in the terminal and the process continues
- "Open in external terminal" opens the OS terminal in the correct directory
