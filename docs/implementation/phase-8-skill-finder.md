# Phase 8 — Skill Finder

**Estimate:** 3 days

---

## Goals

Allow users to discover and install skills from the remote catalog.

---

## Tasks

- [ ] Skills screen → **+ Add skill** modal with two tabs: **Browse catalog** and **From URL**
- [ ] **Browse catalog tab:**
  - Fetch remote index from `https://raw.githubusercontent.com/[org]/trayline-skills/main/index.json`
  - Cache to `app-data/skills-index-cache.json`
  - Search box filters by name, description, tags
  - Each result: name, description, author, version, tags
  - **Install** button per skill — downloads and installs to `skills/<id>/`
- [ ] **From URL tab:** (basic version; validation pipeline is N2.1)
  - Paste URL field
  - Downloads and installs
- [ ] Loading state during fetch; offline fallback to cache
- [ ] Installed skills show **Update** / **Uninstall** actions
- [ ] Uninstall disabled with tooltip if the skill is in use by any worker

---

## Acceptance Criteria

- Fetching the index shows a searchable list of skills
- Installing a skill from the catalog downloads it and makes it available in worker skill pickers
- When offline, the cached index is used
- Uninstall removes the skill folder and shows a clear error if a worker depends on it
