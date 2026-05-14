# Phase 11 — Import / Export

**Estimate:** 4 days

---

## Goals

Let users share projects as zip files and import projects from others.

---

## Tasks

- [x] **Export flow:**
  - Project list screen → **Export project** icon (hover on each project row)
  - Bundles the project folder using `archiver`
  - Generates and includes `manifest.json` at the zip root:
    ```json
    {
      "trayline_version": "0.1.0",
      "exported_at": "...",
      "skills": [{ "id": "pdf-reader", "version": "1.2.0" }],
      "mcps": []
    }
    ```
  - Credentials and MCP state **never** included (`runs/`, `state/` always excluded)
  - **Export without data** selected by default — excludes all `cards/` sub-folders
  - **Include cards** checkbox available in the export dialog
  - **Privacy warning** in the export dialog: advises users that step names, AI prompts,
    and process instructions are included; prompts them to review for personal or sensitive
    information before sharing
- [x] **Import flow:**
  - Project list screen → **Import project from zip** button
  - Welcome splash → **Import project** button (now enabled)
  - File picker (native OS dialog) for `.zip`
  - Extracts to `~/Documents/Trayline/projects/[id]/` using `unzipper`
  - Reads `manifest.json`
  - Checks installed skills against the manifest
  - If missing: `ImportMissingSkillsDialog` lists them by type with per-skill install status
  - Installs missing skills from the catalog on request
- [x] **Bundled example project** shipped in `resources/example-project/`
  - "Feedback Collector (Demo)" — one tray + one AI worker + error tray
  - Shown on the Welcome splash as "Example project" (now enabled)
  - Copies to user's projects folder on first open; subsequent opens reuse the copy

---

## Acceptance Criteria

- Exported zip extracts cleanly on another machine and the project opens correctly
- `manifest.json` lists all required skills with correct versions
- Importing a project with missing skills triggers the install dialog
- "Export without cards" zip does not contain any `cards/` folders
- "Include cards" zip contains cards in all step sub-folders but never `runs/` or `state/`
- Privacy warning is shown before every export and describes what is included
- The example project opens from the Welcome splash with one click
