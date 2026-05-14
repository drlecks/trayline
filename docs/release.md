# Releasing Trayline

This doc describes the CI release pipeline, versioning, signing, and notarization. The actual workflow lives in `.github/workflows/release.yml`.

---

## TL;DR

- **Trigger:** every push/merge to `main`, plus a `workflow_dispatch` manual button.
- **Versioning:** `package.json` is the floor (currently `1.0.0`). CI sets the patch to `1.0.${run_number}` per build — monotonic, no commit-back loop. Bump minor/major manually when you want to mark a meaningful release.
- **Output:** a GitHub Release (marked **pre-release** while in beta) containing installers for every platform whose build succeeded.
- **Auto-update:** packaged builds check the GitHub Releases feed via `electron-updater` on startup.

---

## Pipeline shape

```
test (ubuntu)          ← npm ci, typecheck, vitest
  │
  └── build (matrix)   ← windows-latest, macos-latest, ubuntu-latest
        │
        └── publish    ← electron-builder --publish always → GitHub Releases
```

The `build` matrix only runs after `test` is green. Each matrix leg uploads its installer to the same GitHub Release (electron-builder dedupes by version).

`concurrency: { group: release, cancel-in-progress: false }` prevents two close merges from racing on the same release.

---

## Versioning

`package.json#version` is `1.0.0`. CI runs:

```bash
npm version --no-git-tag-version --allow-same-version "1.0.${run_number}"
```

This rewrites the version in the working copy but **does not** commit or tag — the result is just the input to electron-builder, which embeds it into the installers and creates the GitHub tag.

To bump the **minor** (e.g. start a `1.1.x` line):

1. On `develop`: `npm version 1.1.0 --no-git-tag-version`
2. Commit, PR to main, merge.
3. The next CI run will produce `1.1.${run_number}`.

The patch CAN go backwards if you re-run an old workflow — that's fine; just don't do it on top of a published higher version.

---

## Code signing & notarization

The pipeline reads signing material from GitHub Secrets. If a secret isn't set, the platform builds **unsigned** with a yellow warning in the run log — the workflow stays green.

### Windows (Authenticode)

| Secret | What it is |
|---|---|
| `WIN_CSC_LINK` | Base64-encoded `.pfx` certificate, or an HTTPS URL to one. |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx`. |

To encode a local cert to base64 (cmd/PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("cert.pfx")) | Set-Clipboard
```

Paste the result into the `WIN_CSC_LINK` secret. EV certs require a hardware token and are not supported by GitHub Actions out of the box.

### macOS signing (Developer ID Application)

| Secret | What it is |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` containing the Developer ID Application certificate (and the private key). |
| `CSC_KEY_PASSWORD` | Password for the `.p12`. |

To encode on macOS:

```bash
base64 -i cert.p12 | pbcopy
```

### macOS notarization (Apple ID)

Signing alone is **not enough** — Gatekeeper on modern macOS requires notarization too.

| Secret | What it is |
|---|---|
| `APPLE_ID` | Your Apple ID email. |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password generated at https://appleid.apple.com → Sign-In & Security → App-Specific Passwords. |
| `APPLE_TEAM_ID` | Your 10-character Team ID (visible in the Apple Developer portal). |

When all three are set, the workflow passes `--config.mac.notarize=true` to electron-builder, which uses `notarytool` to submit the signed app to Apple for notarization before stapling the ticket into the DMG. Notarization typically takes 1–5 minutes.

### Linux

Linux AppImages are unsigned by convention. No secrets required.

---

## Pre-release vs stable

`package.json#build.publish.releaseType` is `prerelease`. Every release is marked as a pre-release on GitHub, which:

- Hides it from the "Latest release" badge on the repo page.
- Still makes it downloadable from `/releases`.
- Is consumed by `electron-updater` because we set `autoUpdater.allowPrerelease = true`.

When you're ready to cut a stable line:

1. Change `releaseType` to `release` in `package.json#build.publish`.
2. Change `autoUpdater.allowPrerelease = false` in `auto-update-service.ts`.
3. Optionally split the workflow so `main` produces stable releases and a new `develop` workflow produces nightlies — out of scope for now.

---

## Auto-updates

`electron-updater` is wired in `src/main/services/auto-update-service.ts`. On packaged startup:

1. Reads `package.json#build.publish[0]` to learn where to look (the GitHub repo).
2. `checkForUpdates()` against the GitHub Releases feed.
3. If a newer version exists, downloads it in the background.
4. On `update-downloaded`, prompts the user with **Restart now / Later**.
5. On quit, the new version is installed automatically.

Dev runs (`npm run dev`) skip the check entirely (`app.isPackaged` is false).

The required `latest.yml` / `latest-mac.yml` / `latest-linux.yml` metadata files are generated and uploaded by electron-builder as part of `--publish always`. Don't delete them from the release assets manually — the updater can't find updates without them.

---

## Local builds

| Script | What it does |
|---|---|
| `npm run dist:win` | Windows NSIS installer in `release/`. Unsigned unless `CSC_LINK` env vars are set. |
| `npm run dist:mac` | macOS DMG for arm64 + x64. Same caveat. |
| `npm run dist:linux` | Linux AppImage. |

Local builds do **not** publish to GitHub. To publish from a workstation, add `--publish always` and set `GH_TOKEN`.

---

## Required GitHub Actions permissions

The workflow uses `secrets.GITHUB_TOKEN` to create the GitHub Release. Make sure **Settings → Actions → General → Workflow permissions** is set to **Read and write** (or define a fine-grained `permissions:` block in the workflow if you prefer least-privilege).

---

## Troubleshooting

- **Release didn't appear.** Check the build job log for the `electron-builder` step — if `Resource not accessible by integration` shows up, the `GITHUB_TOKEN` doesn't have write permission. See the section above.
- **Mac DMG opens with "damaged" error.** That's Gatekeeper on an unsigned build. Either sign + notarize, or right-click → Open as a temporary workaround.
- **Auto-updater stuck at 0%.** Look in `~/Documents/Trayline/app-data/startup.log` for `auto-update:` lines. Most common cause is a 404 on `latest.yml` — usually means the release isn't published yet.
- **`better-sqlite3` ABI mismatch.** The native module needs to be rebuilt against Electron's Node ABI; `electron-builder install-app-deps` (already wired as `postinstall`) handles that. If it ever drifts, run `npm run rebuild:electron` manually.
