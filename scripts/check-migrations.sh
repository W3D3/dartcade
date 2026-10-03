#!/usr/bin/env bash
# Migrations that ran on real databases never change: compared with the base branch, a PR may
# only add new files, named NNN_name.sql and numbered after the base's last one.
# Usage: scripts/check-migrations.sh [base-ref]   (default: origin/main)
set -euo pipefail
base="${1:-origin/main}"
dir=backend/src/db/migrations
fail=0

while IFS=$'\t' read -r status path _; do
  [ "$status" = A ] && continue
  echo "::error file=$path::Shipped migration changed ($status). Add a new migration instead of editing, renaming or deleting one."
  fail=1
done < <(git diff --name-status --find-renames "$base"...HEAD -- "$dir")

last_base=$(git ls-tree --name-only "$base" -- "$dir/" | sed -n 's#.*/\([0-9]\{3\}\)_.*\.sql$#\1#p' | sort | tail -1)
while read -r path; do
  [ -n "$path" ] || continue
  name=$(basename "$path")
  if ! [[ "$name" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]; then
    echo "::error file=$path::Migration names look like 010_drop_last_game.sql."; fail=1; continue
  fi
  if [ -n "$last_base" ] && [ "$((10#${name:0:3}))" -le "$((10#$last_base))" ]; then
    echo "::error file=$path::New migration $name must be numbered after $last_base, the base branch's last one."; fail=1
  fi
done < <(git diff --name-only --diff-filter=A "$base"...HEAD -- "$dir")

dups=$(ls "$dir" | sed -n 's/^\([0-9]\{3\}\)_.*\.sql$/\1/p' | sort | uniq -d)
if [ -n "$dups" ]; then echo "::error::Two migrations share a number: $dups"; fail=1; fi

[ "$fail" -eq 0 ] && echo "Migrations: only new files, numbered after ${last_base:-none}."
exit "$fail"
