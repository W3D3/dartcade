import type { BetterAuthOptions } from 'better-auth'
import { createAuthMiddleware } from 'better-auth/api'
import { admin, openAPI } from 'better-auth/plugins'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { MailConfig } from '../mail/config.js'
import type { Mailer } from '../mail/transport.js'
import { deleteMail, resetMail, verifyMail } from '../mail/templates.js'
import { sessionHooks } from './sessionHooks.js'
import { nameHooks } from './nameHooks.js'
import { termsGate } from './termsGate.js'
import { bannedSignIn } from './banGate.js'
import { runAccountCleanup } from './cleanup.js'
import { passwordlessDelete } from './deleteGate.js'
import { discordProvider, type DiscordConfig } from './discord.js'

export type AuthDeps = {
  db: Kysely<Database>
  mail: MailConfig
  mailer: Mailer | null
  trustedOrigins: string[]
  /** Unset or null: no Sign in with Discord */
  discord?: DiscordConfig
}

/** better-auth's options: email/password with optional verification, Sign in with Discord if configured, and terms acceptance at sign-up. */
// No return type annotation: it would widen to BetterAuthOptions and lose the plugins' literal
// types (e.g. admin()'s and openAPI()'s own auth.api methods); `satisfies` below checks the shape instead.
export function authOptions({ db, mail, mailer, trustedOrigins, discord = null }: AuthDeps) {
  return {
    database: { db, type: 'pg' as const },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: mail.verification,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 3600,
      sendResetPassword: mailer
        ? // better-auth's sendResetPassword must return a Promise; mailer.send fires without awaiting
          // oxlint-disable-next-line typescript/require-await
          async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
            mailer.send(resetMail(user.email, user.name, url))
          }
        : undefined,
    },
    emailVerification:
      mailer && mail.verification
        ? {
            sendOnSignUp: true,
            // Login sends no callbackURL (passing one makes the client do a full-page redirect
            // on success), so better-auth's own sendOnSignIn would mail a link back to "/".
            // Login.svelte sends its own verification email with the right callbackURL instead.
            sendOnSignIn: false,
            autoSignInAfterVerification: true,
            // better-auth's sendVerificationEmail must return a Promise; mailer.send fires without awaiting
            // oxlint-disable-next-line typescript/require-await
            sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
              mailer.send(verifyMail(user.email, user.name, url))
            },
          }
        : undefined,
    user: {
      additionalFields: { termsAcceptedAt: { type: 'date', required: false, input: false, fieldName: 'terms_accepted_at' } },
      deleteUser: {
        enabled: true,
        // Leaves lobbies and forfeits running games before the row goes; a throw here aborts
        // the deletion (better-auth doesn't call deleteUser), leaving the account intact.
        beforeDelete: async user => {
          await runAccountCleanup(user.id)
        },
        sendDeleteAccountVerification: mailer
          ? // better-auth's sendDeleteAccountVerification must return a Promise; mailer.send fires without awaiting
            // oxlint-disable-next-line typescript/require-await
            async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
              mailer.send(deleteMail(user.email, user.name, url))
            }
          : undefined,
      },
    },
    // Sign in with Discord, when the deployment has its app's credentials. Linking a Discord sign-in
    // to an existing account with the same email stays better-auth's default, which is what we
    // want: only when Discord reports the email verified (Discord is not a trustedProvider, which
    // would skip that) and the account's own email is verified too; otherwise the sign-in fails
    // with account_not_linked, so an unverified Discord email never takes over a password account.
    socialProviders: discord ? { discord: discordProvider(discord) } : {},
    databaseHooks: { ...nameHooks(db), ...sessionHooks(db) },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        termsGate(ctx)
        if (ctx.path === '/delete-user') return passwordlessDelete(ctx)
      }),
      after: bannedSignIn(db),
    },
    // Bans go only through PUT/DELETE /api/admin/users/{id}/ban, which writes the audit row and
    // closes the player's sockets, lobby and game; the admin plugin's own routes would skip that.
    disabledPaths: ['/admin/ban-user', '/admin/unban-user'],
    trustedOrigins,
    // No `enabled` override: better-auth's own default (NODE_ENV === 'production' only) is what
    // we want — on for real deployments, off for dev and the e2e stack (NODE_ENV=test), where
    // every test browser shares one IP and the limit below would trip for everyone at once.
    rateLimit: {
      customRules: {
        '/send-verification-email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/delete-user': { window: 60, max: 3 },
      },
    },
    // Keyed by this header, set to the real client address below (never the socket address);
    // overwritten even if the client sent one, so it can't be spoofed into hitting someone else's limit.
    advanced: { ipAddress: { ipAddressHeaders: ['x-dartcade-client-ip'] }, database: { validateSchema: false } },
    // Generates better-auth's own OpenAPI document (served at /api/auth/open-api/generate-schema);
    // Swagger UI at /api/docs shows it next to ours, so its built-in reference page is off.
    plugins: [openAPI({ disableDefaultReference: true }), admin()],
  } satisfies BetterAuthOptions
}
