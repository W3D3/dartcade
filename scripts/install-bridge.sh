#!/usr/bin/env sh
# Installs the dartcade-bridge binary for this machine's OS/architecture, and on Linux can also
# set it up as a systemd service that starts at boot and comes back after a crash or a restart.
#
#   curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh
#   curl -fsSL .../install-bridge.sh | sh -s -- --service --board-url http://localhost:3180
#   curl -fsSL .../install-bridge.sh | sh -s -- --uninstall [--purge]
#
# Options (--service only; run again with new values to change them):
#   --service             install and start the systemd service (Linux)
#   --board-url URL       Board Manager address (default: http://localhost:3180)
#   --backend-url URL     dartcade server (default: the hosted one)
#   --token TOKEN         bridge token (skips the pairing code)
#   --uninstall           stop and remove the service (keeps its config and pairing)
#   --purge               with --uninstall: also delete the config and the pairing
#
# Env vars:
#   DARTCADE_INSTALL_DIR     where to install the binary (default: /usr/local/bin)
#   DARTCADE_BRIDGE_VERSION  a release tag, e.g. v0.4.2 (default: latest)
#   DARTCADE_BOARD_URL, DARTCADE_BACKEND_URL, DARTCADE_TOKEN  same as the options above
set -e

repo="W3D3/dartcade"
bin_name="dartcade-bridge"
install_dir="${DARTCADE_INSTALL_DIR:-/usr/local/bin}"
version="${DARTCADE_BRIDGE_VERSION:-latest}"
board_url="${DARTCADE_BOARD_URL:-}"
backend_url="${DARTCADE_BACKEND_URL:-}"
token="${DARTCADE_TOKEN:-}"
service=0
uninstall=0
purge=0

unit_name="${bin_name}.service"
unit_file="/etc/systemd/system/${unit_name}"
env_dir="/etc/${bin_name}"
env_file="${env_dir}/bridge.env"
state_dir="/var/lib/${bin_name}"

die() {
  echo "error: $*" >&2
  exit 1
}

# A value must be usable as-is in a systemd EnvironmentFile line.
need_value() {
  [ $# -ge 2 ] && [ -n "$2" ] || die "$1 needs a value"
  case "$2" in
    *[[:space:]\"\'\\]*) die "$1: the value must not contain spaces, quotes or backslashes" ;;
  esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    --service) service=1 ;;
    --uninstall) uninstall=1 ;;
    --purge) purge=1 ;;
    --board-url) need_value "$@"; board_url="$2"; shift ;;
    --backend-url) need_value "$@"; backend_url="$2"; shift ;;
    --token) need_value "$@"; token="$2"; shift ;;
    *) die "unknown option '$1' (options are listed at the top of the script)" ;;
  esac
  shift
done

# Commands that write outside the user's home run through sudo unless we're root already.
sudo_cmd=""
if [ "$(id -u)" -ne 0 ]; then
  sudo_cmd="sudo"
fi

require_systemd() {
  [ "$(uname -s)" = "Linux" ] || die "the service install only supports Linux with systemd (see https://github.com/${repo}/issues/265 for macOS and Windows)"
  [ -d /run/systemd/system ] || die "systemd isn't running on this machine, so there is no service to install"
  if [ -n "$sudo_cmd" ]; then
    command -v sudo >/dev/null 2>&1 || die "installing the service needs root: run as root or install sudo"
  fi
}

if [ "$uninstall" = 1 ]; then
  require_systemd
  $sudo_cmd systemctl disable --now "$unit_name" 2>/dev/null || true
  $sudo_cmd rm -f "$unit_file"
  $sudo_cmd systemctl daemon-reload
  if [ "$purge" = 1 ]; then
    $sudo_cmd rm -rf "$env_dir" "$state_dir"
    echo "Removed the service, its config and its pairing."
  else
    echo "Removed the service. Its config (${env_dir}) and pairing (${state_dir}) are kept; add --purge to delete them."
  fi
  echo "The binary stays at ${install_dir}/${bin_name}."
  exit 0
fi

[ "$service" = 1 ] && require_systemd

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) os_name=linux ;;
  Darwin) os_name=darwin ;;
  *) die "unsupported OS '$os' — download a build from https://github.com/${repo}/releases" ;;
esac

case "$arch" in
  x86_64 | amd64) arch_name=amd64 ;;
  arm64 | aarch64) arch_name=arm64 ;;
  *) die "unsupported architecture '$arch' — download a build from https://github.com/${repo}/releases" ;;
esac

