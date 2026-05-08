# Phase N2.8 — Import/Export & Polish

**Estimate:** 4 days

---

## Goals

Extend import/export for MCPs, harden the security UX for From URL installs, and fill in remaining empty states and onboarding touches.

---

## Tasks

- [ ] **Export `manifest.json` extended** with MCP block:
  ```json
  {
    "skills": [...],
    "mcps": [{ "id": "gmail", "version": "1.0.0" }]
  }
  ```
  Credentials and `state/` folder contents **never** exported.
- [ ] **Import dialog** groups missing dependencies by type:
  *"This project needs 2 skills and 1 MCP you don't have. Install them now?"*
  After installing MCPs, automatically chain setup wizards for each one that requires credentials — before the user lands in the project.
- [ ] **Security confirmation UI for From URL (MCPs):**
  - Prominent warning: *"This will install and run code on your computer. Only install MCPs from sources you trust."*
  - Source URL displayed clearly
  - Checkbox the user must check before **Install** becomes active
  - (Skills already show a lighter confirmation — MCPs need the stronger version because they execute code)
- [ ] **Empty states** for MCPs and enhanced skills screens (if not already done in N2.3)
- [ ] **Onboarding tour update** — mention MCPs as a key capability ("Connect workers to Gmail, Calendar, and more")
- [ ] Review all audit log MCP events are firing correctly in all flows

---

## Acceptance Criteria

- Exporting a project that uses Gmail produces a `manifest.json` with `mcps: [{ "id": "gmail", ... }]`
- Importing that project on a machine without Gmail installed triggers install + Gmail setup wizard
- From URL MCP install requires explicit checkbox confirmation before Install activates
- Empty states for MCPs screen are meaningful and actionable
