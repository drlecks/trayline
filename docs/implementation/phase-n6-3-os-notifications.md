# Phase N6.3 — OS Notifications & System Tray Badge

**Estimate:** 2–3 days

---

## Goals

Trayline runs workflows in the background. Today, a user who minimises the app has no signal that cards are waiting for their review. They check back once a week, the queue has 40 items, and the workflow feels broken rather than useful.

This phase adds:
- **OS push notifications** (via `Electron.Notification`) when a new card lands in a manual-approval tray
- **App badge / taskbar overlay** showing total pending-review count
- **Notification click → jump to card** so the review action is one click from the desktop
- A **notification settings section** in the app's Settings panel so users can opt out globally or per-project

No new npm dependencies — `Electron.Notification`, `app.setBadgeCount`, and taskbar overlay are all built into Electron.

---

## Tasks

### Service

- [x] **`notification-service.ts`** (`src/main/services/notification-service.ts`):

  - `notifyCardNeedsReview(opts: { projectName, workflowName, trayName, cardId, cardTitle })`:
    - Check `notificationSettings.enabled` (global) and `notificationSettings.disabledProjects` (per-project) — skip if muted
    - Check dedup set: if `cardId` already notified this session, skip
    - Create `new Notification({ title: trayName, body: cardTitle || 'A card needs your review' })`
    - On `click`: send IPC `notification:navigate` with `{ projectName, workflowName, cardId }` to the renderer
    - Add `cardId` to the in-session dedup `Set<string>`

  - `clearNotified(cardId: string)` — removes a card from the dedup set when it is approved or discarded (called by the card-move service)

  - `updateBadgeCount(count: number)`:
    - macOS: `app.setBadgeCount(count)` — shows a red dot with number on the dock icon
    - Windows: sets a taskbar overlay icon (a small red circle with count, drawn on a 16×16 canvas via `nativeImage.createFromDataURL`) via `BrowserWindow.setOverlayIcon`; clears when count is 0
    - Linux: `app.setBadgeCount(count)` (Unity/GNOME only; silently no-ops elsewhere)
    - Stores the current count internally

  - `refreshBadgeCount()` — queries `queueService.getTotalPendingCount()` (already exists) and calls `updateBadgeCount`; called after any card-state change event

- [x] **Notification settings** (`src/shared/types.ts`):
  ```typescript
  interface NotificationSettings {
    enabled: boolean              // global on/off; default true
    disabledProjects: string[]    // project names opted out
  }
  ```
  Persisted in the global `Settings` object (`src/main/services/settings-store.ts`).

- [x] **IPC handlers**:
  - `notifications:get-settings` → returns `NotificationSettings`
  - `notifications:update-settings` with `Partial<NotificationSettings>` → merges and persists
  - `notification:navigate` (main → renderer) — renderer navigates to the card identified by the payload

### Integration

- [x] **`queue-service.ts`** — replaced basic `Electron.Notification` call with `notificationService.notifyCardNeedsReview(...)` and calls `refreshBadgeCount()` on card add/remove.

- [x] **`card-service.ts`** (or wherever card approval/discard is handled) — call `notificationService.clearNotified(cardId)` when a card is moved out of pending-review.

- [x] **App startup** (`src/main/index.ts`) — call `notificationService.refreshBadgeCount()` on `app.whenReady()` to set the correct badge from persisted queue state.

### Renderer

- [x] **Settings panel — "Notifications" section**:
  - Global toggle: "Notify me when cards need review"
  - Per-project toggles: list of all projects with individual on/off switches (hidden if global toggle is off)
  - "Clear notification history" button (calls `notificationService.clearAllNotified()`)

- [x] **`notification:navigate` handler in `App.tsx`** — listens for the IPC event, navigates the router to the card's tray panel, and scrolls to the card

---

## Acceptance Criteria

- A card landing in a manual-approval tray triggers an OS notification within 2 s on macOS, Windows, and Linux (where supported)
- Clicking the notification opens the app (if minimised) and navigates directly to the card
- The dock/taskbar badge reflects the exact number of cards currently needing review
- Badge clears to zero when all pending cards are approved or discarded
- Disabling notifications globally stops all future notifications and does not change the badge
- Disabling notifications for a specific project stops notifications for that project but not others
- The same card is never notified twice in a session (dedup works)
- No new npm package is added — only Electron built-ins are used

---

## Implementation Notes

- Windows overlay icon requires a `BrowserWindow` reference — store one in `notification-service.ts` (the main window) and update it after the window is created in `index.ts`
- `Electron.Notification` requires `Notification.isSupported()` to be true; wrap all `new Notification(...)` calls in that guard so Linux distros without libnotify don't crash
- Do not show a notification when the app window is focused and the user is already looking at the relevant tray — check `BrowserWindow.isFocused()` and skip if the renderer is active (the in-app badge + queue bell are sufficient in that case)
- `docs/user-flows.md` — add section 6.16 "Notification Click → Jump to Card"
- `docs/features.md` — describe the notifications Settings section and badge behaviour per platform
- `docs/tech-stack.md` — note that `Electron.Notification` and `app.setBadgeCount` are used (no new deps)
