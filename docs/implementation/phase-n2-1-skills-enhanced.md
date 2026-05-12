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
  - Download to temp directory (never directly into `skills/`)
  - Validate `skill.json` against zod schema (required: `id`, `name`, `version`, `description`)
  - Validate `skill.md` present and non-empty after trimming whitespace
  - Check ID collision against installed skills; require explicit user confirmation to replace
  - Size limits — `skill.md` ≤ 500KB, any single file ≤ 1MB, folder total ≤ 10MB; reject larger
  - File-count cap — reject if the skill bundle contains more than 50 files (defensive against zip-bomb-style structures)
  - **Content safety checks — skills are instructions only and must never carry executable code or data that can exfiltrate the user's files. The installer MUST verify:**
    - **Allowlist of file types** — permitted: `.json`, `.md`, `.markdown`, `.txt`, `.yaml`, `.yml`, `.png`, `.jpg`, `.jpeg`, `.svg`, `.gif`, `.webp`. Anything else (including unknown extensions and files with no extension) is rejected.
    - **Executable / script rejection by extension** — reject `.exe`, `.dll`, `.so`, `.dylib`, `.bin`, `.bat`, `.cmd`, `.ps1`, `.psm1`, `.sh`, `.bash`, `.zsh`, `.fish`, `.app`, `.command`, `.scpt`, `.msi`, `.deb`, `.rpm`, `.apk`, `.jar`, `.class`, `.pyc`, `.wasm`, `.scr`, `.com`, `.vbs`, `.vbe`, `.js`, `.mjs`, `.cjs`, `.ts`, `.py`, `.rb`, `.pl`, `.php`, `.lua`
    - **Magic-byte (content sniff) rejection** — read the first 16 bytes of every file regardless of extension and reject when they match a known executable / archive signature: ELF (`7F 45 4C 46`), Mach-O (`FE ED FA CE` / `FE ED FA CF` / `CA FE BA BE` and BE variants), Windows PE (`MZ` → `4D 5A`), Java class (`CA FE BA BE`), shell shebangs (`#!`), zip / jar / docx (`50 4B 03 04`), gzip (`1F 8B`), 7z (`37 7A BC AF 27 1C`), rar (`52 61 72 21`), tar (POSIX `ustar` at offset 257), wasm (`00 61 73 6D`)
    - **Symlink rejection** — reject the install if any entry in the bundle is a symlink, hardlink, or junction; only regular files and directories are allowed
    - **Path traversal rejection** — every path inside the bundle must normalize to a path inside the temp install dir. Reject absolute paths, paths containing `..`, paths containing NUL bytes, and on Windows paths containing drive letters or UNC prefixes
    - **Hidden / OS junk rejection** — reject `.git/`, `.hg/`, `.svn/`, `.DS_Store`, `Thumbs.db`, anything beginning with `._`, and any dotfile other than known-safe markdown frontmatter inside `.md` files
    - **Text-file UTF-8 validation** — every permitted text file (`.json`, `.md`, `.markdown`, `.txt`, `.yaml`, `.yml`) must decode as valid UTF-8. Reject on decode error.
    - **JSON / YAML well-formedness** — every `.json` and `.yaml`/`.yml` file must parse without error; reject otherwise (avoids smuggling binary payloads inside a `.json` extension)
    - **Embedded-binary heuristic for text files** — reject any "text" file whose first 8KB contains a NUL byte or more than 0.3% non-printable, non-whitespace bytes (defends against renamed binaries)
    - **`skill.md` static scan** — warn (and require a confirmation checkbox to proceed) when `skill.md` contains patterns that suggest it is instructing the AI to perform destructive or exfiltration-style actions on the user's machine. The scan looks for: shell-command fences targeting `rm -rf`, `del /f`, `format`, `mkfs`, `dd if=`, `:(){:|:&};:`, `curl … | sh`, `wget … | sh`, `iwr … | iex`, `Invoke-Expression`, references to reading `~/.ssh/`, `~/.aws/`, `~/.config/`, `%APPDATA%`, `%USERPROFILE%`, browser cookie / password stores, keychain access, raw network exfiltration to non-standard hosts, or instructions to disable security prompts. The warning surfaces every match with file + line so the user can review before opting in.
    - **No network side-effects during validation** — the validator must not execute, render, or otherwise side-effect any downloaded content. It only parses and inspects bytes.
  - **Show live validation checklist** — every check above is rendered as its own row with pass / fail / warn state, and the failing row's message is surfaced verbatim. The user cannot proceed past a `fail`.
  - **Final confirmation screen** — shows the resolved skill summary (id, name, version, description, file list with sizes), the source URL, and any warnings the user accepted. The **Install** button copies from temp into `skills/<id>/` only after this explicit click.
- [ ] **Catalog installs reuse the same validation pipeline.** Being in the curated catalog does not bypass content safety checks — a compromised catalog entry must still be rejected by the local validator.
- [ ] `_trayline` block written into installed `skill.json` with `source`, `source_url`, `installed_at`, `installed_from_commit` (when resolvable), and `validator_version` so we can re-validate on upgrade if the rules tighten.
- [ ] **Update** flow for URL-sourced and catalog-sourced skills — re-download into a fresh temp dir, run the full validation pipeline again, only swap the installed folder on success. A failed update never corrupts the currently-installed skill.
- [ ] **Re-validate on launch (background)** — on app start, run a lightweight version of the validation pipeline against every installed skill. If a skill no longer passes (e.g. tampered-with on disk, validator rules tightened), mark it as `quarantined` in the Skills screen and refuse to inject it into worker prompts until the user re-installs or explicitly dismisses the warning.
- [ ] **Audit log** — every install / update / uninstall / quarantine event is written to `audit.db` with `details_json` carrying source URL, resolved id+version, validator outcome, and the list of any warnings the user accepted.
- [ ] Tests: valid URL, invalid URL, missing `skill.json`, empty `skill.md`, executables present (by extension AND by magic byte under a renamed extension), symlink present, path-traversal entry, ID collision, oversized `skill.md`, oversized total bundle, non-UTF-8 text file, malformed JSON, `skill.md` containing a `rm -rf ~` fence (warn path), catalog entry that fails validation, on-disk tampering between runs triggering quarantine.

---

## Acceptance Criteria

- Installing from URL shows the live validation checklist with one row per check
- A skill containing an executable is rejected, whether by extension OR by magic-byte sniff under a disguised extension
- A skill containing a symlink, a path-traversal entry, or a non-UTF-8 "text" file is rejected
- A skill whose `skill.md` instructs destructive shell commands or credential-store reads surfaces a per-line warning that the user must explicitly accept before install
- Catalog installs run the **same** validation pipeline as From URL installs — a curated entry that fails validation is rejected
- Source, validator version, and any accepted warnings are tracked in `skill.json._trayline` and shown in the UI
- Update re-downloads and re-validates from scratch; a failed update leaves the previously-installed skill intact
- On launch, an installed skill that no longer passes validation is quarantined and not injected into worker prompts
