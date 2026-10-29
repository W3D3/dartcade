#!/usr/bin/env bash
# Whether a change can alter what the visual check renders (CI's test-visual job): prints
# `ui=true` or `ui=false`, for $GITHUB_OUTPUT. Compares a commit (HEAD by default) with a base.
#   scripts/ui-changed.sh <base> [head]
#
# Counts: the SPA and the server (a game's view data is what the match screens draw), the
# schemas, and the visual check itself (its scenes, images, config, script, stack and job).
# Doesn't count: tests, Markdown, docs/, the bridge, the e2e suite's own specs.
set -euo pipefail

base="${1:?usage: scripts/ui-changed.sh <base commit> [head commit]}"
head="${2:-HEAD}"

files=$(git diff --name-only "$base" "$head")

ui=$(printf '%s\n' "$files" |
  grep -E '^(backend/|schema/|e2e/visual/|e2e/visual\.config\.ts$|e2e/package(-lock)?\.json$|scripts/visual\.sh$|scripts/ui-changed\.sh$|docker-compose\.e2e\.yaml$|\.github/workflows/ci\.yml$)' |
  grep -vE '(\.test\.ts$|/__tests__/|\.md$)' ||
  true)

if [ -n "$ui" ]; then
  echo "ui=true"
  printf 'Files that can change the match screens:\n%s\n' "$ui" >&2
else
  echo "ui=false"
  echo 'No file that can change the match screens: the visual check is skipped.' >&2
fi
