#!/usr/bin/env sh
# The visual regression check: every game mode's match screen compared with e2e/visual/__screenshots__.
#   scripts/visual.sh            compare (fails on any changed screen; report in e2e/playwright-report)
#   scripts/visual.sh --update   rewrite the images from the current code, to commit with the change
# Further arguments go to Playwright, e.g. `scripts/visual.sh -g minigolf` for one mode's scenes.
# Starts the e2e stack (docker-compose.e2e.yaml, :5174) if it isn't up, then runs Playwright inside the
# pinned Playwright image, so CI and every machine render with the same browser and fonts.
set -eu
cd "$(dirname "$0")/.."

# Renovate bumps this with @playwright/test in e2e/package.json (renovate.json), in one PR
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
UPDATE=""
if [ "${1:-}" = "--update" ]; then
  UPDATE="--update-snapshots"
  shift
fi

[ -d e2e/node_modules ] || (cd e2e && npm ci)
docker compose -f docker-compose.e2e.yaml up -d --wait

# The account the scenes sign in as, an admin (the flagged game modes are on for admins)
curl -s -o /dev/null -X POST http://localhost:5174/api/auth/sign-up/email \
  -H 'Origin: http://localhost:5174' -H 'Content-Type: application/json' \
  -d '{"name":"visual","email":"visual@test.local","password":"VisualPass1!","acceptTerms":true}' || true
docker compose -f docker-compose.e2e.yaml exec -T postgres \
  psql -q -U dartgames -d dartgames -c "UPDATE \"user\" SET role = 'admin' WHERE email = 'visual@test.local'"

# As the calling user, so the images and the report aren't root-owned
docker run --rm --network host --ipc host \
  --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" \
  -v "$PWD/e2e:/e2e" -w /e2e \
  "$IMAGE" npx playwright test -c visual.config.ts $UPDATE "$@"
