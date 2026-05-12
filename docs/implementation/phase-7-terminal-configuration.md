# Phase 7 — Terminal Configuration

**Estimate:** 3 days

---

## Goals

Give the user a single place to choose which AI terminal (provider) the app uses, which model that provider should run, and what effort/reasoning level to apply. Surface the active selection in the app footer alongside any usage telemetry the adapter exposes (e.g. Claude Code's "5h" and "weekly" rolling limits). Make sure every AI run resets context before exiting so we don't carry transcript history forward and burn tokens unnecessarily.

---

## Tasks

### Settings screen — AI Terminal section

- [x] in settings screen, **Provider**  lists every adapter registered in `src/main/ai-terminals/` whose `detect()` resolves as installed on the machine. Adapters that aren't installed appear disabled with an "install instructions" link.
- [x] When the selected provider changes:
  - Refresh the **Model** dropdown from `adapter.listModels()` for that provider.
  - Refresh the **Effort** dropdown from `adapter.listEfforts(model)` for the freshly selected model (some providers tie efforts to a specific model; the call must be re-issued when the model changes too).
- [x] Provider/model/effort selections are global defaults; workers can still override on a per-step basis (existing worker step.json fields remain authoritative when present).
- [x] If an adapter exposes account/usage telemetry (Claude Code reports rolling 5-hour and weekly token windows), surface those values on the Settings page with a refresh button.

### AI Terminal Adapter interface additions

- [x] Extend `AITerminalAdapter` in `src/main/ai-terminals/adapter.ts`:
  - `listModels(): Promise<ModelInfo[]>` — `{ id, label, description? }`
  - `listEfforts(modelId: string): Promise<EffortInfo[]>` — `{ id, label }` (return `[]` for providers that don't have effort tiers)
  - `getUsage?(): Promise<UsageSnapshot | null>` — optional; `{ fiveHour: { used, limit, resetsAt }, weekly: { used, limit, resetsAt } }`
  - `clearContext(): Promise<void>` — invokes the provider-specific "/clear" (or equivalent) so the next run starts with empty history.
- [x] Implement `listModels`, `listEfforts`, `getUsage`, and `clearContext` for the Claude Code adapter.
- [x] Update the mock adapter to return deterministic fixtures so tests can drive the Settings screen.
- [x] Update `docs/tech-stack.md` with the expanded adapter contract.

### Footer summary

- [x] Add a persistent footer bar (already present per design-principles? confirm — otherwise add) that shows the active selection in a compact, single-line format:
  - `Provider · Model · Effort · 5h: <used>/<limit> · Weekly: <used>/<limit>`
- [x] If the adapter doesn't expose usage, drop the `5h:` / `Weekly:` segments (don't render "n/a").
- [x] Footer is read-only here; clicking it deep-links to the Settings → AI Terminal screen.
- [x] Usage values refresh on every successful worker run (the adapter publishes a `usage:update` event after each run completes) and on a manual refresh from Settings.

### Clear context after every run

- [x] In the worker run orchestrator (`src/main/workers/runner.ts` or equivalent — the place that calls `adapter.run()`), after a run completes — success **or** failure — invoke `adapter.clearContext()` before releasing the adapter back to the pool.
- [x] Treat clear-context failure as non-fatal: log it to the audit log (`event: ai_terminal_clear_failed`) but don't fail the run.
- [x] Add an integration test that asserts `clearContext()` is invoked exactly once per run, on both the success and failure paths.
- [x] Update `docs/data-model.md` audit log section with the new `ai_terminal_clear_failed` event.
- [x] Update `docs/tech-stack.md` "AI Terminal Adapter" section to document the post-run clear protocol.

---

## Acceptance Criteria

- The Settings screen lists every installed AI terminal; picking one refreshes the model list, picking a model refreshes the effort list, and the selection persists across app restarts.
- The footer always reflects the current provider/model/effort, and shows live 5h / weekly usage numbers for adapters that expose them.
- Every worker run — pass or fail — ends with the adapter's context cleared. Verified by integration test and by inspecting the audit log.
- Removing or uninstalling a provider on disk causes the Settings dropdown to mark it unavailable on next app launch; if it was the active provider, the user is prompted to pick a new one before any worker can run.
