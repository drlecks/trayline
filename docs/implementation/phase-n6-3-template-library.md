# Phase N6.3 — Workflow Template Library

**Estimate:** 4–5 days

---

## Goals

Remove the blank-canvas problem for new users. Instead of describing a workflow from scratch — which requires understanding what Trays and Workers are — a user can browse a curated library of ready-to-run workflow templates, pick one that matches their job, and have it installed and scaffolded in one click.

Templates are pre-built workflow exports (`.zip` files) served from the same catalog source as skills. Importing a template reuses the existing `project:import` engine; the only new surface is the discovery and browser UI.

---

## Template Manifest Format

Templates are added as a `templates` array to the existing skill catalog JSON (no new outbound call — still one fetch):

```json
{
  "skills": [ ... ],
  "templates": [
    {
      "id": "email-triage",
      "name": "Email Triage & Response Drafting",
      "description": "Reads incoming email threads, classifies urgency, and drafts a reply for human approval. Works with Gmail via the Gmail MCP.",
      "category": "Communication",
      "tags": ["email", "support", "drafting"],
      "requiredSkills": [],
      "requiredMcps": ["gmail"],
      "zipUrl": "https://raw.githubusercontent.com/.../templates/email-triage.zip",
      "previewSteps": [
        { "kind": "source", "name": "Gmail Inbox" },
        { "kind": "worker", "name": "Classify & Draft" },
        { "kind": "tray",   "name": "Review Queue" }
      ]
    }
  ]
}
```

`previewSteps` is a lightweight ordered list of step descriptors (kind + name only) used to render the workflow diagram in the template card without downloading the zip.

---

## Initial Templates (5)

| ID | Name | MCPs | Notes |
|---|---|---|---|
| `email-triage` | Email Triage & Response Drafting | Gmail | Source → Worker → Review Tray |
| `pdf-extractor` | PDF Invoice Data Extraction | none | Manual card input → Worker batch → Output tray |
| `meeting-actions` | Meeting Transcript → Action Items | none | Manual card → Worker → Review tray |
| `support-tickets` | Support Ticket Classification | none | Manual card → Worker → two output trays |
| `doc-summarizer` | Document Summarizer | none | Batch worker; accepts multiple docs at once |

Each template zip is a valid Trayline export: contains `project.json`, `manifest.json`, all step folders, and `process.md` files. No run history, no credentials.

---

## Tasks

### Catalog & Data Layer

- [ ] **Extend `CatalogService`** (or `skill-catalog-service.ts`) to parse and cache the `templates` array from the catalog JSON alongside skills
- [ ] **`TemplateManifest` type** (`src/shared/types.ts`) — matches the JSON shape above; validate with zod on fetch
- [ ] **IPC: `catalog:fetch-templates`** → returns `TemplateManifest[]` (cached for 10 min like skills); returns empty array on network failure so the app works offline
- [ ] **IPC: `catalog:import-template` with `{ templateId: string }`** — downloads the zip (streams to a tmp file), then calls the existing `importProjectFromZip` logic; returns the imported project name or a typed error

### Template Browser UI

- [ ] **`TemplateBrowser.tsx`** — modal or full panel (see Integration below):
  - Search box + category filter pills
  - Template cards: name, description, `previewSteps` mini-diagram (step kind icons in a horizontal row → arrows), "Required MCPs" badge chips, `[Use this template]` button
  - "No network" empty state when fetch fails
  - Loading skeleton during fetch

- [ ] **`TemplatePreviewDiagram.tsx`** — renders `previewSteps` as a horizontal chain of labeled step-kind icons (Source → Worker → Tray). Reuses icon + color conventions from the left rail.

- [ ] **`[Use this template]` flow**:
  1. Show confirmation dialog: template name + description + dependency list
  2. If `requiredMcps` has un-installed MCPs: add a secondary callout "This workflow needs Gmail — you can set it up after importing"
  3. Call `catalog:import-template`; show progress spinner
  4. On success: close browser, navigate into the newly created project, show banner "Template imported. Customize it however you like."
  5. On failure: show error inline with a "Try again" button

### Integration into Workflow Author

- [ ] **Add "Start from a template" tab to the Workflow Author screen** alongside the existing "Describe your workflow" input:
  - Tab 1 (default): existing plain-English description flow
  - Tab 2: `TemplateBrowser` embedded inline (not a separate modal)
  - Tab label: "Browse templates"

- [ ] **Project List screen** — add a secondary action in the `+ Create new project` area: small "or start from a template" link that opens the Workflow Author on the templates tab

### Template Zip Authoring (non-code deliverable)

- [ ] Author and publish the 5 initial template zips to the catalog source repo. Each zip must:
  - Pass the existing import validation (valid `manifest.json`, step folders, `step.json` files)
  - Have a descriptive `project.json` name and description
  - Include `process.md` files with concrete, immediately useful prompts (not placeholders)
  - Contain no run history, no credentials, no `.tmp` files

---

## Acceptance Criteria

- Browsing templates never blocks the app when offline (graceful empty state)
- Clicking "Use this template" scaffolds a named project in < 5 s on a typical connection
- The new project opens immediately and is fully navigable (trays, workers, process.md visible)
- Importing a template that requires an MCP does not block — the project is created and the MCP notice is informational only
- Template cards show the workflow shape (step icons) without downloading the zip
- The "Describe your workflow" tab is the default; templates are discoverable but not forced

---

## Implementation Notes

- Template zips are fetched directly in the main process (same as skill zip downloads) — no new fetch infrastructure needed
- The import engine already handles skill/MCP dependency dialogs; `catalog:import-template` passes `skipRunHistory: true` implicitly since template zips contain none
- Do not add a `templates` route or dedicated page — the browser lives inside the Workflow Author flow and the Project List CTA. Deep-linking to templates is out of scope.
- `docs/user-flows.md` — add section 6.15 "Starting from a Template"
- `docs/features.md` — describe the template tab in the Workflow Author and the template card anatomy
