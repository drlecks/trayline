# Phase 0 — Foundations

**Estimate:** 1 week

---

## Goals

Establish the Electron + React + TypeScript project scaffold and wire up the minimum infrastructure that every later phase depends on.

---

## Tasks

- [x] Electron + Vite + React + TypeScript scaffold
- [x] Tailwind CSS configured
- [x] shadcn/ui set up (button, dialog, form primitives)
- [x] Window chrome, top bar shell (placeholder tabs)
- [x] Dark / light theme toggle (stored in electron-store)
- [x] Settings store (`electron-store` or equivalent) — user prefs, default CLI command
- [x] File system service module — read, write, watch via chokidar
- [x] SQLite init via `better-sqlite3` — audit log schema, simple insert/query API
- [x] IPC bridge between main and renderer processes typed with TypeScript

---

## Acceptance Criteria

- App opens, shows a top bar and an empty main area
- Theme toggle persists across restarts
- File system service can read/write a test file in `~/Documents/Trayline/`
- SQLite opens cleanly; a test audit row can be inserted and queried
