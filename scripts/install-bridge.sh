#!/usr/bin/env sh
# Installs the dartcade-bridge binary for this machine's OS/architecture.
#
#   curl -fsSL https://raw.githubusercontent.com/W3D3/dartcade/main/scripts/install-bridge.sh | sh
#
# Env vars:
#   DARTCADE_INSTALL_DIR     where to install the binary (default: /usr/local/bin)
#   DARTCADE_BRIDGE_VERSION  a release tag, e.g. v0.4.2 (default: latest)
set -e

repo="W3D3/dartcade"
bin_name="dartcade-bridge"
install_dir="${DARTCADE_INSTALL_DIR:-/usr/local/bin}"
version="${DARTCADE_BRIDGE_VERSION:-latest}"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Linux) os_name=linux ;;
  Darwin) os_name=darwin ;;
  *)
    echo "error: unsupported OS '$os' — download a build from https://github.com/${repo}/releases" >&2
    exit 1
    ;;
esac

case "$arch" in
  x86_64 | amd64) arch_name=amd64 ;;
  arm64 | aarch64) arch_name=arm64 ;;
  *)
    echo "error: unsupported architecture '$arch' — download a build from https://github.com/${repo}/releases" >&2
    exit 1
    ;;
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
chmod +x "$tmp_file"

mkdir -p "$install_dir" 2>/dev/null || true
if [ -w "$install_dir" ]; then
  mv "$tmp_file" "${install_dir}/${bin_name}"
else
  echo "Using sudo to install into ${install_dir}..."
  sudo mv "$tmp_file" "${install_dir}/${bin_name}"
  sudo chmod +x "${install_dir}/${bin_name}"
fi

trap - EXIT
echo "Installed ${bin_name} to ${install_dir}/${bin_name}"
echo "Run '${bin_name} --help' to see all options."