asset="${bin_name}_${os_name}_${arch_name}"
if [ "$version" = "latest" ]; then
  url="https://github.com/${repo}/releases/latest/download/${asset}"
else
  url="https://github.com/${repo}/releases/download/${version}/${asset}"
fi

tmp_file="$(mktemp)"
trap 'rm -f "$tmp_file"' EXIT

echo "Downloading ${asset} (${version})..."
curl -fsSL "$url" -o "$tmp_file"

# World-executable: the service runs as its own user, not as whoever ran this script.
mkdir -p "$install_dir" 2>/dev/null || true
if [ -w "$install_dir" ]; then
  install -m 0755 "$tmp_file" "${install_dir}/${bin_name}"
else
  echo "Using sudo to install into ${install_dir}..."
  sudo install -m 0755 "$tmp_file" "${install_dir}/${bin_name}"
fi

trap - EXIT
rm -f "$tmp_file"
echo "Installed ${bin_name} to ${install_dir}/${bin_name}"

if [ "$service" != 1 ]; then
  echo "Run '${bin_name} --help' to see all options."
  echo "To keep it running across restarts on Linux, run this script again with --service."
  exit 0
fi

# --- systemd service ------------------------------------------------------------------------
# The settings live in a root-only env file that systemd reads, so they survive upgrades. The
# bridge writes its own pairing (token, bridge_id) into the unit's state directory, which systemd
# creates for the service's dynamic user, so the service never needs a login account of its own.

new_env="$(mktemp)"
trap 'rm -f "$new_env"' EXIT
# Values given now replace the stored ones; anything not given stays as it was.
{ $sudo_cmd cat "$env_file" 2>/dev/null || true; } >"$new_env"
for pair in "DARTCADE_BOARD_URL=$board_url" "DARTCADE_BACKEND_URL=$backend_url" "DARTCADE_TOKEN=$token"; do
  [ -n "${pair#*=}" ] || continue
  grep -v "^${pair%%=*}=" "$new_env" >"$new_env.next" || true
  echo "$pair" >>"$new_env.next"
  mv "$new_env.next" "$new_env"
done
if ! grep -q '^DARTCADE_BOARD_URL=' "$new_env"; then
  echo "DARTCADE_BOARD_URL=http://localhost:3180" >>"$new_env"
  echo "No --board-url given: using http://localhost:3180 (the board on this machine)."
fi

$sudo_cmd install -d -m 0755 "$env_dir"
$sudo_cmd install -m 0600 "$new_env" "$env_file"
rm -f "$new_env"
trap - EXIT

unit="$(mktemp)"
trap 'rm -f "$unit"' EXIT
cat >"$unit" <<EOF
[Unit]
Description=Dartcade bridge (connects a dart board to dartcade)
Documentation=https://github.com/${repo}
After=network-online.target
Wants=network-online.target

[Service]
EnvironmentFile=${env_file}
Environment=DARTCADE_CONFIG_DIR=${state_dir}
ExecStart=${install_dir}/${bin_name}
Restart=always
RestartSec=10
DynamicUser=yes
StateDirectory=${bin_name}
StateDirectoryMode=0700
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
EOF
$sudo_cmd install -m 0644 "$unit" "$unit_file"
rm -f "$unit"
trap - EXIT

$sudo_cmd systemctl daemon-reload
$sudo_cmd systemctl enable "$unit_name" >/dev/null 2>&1
# restart, not start: an upgrade or a changed setting must take effect on a running service
$sudo_cmd systemctl restart "$unit_name"
echo "Started ${unit_name}; it starts at boot and restarts if it stops."

if $sudo_cmd grep -q '^DARTCADE_TOKEN=' "$env_file"; then
  echo "A token is configured, so there is no pairing code."
elif $sudo_cmd test -s "${state_dir}/bridge.toml" && $sudo_cmd grep -q '^token' "${state_dir}/bridge.toml"; then
  echo "This bridge is already paired."
else
  # The bridge prints the code to its log; show it once it's there so the user needn't dig.
  echo "Waiting for the pairing code..."
  i=0
  while [ "$i" -lt 20 ]; do
    if code="$($sudo_cmd journalctl -u "$unit_name" --since "-1min" --no-pager -o cat 2>/dev/null | sed -n '/Pair this board/,/^$/p;/Couldn.t reach/p')" && [ -n "$code" ]; then
      printf '%s\n' "$code"
      break
    fi
    i=$((i + 1))
    sleep 1
  done
fi
echo "Logs: journalctl -u ${unit_name} -f"
