# Phase N12 — System Tray & Single-Instance Mode

**Branch:** `phase/phase-n12-background-process`
**Depends on:** develop (post-N11)

---

## Overview

This phase makes Trayline behave like a proper background-service application on all three desktop platforms.

1. **Close → hide to tray.** Pressing the window's close button hides the window instead of quitting. Workflows keep running in the background.
2. **System tray icon.** A tray icon stays visible while the app is hidden — left-click surfaces the window; right-click shows a context menu with *Resume All*, *Stop All*, and *Quit*.
3. **Single-instance enforcement.** If a second Trayline process is launched, it quits immediately and the existing instance's window is brought to the front.
4. **PlatformAdapter pattern.** All platform-specific code (macOS menu-bar tray, Windows notification-area tray, Linux tray with its DE limitations) is isolated in a `PlatformAdapter` — one class per platform, one registry, called uniformly from `index.ts`. This mirrors the `AITerminalAdapter` architecture already in the codebase.

---

## PlatformAdapter Architecture

```
src/main/platform/
├── adapter.ts      # Interface + shared types
├── registry.ts     # Returns the right adapter for process.platform
├── win32.ts        # Windows implementation
├── darwin.ts       # macOS implementation
└── linux.ts        # Linux implementation
```

### Interface (`adapter.ts`)

```typescript
export interface TrayState {
  /** True when every active project is currently mounted (orchestrator). */
  allRunning: boolean
  /** True when no project is currently mounted. */
  allStopped: boolean
}

export interface PlatformAdapter {
  /**
   * Called once after the main BrowserWindow is created.
   * Creates the system tray icon and registers all platform hooks.
   * `onQuit` is called when the user selects Quit from the tray menu.
   */
  setup(win: BrowserWindow, callbacks: PlatformCallbacks): void

  /**
   * Refreshes enabled/disabled state of the tray context-menu items.
   * Called after any orchestrator mount/unmount operation.
   */
  updateTrayState(state: TrayState): void

  /** Bring the main window to the foreground (from second-instance or tray click). */
  surfaceWindow(): void

  /** Hide the window without quitting (from close-button interception). */
  hideWindow(): void

  /** Tear down the tray icon. Called synchronously just before app.quit(). */
  destroy(): void
}

export interface PlatformCallbacks {
  onResumeAll: () => Promise<void>
  onStopAll: () => Promise<void>
  onQuit: () => void
}
```

### Platform-specific notes

| Platform | Tray location | Left-click | Right-click |
|---|---|---|---|
| **Windows** | Notification area (bottom-right) | Show window | Context menu |
| **macOS** | Menu bar (top-right) | Context menu (macOS norm) | Context menu |
| **Linux** | Desktop-environment tray area | Show window | Context menu |

**macOS extra:** `app.on('activate')` (dock icon click) must also call `surfaceWindow()`.

**Linux caveat:** On GNOME without the AppIndicator Shell Extension, the tray icon may not appear. This is a known upstream limitation. The window can still be re-opened by launching the app again (single-instance catches it and surfaces the window).

---

## Task List

### N12-A — PlatformAdapter interface and registry

- [x] **A1** Create `src/main/platform/adapter.ts` with the `PlatformAdapter` interface, `TrayState` type, and `PlatformCallbacks` type as specified above.

- [x] **A2** Create `src/main/platform/registry.ts` — exports `getPlatformAdapter(): PlatformAdapter` that switches on `process.platform` (`'win32'` / `'darwin'` / anything else → linux). Throws `Error` for unrecognised platforms (guard against future runtimes).

- [x] **A3** Create skeleton files `win32.ts`, `darwin.ts`, `linux.ts` each exporting a class that implements `PlatformAdapter` with method stubs. These are filled in by N12-F.

---

### N12-B — Single-instance lock

- [x] **B1** At the very top of `app.whenReady()` (before any `await`), call `app.requestSingleInstanceLock()`. If it returns `false`, call `app.quit()` immediately and return — this process is the duplicate.

- [x] **B2** Register `app.on('second-instance', () => platformAdapter.surfaceWindow())` immediately after the lock acquisition (before `app.whenReady()`). When a second instance launches, this fires on the first (surviving) instance.

---

### N12-C — Close-to-tray interception

