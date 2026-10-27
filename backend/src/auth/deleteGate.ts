import { randomUUID } from 'node:crypto'
import { APIError, getSessionFromCtx } from 'better-auth/api'
import type { GenericEndpointContext } from '@better-auth/core'

/** How recently an account without a password must have signed in to delete itself. */
export const FRESH_SIGN_IN_SECONDS = 5 * 60
export const FRESH_SIGN_IN_REQUIRED = 'FRESH_SIGN_IN_REQUIRED'

/**
 * POST /delete-user for an account with no password (Sign in with Discord only). It can't confirm
 * with a password, and with mail on better-auth would mail a link, which a stand-in .invalid
 * address never gets. Instead it must have signed in within the last few minutes (Settings sends
 * it through Discord again); then this hands better-auth a one-off deletion token, whose path
 * deletes at once and still runs beforeDelete (the account cleanup). Accounts with a password,
 * and the mailed link's own token, go better-auth's usual way.
 */
export async function passwordlessDelete(ctx: GenericEndpointContext) {
  const body: unknown = ctx.body
  if (!body || typeof body !== 'object' || 'password' in body || 'token' in body) return
  // Signed out: the endpoint's own session check answers
  const session = await getSessionFromCtx(ctx, { disableCookieCache: true })
  if (!session) return
  const accounts = await ctx.context.internalAdapter.findAccounts(session.user.id)
  if (accounts.some(a => a.providerId === 'credential' && a.password)) return
  if (Date.now() - new Date(session.session.createdAt).getTime() > FRESH_SIGN_IN_SECONDS * 1000) {
    throw new APIError('BAD_REQUEST', { code: FRESH_SIGN_IN_REQUIRED, message: 'Sign in with Discord again to confirm' })
  }
  const token = randomUUID()
  // The identifier and value better-auth 1.7's own /delete-user writes for its mailed link (deleteAccount.test.ts checks it)
  await ctx.context.internalAdapter.createVerificationValue({
    identifier: `delete-account-${token}`,
    value: session.user.id,
    expiresAt: new Date(Date.now() + 60_000),
  })
  return { context: { body: { ...body, token } } }
}
