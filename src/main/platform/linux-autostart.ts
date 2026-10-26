import fs from 'fs'
import { homedir } from 'os'
import { join } from 'path'

// Electron's app.setLoginItemSettings() is a no-op on Linux, so launch-at-login
// is implemented with an XDG autostart entry (~/.config/autostart/*.desktop),
// which GNOME, KDE, XFCE, Cinnamon and most other desktops honour.

const FILE_NAME = 'trayline.desktop'

export function autostartPath(
  configHome: string = process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
): string {
  return join(configHome, 'autostart', FILE_NAME)
}

/**
 * Quote an Exec= argument per the Desktop Entry spec: wrap in double quotes,
 * backslash-escape `"`, `` ` ``, `$` and `\`, and double any `%` so it isn't
 * read as a field code.
 */
function quoteExecArg(arg: string): string {
  return `"${arg.replace(/(["`$\\])/g, '\\$1').replace(/%/g, '%%')}"`
}

export function buildDesktopEntry(execPath: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Trayline',
    'Comment=Visual AI workflow automation',
    `Exec=${quoteExecArg(execPath)}`,
    'Terminal=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n')
}

/** Create or remove the autostart entry. `execPath` is the binary to launch. */
export function setLinuxAutostart(enabled: boolean, execPath: string, file: string = autostartPath()): void {
  if (enabled) {
    fs.mkdirSync(join(file, '..'), { recursive: true })
    fs.writeFileSync(file, buildDesktopEntry(execPath), 'utf-8')
  } else {
    fs.rmSync(file, { force: true })
  }
}
