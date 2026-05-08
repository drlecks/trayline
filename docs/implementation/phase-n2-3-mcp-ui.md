# Phase N2.3 — MCP UI

**Estimate:** 5 days

---

## Goals

Full MCPs screen with installed/available views and detail panels. No execution integration yet.

---

## Tasks

- [ ] MCPs as a first-level section in the top bar (lucide `plug` icon)
- [ ] **Installed** section: MCP cards showing name, description, status badge (✓ Ready / ⚠ Setup needed / ⚠ Auth expired / ✗ Error / ⏸ Disabled), connected account info (e.g. "Connected as alice@example.com"), and count of workers using them
- [ ] **Available (not installed)** section: curated catalog MCPs with **Install** button
- [ ] **`⋯` menu** per installed MCP card: **Run health check**, **View logs**, **Disable**, **Uninstall** (disabled with tooltip if in use)
- [ ] **MCP detail panel** (click on card):
  - Status with timestamp of last health check
  - Credentials: what's configured (values never shown — only "*configured ✓*" or "*not set*")
  - **Reset credentials** button (opens the wizard again)
  - Logs: last N lines of MCP process stdout/stderr
  - **Used in workers**: clickable list
  - **Run health check** button
  - **Uninstall** button
- [ ] **+ Add MCP** button with three tabs:
  - **Browse catalog** — filters out already-installed
  - **Browse registry** — fetches remote index, cached locally
  - **From URL** — paste URL (install + security confirmation, parallel to skills validation)
- [ ] State updates reactively: installing, configuring, and health-checking an MCP updates the card without needing a full refresh

---

## Note

At this phase, MCPs can be installed and their UI managed, but they do not yet participate in worker runs. Execution integration is Phase N2.5.

---

## Acceptance Criteria

- Installed and available MCPs are correctly displayed with accurate status badges
- MCP detail panel shows logs and credential status without exposing values
- Adding an MCP from the catalog opens correctly (wizard chaining handled in N2.4)
- Status updates are reactive
