# Phase 10 — Skills & Context Packs

**Estimate:** 1 week

---

## Goals

Wire up the skills system and context packs so they are read by workers at run time.

---

## Tasks

- [ ] **Skill picker** in worker config (Skills, MCPs & Context tab) — checklist of installed skills
- [ ] **Skill `skill.md` injection** — at run time, the adapter concatenates selected skills' `skill.md` contents into the prompt
- [ ] **Context pack editor** — simple file list in project sidebar + markdown editor for `context/` files
- [ ] **Context pack picker** in worker config — checklist of context files in `context/`
- [ ] **Variable resolution** in `process.md`:
  - `{{card.data}}` — substituted with the card's `data` JSON
  - `{{context.brand-voice}}` — substituted with the contents of `context/brand-voice.md`
  - Autocomplete in the process.md editor
- [ ] Skills screen showing installed skills (basic list; full redesign is N2.1)

---

## Acceptance Criteria

- A worker with a skill selected includes the skill's `skill.md` in the prompt sent to the AI
- Context packs selected in the worker config are injected under a `## Context` section in the prompt
- Variables in `process.md` are resolved correctly before sending to the adapter
- A user can create and edit context pack files from the project sidebar
