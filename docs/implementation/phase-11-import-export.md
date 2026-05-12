# Phase 11 — Import / Export

**Estimate:** 4 days

---

## Goals

Let users share projects as zip files and import projects from others.

---

## Tasks

- [ ] **Export flow:**
  - Project menu → **Export as zip**
  - Bundles the full project folder using `archiver`
  - Generates and includes `manifest.json` at the zip root:
    ```json
    {
      "skills": [{ "id": "pdf-reader", "version": "1.2.0" }],
      "mcps": [{ "id": "gmail", "version": "1.0.0" }]
    }
    ```
  - Credentials and MCP state **never** included
  - **Export without data** option selected by default — excludes all `runs/` folders and cards from all steps.
- [ ] **Import flow:**
  - File menu → **Import project** → file picker for `.zip`
  - Extracts to `~/Documents/Trayline/projects/[id]/` using `unzipper`
  - Reads `manifest.json`
  - Checks installed skills and MCPs against the manifest
  - If missing: dialog groups by type: *"This project needs 2 skills and 1 MCP you don't have. Install them now?"*
  - Installs missing skills from the catalog (if available)
  - Chains MCP setup wizards for any MCPs that need credentials after install
- [ ] **Bundled example project** shipped with the app — shown on first launch as "Open example project"

---

## Acceptance Criteria

- Exported zip extracts cleanly on another machine and the project opens correctly
- `manifest.json` lists all required skills and MCPs with correct versions
- Importing a project with missing skills triggers the install dialog
- Importing a project with missing MCPs triggers install + setup wizard chain
- "Export without runs" zip does not contain any `runs/` folders
