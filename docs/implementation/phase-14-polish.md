# Phase 14 — Polish & Beta

**Estimate:** 1 week

---

## Goals

Empty states, onboarding, keyboard shortcuts, and build pipelines.

---

## Tasks

- [ ] **Empty states** for every screen:
  - No projects → first launch options (Create / Import / Example)
  - No cards in tray → "No cards yet. [+ New card] to add one."
  - No runs in worker → "This worker hasn't run yet."
  - No skills installed → "No skills installed. [Add a skill] to get started."
  - No MCPs installed → "No MCPs installed. [Add an MCP] to connect to real-world services."
- [ ] **Onboarding tour** for first-time users:
  - Tooltip-based overlay highlighting: left rail, right panel, top bar, terminal toggle
  - Skippable; not shown after first completion (stored in settings)
- [ ] **Keyboard shortcuts:**
  - `Cmd/Ctrl+N` — new card in selected tray
  - `Cmd/Ctrl+,` — open settings
  - `Cmd/Ctrl+K` — command palette / jump to step
  - `Space` — mark card ready (when card is focused)
  - Shortcuts reference in help menu
- [ ] Bug bash — end-to-end test of all core flows
- [ ] **Build pipelines:**
  - macOS (universal binary, signed)
  - Windows (NSIS installer, signed if possible)
  - Linux (AppImage)
  - CI config (GitHub Actions)

---

## Acceptance Criteria

- Every screen has a meaningful empty state, not a blank area
- Onboarding tour runs on first launch and can be re-triggered from help menu
- Keyboard shortcuts are documented and functional
- App builds cleanly for all three platforms