- [x] **C1** Add a module-level `let isQuitting = false` flag in `index.ts`.

- [x] **C2** In `createWindow()`, add `win.on('close', (e) => { if (!isQuitting) { e.preventDefault(); platformAdapter.hideWindow(); } })` so the close button hides rather than destroys the window.

- [x] **C3** Replace the existing `app.on('window-all-closed')` handler (which currently calls `app.quit()` on non-macOS) with a no-op, since hiding the window must no longer trigger a quit. macOS already has its own `activate` re-surface logic.

- [x] **C4** Keep the existing `app.on('before-quit', () => orchestrator.unmountAll())` handler unchanged — it still runs for the real quit path (Quit from tray menu).

- [x] **C5** The `onQuit` callback passed to `platformAdapter.setup()` must: set `isQuitting = true`, then call `app.quit()`.

---

### N12-D — Tray icon and context menu (shared logic)

- [x] **D1** Resolve the tray icon path inside each platform adapter's `setup()`. Use the same `resolveAppIcon()` helper already in `index.ts` — extract it into a shared `src/main/util/app-icon.ts` utility so adapters can import it without duplicating the packaged-vs-dev path logic.

- [x] **D2** Create `new Tray(iconPath)` in each adapter's `setup()`. Set tooltip to `"Trayline"`.

- [x] **D3** Build the context menu via `Menu.buildFromTemplate`:
  ```
  { label: 'Resume All', enabled: !state.allRunning, click: callbacks.onResumeAll }
  { label: 'Stop All',   enabled: !state.allStopped, click: callbacks.onStopAll  }
  { type: 'separator' }
  { label: 'Quit',       click: callbacks.onQuit                                 }
  ```

- [x] **D4** Implement `updateTrayState(state)` by rebuilding the menu template with the new `enabled` flags and calling `tray.setContextMenu(newMenu)`. Store `state` so it can be used when the menu is rebuilt.

---

### N12-E — Orchestrator state helpers and wiring

- [x] **E1** Add two new exported functions to `orchestrator.ts`:
  - `getMountedCount(): number` — returns `mounted.size`.
  - `getTotalActiveCount(): Promise<number>` — calls `projectService.listProjects()` and counts entries with `status === 'active'`.

- [x] **E2** Add `getTrayState(): Promise<TrayState>` helper function in `index.ts`:
  ```typescript
  async function getTrayState(): Promise<TrayState> {
    const mounted = orchestrator.getMountedCount()
    const total = await orchestrator.getTotalActiveCount()
    return { allRunning: mounted >= total && total > 0, allStopped: mounted === 0 }
  }
  ```

