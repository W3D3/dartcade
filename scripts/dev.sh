#!/usr/bin/env sh
# Start the dev stack, detached by default. Extra args are passed to `docker compose up`
# (e.g. `scripts/dev.sh --attach backend` to follow one service's logs, or drop `-d` yourself
# by editing the invocation below if you want it attached every time).
set -eu
cd "$(dirname "$0")/.."

# The backend/frontend containers mount a volume over node_modules. If the
# directory doesn't exist yet Docker creates it as root, which breaks host-side
# `npm install`, so create it ourselves first.
mkdir -p backend/node_modules backend/frontend/node_modules

# Stamp the bridge with the current commit; it reports itself as dev+<sha>[-dirty].
BRIDGE_COMMIT="$(git describe --always --dirty --exclude '*' 2>/dev/null || true)"
export BRIDGE_COMMIT

exec docker compose -f docker-compose.dev.yaml up --build -d "$@"
