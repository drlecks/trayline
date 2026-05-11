# Phase 4 — Workers + CLI Execution

**Estimate:** 2 weeks

---

## Goals

Full worker management and the core AI execution loop.

---

## Tasks

- [x] **Add worker step** modal flow (name, description)
- [x] **Worker config UI** — command, timeout, retry attempts, trigger mode
- [x] **`process.md` editor** — basic markdown with side preview in Worker Instructions tab
- [x] **File watcher** — chokidar watches the previous step's `cards/ready/` folder; triggers worker on new file
- [x] **Worker execution via AI Terminal Adapter:**
  - Resolves skills and context packs (but not MCPs yet — that's N2.5)
  - Spawns the CLI command via node-pty
  - Streams stdout/stderr to `runs/<run_id>/terminal.log`
  - Parses structured JSON output from stdout
- [x] **Worker `state/` folder:**
  - `counters.json` — runs_total, successful, failed
  - `memory.md` — optional persistent notes
  - `conversation/messages.jsonl` — optional persistent conversation history
- [x] **Atomic card movement:**
  - Source card stays in `ready/` during the run
  - Output written to `runs/<run_id>/output.json.tmp`, renamed to `output.json` on success
  - Only after a fully successful, flushed run: source card moves out of `ready/`, destination card written to next step's `pending/`
  - Log the planned move to audit log *before* the file move (so it can be replayed if interrupted)
- [x] **Card advancement on success:** new card created in next step's `pending/` (or `ready/` if next tray is auto-approve); original card updated with new history entry
- [x] **Card failure:** card moved to `99-errors/` with error attached
- [x] **Crash recovery scan on launch:** find orphaned `runs/*` folders without `meta.json` marked `finished` → mark as failed, source card untouched in `ready/`
- [x] **Status pill** on step card with all states (idle / running / awaiting input / done / failed)
- [x] **Run summary view** in right panel — input summary, status, elapsed time, **Show terminal** toggle
- [x] Audit log writes: `run_started`, `run_completed`, `run_failed`

---

## Acceptance Criteria

- Marking a card ready in a tray automatically triggers the next worker
- Worker runs, produces output, and the card appears in the following tray
- On failure, card moves to `99-errors/` with the error
- Killing the app mid-run leaves the source card intact in `ready/`; on relaunch the run is marked failed
- Status pill transitions correctly through all states
