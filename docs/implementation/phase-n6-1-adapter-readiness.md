# Phase N6.1 — Adapter Readiness Protocol

**Estimate:** 2 days

---

## Goals

Extend the `AITerminalAdapter` interface with a structured **readiness model** that replaces the existing binary `detectInstalled()`. Each adapter reports its install state as a typed `AdapterReadiness` object — including a version string and a list of blockers with user-actionable fix instructions.

Authentication state is deliberately out of scope: there is no way to check whether a CLI agent's credentials are valid without consuming API tokens. Auth failures surface naturally in the terminal output when a worker run fails, which is the right place to handle them.

The abstraction is designed so future adapters (Open Code, Ollama, local models, etc.) can report their own cheaply-detectable blockers (e.g. `server_unreachable`, `version_too_old`) without changes to the calling code or the wizard.

---

## New Interface Types (`src/main/ai-terminals/adapter.ts`)

```typescript
export type AdapterBlockerKind =
  | 'not_installed'
  // Future adapters may extend this union with cheaply-detectable conditions
  // (e.g. 'server_unreachable' for a local server adapter, 'version_too_old').
  // Blocker kinds that require running inference to detect are intentionally
  // excluded — those surface as worker-run errors in the terminal.

export interface AdapterBlocker {
  kind: AdapterBlockerKind
  /** User-facing explanation, plain English. */
  message: string
  /** Link to install docs. */
  fixUrl?: string
  /** Shell command the user can run to fix (e.g. install command). */
  fixCommand?: string
}

export interface AdapterReadiness {
  adapterId: string
  /** CLI binary (or local server) is present and reachable. */
  installed: boolean
  /** CLI version string if installed, otherwise null. */
  version: string | null
  /** All current blockers. Empty array = ready to run. */
  blockers: AdapterBlocker[]
  checkedAt: number
}
```

## New Method on `AITerminalAdapter`

```typescript
/**
 * Returns the adapter's current readiness without running any inference.
 * Checks only what is cheaply detectable: binary presence, version, and
 * any adapter-specific structural preconditions (e.g. local server up).
 * Safe to call at startup; never consumes API tokens.
 */
checkReadiness(): Promise<AdapterReadiness>
```

The existing `detectInstalled()` and `getVersion()` are superseded by `checkReadiness()` and can be kept as private helpers inside each adapter file or removed during cleanup — they must not be removed from the interface until all callers migrate.

---

## Tasks

- [x] **Extend `adapter.ts`** — add `AdapterBlocker`, `AdapterBlockerKind`, `AdapterReadiness` types and `checkReadiness()` signature to `AITerminalAdapter`

- [x] **Implement `checkReadiness()` on `claudeCodeAdapter`**:
  - Reuse the existing `detectInstalled()` private helper for `installed` and `version`
  - If not installed: return one `not_installed` blocker with `fixUrl: installUrl` and `fixCommand: 'npm install -g @anthropic-ai/claude-code'`
  - If installed: return `installed: true`, the version string, no blockers

- [x] **Implement `checkReadiness()` on `mockAdapter`** (`src/main/ai-terminals/mock.ts`):
  - Configurable via test helper: `setReadinessOverride(partial: Partial<AdapterReadiness>)` / `resetReadinessOverride()`
  - Default: `installed: true`, `version: '0.0.0-mock'`, no blockers

- [x] **`adapter-readiness-service.ts`** (`src/main/services/adapter-readiness-service.ts`):
  - `checkAll(): Promise<Map<string, AdapterReadiness>>` — calls `checkReadiness()` for every production adapter in the registry; caches results in memory for the session
  - `getCached(adapterId: string): AdapterReadiness | null` — returns last cached result without re-querying
  - `recheck(adapterId: string): Promise<AdapterReadiness>` — re-runs `checkReadiness()` for one adapter, updates the cache; used by the "Check again" button
  - `isReadyToRun(adapterId: string): Promise<boolean>` — `installed === true`; calls `recheck` on first access if no cached result
  - Cache is in-memory only; invalidates on app restart

- [x] **IPC handlers** (`src/main/ipc/handlers.ts`):
  - `adapter:check-readiness` → calls `adapterReadinessService.checkAll()`, returns `Record<string, AdapterReadiness>`
  - `adapter:recheck` with `{ adapterId: string }` → calls `adapterReadinessService.recheck(adapterId)`, returns updated `AdapterReadiness`
  - `adapter:get-cached` with `{ adapterId: string }` → returns cached snapshot or null

- [x] **Worker-runner pre-flight update** — replaced the `kind === 'production' && detectInstalled()` guard with `adapterReadinessService.isReadyToRun(adapterId)` in both single-card and batch run paths. Error message uses `blockers[0].message` when available.

- [x] **Tests for `adapter-readiness-service.ts`**:
  - `checkAll` only queries production adapters (mock kind is excluded)
  - `isReadyToRun` returns false when adapter reports `installed: false`
  - `isReadyToRun` returns true when adapter reports `installed: true`
  - `recheck` updates the cache and returns the new snapshot

- [x] **Tests for `checkReadiness()` on `claudeCodeAdapter`**:
  - Returns a valid `AdapterReadiness` shape in all cases (environment-adaptive)
  - When not installed: blockers has one `not_installed` entry with `fixUrl` and `fixCommand`

---

## Acceptance Criteria

- `checkReadiness()` never spawns an inference call for any adapter
- `isReadyToRun()` returns true if and only if `installed === true`
- The mock adapter can be configured to any readiness state for test coverage of the wizard and pre-flight guard
- No existing worker-run behaviour changes — the pre-flight guard uses the same logic, now via the service

---

## Implementation Notes

- Do not remove `detectInstalled()` / `getVersion()` from the interface in this phase — mark them `@deprecated` and migrate callers in a follow-up
- Future adapters that can cheaply detect more conditions (e.g. Ollama checking `localhost:11434`) extend the `AdapterBlockerKind` union and implement the check inside their own `checkReadiness()`; the service layer and wizard need no changes
- `docs/tech-stack.md` — update the adapter interface listing to show `checkReadiness()` and `AdapterReadiness`; remove `runProbe()` references
