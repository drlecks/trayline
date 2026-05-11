/// <reference types="vite/client" />

import type { TraylineAPI } from '../preload/index'

declare global {
  interface Window {
    trayline?: TraylineAPI
  }
}
