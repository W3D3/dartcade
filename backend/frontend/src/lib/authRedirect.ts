// better-auth's verify-email and reset-password callbacks redirect the browser with `?error=…`
// (or, for reset, `?token=…`) in the page's real query string, before the `#` — not inside the
// hash route svelte-spa-router reads ($querystring only parses the text after `#/route?…`). A
// verify-email error's callback is never `#/reset` (that's only reset-password's own redirect
// target), so landing anywhere else with one of verify-email's own error codes means the app
// opened at the wrong page: send it to `#/verify` instead, with the code carried into the hash
// where Verify.svelte's $querystring reading can see it. `#/reset` reads its token/error straight
// from location.search itself, so it's left untouched here.

// The codes better-auth's verify-email route redirects a failed verification with (see
// node_modules/better-auth/dist/api/routes/email-verification.mjs's `redirectOnError` calls).
const VERIFY_EMAIL_ERRORS = new Set(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'USER_NOT_FOUND', 'INVALID_USER'])

/**
 * Where the app should land given the page's real query string and its current hash. `stripQuery`
 * is true only when `hash` must change (to `#/verify?error=…`) and the leftover page query should
 * be dropped from the address bar; otherwise `hash` is returned unchanged and nothing to do.
 */
export function authRedirect(search: string, hash: string): { hash: string; stripQuery: boolean } {
  const error = new URLSearchParams(search).get('error')
  if (!error || hash.startsWith('#/reset') || !VERIFY_EMAIL_ERRORS.has(error)) return { hash, stripQuery: false }
  return { hash: `#/verify?error=${error}`, stripQuery: true }
}
