import { app, Notification, BrowserWindow, nativeImage } from 'electron'
import { settingsStore } from './settings-store'
import { queueService } from './queue-service'

// In-session dedup: cardIds that have already triggered a notification this session.
const notified = new Set<string>()

let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win
}

export interface NotifyCardOpts {
  projectName: string
  workflowName: string
  trayName: string
  cardId: string
  cardTitle?: string
}

export function notifyCardNeedsReview(opts: NotifyCardOpts): void {
  const settings = settingsStore.get('notificationSettings')
  if (!settings.enabled) return
  if (settings.disabledProjects.includes(opts.projectName)) return
  if (notified.has(opts.cardId)) return

  // Skip when the app window is focused — the in-app badge is sufficient.
  const windows = BrowserWindow.getAllWindows()
  const focused = windows.some((w) => !w.isDestroyed() && w.isFocused())
  if (focused) {
    // Still dedup so we don't spam on the next unfocus
    notified.add(opts.cardId)
    return
  }

  if (!Notification.isSupported()) return

  const n = new Notification({
    title: opts.trayName,
    body: opts.cardTitle || 'A card needs your review',
  })

  n.on('click', () => {
    // Bring the window to the foreground
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    // Tell the renderer to navigate to this card
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send('notification:navigate', {
          projectName: opts.projectName,
          workflowName: opts.workflowName,
          cardId: opts.cardId,
        })
      }
    }
  })

  notified.add(opts.cardId)
  n.show()
}

export interface NotifySourceRunFailedOpts {
  projectName: string
  workflowName: string
  error: string
}

export function notifySourceRunFailed(opts: NotifySourceRunFailedOpts): void {
  const settings = settingsStore.get('notificationSettings')
  if (!settings.enabled) return
  if (settings.disabledProjects.includes(opts.projectName)) return
  if (!Notification.isSupported()) return

  const body = opts.error.length > 120 ? opts.error.slice(0, 120) + '…' : opts.error
  const n = new Notification({
    title: `Source run failed — ${opts.workflowName}`,
    body,
  })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
  n.show()
}

export function clearNotified(cardId: string): void {
  notified.delete(cardId)
}

export function clearAllNotified(): void {
  notified.clear()
}

let currentBadgeCount = 0

export function updateBadgeCount(count: number): void {
  currentBadgeCount = count

  try {
    if (process.platform === 'win32') {
      const win = mainWindow ?? BrowserWindow.getAllWindows()[0]
      if (!win || win.isDestroyed()) return
      if (count === 0) {
        win.setOverlayIcon(null, '')
      } else {
        const label = String(count > 99 ? '99+' : count)
        const size = 20
        const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
          <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#ef4444"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
                font-family="Arial,sans-serif" font-size="${label.length > 2 ? 7 : 9}"
                font-weight="bold" fill="white">${label}</text>
        </svg>`
        const img = nativeImage.createFromDataURL(
          `data:image/svg+xml;base64,${Buffer.from(canvas).toString('base64')}`,
        )
        win.setOverlayIcon(img, `${count} cards need review`)
      }
    } else {
      // macOS and Linux (Unity/GNOME badge)
      app.setBadgeCount(count)
    }
  } catch {
    // Badge APIs are best-effort — silently ignore failures
  }
}

export async function refreshBadgeCount(): Promise<void> {
  try {
    const entries = await queueService.getPending()
    updateBadgeCount(entries.length)
  } catch {
    // Non-blocking; ignore errors
  }
}

export function getCurrentBadgeCount(): number {
  return currentBadgeCount
}

export const notificationService = {
  setMainWindow,
  notifyCardNeedsReview,
  notifySourceRunFailed,
  clearNotified,
  clearAllNotified,
  updateBadgeCount,
  refreshBadgeCount,
  getCurrentBadgeCount,
}
