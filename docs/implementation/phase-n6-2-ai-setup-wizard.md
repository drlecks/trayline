# Phase N6.2 — AI Setup Wizard

**Estimate:** 2–3 days

**Depends on:** N6.1

---

## Goals

A non-technical user who has just installed Trayline must be guided through connecting an AI agent before they can do anything useful. Today, if Claude Code is not installed, the workflow author silently fails or shows a generic error.

This phase adds:
1. A **first-run AI detection screen** that blocks the app when no production adapter is installed
2. An **AI Setup Wizard** that walks the user through installing their AI agent and checking it is detected
3. The ability to re-run setup from Settings at any time

**What this does not do:** verify authentication or run any inference. Auth failures are handled downstream — they surface as terminal output when a worker run fails, which is the appropriate place for them.

---

## Flows

### First launch — no adapter installed

```
App opens
  └── adapterReadinessService.checkAll()
        └── no production adapter has installed: true
              └── Show "Connect your AI" blocking screen (full window, no left rail)
                    ├── Headline: "Trayline needs an AI agent to run your workflows."
                    ├── Card per registered production adapter (initially just Claude Code):
                    │     • adapter name, short description, installUrl
                    │     • [Open install guide] → opens installUrl in browser
                    │     • [Check again] → re-runs checkReadiness() for this adapter inline
                    └── Once any adapter becomes installed → auto-dismiss screen, open app normally
```

### First launch — adapter installed

App opens directly to Project List or Workflow Author. No banner, no gate.

### AI Setup Wizard

Used when the user clicks "Check again" inside the blocking screen and the adapter is still not found, or from Settings to re-verify. Linear next/back/cancel modal, same visual pattern as the MCP setup wizard.

Steps are driven by the adapter's current `AdapterReadiness.blockers`:

| Blocker kind | Steps shown |
|---|---|
| `not_installed` | Info → Install instructions → Recheck |
| none (installed) | Info → Done |

**Step: Info** — adapter display name, description, install URL. "Let's get [Claude Code] set up."

**Step: Install instructions** — shows `fixCommand` in a copyable code block plus "Open install guide" link to `fixUrl`. "Check again" button re-runs `checkReadiness()`; if now installed, auto-advances to Done.

**Step: Done** — "Claude Code is installed. You're ready to go." → closes wizard, opens app normally.

---

## Tasks

- [x] **`AdapterSetupScreen.tsx`** — full-window blocking screen rendered when no adapter is installed:
  - Calls `adapter:check-readiness` on mount (via App.tsx bootstrap)
  - One card per registered production adapter (sourced from `adapters:list` IPC)
  - "Open install guide" link opens `installUrl` in the OS browser
  - "Check again" button calls `adapter:recheck` for that adapter and updates inline
  - "Setup guide" button opens `AdapterSetupWizard` modal
  - When any adapter reports `installed: true`, calls `onReady()` to dismiss and resume routing
  - No left rail, no header — this is a pre-app gate

- [x] **`AdapterSetupWizard.tsx`** — modal wizard (`src/renderer/components/adapter/`):
  - Accepts `adapterId`, `displayName`, `readiness`, `open`, `onOpenChange`, `onComplete`
  - Derives `InternalStep[]` from `AdapterReadiness.blockers`
  - On `installed: true` after recheck: advances to Done step, `onComplete` fires
  - Cancellable at any step
  - Progress dots match McpSetupWizard visual pattern

- [x] **First-run routing in `App.tsx`**:
  - Calls `adapter:check-readiness` at startup alongside settings fetch (parallel)
  - `adapterGateResolved: null` → renders nothing (avoids flash)
  - `adapterGateResolved: false` → renders `AdapterSetupScreen`
  - `adapterGateResolved: true` → normal routing (project list / author)

- [x] **`adapter:readiness-changed` IPC event** — broadcast from main `adapter:recheck` handler; renderer updates `adapterStore` and lifts gate if now installed

- [x] **Store: `adapter-store.ts`** — Zustand slice with `readiness`, `setReadiness`, `updateFromCheckAll`, `anyInstalled`

- [x] **Settings panel — "AI Terminal" section updated**:
  - Now uses `adapter:check-readiness` instead of `adapters:detect` for richer readiness data
  - "Re-run setup" link on not-installed adapters opens `AdapterSetupWizard`
  - Wizard completion refreshes adapter entries inline

- [x] **IPC channels + preload**: `adapter.checkReadiness`, `adapter.recheck`, `adapter.getCached`, `adapter.onReadinessChanged` added to `ipc-channels.ts` and `preload/index.ts`

---

## Acceptance Criteria

- A fresh install with no CLI shows the blocking screen and nothing else
- "Check again" detects the CLI immediately after the user installs it, without restarting the app
- Once any adapter is detected, the app opens normally with no further gates
- Settings shows installed adapters with version strings
- The blocking screen and wizard never call any inference endpoint

---

## Implementation Notes

- Reuse `McpSetupWizard` step rendering primitives (progress bar, back/next/cancel layout) — extract to shared components if needed rather than duplicating
- `adapterStore` should live alongside the existing settings store — do not introduce a fourth top-level Zustand store
- `docs/user-flows.md` — add section 6.14 "AI Setup — First Launch" with the two routing cases
- `docs/features.md` — describe the blocking screen layout and the Settings "AI Agent" section