- [x] **E3** Add `refreshTrayState()` helper in `index.ts` — calls `getTrayState()` then `platformAdapter.updateTrayState(state)`. Call it:
  - After `orchestrator.mountAll()` at startup.
  - After the "Resume All" tray action completes.
  - After the "Stop All" tray action completes.
  - After any IPC handler that calls `orchestrator.mountProject()` or `orchestrator.unmountProject()` (e.g. when a project's active/paused status is toggled from the UI). Search `ipc/handlers.ts` for existing mount/unmount calls and add `void refreshTrayState()` after each.

- [x] **E4** In `PlatformCallbacks.onResumeAll`: call `await orchestrator.mountAll()`, then `refreshTrayState()`.

- [x] **E5** In `PlatformCallbacks.onStopAll`: call `await orchestrator.unmountAll()`, then `refreshTrayState()`.

---

### N12-F — Per-platform implementations

- [x] **F1** `win32.ts` — Windows:
  - `setup()`: Creates `Tray`. Registers `tray.on('click', () => surfaceWindow())`. Registers `tray.on('right-click', () => tray.popUpContextMenu())`. Sets initial context menu.
  - `surfaceWindow()`: If `win.isMinimized()` → `win.restore()`; else if not visible → `win.show()`; then `win.focus()`.
  - `hideWindow()`: `win.hide()`.
  - `destroy()`: `tray.destroy()`.

- [x] **F2** `darwin.ts` — macOS:
  - `setup()`: Creates `Tray`. On macOS, `tray.on('click')` → `tray.popUpContextMenu()` (standard macOS tray convention; left-click shows menu, not window directly). Registers `app.on('activate', () => surfaceWindow())` for dock-icon clicks.
  - `surfaceWindow()`: `win.show(); win.focus()`.
  - `hideWindow()`: `win.hide()`. Does **not** call `app.dock.hide()` — the dock icon stays visible so Cmd+Tab still shows the app.
  - `destroy()`: `tray.destroy()`.

- [x] **F3** `linux.ts` — Linux:
  - `setup()`: Creates `Tray`. Registers `tray.on('click', () => surfaceWindow())`. Sets static context menu via `tray.setContextMenu()`. On Linux, `popUpContextMenu()` is unreliable across DEs — the static menu set via `setContextMenu` is the safe path. `updateTrayState()` still rebuilds and resets the static menu.
  - `surfaceWindow()`: Same as Win32 — check minimized/hidden then `show()` + `focus()`.
  - `hideWindow()`: `win.hide()`.
  - `destroy()`: `tray.destroy()`.

---

### N12-G — Wire everything into `index.ts`

- [x] **G1** Import `getPlatformAdapter` from `src/main/platform/registry.ts` at the top of `index.ts`. Instantiate it as a module-level `const platformAdapter = getPlatformAdapter()`.

- [x] **G2** After `createWindow()` returns `win`, call:
  ```typescript
  platformAdapter.setup(win, {
    onResumeAll: async () => { await orchestrator.mountAll(); void refreshTrayState() },
    onStopAll:   async () => { await orchestrator.unmountAll(); void refreshTrayState() },
    onQuit:      () => { isQuitting = true; app.quit() },
  })
  ```

- [x] **G3** After `orchestrator.mountAll()` at startup, call `void refreshTrayState()`.

- [x] **G4** In the `app.on('before-quit')` handler, call `platformAdapter.destroy()` before (or after) `orchestrator.unmountAll()`.

- [x] **G5** Extract `resolveAppIcon()` from `index.ts` into `src/main/util/app-icon.ts` and update the import in `index.ts` and in each platform adapter.

---

### N12-H — Docs

- [x] **H1** Update `docs/tech-stack.md`:
  - Add a **PlatformAdapter Layer** section listing the interface, the three platform files, and the Linux tray caveat.
  - Note that Electron's `Tray` API is used (no new npm dependencies).
  - Note `app.requestSingleInstanceLock()` for single-instance enforcement.

- [x] **H2** Update `docs/features.md`:
  - Add section **System Tray & Background Mode**: describe close-to-tray behaviour, tray icon location per platform, context menu items and their enabled states, and single-instance enforcement.

- [x] **H3** Update `docs/user-flows.md`:
  - Add flow **"Closing the window"** — user presses X → window hides → tray icon stays → workflows keep running.
  - Add flow **"Surfacing from tray"** — left-click tray → window appears.
  - Add flow **"Quitting Trayline"** — Quit from tray context menu → `orchestrator.unmountAll()` → process exits.
  - Add flow **"Launching a second instance"** — OS closes the new process, existing window comes to front.

- [x] **H4** Update `docs/implementation/tasks.md` — add Phase N12 entry (already added as part of this planning step).

---

## Acceptance Criteria

- Pressing the window's close button hides the window; the Trayline process stays alive and continues processing workflows.
- A system tray icon is visible on all three platforms while the window is hidden (and optionally while visible too).
- Left-clicking the tray icon on Windows and Linux shows and focuses the main window.
- On macOS, left-clicking the tray icon opens the context menu (platform norm); clicking the dock icon shows the window.
- Right-clicking the tray icon on any platform opens a context menu with Resume All / Stop All / Quit.
- "Resume All" is disabled when all active projects are already mounted; clicking it mounts them all.
- "Stop All" is disabled when no projects are mounted; clicking it unmounts them all.
- "Quit" triggers a clean shutdown: `orchestrator.unmountAll()` runs, then the process exits.
- Launching a second Trayline instance closes that second instance immediately and brings the first instance's window to the front.
- On macOS, clicking the dock icon while the window is hidden re-surfaces the window.
- All platform-specific code is confined to `src/main/platform/` — `index.ts` calls only the `PlatformAdapter` interface.
- `npm test` passes with no new failures.
- All referenced `docs/` sections are updated to match the new behaviour.
