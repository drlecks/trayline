# Phase N2.1 — Skills Enhanced

**Estimate:** 1 week

---

## Goals

Upgrade the skills screen to a first-level section with richer install flows and validation.

---

## Tasks

- [ ] Refactor Skills to a first-level section accessible from the top bar (lucide `blocks` icon)
- [ ] Skill cards show: icon, name, version, description, source (`From catalog` / `From URL` / `system` / `local`), count of workers using them ("Used in N workers" — calculated by scanning all `step.json` files)
- [ ] `⋯` menu per card: **Update**, **Reinstall**, **View files** (opens folder in Finder/Explorer), **Uninstall** (disabled with tooltip if in use)
- [ ] **+ Add skill** modal with two tabs: **Browse catalog** and **From URL**
- [ ] **Validation pipeline for From URL installs** (see `docs/skills-and-mcps.md`):
  - Download to temp directory
  - Validate `skill.json` against zod schema
  - Validate `skill.md` present and non-empty
  - Check ID collision
  - Content sanity
  - Size limits (≤500KB `skill.md`, ≤10MB total)
  - No executables scan (reject `.exe`, `.sh`, `.bat`, `.dll`, `.so`, binaries)
  - Show live validation checklist to the user
  - Final confirmation screen with skill summary before **Install**
- [ ] `_trayline` block written into installed `skill.json` with source, source_url, installed_at, commit hash
- [ ] **Update** flow for URL-sourced skills — re-clone/re-download and revalidate
- [ ] Tests: valid URL, invalid URL, missing `skill.json`, empty `skill.md`, executables present, ID collision

---

## Acceptance Criteria

- Installing from URL shows the live validation checklist
- A skill with executables is rejected with a clear message
- Source is tracked in `skill.json` and shown in the UI
- Update re-validates before applying
