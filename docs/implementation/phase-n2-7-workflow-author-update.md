# Phase N2.7 — Workflow Author Update

**Estimate:** 3 days

---

## Goals

Update the Workflow Author to recommend MCPs in addition to skills, and adapt the post-scaffold experience accordingly.

---

## Tasks

- [ ] Edit the `trayline-author` system skill's `skill.md` prompt so it:
  - Recommends appropriate MCPs based on the user's description (e.g. description mentions "email" → plan includes `gmail` in the worker's MCPs)
  - Returns MCPs in the JSON workflow plan alongside skills
- [ ] `trayline-scaffold` system skill: add `mcps` field to worker `step.json` files it generates, based on what the plan recommends
- [ ] **Adaptive post-scaffold banner:**
  - No unconfigured MCPs → *"Here's a starting point for you. Edit anything you want."*
  - Some MCPs need setup → *"Here's a starting point. To run it, set up [Gmail, Calendar] — click any worker with a ⚠ to start."*
- [ ] **Update example chips** on the Workflow Author screen to include MCP-powered examples:
  - "Read incoming sales emails and qualify leads" — now actually viable with Gmail MCP
  - "Read my calendar and send a weekly summary email"
  - "Monitor a GitHub repo for new issues and triage them"
- [ ] If a recommended MCP is not installed, `trayline-scaffold` creates the worker with the MCP listed but the status will show *Setup needed* — the scaffold does not fail

---

## Acceptance Criteria

- Describing "qualify sales emails" produces a workflow with `gmail` in the relevant worker's MCPs
- Post-scaffold banner correctly reflects whether MCP setup is needed
- If the generated workflow has unconfigured MCPs, the worker rail card shows the amber triangle immediately
- Example chips include at least two examples that reference real-world services
