# Phase 2 — Projects & Workflow Author

**Estimate:** 1.5 weeks

---

## Goals

Project management UI and the "describe what you want" first-run experience.

---

## Tasks

- [ ] Project list screen — open, delete, create new
- [ ] **Workflow Author** screen:
  - Large textarea with placeholder
  - Five example chips (clicking fills the textbox)
  - **Generate workflow** button
  - Calls `trayline-author` system skill via AI Terminal Adapter
  - Calls `trayline-scaffold` to materialize the project on disk
- [ ] Loading state during generation:
  - Centered animated circle
  - Rotating pre-written status messages: *"Imagining your workflow..."*, *"Sketching out the trays..."*, *"Wiring up the workers..."*, *"Picking the right skills..."*, *"Almost there..."*
- [ ] Project lands in `~/Documents/Trayline/projects/<project-name>/` with scaffolded workflow visible in the left rail
- [ ] **Regenerate** flow:
  - User can edit description and regenerate
  - Previous version archived to `<project>/.history/<timestamp>/`
- [ ] Post-scaffold banner:
  - Default: *"Here's a starting point for you. Edit anything you want."*
  - If MCPs need setup: *"Here's a starting point. To run it, set up [MCP names] — click any worker with a ⚠ to start."*
- [ ] Top bar project switcher
- [ ] Settings → General (default AI adapter, theme)

---

## Acceptance Criteria

- User can describe a workflow, see the loading screen, and land in a project with a structured left rail
- `project.json`, `workflow.json`, and all step folders exist in the expected path
- Regenerating archives the previous version correctly
- Project switcher in top bar lists all projects
