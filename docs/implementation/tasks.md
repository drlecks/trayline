# Trayline — Implementation Task List

Each task corresponds to a phase file in this folder. Check off tasks as they are completed.

---

## How to work on a task

> Full details are in the **Git Branching Workflow** section of `CLAUDE.md`. This is the short version.

**Before starting any phase:**
1. `git checkout develop && git pull origin develop`
2. `git checkout -b phase/<phase-id>` (e.g. `phase/phase-0-foundations`)
3. Read the phase file, implement, commit — including any doc updates.
4. As each individual task inside the phase is completed, check it off in the phase file (`- [ ]` → `- [x]`) and commit.
5. `git push -u origin phase/<phase-id>`
6. Ask the user to review. **Do not merge until confirmed.**
7. On approval: `git checkout develop && git merge --no-ff phase/<phase-id>` → push → delete branch.
8. Check off the phase in the list below and commit directly on `develop`.

---

## MVP Phases

- [x] [Phase 0 — Foundations](./phase-0-foundations.md)
- [x] [Phase 1 — Global App Skills & First-Run Bootstrap](./phase-1-bootstrap.md)
- [x] [Phase 2 — Projects & Workflow Author](./phase-2-workflow-author.md)
- [x] [Phase 3 — Trays + Manual Cards](./phase-3-trays.md)
- [x] [Phase 4 — Workers + CLI Execution](./phase-4-workers.md)
- [x] [Phase 5 — Terminal Integration](./phase-5-terminal.md)
- [x] [Phase 6 — Scheduler](./phase-6-scheduler.md)
- [x] [Phase 7 — Terminal Configuration](./phase-7-terminal-configuration.md)
- [x] [Phase 8 — Skill Finder](./phase-8-skill-finder.md)
- [x] [Phase 9 — Human Review Polish](./phase-9-human-review.md)
- [x] [Phase 10 — Skills & Context Packs](./phase-10-skills.md)
- [x] [Phase 11 — Import / Export](./phase-11-import-export.md)
- [x] [Phase 12 — Errors & Retry](./phase-12-errors.md)
- [x] [Phase 13 — Polish & Beta](./phase-13-polish.md)

---

## N2 Phases (Skills & MCPs)

- [x] [Phase N2.1 — Skills Enhanced](./phase-n2-1-skills-enhanced.md)
- [x] [Phase N2.2 — MCP Foundations](./phase-n2-2-mcp-foundations.md)
- [x] [Phase N2.3 — MCP UI](./phase-n2-3-mcp-ui.md)
- [x] [Phase N2.4 — Setup Wizard](./phase-n2-4-setup-wizard.md)
- [x] [Phase N2.5 — Worker Engine Integration (MCPs)](./phase-n2-5-worker-engine.md)
- [x] [Phase N2.6 — Initial Catalog MCPs](./phase-n2-6-catalog-mcps.md)
- [x] [Phase N2.7 — Workflow Author Update](./phase-n2-7-workflow-author-update.md)
- [x] [Phase N2.8 — Import/Export & Polish](./phase-n2-8-polish.md)

---

## N3 Phases (Sources & Batch Workers)

- [x] [Phase N3.1 — Source Engine](./phase-n3-1-source-engine.md)
- [x] [Phase N3.2 — Source Step UI](./phase-n3-2-source-ui.md)
- [x] [Phase N3.3 — Batch Worker Mode](./phase-n3-3-batch-worker.md)
- [x] [Phase N3.4 — Workflow Author Integration](./phase-n3-4-author-support.md)

---

## N5 Phases (Global Orchestration & Live Dashboard)

- [x] [Phase N5.1 — Orchestration Engine](./phase-n5-1-orchestration-engine.md)
- [x] [Phase N5.2 — Project Dashboard](./phase-n5-2-project-dashboard.md)
- [x] [Phase N5.3 — Live Activity](./phase-n5-3-live-activity.md)

---

---

## N6 Phases (Mainstream Adoption)

- [x] [Phase N6.1 — Adapter Readiness Protocol](./phase-n6-1-adapter-readiness.md)
- [x] [Phase N6.2 — AI Setup Wizard](./phase-n6-2-ai-setup-wizard.md)
- [x] [Phase N6.3 — OS Notifications & System Tray Badge](./phase-n6-3-os-notifications.md)

---

## N7 Phases (Local LLM)

- [x] [Phase N7 — Local LLM Adapter](./phase-n7-local-llm.md)

---

## N8 Phases (Simplification)

- [x] [Phase N8 — Remove Skills & MCPs](./phase-n8-remove-skills-mcps.md)

---

## N9 Phases (Connectors)

- [x] [Phase N9 — Credentials & Connectors (Source channels, Outlet step)](./phase-n9-connectors.md)

---

## N10 Phases (Onboarding & Accessibility)

- [x] [Phase N10 — Onboarding & Accessibility](./phase-n10-onboarding.md)

---

## Estimates

| Block | Estimate |
|---|---|
| MVP (Phases 0–13) | ~11–13 weeks (1 developer) |
| N2 (Phases N2.1–N2.8) | ~6–7 weeks (1 developer) |
| N3 (Phases N3.1–N3.4) | ~3–4 weeks (1 developer) |
| N5 (Phases N5.1–N5.3) | ~1 week (1 developer) |
| N6 (Phases N6.1–N6.3) | ~1 week (1 developer) |
| **Total** | **~23–27 weeks** |

Highest-risk areas: Phase N2.4 (OAuth in Electron has OS-specific quirks), Phase N2.5 (clean MCP integration into the adapter layer), Phase N3.1 (atomic dedup index under crash conditions).
