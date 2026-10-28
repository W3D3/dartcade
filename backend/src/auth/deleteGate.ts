import type { AuthContext } from '@better-auth/core'
import { runAccountCleanup } from './cleanup.js'

/** How recently an account without a password must have signed in to delete itself. */
export const FRESH_SIGN_IN_SECONDS = 5 * 60

/** The parts of a better-auth instance this needs (the app's and a test's differ in their options). */
type DeleteAuth = {
  api: {
    getSession(req: {
      headers: Headers
      query: { disableCookieCache: true }
    }): Promise<{ user: { id: string }; session: { createdAt: Date } } | null>
    signOut(req: { headers: Headers; returnHeaders: true }): Promise<{ headers: Headers }>
  }
  $context: Promise<{ internalAdapter: Pick<AuthContext['internalAdapter'], 'findAccounts' | 'deleteUser'> }>
}

export type FreshDelete = { deleted: true; headers: Headers } | { deleted: false; reason: 'signed-out' | 'has-password' | 'stale' }

/**
 * DELETE /api/me: deletes an account with no password (Sign in with Discord only). It can't
 * confirm with a password, and with mail on better-auth's /delete-user would mail a link, which
 * a stand-in .invalid address never gets. Instead it must have signed in within the last few
 * minutes (Settings sends it through Discord again). Then it does what better-auth's own
 * /delete-user does: the account cleanup (its beforeDelete), then the user with its sessions and
 * accounts; `headers` clear the session cookies. Accounts with a password go better-auth's way.
 */
export async function deleteWithFreshSignIn(auth: DeleteAuth, headers: Headers): Promise<FreshDelete> {
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } })
  if (!session) return { deleted: false, reason: 'signed-out' }
  const userId = session.user.id
  const ctx = await auth.$context
  const accounts = await ctx.internalAdapter.findAccounts(userId)
  if (accounts.some(a => a.providerId === 'credential' && a.password)) return { deleted: false, reason: 'has-password' }
  if (Date.now() - new Date(session.session.createdAt).getTime() > FRESH_SIGN_IN_SECONDS * 1000) return { deleted: false, reason: 'stale' }
  // A throw here aborts the deletion, leaving the account intact (as beforeDelete does)
  await runAccountCleanup(userId)
  await ctx.internalAdapter.deleteUser(userId)
  // The session rows went with the user; signing out only clears the cookies
  const { headers: cleared } = await auth.api.signOut({ headers, returnHeaders: true })
  return { deleted: true, headers: cleared }
}
