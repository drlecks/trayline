# Phase 13 — Polish & Beta

**Estimate:** 1 week

---

## Goals

Empty states, onboarding, keyboard shortcuts, and build pipelines.

---

## Tasks

- [x] **Empty states** for every screen:
  - No projects → first launch options (Create / Import / Example) — auto-routes to Workflow Author with Create + Import options on the Project List
  - No cards in tray → "No cards yet. [+ New card] to add one." — inline button when schema allows manual create
  - No runs in worker → "This worker hasn't run yet." — with hint about auto-trigger and Run now
  - No skills installed → "No skills installed. [Add a skill] to get started." — already present in Skills screen
  - No MCPs installed → "No MCPs installed. [Add an MCP] to connect to real-world services." *(deferred to N2 MCP phases)*
- [x] **Onboarding tour** for first-time users:
  - Tooltip-based overlay highlighting: top bar, left rail, right detail panel (plus welcome + closing cards)
  - Skippable; not shown after first completion (stored in `settings.onboardingComplete`)
  - Re-triggerable from **Settings → Help → Run onboarding tour**
- [x] **Keyboard shortcuts:**
  - `Cmd/Ctrl+N` — new card in selected tray
  - `Cmd/Ctrl+,` — open settings
  - `Cmd/Ctrl+K` — command palette (jump to step / project / screen)
  - `Cmd/Ctrl+/` — shortcuts reference dialog
  - Shortcuts reference accessible from Settings → Help
  - *Note: focused-card `Space` shortcut not wired in this phase — the CardViewer's existing "Mark ready" button handles that path; can be added later as a focused-element binding without protocol changes.*
- [ ] Bug bash — end-to-end test of all core flows *(manual; runs as part of beta validation)*
- [ ] **Build pipelines:** *(deferred — requires platform-specific signing certificates and CI secrets; will land in a dedicated build/release pass)*
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
