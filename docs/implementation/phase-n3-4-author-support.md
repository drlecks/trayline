# Phase N3.4 — Workflow Author Integration

**Estimate:** 0.5 week

**Depends on:** Phase N3.2 (Source Step UI), Phase N3.3 (Batch Worker Mode)

---

## Goals

Update the Workflow Author (`trayline-author` system skill) and the scaffold system (`trayline-scaffold`) so that both recognise Source steps and Batch Workers. Add source-first examples to the author's prompt and the Workflow Author UI. Update the scaffold templates to cover new step kinds.

---

## Tasks

### `trayline-author` Skill Update

- [ ] Update `skills/_system/trayline-author/skill.md`:
  - [ ] Introduce `"kind": "source"` as a valid first step in the output JSON plan
  - [ ] Add guidance: if the user's description involves polling, monitoring, or ingesting from an external source on a schedule, the plan should start with a Source step
  - [ ] Add guidance: if the user's description involves summarising or digesting many items into one, the relevant Worker should have `batch_mode: true`
  - [ ] For each Source step in the plan, the author must output:
    - `name`, `description`, `icon` (default `"rss"`), `color` (default `"#4CB87E"`)
    - `schedule_cron` — a sensible default for the described use case
    - `dedup.key` — the field name the AI should use as the unique ID
    - `dedup.first_run` — recommended mode for the use case
    - A draft `source.md` with instructions appropriate to the described workflow
  - [ ] For each Batch Worker in the plan, the author must output `batch_mode: true` and a sensible `batch_max`

### `trayline-scaffold` Skill Update

- [ ] Update `skills/_system/trayline-scaffold/skill.md` to handle `"kind": "source"` steps in the plan:
  - [ ] Create `<index>-<name>/step.json` from `source.step.json` template, filling in all plan fields
  - [ ] Write the draft `source.md` from the plan into the step folder
  - [ ] Create `state/` directory with empty `seen-ids.json` (`[]`) and initial `counters.json`
  - [ ] Create `cards/ready/` and `cards/archived/` directories
- [ ] Update scaffold to write `batch_mode` and `batch_max` into Worker `step.json` when the plan specifies them
- [ ] Update the `workflow.json` template to include Source as a valid step kind in the step list

### Workflow Author UI — Example Chips

- [ ] Update the five rotating example chips in the Workflow Author screen to include at least two source-first examples:
  - *"Poll Instagram comments every minute and draft a reply for each new one"*
  - *"Fetch the top Hacker News stories every 30 minutes and email me a daily digest"*
- [ ] Ensure the existing non-source examples remain (do not replace all five; add to the rotation pool so examples cycle)

### Workflow Author Loading Messages

- [ ] Add new warm status messages to the loading sequence for source-aware generation:
  - *"Setting up your data source..."*
  - *"Configuring the schedule..."*
  - *"Wiring up deduplication..."*
- [ ] These messages appear only when the generated plan includes a Source step (the author outputs a flag in its JSON that the UI can read)

### Post-Generation Banner

- [ ] If the generated workflow includes a Source step, update the post-generation banner text:
  - *"Here's a starting point. Your source is set to run every X — click it to write your fetch instructions."*
  - If MCPs are also needed: *"Here's a starting point. Set up [MCP name] and write your fetch instructions to get started."*

### Documentation Sync

- [ ] Update `skills/_system/trayline-author/skill.md` header comment to note the version that added Source and Batch Worker support
- [ ] Update `docs/features.md` § 7.13 (Workflow Author) to note that the author can now generate Source steps and Batch Workers

---

## Acceptance Criteria

- Describing a polling/monitoring workflow in the Workflow Author generates a plan with a Source step as the first step, complete with a sensible `schedule_cron` and a draft `source.md`
- Describing a digest/summary workflow generates a plan with a Worker that has `batch_mode: true`
- The scaffold correctly materialises Source step folders from the plan, including `source.md`, `state/`, and both `cards/` subdirectories
- At least two source-first examples appear in the author UI example chip rotation
- The post-generation banner reflects source-specific next-step guidance when a Source step is present
