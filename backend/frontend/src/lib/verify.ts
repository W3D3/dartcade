// Where email-verification links send the browser, and the resend cooldown shown on #/verify.

/** The page a verification link opens: the remembered return path, or step 2 for a fresh sign-up. */
export function verifyCallback(returnPath: string | null): string {
  return `/#${returnPath && returnPath !== '/' ? returnPath : '/settings/boards'}`
}

/** Whether to show the "type your email" field: only when none arrived via the query string.
 *  Keyed off the query, not the typed email itself, so typing the first character into the
 *  field doesn't unmount the input it's bound to. */
export function showEmailField(queryEmail: string): boolean {
  return !queryEmail
}

export const RESEND_COOLDOWN_S = 60

/** Whole seconds left before a resend is allowed again; 0 once the cooldown is over (or never started). */
export function cooldownLeft(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null) return 0
  return Math.max(0, Math.ceil((lastSentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000))
}

/** The credentials typed at sign-up or sign-in, kept in memory only so the verify page can sign in once
 *  the link was opened elsewhere. Gone on reload, after 15 minutes, or when the verify page closes. */
const PENDING_TTL_MS = 15 * 60 * 1000
let pending: { email: string; password: string; at: number } | null = null

export function rememberCredentials(email: string, password: string): void {
  pending = { email, password, at: Date.now() }
}

export function pendingCredentials(email: string): { email: string; password: string } | null {
  if (pending && Date.now() - pending.at > PENDING_TTL_MS) pending = null
  return pending?.email === email ? { email: pending.email, password: pending.password } : null
}

export function forgetCredentials(): void {
  pending = null
}

/** How often the verify page tries to sign in; the sign-in rate limit allows 3 per 10 s. */
export const SIGN_IN_POLL_MS = 6000
