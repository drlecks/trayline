/// <reference types="vite/client" />

import type { TraylineAPI } from '../preload/index'

declare global {
  interface Window {
    // The preload script always exposes this via contextBridge before any
    // renderer code runs, so it is safe to type as non-optional. (Earlier
    // versions of this file marked it optional defensively, but that just
    // forced `!` assertions throughout the renderer.)
    trayline: TraylineAPI
  }
}
