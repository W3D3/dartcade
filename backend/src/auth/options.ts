import type { BetterAuthOptions } from 'better-auth'
import { admin, openAPI } from 'better-auth/plugins'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { MailConfig } from '../mail/config.js'
import type { Mailer } from '../mail/transport.js'
import { verifyMail } from '../mail/templates.js'
import { lastLoginHooks } from './lastLogin.js'
import { nameHooks } from './nameHooks.js'
import { termsGate } from './termsGate.js'

export type AuthDeps = { db: Kysely<Database>; mail: MailConfig; mailer: Mailer | null; trustedOrigins: string[] }

/** better-auth's options: email/password with optional verification, and terms acceptance at sign-up. */
// No return type annotation: it would widen to BetterAuthOptions and lose the plugins' literal
// types (e.g. admin()'s and openAPI()'s own auth.api methods); `satisfies` below checks the shape instead.
export function authOptions({ db, mail, mailer, trustedOrigins }: AuthDeps) {
  return {
    database: { db, type: 'pg' as const },
    emailAndPassword: { enabled: true, requireEmailVerification: mail.verification },
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
    },
    databaseHooks: { ...nameHooks(db), ...lastLoginHooks(db) },
    hooks: { before: termsGate },
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
