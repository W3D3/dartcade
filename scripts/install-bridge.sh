#!/usr/bin/env sh
# Installs the dartcade-bridge binary for this machine's OS/architecture, and with --service also
# sets it up as a service that starts at boot and comes back after a crash or a restart (systemd on
# Linux, launchd on macOS). On Windows use install-bridge.ps1.
#
#   curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh
#   curl -fsSL .../install-bridge.sh | sh -s -- --service --board-url http://localhost:3180
#   curl -fsSL .../install-bridge.sh | sh -s -- --uninstall [--purge]
#
# Options (--service only; run again with new values to change them, anything left out resets):
#   --service             install and start the service (systemd on Linux, launchd on macOS)
#   --board-url URL       Board Manager address (default: http://localhost:3180)
#   --backend-url URL     dartcade server (default: the hosted one)
#   --token TOKEN         bridge token (skips the pairing code)
#   --install-token TOKEN one-time token from the dashboard's install command (also pairs the bridge)
#   --uninstall           stop and remove the service (keeps its config and pairing)
#   --purge               with --uninstall: also delete the config and the pairing
#
# Env vars:
#   DARTCADE_INSTALL_DIR     where to install the binary (default: /usr/local/bin)
#   DARTCADE_BRIDGE_VERSION  a release tag, e.g. v0.4.2 (default: latest)
#   DARTCADE_BOARD_URL, DARTCADE_BACKEND_URL, DARTCADE_TOKEN, DARTCADE_INSTALL_TOKEN  same as the options above
set -e

repo="W3D3/dartcade"
bin_name="dartcade-bridge"
install_dir="${DARTCADE_INSTALL_DIR:-/usr/local/bin}"
version="${DARTCADE_BRIDGE_VERSION:-latest}"
board_url="${DARTCADE_BOARD_URL:-}"
backend_url="${DARTCADE_BACKEND_URL:-}"
token="${DARTCADE_TOKEN:-}"
install_token="${DARTCADE_INSTALL_TOKEN:-}"
service=0
uninstall=0
purge=0


die() {
  echo "error: $*" >&2
  exit 1
}

# Values end up in a service definition, so keep them free of characters that need escaping.
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
    --install-token) need_value "$@"; install_token="$2"; shift ;;
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
  [ "$(uname -s)" = "Linux" ] || die "this check is for Linux with systemd"
  [ -d /run/systemd/system ] || die "systemd isn't running on this machine, so there is no service to install"
  if [ -n "$sudo_cmd" ]; then
    command -v sudo >/dev/null 2>&1 || die "installing the service needs root: run as root or install sudo"
  fi
}

if [ "$uninstall" = 1 ]; then
  [ "$(uname -s)" = "Darwin" ] || require_systemd
  [ -x "${install_dir}/${bin_name}" ] || die "nothing to remove: ${install_dir}/${bin_name} doesn't exist"
  if [ "$purge" = 1 ]; then $sudo_cmd "${install_dir}/${bin_name}" uninstall --purge; else $sudo_cmd "${install_dir}/${bin_name}" uninstall; fi
  echo "The binary stays at ${install_dir}/${bin_name}."
  exit 0
fi

if [ "$service" = 1 ] && [ "$(uname -s)" != "Darwin" ]; then require_systemd; fi

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
  echo "To keep it running across restarts, run this script again with --service."
  exit 0
fi

# --- service -------------------------------------------------------------------------------
# The bridge registers itself (systemd on Linux, launchd on macOS) and keeps its settings in its
# own state directory. Running this again replaces the service with the values given now.

set -- install --board-url "${board_url:-http://localhost:3180}"
[ -n "$backend_url" ] && set -- "$@" --backend-url "$backend_url"
[ -n "$token" ] && set -- "$@" --token "$token"
[ -n "$install_token" ] && set -- "$@" --install-token "$install_token"
$sudo_cmd "${install_dir}/${bin_name}" "$@"

if [ "$os_name" = darwin ]; then
  echo "Logs: /var/log/${bin_name}.out.log"
  exit 0
fi

unit_name="${bin_name}.service"
state_dir="/var/lib/${bin_name}"
if [ -n "$token" ]; then
  echo "A token is configured, so there is no pairing code."
elif $sudo_cmd test -s "${state_dir}/bridge.toml" && $sudo_cmd grep -q '^token' "${state_dir}/bridge.toml"; then
  echo "This bridge is already paired."
elif [ -n "$install_token" ]; then
  echo "The install token pairs the bridge by itself; your board appears in the dashboard."
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
