# Phase N2.7 — Workflow Author Update

**Estimate:** 3 days

---

## Goals

Update the Workflow Author to recommend MCPs in addition to skills, and adapt the post-scaffold experience accordingly.

---

## Tasks

- [x] Edit the `trayline-author` system skill's `skill.md` prompt so it:
  - Recommends appropriate MCPs based on the user's description
  - Returns MCPs in the JSON workflow plan alongside skills
  - MCP list trimmed to catalog-available MCPs only: `web-browse`, `github`, `slack`, `notion`, `filesystem`, `fetch`, `memory`
- [x] `trayline-scaffold` system skill: `mcps` field already written to worker `step.json` via scaffold-service (completed in N2.5)
- [x] **Adaptive post-scaffold banner** — shows for all generated workflows, not just source steps:
  - No source, no MCPs → *"Edit anything you want, then click Run to process your first card."*
  - No source + MCPs → *"To run it, set up [X] — click any worker with a ⚠ to start."*
  - Source + no MCPs → *"Click your source step to write your fetch instructions and set the schedule."*
  - Source + MCPs → *"Set up [X] and configure your source step to get started."*
- [x] **Updated example chips** on the Workflow Author screen:
  - "Monitor a GitHub repo for new issues and triage them." — uses `github` MCP
  - "Browse competitor websites weekly and summarise price changes." — uses `web-browse` MCP
- [x] If a recommended MCP is not installed, scaffold creates the worker with the MCP listed and it shows *Setup needed* — scaffold does not fail (pre-existing behaviour from scaffold-service)

---

## Acceptance Criteria

- Describing "monitor GitHub issues" produces a workflow with `github` in the relevant worker's MCPs
- Post-scaffold banner correctly reflects whether MCP setup is needed
- Non-source workflows also show the post-scaffold banner (previously they skipped straight to the project)
- If the generated workflow has unconfigured MCPs, the worker rail card shows the amber triangle immediately
- Example chips include at least two examples that reference real-world services
