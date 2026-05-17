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

### Validation Pipeline (every install — From URL AND From catalog)

A skill is *instructions*. The installer's job is to prove the bundle cannot do anything other than be read as instructions. Both **From URL** and **Browse catalog** installs run the identical pipeline — being curated does not buy a bypass.

Before accepting a skill, Trayline verifies, in order:

1. **Downloadable** — if the URL fails, error: *"Couldn't reach this URL."*
2. **Staged to temp** — every byte is written to a temp directory, never directly into `skills/`. Nothing is executed, rendered, or interpreted during validation.
3. **`skill.json` valid** — parses as JSON and passes the zod schema (`id`, `name`, `version`, `description` required; `id` matches `^[a-z0-9][a-z0-9_-]{0,63}$`)
4. **`skill.md` present and non-empty** after trimming whitespace
5. **ID collision** — if id already installed, prompts: *"A skill with id `pdf-reader` is already installed (v1.2.0). Replace it with this version (v1.3.0)?"*
6. **Size & shape limits** — `skill.md` ≤ 500KB, every individual file ≤ 1MB, total bundle ≤ 10MB, total file count ≤ 50
7. **File-type allowlist** — permitted extensions: `.json`, `.md`, `.markdown`, `.txt`, `.yaml`, `.yml`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`. Anything else, including extensionless files, is rejected.
8. **Executable / script rejection by extension** — explicit blocklist covering native binaries (`.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.app`, `.command`, `.scr`, `.com`, `.msi`, `.deb`, `.rpm`, `.apk`), shell and admin scripts (`.bat`, `.cmd`, `.ps1`, `.psm1`, `.sh`, `.bash`, `.zsh`, `.fish`, `.scpt`, `.vbs`, `.vbe`), and interpreted source files (`.js`, `.mjs`, `.cjs`, `.ts`, `.py`, `.rb`, `.pl`, `.php`, `.lua`, `.jar`, `.class`, `.pyc`, `.wasm`)
9. **Magic-byte sniff** — read the first 16 bytes of every file (regardless of extension) and reject when they match known executable / archive signatures: ELF, Mach-O, Windows PE (`MZ`), Java class, shell shebang (`#!`), zip / jar / docx, gzip, 7z, rar, tar, wasm. This catches a `payload.md` that is actually an ELF binary.
10. **Symlink rejection** — symlinks, hardlinks, and Windows junctions are all rejected. Only regular files and directories are accepted.
11. **Path-traversal rejection** — every entry must normalize to a path strictly inside the temp install dir. Reject absolute paths, `..` segments, NUL bytes, and (on Windows) drive letters / UNC prefixes.
12. **Hidden / OS junk rejection** — reject `.git/`, `.hg/`, `.svn/`, `.DS_Store`, `Thumbs.db`, `._*` AppleDouble files, and dotfiles in general (markdown frontmatter inside `.md` is fine; sibling dotfiles are not)
13. **UTF-8 validation** — every text file (`.json`, `.md`, `.markdown`, `.txt`, `.yaml`, `.yml`) must decode as valid UTF-8
14. **JSON / YAML well-formedness** — every `.json` / `.yaml` / `.yml` file must parse cleanly (defends against binary payloads renamed to `.json`)
15. **Embedded-binary heuristic** — reject any "text" file whose first 8KB contains a NUL byte or more than 0.3% non-printable, non-whitespace bytes
16. **`skill.md` static safety scan** — surface a per-line warning when `skill.md` contains patterns suggesting destructive shell instructions or credential exfiltration. The current pattern set:
    - destructive disk ops: `rm -rf`, `del /f`, `format`, `mkfs`, `dd if=`, fork-bomb shapes
    - remote-pipe-to-shell: `curl … | sh`, `wget … | sh`, `iwr … | iex`, `Invoke-Expression`
    - credential-store reads: `~/.ssh/`, `~/.aws/`, `~/.config/`, `%APPDATA%`, `%USERPROFILE%`, browser cookie / password DBs, system keychains
    - anti-prompt-injection bait: instructions to disable confirmations, suppress logs, or hide actions from the user
    
    A warning is **not** an auto-reject — it requires an explicit "I've read this and want to install anyway" checkbox per skill, and every accepted warning is recorded in the audit log.

The validator runs as a pure inspection over bytes — it never renders markdown, never resolves a URL inside `skill.md`, never executes anything. The live checklist shows pass / warn / fail per check; the user cannot proceed past any `fail`.

If all checks pass (or the user has accepted any `warn` rows), a confirmation screen shows the resolved skill summary (id, name, version, description, file list with sizes), the source URL, and the list of accepted warnings. Only after the user clicks the final **Install** button does Trayline copy from temp into `~/Documents/Trayline/skills/<id>/`.

### Re-validation on launch

