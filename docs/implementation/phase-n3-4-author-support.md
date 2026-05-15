# Phase N3.4 — Workflow Author Integration

**Estimate:** 0.5 week

**Depends on:** Phase N3.2 (Source Step UI), Phase N3.3 (Batch Worker Mode)

---

## Goals

Update the Workflow Author (`trayline-author` system skill) and the scaffold system (`trayline-scaffold`) so that both recognise Source steps and Batch Workers. Add source-first examples to the author's prompt and the Workflow Author UI. Update the scaffold templates to cover new step kinds.

---

## Tasks

### `trayline-author` Skill Update

- [x] Update `resources/system-skills/trayline-author/skill.md`:
  - [x] Introduce `"kind": "source"` as a valid first step in the output JSON plan (prefix `00-`)
  - [x] Add guidance: if the user's description involves polling, monitoring, or ingesting from an external source on a schedule, the plan should start with a Source step
  - [x] Add guidance: if the user's description involves summarising or digesting many items into one, the relevant Worker should have `batch_mode: true`
  - [x] For each Source step in the plan, the author outputs: `name`, `description`, `icon`, `schedule_cron`, `dedup.key`, `dedup.first_run`, `dedup.first_run_n`, and a draft `source.md`
  - [x] For each Batch Worker in the plan, the author outputs `batch_mode: true` and a sensible `batch_max`
  - [x] Version header comment added (`<!-- v2 -->`)

### `trayline-scaffold` Skill Update

- [x] Update `resources/system-skills/trayline-scaffold/skill.md` to document `"kind": "source"` step handling: template usage, `source.md`, `seen-ids.json`, `counters.json`, folder layout
- [x] Document batch_mode/batch_max writing into Worker `step.json`
- [x] `scaffold-service.ts` materialises Source steps: stamps `source.step.json` template, writes `source.md`, `state/seen-ids.json`, `state/counters.json`, `cards/ready/`, `cards/archived/`, `runs/`
- [x] `scaffold-service.ts` sets `batch_mode` and `batch_max` on Worker steps from the plan; coerces trigger to `manual` if it was `on_ready`
- [x] Added `source.step.json` template to `resources/system-skills/trayline-scaffold/templates/`
- [x] Added `source.md` starter template to `resources/system-skills/trayline-scaffold/templates/`

### Workflow Author UI — Example Chips

- [x] Added two source-first examples to the rotating chip pool (pool now has 7 chips):
  - *"Poll Instagram comments every hour and draft a reply for each new one"*
  - *"Fetch the top Hacker News stories every 30 minutes and send a daily digest"*
- [x] Existing non-source examples remain

### Workflow Author Loading Messages

- [x] Added source-aware loading messages to the pool:
  - *"Setting up your data source…"*
  - *"Configuring the schedule…"*
  - *"Wiring up deduplication…"*

### Post-Generation Banner

- [x] When the generated workflow includes a Source step (`hasSourceStep: true` in `ProjectCreateSuccess`), a `PostGenBanner` component is shown before navigating to the project
- [x] Banner text: "Your source step is ready — click it to write your fetch instructions and set your schedule."
- [x] If unconfigured MCPs are also present: banner also shows their names with setup instructions
- [x] User clicks "Open project" to navigate; without a source step the app navigates immediately as before

### Documentation Sync

- [x] `resources/system-skills/trayline-author/skill.md` header version comment updated
- [x] `docs/features.md` § 7.13 updated to describe Source step and Batch Worker author support, loading messages, and post-generation banner

---

## Acceptance Criteria

- Describing a polling/monitoring workflow in the Workflow Author generates a plan with a Source step as the first step, complete with a sensible `schedule_cron` and a draft `source.md`
- Describing a digest/summary workflow generates a plan with a Worker that has `batch_mode: true`
- The scaffold correctly materialises Source step folders from the plan, including `source.md`, `state/`, and both `cards/` subdirectories
- At least two source-first examples appear in the author UI example chip rotation
- The post-generation banner reflects source-specific next-step guidance when a Source step is present
