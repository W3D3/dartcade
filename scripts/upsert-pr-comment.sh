#!/usr/bin/env bash
# Finds this repo's marker-tagged PR comment (first line "<!-- marker -->") and updates it, or
# posts a new one if none exists. Used by CI steps that keep one running comment per PR instead
# of one per run (see check-migrations' schema-diff comment, the first to use this pattern).
# Usage: upsert-pr-comment.sh <repo> <pr-number> <marker> <body-file>
# Requires GH_TOKEN in the environment.
set -euo pipefail

repo=$1
pr=$2
marker=$3
file=$4

id=$(gh api "repos/$repo/issues/$pr/comments" --paginate \
  --jq "[.[] | select(.body | startswith(\"$marker\"))][0].id // empty")
if [ -n "$id" ]; then
  gh api -X PATCH "repos/$repo/issues/comments/$id" -F body=@"$file" >/dev/null
else
  gh pr comment "$pr" --body-file "$file"
fi
