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
- [ ] [Phase 4 — Workers + CLI Execution](./phase-4-workers.md)
- [ ] [Phase 5 — Terminal Integration](./phase-5-terminal.md)
- [ ] [Phase 6 — Skills & Context Packs](./phase-6-skills.md)
- [ ] [Phase 7 — Skill Finder](./phase-7-skill-finder.md)
- [ ] [Phase 8 — Human Review Polish](./phase-8-human-review.md)
- [ ] [Phase 9 — Run History & Audit Log UI](./phase-9-audit-log.md)
- [ ] [Phase 10 — Scheduler](./phase-10-scheduler.md)
- [ ] [Phase 11 — Import / Export](./phase-11-import-export.md)
- [ ] [Phase 12 — Errors & Retry](./phase-12-errors.md)
- [ ] [Phase 13 — Polish & Beta](./phase-13-polish.md)

---

## N2 Phases (Skills & MCPs)

- [ ] [Phase N2.1 — Skills Enhanced](./phase-n2-1-skills-enhanced.md)
- [ ] [Phase N2.2 — MCP Foundations](./phase-n2-2-mcp-foundations.md)
- [ ] [Phase N2.3 — MCP UI](./phase-n2-3-mcp-ui.md)
- [ ] [Phase N2.4 — Setup Wizard](./phase-n2-4-setup-wizard.md)
- [ ] [Phase N2.5 — Worker Engine Integration (MCPs)](./phase-n2-5-worker-engine.md)
- [ ] [Phase N2.6 — Initial Catalog MCPs](./phase-n2-6-catalog-mcps.md)
- [ ] [Phase N2.7 — Workflow Author Update](./phase-n2-7-workflow-author-update.md)
- [ ] [Phase N2.8 — Import/Export & Polish](./phase-n2-8-polish.md)

---

## Estimates

| Block | Estimate |
|---|---|
| MVP (Phases 0–13) | ~11–13 weeks (1 developer) |
| N2 (Phases N2.1–N2.8) | ~6–7 weeks (1 developer) |
| **Total** | **~17–20 weeks** |

Highest-risk areas: Phase N2.4 (OAuth in Electron has OS-specific quirks), Phase N2.5 (clean MCP integration into the adapter layer).
