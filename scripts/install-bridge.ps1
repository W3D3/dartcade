# Installs the dartcade-bridge binary on Windows and sets it up as a Windows service that starts
# at boot and comes back after a crash. Run it from an Administrator PowerShell:
#
#   & ([scriptblock]::Create((irm https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.ps1))) -InstallToken <token> -BackendUrl wss://play.dartca.de/bridge
#   & ([scriptblock]::Create((irm .../install-bridge.ps1))) -Uninstall [-Purge]
#
# -InstallToken  one-time token from the dashboard's install command (pairs the bridge)
# -BackendUrl    dartcade server (default: the hosted one)
# -BoardUrl      Board Manager address (default: http://localhost:3180)
# -Version       a release tag, e.g. v0.8.0 (default: latest)
# -Uninstall     remove the service (keeps its config and pairing); add -Purge to delete those too
param(
  [string]$InstallToken = '',
  [string]$BackendUrl = '',
  [string]$BoardUrl = 'http://localhost:3180',
  [string]$Version = 'latest',
  [switch]$Uninstall,
  [switch]$Purge
)
$ErrorActionPreference = 'Stop'

$principal = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Installing the service needs an Administrator PowerShell: right-click PowerShell, "Run as administrator", then run the command again.'
}

$dir = Join-Path $env:ProgramFiles 'Dartcade'
$exe = Join-Path $dir 'dartcade-bridge.exe'

function Invoke-Bridge {
  & $exe @args
  if ($LASTEXITCODE -ne 0) { throw "dartcade-bridge $($args[0]) failed (exit $LASTEXITCODE)" }
}

if ($Uninstall) {
  if (-not (Test-Path $exe)) { throw "Nothing to remove: $exe doesn't exist." }
  if ($Purge) { Invoke-Bridge uninstall --purge } else { Invoke-Bridge uninstall }
  Write-Host "The binary stays at $exe."
  return
}

# A running service holds its .exe open, so take it down before replacing the file. (Installs
# since the Update bridge button run a copy in ProgramData instead, which the service updates
# itself; the install below refreshes that copy from this one.)
if (Test-Path $exe) { Invoke-Bridge uninstall }

$asset = 'dartcade-bridge_windows_amd64.exe'
if ($Version -eq 'latest') { $url = "https://github.com/W3D3/dartcade/releases/latest/download/$asset" }
else { $url = "https://github.com/W3D3/dartcade/releases/download/$Version/$asset" }

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Write-Host "Downloading $asset ($Version)..."
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $exe

$bridgeArgs = @('install', '--board-url', $BoardUrl)
if ($BackendUrl) { $bridgeArgs += @('--backend-url', $BackendUrl) }
if ($InstallToken) { $bridgeArgs += @('--install-token', $InstallToken) }
Invoke-Bridge @bridgeArgs
if ($InstallToken) { Write-Host 'The install token pairs the bridge by itself; your board appears in the dashboard.' }
Write-Host "Logs: $env:ProgramData\dartcade-bridge\bridge.log"
