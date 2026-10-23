// The commands that install the bridge and sign it in with a one-time install token, per OS.
export type Os = 'linux' | 'macos' | 'windows'

export const OSES: Os[] = ['linux', 'macos', 'windows']

export const OS_LABELS: Record<Os, string> = { linux: 'Linux', macos: 'macOS', windows: 'Windows' }

const REPO = 'https://github.com/W3D3/dartcade'
const INSTALL_SH = 'https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh'
const BOARD_URL = 'http://localhost:3180'

/** The OS this browser runs on, for the tab to open first. */
export function detectOs(userAgent: string): Os {
  if (/windows/i.test(userAgent)) return 'windows'
  if (/mac/i.test(userAgent) && !/iphone|ipad/i.test(userAgent)) return 'macos'
  return 'linux'
}

/** Where a bridge connects to this server: wss://host/bridge for an https page. */
export function bridgeUrl(origin: string): string {
  return `${origin.replace(/^http/, 'ws')}/bridge`
}

export function installCommand(os: Os, token: string, origin: string): string {
  const backend = bridgeUrl(origin)
  switch (os) {
    case 'linux':
      return `curl -fsSL ${INSTALL_SH} | DARTCADE_INSTALL_TOKEN=${token} sh -s -- --service --backend-url ${backend}`
    case 'macos':
      return `curl -fsSL ${INSTALL_SH} | sh\nDARTCADE_INSTALL_TOKEN=${token} DARTCADE_BACKEND_URL=${backend} DARTCADE_BOARD_URL=${BOARD_URL} dartcade-bridge`
    case 'windows':
      return `Invoke-WebRequest ${REPO}/releases/latest/download/dartcade-bridge_windows_amd64.exe -OutFile dartcade-bridge.exe\n$env:DARTCADE_INSTALL_TOKEN="${token}"; $env:DARTCADE_BACKEND_URL="${backend}"; $env:DARTCADE_BOARD_URL="${BOARD_URL}"; .\\dartcade-bridge.exe`
  }
}

/** What to know about the command, under it. */
export const OS_NOTES: Record<Os, string> = {
  linux:
    'Installs a systemd service: it starts at boot and restarts if it stops. Add --board-url http://<ip>:3180 if the board runs on another machine.',
  macos:
    'Run it in the terminal on the machine with your Board Manager and keep that window open. Change DARTCADE_BOARD_URL if the board runs on another machine.',
  windows:
    'Run it in PowerShell on the machine with your Board Manager and keep that window open. Change DARTCADE_BOARD_URL if the board runs on another machine.',
}
