#!/usr/bin/env bash
# Refresh backend/src/auth/disposableDomains.ts from the upstream blocklist.
set -euo pipefail
out="$(dirname "$0")/../backend/src/auth/disposableDomains.ts"
{
  echo "// Snapshot of https://github.com/disposable-email-domains/disposable-email-domains (disposable_email_blocklist.conf)."
  echo "// Refresh: scripts/update-disposable-domains.sh. Not formatted (see .oxfmtrc.json)."
  echo 'export const DISPOSABLE_DOMAINS = `'
  curl -sfL https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf | grep -v '^\s*$' | tr 'A-Z' 'a-z'
  echo '`'
} > "$out"
