// The commands that install the bridge and sign it in with a one-time install token, per OS.
export type Os = 'linux' | 'macos' | 'windows'

export const OSES: Os[] = ['linux', 'macos', 'windows']

export const OS_LABELS: Record<Os, string> = { linux: 'Linux', macos: 'macOS', windows: 'Windows' }

const INSTALL_SH = 'https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh'
const INSTALL_PS1 = 'https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.ps1'

/** The OS this browser runs on, for the tab to open first. */
export function detectOs(userAgent: string): Os {
  if (/windows/i.test(userAgent)) return 'windows'
  if (/mac/i.test(userAgent) && !/iphone|ipad/i.test(userAgent)) return 'macos'
  return 'linux'
}

/** Where a bridge connects to this server: wss://host for an https page (the bridge adds /bridge). */
export function bridgeUrl(origin: string): string {
  return origin.replace(/^http/, 'ws')
}

export function installCommand(os: Os, token: string, origin: string): string {
  const backend = bridgeUrl(origin)
  switch (os) {
    case 'linux':
    case 'macos':
      return `curl -fsSL ${INSTALL_SH} | DARTCADE_INSTALL_TOKEN=${token} sh -s -- --service --backend-url ${backend}`
    case 'windows':
      return `& ([scriptblock]::Create((irm ${INSTALL_PS1}))) -InstallToken ${token} -BackendUrl ${backend}`
  }
}

/** What to know about the command, under it. */
export const OS_NOTES: Record<Os, string> = {
  linux:
    'Installs a systemd service: it starts at boot and restarts if it stops. It also sets up Big screen for the logged-in desktop user. It expects the Board Manager on this machine; if it runs elsewhere, add --board-url http://<ip>:3180.',
  macos:
    'Installs a launchd service (it asks for your password): it starts at boot and restarts if it stops. It also sets up Big screen for the logged-in desktop user. It expects the Board Manager on this machine; if it runs elsewhere, add --board-url http://<ip>:3180.',
  windows:
    'Run it in an Administrator PowerShell. It installs a Windows service that starts at boot and restarts if it stops. It also sets up Big screen for the logged-in desktop user. It expects the Board Manager on this machine; if it runs elsewhere, add -BoardUrl http://<ip>:3180.',
}