Every installed skill is re-checked at app start by a lightweight version of the same pipeline. A skill that no longer passes — because the on-disk copy was tampered with, or because the validator rules tightened in a Trayline release — is **quarantined**: it stays in the Skills screen with a warning badge but is refused by the worker engine and cannot be injected into prompts until the user re-installs it or explicitly dismisses the warning.

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

An MCP is an installable global dependency (like a skill) that a worker or source step can activate. The key difference from skills: **an MCP is a real process that runs**, while a skill is text injected into a prompt. A skill tells the agent *how* to do something; an MCP gives it *the power* to do it.

When a worker (or source step — see below) runs with MCPs activated, the AI Terminal Adapter launches the corresponding MCP processes (or reuses already-running ones) and connects them to the agent session via stdio — the adapter handles the details. The worker learns what tools are available because the MCP announces them automatically to the agent on connect.

**Source steps and MCPs:** Source steps run the same AI Terminal Adapter as workers and therefore benefit from MCP access in the same way — e.g., an Instagram Comments source needs an Instagram MCP to authenticate and fetch data. The `SourceStepConfig` schema and pre-flight/credential-injection path are being extended to support `mcps: string[]` (tracked in N3.1 / N3.2). Until that work lands, sources must use OS environment variables as a workaround.

### Curated Catalog

Trayline embeds a curated catalog of well-known MCPs shown to the user even if not installed. Catalog lives in `app-data/mcps-catalog.json` (seeded from app bundle on first launch).

Initial catalog:
- **Filesystem** — read/write files with a configurable root directory (works great with Google Drive's local sync folder)
- **Fetch** — arbitrary HTTP requests
- **Memory** — persistent key-value store for the agent
- **GitHub** — issues, PRs, repos, files via Personal Access Token
- **Brave Search** — web search using Brave Search API key
- **Slack** — read channels, post messages via Bot Token
- **Notion** — read and edit pages and databases via Integration Token
- **macOS Apps** *(macOS 14+ only)* — Calendar, Mail, Reminders, and Files through native Mac apps via `@l22-io/orchard-mcp`; no credentials — uses whichever accounts are signed in via System Settings
- **Outlook Calendar** *(Windows only)* — read and create calendar events through locally installed Outlook via COM; no credentials — uses whichever account is signed in

Trayline does not support OAuth-based MCPs. All credentials are simple key/value pairs (API keys, tokens, paths) stored in the OS keychain via keytar. MCPs that require a developer account or app review process (Google, Meta/Instagram, etc.) are intentionally excluded.

Platform-specific MCPs (those with a `platforms` field in their catalog entry) are filtered server-side and only appear in the catalog on the matching OS.

Showing an MCP in the catalog doesn't mean it's installed — it means Trayline knows how to install and configure it.

### MCP Status States

| State | Display |
|---|---|
| ✓ Ready | Green — installed, configured, last health check OK |
| ⚠ Setup needed | Amber — installed but credentials missing |
| ✗ Error | Desaturated red — last health check failed; **View logs** + **Run health check** in `⋯` menu |
| ⏸ Disabled | Gray — manually disabled; won't start even if a worker has it marked |

**If a worker has an MCP marked but not Ready**, the rail card shows a small amber triangle with tooltip. The worker's Skills, MCPs & Context tab shows the MCP in red with an inline **Configure now** button. No run "fails silently due to credentials" — it's always prevented before starting (`run_aborted_mcp_not_ready` event logged).

### The Setup Wizard

A linear next/back/cancel modal. Steps are derived dynamically from three fields in `mcp.json`:

| Source field | Wizard step |
|---|---|
| `instructions?: string` | Info screen (plain text, shown first) |
| `credentials_schema[]` (each entry) | One input per credential — masked for `api_key`, plain for `text_field` |
| `has_test?: boolean` | Connection test screen (shown last if `true`) |

All credential values are held in memory during the wizard and committed to the OS keychain only immediately before the test step (or on Finish if there is no test). Aborting the wizard at any step calls `delete-credentials` to clean up any partial keychain state — the MCP returns to *Setup needed*.

### Adapter Compatibility (`supportsMcps`)

Not all AI adapters support MCP tools. Each adapter declares this via an optional `supportsMcps` field on the `AITerminalAdapter` interface:

- **`supportsMcps: false`** — the adapter cannot connect to MCP processes. Any worker or source step that has MCPs assigned will be blocked from running. The worker's **Run now** button surfaces an inline error and a link to Settings.
- **`supportsMcps: true` or omitted** — MCPs are supported (the default assumption).

Currently, `local-llm` sets `supportsMcps: false`. Claude Code sets it to `true`. The MCPs screen shows a "Not available with local AI model" badge next to each installed MCP when the active adapter doesn't support them.

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
