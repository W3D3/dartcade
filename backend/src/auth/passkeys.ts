import { passkey } from '@better-auth/passkey'
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx, sensitiveSessionMiddleware } from 'better-auth/api'
import { deleteSessionCookie } from 'better-auth/cookies'
import type { BetterAuthPlugin } from 'better-auth'

export type PasskeyDeps = {
  /** The origins WebAuthn ceremonies may come from; null falls back to the request's Origin header. */
  origin: string[] | null
  /** Whether the `auth.passkeys.enabled` flag is on for this user. */
  enabledFor: (userId: string) => Promise<boolean>
  requireVerifiedEmail: boolean
}

const REAUTH_TTL_MS = 2 * 60 * 1000
const reauthId = (userId: string) => `passkey-reauth:${userId}`

/** Paths of the passkey plugin that act for a signed-in user (the sign-in ones know their user only after the assertion). */
const isAccountPath = (path: string) =>
  path.startsWith('/passkey/') && path !== '/passkey/generate-authenticate-options' && path !== '/passkey/verify-authentication'

const disabled = () => new APIError('FORBIDDEN', { code: 'PASSKEYS_DISABLED', message: 'Passkeys are not available for your account' })

/**
 * What the passkey plugin does not do itself, as a plugin of ours:
 * - `last_used_at` on the passkey row (migration 059), shown in Settings;
 * - the feature flag for the registration, list, rename and remove routes;
 * - the delete-account confirmation: `afterVerification` below records a short-lived proof when the
 *   signed-in user's own passkey was just verified by the plugin, and POST /delete-user/passkey
 *   spends it. The proof only ever comes from a server-verified assertion.
 */
function passkeyExtras({ enabledFor }: Pick<PasskeyDeps, 'enabledFor'>): BetterAuthPlugin {
  return {
    id: 'passkey-extras',
    schema: { passkey: { fields: { lastUsedAt: { type: 'date', required: false, input: false, fieldName: 'last_used_at' } } } },
    hooks: {
      before: [
        {
          matcher: ctx => (ctx.path ? isAccountPath(ctx.path) || ctx.path === '/delete-user/passkey' : false),
          handler: createAuthMiddleware(async ctx => {
            const session = await getSessionFromCtx(ctx)
            if (session && !(await enabledFor(session.user.id))) throw disabled()
          }),
        },
      ],
    },
    endpoints: {
      deleteUserWithPasskey: createAuthEndpoint(
        '/delete-user/passkey',
        { method: 'POST', use: [sensitiveSessionMiddleware] },
        async ctx => {
          const { user } = ctx.context.session
          const proof = await ctx.context.internalAdapter.consumeVerificationValue(reauthId(user.id))
          if (!proof || proof.expiresAt.getTime() < Date.now()) {
            throw new APIError('UNAUTHORIZED', { code: 'PASSKEY_REQUIRED', message: 'Confirm with your passkey first' })
          }
          const { beforeDelete, afterDelete } = ctx.context.options.user?.deleteUser ?? {}
          if (beforeDelete) await beforeDelete(user, ctx.request)
          await ctx.context.internalAdapter.deleteUser(user.id)
          await ctx.context.internalAdapter.deleteUserSessions(user.id)
          deleteSessionCookie(ctx)
          if (afterDelete) await afterDelete(user, ctx.request)
          return ctx.json({ success: true, message: 'User deleted' })
        },
      ),
    },
  }
}

/**
 * Passkeys through better-auth's plugin; the WebAuthn ceremonies and their verification are its.
 * Adding one needs a fresh session (the plugin's own rule, one day by default); there is no
 * passkey-only sign-up, so every passkey belongs to an account that signed up with the terms accepted.
 * Signing in with one is held to the same rules as a password: a deployment that requires email
 * verification refuses an unverified address, and a ban stops the session being created
 * (the admin plugin's session hook).
 */
export function passkeyPlugins({ origin, enabledFor, requireVerifiedEmail }: PasskeyDeps): BetterAuthPlugin[] {
  return [
    passkey({
      rpName: 'Dartcade',
      origin,
      authentication: {
        afterVerification: async ({ ctx, clientData, verification }) => {
          const row = await ctx.context.adapter.findOne<{ id: string; userId: string }>({
            model: 'passkey',
            where: [{ field: 'credentialID', value: clientData.id }],
          })
          if (!row) return
          if (!(await enabledFor(row.userId))) throw disabled()
          if (requireVerifiedEmail) {
            const user = await ctx.context.internalAdapter.findUserById(row.userId)
            if (!user?.emailVerified) {
              throw new APIError('FORBIDDEN', { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' })
            }
          }
          await ctx.context.adapter.update({
            model: 'passkey',
            where: [{ field: 'id', value: row.id }],
            update: { lastUsedAt: new Date() },
          })
          const current = await getSessionFromCtx(ctx)
          // A key tapped without its PIN or biometric only proves presence: not enough to stand in for the password
          if (current?.user.id === row.userId && verification.authenticationInfo.userVerified) {
            await ctx.context.internalAdapter.createVerificationValue({
              identifier: reauthId(row.userId),
              value: row.userId,
              expiresAt: new Date(Date.now() + REAUTH_TTL_MS),
            })
          }
        },
      },
    }),
    passkeyExtras({ enabledFor }),
  ]
}
