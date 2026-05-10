# Phase 3.1 — Effect Migration Foundation

**Estimate:** 5–10 working days

---

## Goals

Introduce Effect as the default implementation style for main-process side effects before the worker engine expands the app's operational complexity.

This phase is intentionally pragmatic: migrate the backend/service boundary first, keep the renderer mostly as-is, and use the migration to improve typed errors, dependency seams, cleanup, and tests.

---

## Migration Principles

- Effect starts in `src/main/**`, especially services, worker orchestration, filesystem operations, audit logging, adapter execution, and scheduler/watchers.
- The renderer keeps React, Zustand, and Promise-based IPC calls unless a screen needs deeper async orchestration.
- IPC handlers are the runtime boundary: they run Effect programs and translate typed failures into renderer-safe responses.
- Existing Promise code does not need to be rewritten all at once. When touching a main-process service for Phase 4+, prefer converting that service path to Effect.
- Domain logic should be pure where possible. Effect wraps the side effects around it.
- Typed errors are part of the public service contract. Avoid broad `catch` blocks that erase cause, stage, or recovery information.

---

## Tasks

- [ ] **Add Effect dependency and baseline runtime**
  - Install `effect`
  - Add a small main-process Effect runtime/helper for IPC handlers
  - Document the local conventions for `Effect`, `Layer`, `Context.Tag`, typed errors, and `Effect.runPromise`

- [ ] **Define shared backend error model**
  - Add typed errors for filesystem, JSON parse/validation, audit database, project/scaffold, card movement, adapter detection/spawn, timeout, cancellation, and unknown failures
  - Keep renderer-facing error payloads stable and serializable
  - Preserve human-readable messages for UI surfaces

- [ ] **Wrap core side-effect dependencies as Effect services**
  - File system service: read/write JSON, atomic writes, mkdir, rename/unlink, exists, watch lifecycle
  - Audit database service: init, insert, query
  - Settings service: get/set access
  - AI terminal adapter registry/service: list, detect, spawn
  - Clock/ID helpers for testable timestamps and IDs

- [ ] **Migrate highest-value existing service paths**
  - `card-service`: card creation, mark-ready/archive movement, counters, audit writes
  - `project-service`: project/workflow/step listing and safe JSON reads
  - `project-create-service`: author + scaffold orchestration and stage-specific failures
  - `author-service`: temp directory lifecycle, adapter execution, output parsing, cleanup

- [ ] **Adapt IPC handlers without changing renderer API shape**
  - Keep `window.trayline.*` preload API Promise-based
  - Run Effect programs inside IPC handlers
  - Convert typed service failures into consistent `{ ok: false, reason, message }` shapes where the existing contract expects outcomes
  - Let truly unexpected failures continue to be logged by the app-level crash/logging path

- [ ] **Add migration tests**
  - Unit tests for typed error mapping and JSON/file failure handling
  - Card service tests for create, mark-ready, archive, malformed-card skip behavior, and audit ordering
  - Author/project-create tests for adapter missing, invalid JSON, invalid plan, spawn failure, and cleanup
  - Runtime/IPC adapter tests for successful run and typed failure translation

- [ ] **Update Phase 4 implementation guidelines**
  - Worker engine, watchers, scheduler, run lifecycle, terminal log streaming, and crash recovery should be implemented with Effect from the start
  - Long-lived resources such as watchers and spawned sessions should use scoped resource management
  - Retry, timeout, interruption, and cleanup policies should be explicit in the Effect program

---

## Recommended Order

1. Add `effect`, runtime helper, and typed error conventions.
2. Wrap file system, audit DB, settings, adapter registry, clock, and ID generation as Effect services.
3. Migrate `card-service` first because it is already implemented, user-facing, and side-effect heavy.
4. Migrate author/project creation paths next because they combine AI adapter execution, temp files, validation, and scaffold writes.
5. Update IPC handlers to run Effect programs while preserving the renderer API.
6. Add tests alongside each migrated service path.

---

## Acceptance Criteria

- `effect` is installed and documented as the main-process side-effect style
- New main-process service work has a clear Effect pattern to follow
- Existing renderer/preload APIs still behave the same from the UI's point of view
- Card creation and movement paths are covered by tests after migration
- Author/project creation failures retain their current user-facing behavior while using typed errors internally
- Phase 4 can start with worker execution, watchers, subprocess lifecycles, timeouts, retries, and cleanup modeled with Effect
