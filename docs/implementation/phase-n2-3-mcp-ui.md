# Phase N2.3 — MCP UI

**Estimate:** 5 days

---

## Goals

Full MCPs screen with installed/available views and detail panels. No execution integration yet.

---

## Tasks

- [x] MCPs as a first-level section in the top bar (lucide `plug` icon)
- [x] **Installed** section: MCP cards showing name, description, status badge (✓ Ready / ⚠ Setup needed / ✗ Error / ⏸ Disabled), and count of workers using them (worker linkage is N2.5)
- [x] **Available (not installed)** section: curated catalog MCPs with **Install** button
- [x] **`⋯` menu** per installed MCP card: **Disable/Enable**, **Uninstall** (health check deferred to N2.5 when MCP processes exist)
- [x] **MCP detail panel** (click on card):
  - Status badge + install date
  - Credentials: what's configured (values never shown — only "Configured ✓" or "Not set" per schema entry)
  - Command template + install method
  - Tags + homepage link
  - Last health check timestamp (if any)
  - **Disable/Enable** + **Uninstall** action buttons
- [x] **+ Add MCP** button with three tabs:
  - **Browse catalog** — filters out already-installed, with search, fully working
  - **Browse registry** — stub ("coming soon")
  - **From URL** — stub (security confirmation wizard is N2.4)
- [x] State updates reactively: install/uninstall/disable refresh the list without a full page reload

---

## Note

At this phase, MCPs can be installed and their UI managed, but they do not yet participate in worker runs. Execution integration is Phase N2.5.

---

## Acceptance Criteria

- Installed and available MCPs are correctly displayed with accurate status badges
- MCP detail panel shows logs and credential status without exposing values
- Adding an MCP from the catalog opens correctly (wizard chaining handled in N2.4)
- Status updates are reactive
