# Trayline — Skills & MCPs System (Plan N2)

---

## Overview

Skills and MCPs are parallel systems, managed globally and assigned per-worker.

| | Skills | MCPs |
|---|---|---|
| What they are | Markdown instructions injected into prompts | Real processes that run and expose tools to the AI |
| Installed to | `~/Documents/Trayline/skills/` | `~/Documents/Trayline/mcps/` |
| Assigned in | `step.json` → `"skills": []` | `step.json` → `"mcps": []` |
| Credentials | None | OS keychain via keytar |
| Security risk | Text only | Executes code on user's machine |

---

## Skills — Enhanced System

### Skills Screen (Top Bar)

Skills is a first-level section accessible from the top bar (lucide `blocks` icon). Installed skills are shown as cards with: icon, name, version, description, source (`From catalog` / `From URL` / `system` / `local`), and count of workers using them.

The `⋯` menu per card: **Update** (if source supports it), **Reinstall**, **View files** (opens folder in Finder/Explorer), **Uninstall** (disabled with tooltip if in use).

### Adding a Skill — Two Paths

**Browse catalog tab:**  
Fetches `https://raw.githubusercontent.com/[org]/trayline-skills/main/index.json`. Search box, list with Install button. Cached locally for offline use.

**From URL tab:**  
Accepts:
- GitHub repo: `https://github.com/user/my-skill` or a subdirectory URL
- Direct zip: `https://example.com/my-skill.zip`
- Raw `skill.json`: `https://raw.githubusercontent.com/.../skill.json` (Trayline resolves siblings)

### Validation Pipeline (From URL)

Before accepting a skill, Trayline verifies:

1. **Downloadable** — if the URL fails, error: *"Couldn't reach this URL."*
2. **`skill.json` present and valid** — must parse as JSON and pass zod schema (`id`, `name`, `version`, `description` required)
3. **`skill.md` present and not empty**
4. **ID collision** — if id already installed, prompts: *"A skill with id `pdf-reader` is already installed (v1.2.0). Replace it with this version (v1.3.0)?"*
5. **Content sanity** — `skill.md` not empty or whitespace-only
6. **Size limits** — `skill.md` ≤ 500KB, folder total ≤ 10MB
7. **No executables** — allowed content: `skill.json`, markdown files, plain text, `templates/` files, small images. `.exe`, `.sh`, `.bat`, `.dll`, `.so`, binaries rejected with: *"This skill contains executable files, which Trayline doesn't allow. Skills are instructions only."*

Validation shows a live checklist to the user. If all passes, a confirmation screen shows the skill summary before the final **Install** button copies it to `~/Documents/Trayline/skills/<id>/`.

### Source Tracking

The `_trayline` block is added to `skill.json` on install:

```json
"_trayline": {
  "source": "url",
  "source_url": "https://github.com/user/pdf-reader",
  "installed_at": "2026-05-08T10:14:22Z",
  "installed_from_commit": "a3f9c12"
}
```

This enables **Update** (re-clone and revalidate for URL-sourced skills) and full transparency on where each skill came from.

---

## MCPs — Full System

### What an MCP Is in Trayline

An MCP is an installable global dependency (like a skill) that a worker can activate (like a skill). The key difference: **an MCP is a real process that runs**, while a skill is text injected into a prompt. A skill tells the agent *how* to do something; an MCP gives it *the power* to do it.

When a worker runs with MCPs activated, the AI Terminal Adapter launches the corresponding MCP processes (or reuses already-running ones) and connects them to the agent session via stdio — the adapter handles the details. The worker learns what tools are available because the MCP announces them automatically to the agent on connect.

### Curated Catalog

Trayline embeds a curated catalog of well-known MCPs shown to the user even if not installed. Catalog lives in `app-data/mcps-catalog.json` (seeded from app bundle on first launch).

Initial catalog:
- **Gmail** — read, search, send emails
- **Google Calendar** — read events, create events, modify
- **Google Drive** — list, read, create, edit files
- **Web Browse** — headless web browsing with content extraction
- **GitHub** — issues, PRs, repos, files
- **Slack** — read channels, post messages
- **Notion** — read and edit pages and databases
- **Filesystem** — read/write files (with configurable scope)
- **Fetch** — arbitrary HTTP requests
- **Memory** — persistent key-value store for the agent

Showing an MCP in the catalog doesn't mean it's installed — it means Trayline knows how to install and configure it.

### MCP Status States

| State | Display |
|---|---|
| ✓ Ready | Green — installed, configured, last health check OK |
| ⚠ Setup needed | Amber — installed but credentials missing |
| ⚠ Auth expired | Amber — OAuth credentials expired; "Reconnect" relaunches OAuth |
| ✗ Error | Desaturated red — last health check failed; **View logs** + **Run health check** in `⋯` menu |
| ⏸ Disabled | Gray — manually disabled; won't start even if a worker has it marked |

**If a worker has an MCP marked but not Ready**, the rail card shows a small amber triangle with tooltip. The worker's Skills, MCPs & Context tab shows the MCP in red with an inline **Configure now** button. No run "fails silently due to credentials" — it's always prevented before starting (`run_aborted_mcp_not_ready` event logged).

### The Setup Wizard

A linear next/back/cancel modal. Steps are declared in `mcp.json` under `setup_steps`. Supported step types in MVP:

| Type | Behavior |
|---|---|
| `info` | Text-only, with optional external links |
| `api_key` | Single text field (secret), value stored in OS keychain |
| `text_field` | Non-secret field (e.g. workspace URL), stored in MCP `state/` |
| `select` | Dropdown (e.g. region) |
| `oauth` | Opens OS browser to provider URL, spins up an ephemeral local server to capture callback, stores tokens in keychain. Supports Google (provider `google`) and generic OAuth 2.0 with PKCE |
| `test_connection` | Spawns the MCP in dry-run mode, pings it, captures result |

Aborting the wizard at any step leaves the MCP in its previous state — nothing is persisted mid-wizard.

### MCP Execution Flow

In `spawn()`, the engine:

1. Resolves each MCP id. If any isn't installed or not Ready → **run aborts before starting**, UI shows which MCP failed.
2. For each ready MCP: reads credentials from keychain, injects them as env vars or stdin as declared in `mcp.json`.
3. Launches the agent. MCP processes run as child processes of the agent (not Trayline directly), following the standard MCP model.
4. On run completion, MCP processes shut down with the agent.
5. `runs/<run_id>/meta.json` records which MCPs were active.

### Adding MCPs Outside the Catalog

**+ Add MCP** offers three paths:

- **Browse catalog** — the curated embedded catalog
- **Browse registry** — remote JSON index at `https://raw.githubusercontent.com/[org]/trayline-mcps/main/index.json`
- **From URL** — paste a repo or zip containing a valid `mcp.json`

**Security confirmation for From URL:** *"This will install and run code on your computer. Only install MCPs from sources you trust."* — URL prominently displayed, plus a checkbox the user must check before **Install** activates.

Additional MCP validations beyond skills:
- `mcp.json` validates against zod schema
- `install_method: npm` → package installed in an isolated folder (not global `node_modules`)
- `install_method: binary` → checksum SHA-256 verified before marking installed
- `install_method: docker` → Docker must be on PATH, else clear error message

### MCP Detail Panel

Click on any MCP card to open:
- **Status** with timestamp of last check
- **Credentials** — what credentials are configured (values never shown, only existence confirmed)
- **Logs** — last N lines of MCP process stdout/stderr
- **Used in workers** — clickable list
- **Run health check** — test spawn on demand
- **Uninstall** — deletes folder and removes credentials from keychain (disabled with tooltip if in use)
