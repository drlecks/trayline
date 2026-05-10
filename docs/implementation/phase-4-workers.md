# Phase 4 — Workers + CLI Execution

**Estimate:** 2 weeks

---

## Goals

Full worker management and the core AI execution loop.

Phase 4 should build on Phase 3.1's Effect foundation. Worker execution, watchers, terminal log streaming, retries, timeouts, cancellation, crash recovery, and cleanup should be modeled as Effect programs rather than ad hoc Promise orchestration.

---

## Tasks

- [ ] **Add worker step** modal flow (name, description)
- [ ] **Worker config UI** — command, timeout, retry attempts, trigger mode
- [ ] **`process.md` editor** — basic markdown with side preview in Worker Instructions tab
- [ ] **File watcher** — chokidar watches the previous step's `cards/ready/` folder; triggers worker on new file
- [ ] **Worker execution via AI Terminal Adapter:**
  - Uses Effect services/layers for file system, audit log, adapter registry, clock, IDs, and settings
  - Resolves skills and context packs (but not MCPs yet — that's N2.5)
  - Spawns the CLI command via node-pty
  - Streams stdout/stderr to `runs/<run_id>/terminal.log`
  - Parses structured JSON output from stdout
- [ ] **Worker `state/` folder:**
  - `counters.json` — runs_total, successful, failed
  - `memory.md` — optional persistent notes
  - `conversation/messages.jsonl` — optional persistent conversation history
- [ ] **Atomic card movement:**
  - Source card stays in `ready/` during the run
  - Output written to `runs/<run_id>/output.json.tmp`, renamed to `output.json` on success
  - Only after a fully successful, flushed run: source card moves out of `ready/`, destination card written to next step's `pending/`
  - Log the planned move to audit log *before* the file move (so it can be replayed if interrupted)
- [ ] **Card advancement on success:** new card created in next step's `pending/` (or `ready/` if next tray is auto-approve); original card updated with new history entry
- [ ] **Card failure:** card moved to `99-errors/` with error attached
- [ ] **Crash recovery scan on launch:** find orphaned `runs/*` folders without `meta.json` marked `finished` → mark as failed, source card untouched in `ready/`
- [ ] **Effect resource handling:** watchers and spawned sessions use scoped cleanup; worker runs define explicit timeout, retry, cancellation, and failure mapping behavior
- [ ] **Status pill** on step card with all states (idle / running / awaiting input / done / failed)
- [ ] **Run summary view** in right panel — input summary, status, elapsed time, **Show terminal** toggle
- [ ] Audit log writes: `run_started`, `run_completed`, `run_failed`

---

## Acceptance Criteria

- Marking a card ready in a tray automatically triggers the next worker
- Worker runs, produces output, and the card appears in the following tray
- On failure, card moves to `99-errors/` with the error
- Killing the app mid-run leaves the source card intact in `ready/`; on relaunch the run is marked failed
- Status pill transitions correctly through all states
