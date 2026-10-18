# Email verification, legal pages and account deletion: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New accounts confirm their email before they can sign in, sign-up links real Terms, a
Privacy Policy and an Imprint, users can reset their password and delete their account, and the
sign-in and register pages match the design canvas.

**Architecture:** better-auth (1.7.6) already handles sign-in. We give it a mail callback built on
one nodemailer SMTP transport and turn on its built-in verification, password reset and
user-deletion endpoints. Config is resolved once from env by a pure function, so self-hosters can
run without mail. Legal texts are Markdown files the backend fills from env and renders to HTML.
The SPA gets new signed-out routes and a delete-account modal.

**Tech Stack:** better-auth 1.7.6, nodemailer, marked, Fastify, Kysely/Postgres, Svelte 5,
svelte-spa-router, bits-ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-email-verification-legal-design.md`. Read it before
starting any task.

## Global Constraints

- Work in the worktree `.claude/worktrees/email-verification` on branch `feat/email-verification`.
  Never `cd` to the main checkout.
- New dependencies: `nodemailer` (plus `@types/nodemailer`) and `marked` in `backend/` only.
  Nothing new in the frontend.
- `EMAIL_VERIFICATION` is `required` or `off`. It defaults to `required` with `SMTP_URL` set and
  `off` without it. `required` without `SMTP_URL` stops startup with an error that names both
  variables.
- Existing users become verified in migration `024_email_verification.sql`.
- Minimum age 14. Legal texts are written in English for an operator in Austria.
- A deleted user's `game_players.name` stays.
- Responses never reveal whether an email has an account. Reset and resend always answer the
  same, and mail is sent without awaiting.
- Commits: conventional `type(scope): subject`, lower case, under 72 characters, each ending
  with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One atomic commit per task;
  each one builds and passes `npm test` and `npm run typecheck` in `backend/` and
  `backend/frontend/`.
- Run `npm run format` at the repo root before every commit. After touching
  `schema/api-v1.yaml`, run `npm run gen:api` at the repo root.
- UI follows the canvas artboards from Task 1. Don't invent layout that contradicts them.
- DB tests use `describe.skipIf(!process.env.TEST_DATABASE_URL)` and `openTestSchema` from
  `backend/src/db/testSchema.ts`. Start Postgres for them as `DEVELOPMENT.md` says.

## Review Focus

1. **An existing user signs in after deploy.** The migration has marked them verified, so they get
   straight in with no "check your inbox". Pinned in Task 3 (migration DB test).
2. **A join link or QR code opened signed out, then sign-up and verify in a new tab.** The user
   lands on the lobby, not the start page: the return path travels in `callbackURL`. Pinned in
   Task 4 (`verifyCallback` unit test).
3. **A self-hosted instance with no SMTP.** Sign-up signs the user straight in, "Forgot
   password?" is hidden, and deletion happens without a mail. Pinned in Tasks 2, 3 and 8
   (config resolution, `/api/auth-info`, and the delete DB test with mail off).
4. **A deleted user had played games with others.** The others' history still shows the old name
   and stats, and no lobby is left hostless. Pinned in Task 8 (DB test).
5. **Someone signs up with an address that's already registered.** They see the same "check your
   inbox" as a new sign-up, with no "email taken" leak, as long as verification is on.
   better-auth does this when `requireEmailVerification` is set. Pinned in Task 3 (integration
   test asserts the 200 response).

---

## File map

| File                                                                | Change                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/src/mail/config.ts`                                        | **new**: `resolveMailConfig(env)` → `MailConfig`                   |
| `backend/src/mail/transport.ts`                                     | **new**: `createMailer(config)` → `Mailer` (`send(msg)`)           |
| `backend/src/mail/templates.ts`                                     | **new**: `verifyMail`, `resetMail`, `deleteMail`                   |
| `backend/src/auth/options.ts`                                       | **new**: `authOptions(deps)`, the pure better-auth options         |
| `backend/src/auth/index.ts`                                         | builds `auth` from `authOptions`                                   |
| `backend/src/auth/nameHooks.ts`                                     | sets `termsAcceptedAt` on create                                   |
| `backend/src/auth/termsGate.ts`                                     | **new**: `before` middleware requiring `acceptTerms`               |
| `backend/src/auth/cleanup.ts`                                       | **new**: `setAccountCleanup`/`accountCleanup`, run before deletion |
| `backend/src/auth/seed.ts`                                          | dev users verified                                                 |
| `backend/src/db/migrations/024_email_verification.sql`              | **new**                                                            |
| `backend/src/db/schema.ts`                                          | `UserTable.terms_accepted_at`                                      |
| `backend/src/api/authInfo.ts`                                       | **new**: `GET /api/auth-info`                                      |
| `backend/src/legal/{load.ts,defaults/*.md}`                         | **new**: placeholder filling and rendering                         |
| `backend/src/api/legal.ts`                                          | **new**: `GET /api/legal/{doc}`                                    |
| `backend/src/app.ts`, `backend/src/index.ts`                        | register plugins, wire the cleanup                                 |
| `schema/api-v1.yaml`                                                | `getAuthInfo`, `getLegalDoc`                                       |
| `backend/frontend/src/lib/authInfo.ts`                              | **new**: `authInfo` loadOnce store                                 |
| `backend/frontend/src/lib/verify.ts`                                | **new**: `verifyCallback`, `resendCooldown`                        |
| `backend/frontend/src/lib/publicRoutes.ts`                          | **new**: `isPublicRoute(hash)`                                     |
| `backend/frontend/src/routes/{Verify,Forgot,Reset,Legal}.svelte`    | **new**                                                            |
| `backend/frontend/src/routes/{Login,Register}.svelte`               | redesign, verify flow                                              |
| `backend/frontend/src/lib/components/AuthPanel.svelte`              | `variant`                                                          |
| `backend/frontend/src/lib/components/AuthFooter.svelte`             | **new**: Terms · Privacy · Imprint                                 |
| `backend/frontend/src/lib/components/settings/DeleteAccount.svelte` | **new**                                                            |
| `backend/frontend/src/App.svelte`, `lib/returnTo.ts`                | public routes                                                      |
| `docker-compose.dev.yaml`                                           | Mailpit                                                            |
| `DEVELOPMENT.md`, `AGENTS.md`                                       | docs                                                               |

---

### Task 1: Canvas artboards (review gate)

No code. This task ends with the user's review, and Tasks 4–8 build the UI from what it settles.

**Files:** the Dartcade Platform Design artifact,
`https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23`.

- [ ] **Step 1:** Read the canvas's `SKILL.md`, `project/canvas.json`, `project/Main.dc.html`,
      `project/Mobile-SignIn.dc.html`, `project/Register.dc.html`, `project/Settings.dc.html` and
      `project/ds/dartcade/tokens.json` with the Artifact tool (`action: "read"`, `paths`). Follow
      `SKILL.md` for how artboards are added and registered in `canvas.json`.
- [ ] **Step 2:** Add these artboards, reusing the split layout and tokens of `Main.dc.html` (the
      left panel stays, the form side changes):
  - `Register-Verify.dc.html` (1440×900) and `Mobile-Register-Verify.dc.html` (390×844):
    - step bars showing step 1 done; heading "Check your inbox"
    - "We sent a link to **lena@example.com**. Open it on this device to finish signing up."
    - a secondary "Resend email" button with the cooldown state "Resend in 42 s", and a
      "Wrong address? Start over" link
    - an expired variant: "That link has expired", with a primary "Send a new link" button
  - `Forgot.dc.html` and `Mobile-Forgot.dc.html`:
    - heading "Reset password", an Email field, a primary "Send reset link" button
    - the sent state: "If that address has an account, we've sent a link. It's valid for an
      hour."
    - "Back to sign in"
  - `Reset.dc.html` and `Mobile-Reset.dc.html`:
    - heading "New password", a New password field with the strength meter from
      `Register.dc.html`, a primary "Save password" button
    - an error state for a bad token: "This link has expired or was already used." with a link
      to Forgot
  - `Legal.dc.html` and `Mobile-Legal.dc.html`:
    - a reading column (max 720 px) on the `#0f100e` page with the wordmark on top
    - tabs or links Terms · Privacy · Imprint, "Last updated 17 October 2026", and
      h1/h2/p/ul styles
  - `Settings-DeleteAccount.dc.html` (1440×900):
    - the Settings → Account card with a "Danger zone" block and a red outline "Delete account"
      button
    - the open confirmation modal: what's deleted, what stays ("Your name stays in match
      history other players keep"), "Type **Lena** to confirm", a Password field, and red
      "Delete account" plus "Cancel" buttons
  - The auth footer on `Main`, `Mobile-SignIn` and `Register`: "Terms · Privacy · Imprint" in
    13 px `#828379` under the form.
- [ ] **Step 3:** Publish to the artifact's `url` and give the user the link.
- [ ] **Step 4: STOP.** Ask the user to review the artboards. Make their changes and republish
      until they approve. Don't start Task 4 before approval. Tasks 2 and 3 don't depend on it and
      may run while the user reviews.

---

### Task 2: Mail config, transport, templates, Mailpit

**Files:**

- Create: `backend/src/mail/config.ts`, `backend/src/mail/transport.ts`, `backend/src/mail/templates.ts`
- Test: `backend/src/mail/config.test.ts`, `backend/src/mail/templates.test.ts`
- Modify: `backend/package.json` (deps), `docker-compose.dev.yaml`, `DEVELOPMENT.md` (Environment variables)

**Interfaces (produced):**

```ts
// config.ts
export type MailConfig = { smtpUrl: string; from: string; verification: boolean } | { smtpUrl: null; from: null; verification: false }
export function resolveMailConfig(env: Record<string, string | undefined>): MailConfig  // throws Error on bad combos
// transport.ts
export type Mail = { to: string; subject: string; text: string; html: string }
export type Mailer = { send(mail: Mail): void }  // fire-and-forget; logs failures
export function createMailer(config: MailConfig, warn: (msg: string, details: unknown) => void): Mailer | null
// templates.ts
export function verifyMail(to: string, name: string, url: string): Mail
export function resetMail(to: string, name: string, url: string): Mail
export function deleteMail(to: string, name: string, url: string): Mail
```

- [ ] **Step 1:** `cd backend && npm i nodemailer marked && npm i -D @types/nodemailer`
- [ ] **Step 2: Write the failing config test** (`config.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { resolveMailConfig } from './config.js'

const smtp = { SMTP_URL: 'smtp://mailpit:1025', MAIL_FROM: 'Dartcade <noreply@x.org>' }

describe('resolveMailConfig', () => {
  it('turns verification on when SMTP is set', () => {
    expect(resolveMailConfig(smtp)).toEqual({ smtpUrl: smtp.SMTP_URL, from: smtp.MAIL_FROM, verification: true })
  })
  it('lets a deployment with SMTP turn verification off', () => {
    expect(resolveMailConfig({ ...smtp, EMAIL_VERIFICATION: 'off' }).verification).toBe(false)
  })
  it('is mail off and verification off without SMTP', () => {
    expect(resolveMailConfig({})).toEqual({ smtpUrl: null, from: null, verification: false })
    expect(resolveMailConfig({ EMAIL_VERIFICATION: 'off' }).verification).toBe(false)
  })
  it('refuses required verification without SMTP, naming both variables', () => {
    expect(() => resolveMailConfig({ EMAIL_VERIFICATION: 'required' })).toThrow(/EMAIL_VERIFICATION.*SMTP_URL/)
  })
  it('refuses SMTP without MAIL_FROM and an unknown mode', () => {
    expect(() => resolveMailConfig({ SMTP_URL: smtp.SMTP_URL })).toThrow(/MAIL_FROM/)
    expect(() => resolveMailConfig({ ...smtp, EMAIL_VERIFICATION: 'yes' })).toThrow(/required.*off/)
  })
})
```

- [ ] **Step 3:** Run `cd backend && npx vitest run src/mail/config.test.ts`. Expected: FAIL, the
      module is missing.
- [ ] **Step 4: Implement `config.ts`**

```ts
/** Mail and email verification for this deployment, from env (see DEVELOPMENT.md). Throws on a combination that can't work. */
export function resolveMailConfig(env: Record<string, string | undefined>): MailConfig {
  const smtpUrl = env.SMTP_URL?.trim() || null
  const mode = env.EMAIL_VERIFICATION?.trim() || (smtpUrl ? 'required' : 'off')
  if (mode !== 'required' && mode !== 'off') throw new Error(`EMAIL_VERIFICATION must be "required" or "off", not "${mode}"`)
  if (!smtpUrl) {
    if (mode === 'required') throw new Error('EMAIL_VERIFICATION=required needs SMTP_URL to send the links')
    return { smtpUrl: null, from: null, verification: false }
  }
  const from = env.MAIL_FROM?.trim()
  if (!from) throw new Error('SMTP_URL is set but MAIL_FROM is not')
  return { smtpUrl, from, verification: mode === 'required' }
}
```

(Export the `MailConfig` type shown in Interfaces.)

- [ ] **Step 5:** Run it again. Expected: PASS.
- [ ] **Step 6: Write the failing template test** (`templates.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { verifyMail, resetMail, deleteMail } from './templates.js'

describe('mail templates', () => {
  const url = 'https://darts.example/api/auth/verify-email?token=t&callbackURL=%2F%23%2F'
  it.each([verifyMail, resetMail, deleteMail])('%o carries the link in text and html, addressed to the user', make => {
    const m = make('lena@example.com', 'Lena', url)
    expect(m.to).toBe('lena@example.com')
    expect(m.text).toContain(url)
    expect(m.html).toContain(url.replaceAll('&', '&amp;'))
    expect(m.text).toContain('Lena')
  })
  it('escapes the name in html', () => {
    expect(verifyMail('a@x', '<b>x</b>', url).html).not.toContain('<b>x</b>')
  })
})
```

- [ ] **Step 7: Implement `templates.ts`**

```ts
import type { Mail } from './transport.js'

const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`).replaceAll('&#38;', '&amp;')

function mail(to: string, subject: string, name: string, lead: string, action: string, url: string, ignore: string): Mail {
  const text = `Hi ${name},\n\n${lead}\n\n${url}\n\n${ignore}\n\n— Dartcade`
  const html = `<p>Hi ${esc(name)},</p><p>${esc(lead)}</p><p><a href="${esc(url)}">${esc(action)}</a></p><p style="color:#666">${esc(ignore)}</p><p>— Dartcade</p>`
  return { to, subject, text, html }
}

export const verifyMail = (to: string, name: string, url: string) =>
  mail(to, 'Confirm your email for Dartcade', name, 'Open this link to confirm your email and finish signing up:', 'Confirm email', url, "If you didn't sign up, ignore this mail.")
export const resetMail = (to: string, name: string, url: string) =>
  mail(to, 'Reset your Dartcade password', name, 'Open this link to choose a new password. It is valid for an hour:', 'Choose a new password', url, "If you didn't ask for this, ignore this mail; your password stays as it is.")
export const deleteMail = (to: string, name: string, url: string) =>
  mail(to, 'Confirm deleting your Dartcade account', name, 'Open this link to delete your account. This cannot be undone:', 'Delete my account', url, "If you didn't ask for this, ignore this mail and change your password.")
```

- [ ] **Step 8: Implement `transport.ts`**

```ts
import nodemailer from 'nodemailer'
import type { MailConfig } from './config.js'

export type Mail = { to: string; subject: string; text: string; html: string }
export type Mailer = { send(mail: Mail): void }

/** One SMTP transport for the process; null when the deployment has no mail. Sends without awaiting, so timing never shows whether an address has an account. */
export function createMailer(config: MailConfig, warn: (msg: string, details: unknown) => void): Mailer | null {
  if (!config.smtpUrl) return null
  const transport = nodemailer.createTransport(config.smtpUrl)
  const from = config.from
  return {
    send: mail => {
      transport.sendMail({ from, ...mail }).catch((err: unknown) => {
        warn('mail send failed', { to: mail.to, subject: mail.subject, error: String(err) })
      })
    },
  }
}
```

- [ ] **Step 9:** Run `npx vitest run src/mail`. Expected: PASS.
- [ ] **Step 10: Add Mailpit** to `docker-compose.dev.yaml`:

```yaml
  mailpit:
    image: axllent/mailpit:v1.27
    ports:
      - '8025:8025'
```

and to the backend's `environment:`:

```yaml
      SMTP_URL: smtp://mailpit:1025
      MAIL_FROM: Dartcade Dev <noreply@dartcade.local>
```

plus `mailpit` under the backend's `depends_on:` (`condition: service_started`).

- [ ] **Step 11:** In `DEVELOPMENT.md` → Environment variables, add rows for `SMTP_URL`,
      `MAIL_FROM` and `EMAIL_VERIFICATION`, copying the meanings from the spec's Configuration
      table. Add one line: "Dev mail lands in Mailpit at http://localhost:8025."
- [ ] **Step 12:** Run `npm run format` at the root, then `npm test` and `npm run typecheck` in
      `backend/`, then commit:
      `feat(mail): send mail over smtp, with mailpit in dev`

---

### Task 3: Email verification and terms acceptance (backend)

**Files:**

- Create: `backend/src/auth/options.ts`, `backend/src/auth/termsGate.ts`, `backend/src/db/migrations/024_email_verification.sql`, `backend/src/api/authInfo.ts`
- Modify: `backend/src/auth/index.ts`, `backend/src/auth/nameHooks.ts`, `backend/src/auth/seed.ts`, `backend/src/db/schema.ts`, `backend/src/app.ts`, `schema/api-v1.yaml`
- Test: `backend/src/auth/verification.test.ts` (DB), `backend/src/auth/nameHooks.test.ts`, `backend/src/api/authInfo.test.ts`, `backend/src/db/migrations.test.ts` (or the existing migration test file; `grep -rl "runMigrations" src --include=*.test.ts` finds it)

**Interfaces:**

- Consumes: `MailConfig`, `Mailer`, `verifyMail` from Task 2.
- Produces:

```ts
// options.ts
export type AuthDeps = { db: Kysely<Database>; mail: MailConfig; mailer: Mailer | null; trustedOrigins: string[] }
export function authOptions(deps: AuthDeps): BetterAuthOptions
// index.ts (unchanged export name)
export const auth   // betterAuth(authOptions({ db, mail: mailConfig, mailer, trustedOrigins }))
export const mailConfig: MailConfig
// authInfo.ts
export function authInfoApiPlugin(app, opts: { mail: boolean; verification: boolean }, done)
// GET /api/auth-info → { mail: boolean, verification: boolean }
```

- [ ] **Step 1: Migration** `024_email_verification.sql`:

```sql
-- Email verification (docs/superpowers/specs/2026-10-17-email-verification-legal-design.md):
-- accounts from before it count as verified; sign-up records when the terms were accepted
UPDATE "user" SET "emailVerified" = true;
ALTER TABLE "user" ADD COLUMN terms_accepted_at TIMESTAMPTZ;
```

Add `terms_accepted_at: Date | null` to `UserTable` in `schema.ts`. Check its other columns'
`ColumnType` style and match it (nullable with a default insert).

- [ ] **Step 2: Migration DB test** in the existing migration test file (or a new
      `src/db/emailVerification.test.ts` using `openTestSchema`). Insert an unverified user _before_
      migration 024 runs, if the harness allows running up to a version. If it doesn't, assert the
      migration file's SQL against a fresh schema: after `openTestSchema`, insert a user with
      `emailVerified: false`, run the `UPDATE` statement from the file, and expect `true`. Read
      `testSchema.ts` first to see which applies.
- [ ] **Step 3: `termsGate.ts`.** A better-auth `before` hook:

```ts
import { createAuthMiddleware, APIError } from 'better-auth/api'

export const TERMS_REQUIRED = 'Please accept the Terms and Privacy Policy'

/** Sign-up must carry acceptTerms: true (Register's checkbox); nameHooks then records when. */
export const termsGate = createAuthMiddleware(async ctx => {
  if (ctx.path !== '/sign-up/email') return
  if ((ctx.body as { acceptTerms?: unknown } | undefined)?.acceptTerms !== true) throw new APIError('BAD_REQUEST', { message: TERMS_REQUIRED })
})
```

- [ ] **Step 4: Record the time in `nameHooks.ts`.** In `create.before`, return
      `{ data: { ...user, name: check.name, termsAcceptedAt: new Date() } }`. Update the existing
      `nameHooks.test.ts` expectation (`toEqual` → `toMatchObject` on name/email, plus
      `expect(result.data.termsAcceptedAt).toBeInstanceOf(Date)`).
- [ ] **Step 5: `options.ts`.** Move today's options out of `index.ts` and add verification:

```ts
export function authOptions({ db, mail, mailer, trustedOrigins }: AuthDeps) {
  return {
    database: { db, type: 'pg' as const },
    emailAndPassword: { enabled: true, requireEmailVerification: mail.verification },
    emailVerification: mailer && mail.verification
      ? {
          sendOnSignUp: true,
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }: { user: { email: string; name: string }; url: string }) => {
            mailer.send(verifyMail(user.email, user.name, url))
          },
        }
      : undefined,
    user: { additionalFields: { termsAcceptedAt: { type: 'date', required: false, input: false, fieldName: 'terms_accepted_at' } } },
    databaseHooks: nameHooks(db),
    hooks: { before: termsGate },
    trustedOrigins,
    rateLimit: {
      enabled: true,
      customRules: {
        '/send-verification-email': { window: 60, max: 3 },
        '/request-password-reset': { window: 60, max: 3 },
        '/delete-user': { window: 60, max: 3 },
      },
    },
    advanced: { database: { validateSchema: false } },
    plugins: [openAPI({ disableDefaultReference: true }), admin()],
  } satisfies BetterAuthOptions
}
```

Keep the existing comments from `index.ts` on `validateSchema` and `openAPI`. Check better-auth's
`hooks.before` and `additionalFields` types in
`node_modules/@better-auth/core/dist/types/init-options.d.mts`. If `hooks.before` takes one
middleware, `termsGate` fits as is. The `sendVerificationEmail` signature is
`(data: { user, url, token }, request?) => Promise<void>`.

The e2e stack sets `RATE_LIMIT_MAX`. better-auth's limiter keys by IP, and every e2e browser
shares one IP, so set `rateLimit.enabled` to `process.env.RATE_LIMIT_MAX ? false : true`, with a
one-line comment saying why.

- [ ] **Step 6: `index.ts`**

```ts
export const mailConfig = resolveMailConfig(process.env)
const mailer = createMailer(mailConfig, (message, details) => console.warn(message, details))
export const auth = betterAuth(authOptions({ db, mail: mailConfig, mailer, trustedOrigins }))
```

In `backend/src/index.ts`, after the instance lock, log once:
`console.info(\`mail: ${mailConfig.smtpUrl ? 'on' : 'off'}, email verification: ${mailConfig.verification ? 'required' : 'off'}\`)`.

- [ ] **Step 7: Seed.** In `seed.ts`, pass `acceptTerms: true` in each `signUpEmail` body (cast
      the body if the type rejects the extra field, with a one-line comment). After each sign-up, run
      `db.updateTable('user').set({ emailVerified: true }).where('email', '=', email).execute()`.
      Dev users must still sign in with verification on (Mailpit is configured in dev).
- [ ] **Step 8: Failing integration test** `src/auth/verification.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { betterAuth } from 'better-auth'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { authOptions } from './options.js'
import type { Mail } from '../mail/transport.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('email verification', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  const sent: Mail[] = []
  let auth: ReturnType<typeof betterAuth>
  const mail = { smtpUrl: 'smtp://x', from: 'x@x', verification: true } as const
  const base = 'http://localhost:3000'
  const post = (path: string, body: unknown) =>
    auth.handler(new Request(base + '/api/auth' + path, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) }))

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('auth_verify_db_test'))
    auth = betterAuth({ ...authOptions({ db, mail, mailer: { send: m => sent.push(m) }, trustedOrigins: [base] }), baseURL: base, secret: 'test-secret-at-least-32-characters-long', rateLimit: { enabled: false } })
  })
  afterAll(() => close())

  it('refuses sign-up without acceptTerms', async () => {
    const res = await post('/sign-up/email', { name: 'Nobody', email: 'n@x.org', password: 'doubletop-16' })
    expect(res.status).toBe(400)
  })

  it('sends a link, refuses sign-in until it is opened, then signs in', async () => {
    const res = await post('/sign-up/email', { name: 'Lena', email: 'lena@x.org', password: 'doubletop-16', acceptTerms: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie') ?? '').not.toContain('session_token')
    const link = sent.at(-1)!.text.match(/https?:\S+/)![0]
    expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'doubletop-16' })).status).toBe(403)
    const verified = await auth.handler(new Request(link, { headers: { origin: base } }))
    expect([200, 302]).toContain(verified.status)
    expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'doubletop-16' })).status).toBe(200)
    const row = await db.selectFrom('user').select(['emailVerified', 'terms_accepted_at']).where('email', '=', 'lena@x.org').executeTakeFirstOrThrow()
    expect(row.emailVerified).toBe(true)
    expect(row.terms_accepted_at).toBeInstanceOf(Date)
  })

  it('answers a second sign-up of a taken address like a new one', async () => {
    const res = await post('/sign-up/email', { name: 'Lena2', email: 'lena@x.org', password: 'doubletop-16', acceptTerms: true })
    expect(res.status).toBe(200)
  })
})
```

If better-auth 1.7.6 answers the duplicate differently (check `sign-up` in
`node_modules/better-auth/dist/api/routes`), note it in the test name and keep the assertion on
what it really does. The goal is no 422 "user already exists" while verification is on.

- [ ] **Step 9:** Run with Postgres: `TEST_DATABASE_URL=… npx vitest run src/auth/verification.test.ts`.
      Expected: PASS after Steps 1–7. If a status differs, read better-auth's route and fix the
      options, not the assertion. The exception is the duplicate case above.
- [ ] **Step 10: `GET /api/auth-info`.** In `schema/api-v1.yaml`, next to `/api/preview`:

```yaml
  /api/auth-info:
    get:
      operationId: getAuthInfo
      summary: Whether this deployment sends mail and requires email verification
      tags: [system]
      security: []
      responses:
        '200':
          description: The deployment's sign-up settings
          content:
            application/json:
              schema: { $ref: '#/components/schemas/AuthInfo' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

and under `components.schemas`:

```yaml
    AuthInfo:
      type: object
      required: [mail, verification]
      additionalProperties: false
      properties:
        mail: { type: boolean, description: Password reset and mailed confirmations are available }
        verification: { type: boolean, description: New accounts confirm their email before signing in }
```

Run `npm run gen:api` at the root. Write `src/api/authInfo.ts` modelled on `preview.ts`:
`app.get<Route<'getAuthInfo'>>('/api/auth-info', { schema: fromSpec('getAuthInfo') }, () => ({ mail: opts.mail, verification: opts.verification }))`.
Register it in `app.ts` with `{ mail: mailConfig.smtpUrl !== null, verification: mailConfig.verification }`.
Write `authInfo.test.ts` modelled on `preview.test.ts`, covering both combinations.

- [ ] **Step 11:** Run all backend tests and the typecheck. The spec coverage test
      (`api/spec.test.ts`) must pass with the new route. Commit:
      `feat(auth): require email verification and record accepted terms`

---

### Task 4: Verify screen and sign-up flow (frontend)

Requires Task 1 approved and Task 3.

**Files:**

- Create: `backend/frontend/src/lib/authInfo.ts`, `lib/verify.ts`, `lib/publicRoutes.ts`, `routes/Verify.svelte`
- Modify: `routes/Register.svelte`, `routes/Login.svelte`, `App.svelte`, `lib/returnTo.ts`
- Test: `lib/__tests__/verify.test.ts`, `lib/__tests__/publicRoutes.test.ts`, `lib/__tests__/returnTo.test.ts` (extend)

**Interfaces:**

```ts
// authInfo.ts
export const authInfo  // loadOnce<{ mail: boolean; verification: boolean }>(GET /api/auth-info), default { mail: false, verification: false }
// verify.ts
/** The page a verification link opens: the remembered return path, or step 2 for a fresh sign-up. */
export function verifyCallback(returnPath: string | null): string   // '/#/join/K7Q4MD' or '/#/settings/boards'
export const RESEND_COOLDOWN_S = 60
export function cooldownLeft(lastSentAt: number | null, now: number): number  // whole seconds, 0 when ready
// publicRoutes.ts
export function isPublicRoute(hash: string): boolean  // #/login #/register #/verify #/forgot #/reset #/terms #/privacy #/imprint, with or without ?query
```

- [ ] **Step 1: Failing tests**

```ts
// verify.test.ts
import { describe, it, expect } from 'vitest'
import { verifyCallback, cooldownLeft } from '../verify'
describe('verifyCallback', () => {
  it('returns to the remembered page', () => expect(verifyCallback('/join/K7Q4MD')).toBe('/#/join/K7Q4MD'))
  it('goes to step 2, connecting a board, without one', () => expect(verifyCallback(null)).toBe('/#/settings/boards'))
  it('ignores the home page as a return path', () => expect(verifyCallback('/')).toBe('/#/settings/boards'))
})
describe('cooldownLeft', () => {
  it('is 0 before the first send and after a minute', () => {
    expect(cooldownLeft(null, 1000)).toBe(0)
    expect(cooldownLeft(0, 60_000)).toBe(0)
  })
  it('counts the seconds down, rounding up', () => expect(cooldownLeft(0, 17_500)).toBe(43))
})
// publicRoutes.test.ts
import { isPublicRoute } from '../publicRoutes'
it.each(['#/login', '#/register', '#/verify?email=a%40b', '#/forgot', '#/reset?token=x', '#/terms', '#/privacy', '#/imprint'])('%s is public', h => expect(isPublicRoute(h)).toBe(true))
it.each(['#/', '#/settings', '#/join/K7Q4MD', '#/termsx', ''])('%s is not', h => expect(isPublicRoute(h)).toBe(false))
```

Extend `returnTo.test.ts`: `rememberReturn` with `#/verify` or `#/terms` remembers nothing.

- [ ] **Step 2:** Run `cd backend/frontend && npx vitest run src/lib/__tests__/verify.test.ts src/lib/__tests__/publicRoutes.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**

```ts
// publicRoutes.ts
const PUBLIC = /^#\/(login|register|verify|forgot|reset|terms|privacy|imprint)(?:[/?]|$)/
/** Pages a signed-out visitor may open: sign-in, sign-up and their mails' landing pages, the legal texts. */
export const isPublicRoute = (hash: string) => PUBLIC.test(hash)

// verify.ts
export const RESEND_COOLDOWN_S = 60
export function verifyCallback(returnPath: string | null): string {
  return `/#${returnPath && returnPath !== '/' ? returnPath : '/settings/boards'}`
}
export function cooldownLeft(lastSentAt: number | null, now: number): number {
  if (lastSentAt === null) return 0
  return Math.max(0, Math.ceil((lastSentAt + RESEND_COOLDOWN_S * 1000 - now) / 1000))
}
```

In `returnTo.ts`, widen `route()`'s regex to
`/^\/(login|register|verify|forgot|reset|terms|privacy|imprint)(?:[/?]|$)/`.
`authInfo.ts` follows `currentUser` in `lib/auth.ts`: `loadOnce` over
`createApi({ onUnauthorized: () => undefined }).GET('/api/auth-info')`.

- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5: `App.svelte`.** Replace
      `currentHash.startsWith('#/login') || currentHash.startsWith('#/register')` with
      `isPublicRoute(currentHash)`. Add the routes `'/verify': Verify` now and the others in their
      tasks.
- [ ] **Step 6: `Register.svelte` submit.**

```ts
const callbackURL = verifyCallback(peekReturn(sessionStore()))
const { error: err } = await authClient.signUp.email({ name, email, password, acceptTerms: true, callbackURL } as Parameters<typeof authClient.signUp.email>[0])
if (err) { error = err.message ?? 'Registration failed'; return }
if (get(authInfo).verification) { void push(`/verify?email=${encodeURIComponent(email)}`); return }
await currentUser.refresh()
void push(takeReturn(sessionStore()))
```

Add `peekReturn(storage)` to `returnTo.ts`: like `takeReturn` but it doesn't remove the entry, and
it returns `null` when nothing is stored. Test it in `returnTo.test.ts`. The cast exists because
`acceptTerms` isn't in better-auth's client types; add a one-line comment saying so.

- [ ] **Step 7: `Login.svelte`.** When `err.code === 'EMAIL_NOT_VERIFIED'`, run
      `void push(\`/verify?email=${encodeURIComponent(email)}&sent=1\`)`. better-auth already sent a
  fresh link (`sendOnSignIn`).
- [ ] **Step 8: `Verify.svelte`**, laid out like the `Register-Verify` artboards:
  - Read `email`, `error` and `sent` from the query string (`$querystring` from
    svelte-spa-router).
  - Resend calls
    `authClient.sendVerificationEmail({ email, callbackURL: verifyCallback(peekReturn(sessionStore())) })`,
    then sets `lastSentAt = Date.now()`. A 1 s `$effect` interval ticks `now` while
    `cooldownLeft > 0`, and the button reads `Resend in ${n} s`. A 429 shows "Try again in a
    minute."
  - `sent=1` or a fresh sign-up starts with `lastSentAt = Date.now()`.
  - `error` set shows the expired variant.
  - "Start over" goes to `#/register`.
  - Without an `email` in the query (an expired link opened elsewhere), add an email field above
    the button.
- [ ] **Step 9: Verify in the app.** Run `scripts/dev.sh` from the worktree root. Sign up at
      `http://localhost:5173/#/register`, open the mail in Mailpit (`:8025`), click it, and land on
      `#/settings/boards` signed in. Repeat from `#/join/<code>` signed out: you land on the join page.
      Take a phone (390×844) and a desktop (1440×900) screenshot of `#/verify` and compare them with
      the artboards.
- [ ] **Step 10:** Run tests, typecheck and lint in `backend/frontend`. Commit:
      `feat(frontend): confirm email after sign-up`

---

### Task 5: Password reset

**Files:**

- Modify: `backend/src/auth/options.ts`, `backend/src/auth/verification.test.ts`
- Create: `backend/frontend/src/routes/Forgot.svelte`, `routes/Reset.svelte`
- Modify: `App.svelte` (routes), `routes/Login.svelte` (link hidden without mail)

- [ ] **Step 1: Failing test** in `verification.test.ts`:

```ts
it('resets a password through the mailed link and signs out other sessions', async () => {
  const res = await post('/request-password-reset', { email: 'lena@x.org', redirectTo: base + '/#/reset' })
  expect(res.status).toBe(200)
  const token = new URL(sent.at(-1)!.text.match(/https?:\S+/)![0]).pathname.split('/').at(-1)!
  expect((await post('/reset-password', { token, newPassword: 'bullseye-50!' })).status).toBe(200)
  expect((await post('/sign-in/email', { email: 'lena@x.org', password: 'bullseye-50!' })).status).toBe(200)
})
it('answers a reset for an unknown address the same, sending nothing', async () => {
  const before = sent.length
  expect((await post('/request-password-reset', { email: 'nobody@x.org', redirectTo: base + '/#/reset' })).status).toBe(200)
  expect(sent.length).toBe(before)
})
```

Read the link format from better-auth's `request-password-reset` route. Its link is
`/reset-password/:token?callbackURL=…`, which redirects to `redirectTo?token=…`. Adjust the
token extraction to match.

- [ ] **Step 2:** Run it. Expected: FAIL, since `sendResetPassword` isn't configured.
- [ ] **Step 3:** In `authOptions`, set
      `emailAndPassword.sendResetPassword = mailer ? async ({ user, url }) => { mailer.send(resetMail(user.email, user.name, url)) } : undefined`,
      `revokeSessionsOnPasswordReset: true` and `resetPasswordTokenExpiresIn: 3600`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: `Forgot.svelte`**, following the artboard:
  - It calls `authClient.requestPasswordReset({ email, redirectTo: \`${location.origin}/#/reset\` })`.
  - On any non-429 answer, it shows the sent state: "If that address has an account, we've sent
    a link."
- [ ] **Step 6: `Reset.svelte`:**
  - It reads `token` and `error` from the query and calls
    `authClient.resetPassword({ newPassword, token })`.
  - On success: `push('/login?reset=1')`.
  - `error=INVALID_TOKEN` or a failed call shows the expired state, linking to `#/forgot`.
  - Move Register's strength meter into `lib/components/PasswordStrength.svelte` (props:
    `password`) and use it in both Register and Reset.
- [ ] **Step 7:** `Login.svelte`:
  - Show "Password changed. Sign in with the new one." when `$querystring` has `reset=1`.
  - Wrap "Forgot password?" in `{#if $authInfo.mail}`.
- [ ] **Step 8:** Add `'/forgot': Forgot` and `'/reset': Reset` to `App.svelte`.
- [ ] **Step 9: Verify in the app**, with Mailpit: Forgot, then the mail, then Reset, then sign
      in with the new password. Screenshot both pages at phone and desktop size and compare them with
      the artboards.
- [ ] **Step 10:** Run tests, typecheck and lint in both packages. Commit:
      `feat(auth): reset a forgotten password by mail`

---

### Task 6: Legal pages

**Files:**

- Create: `backend/src/legal/load.ts`, `backend/src/legal/defaults/{terms,privacy,imprint}.md`, `backend/src/api/legal.ts`
- Modify: `backend/src/app.ts`, `schema/api-v1.yaml`, `backend/src/index.ts` (startup warning), `backend/Dockerfile` if it doesn't copy non-TS files from `src/` (check how `migrations/*.sql` reach the image and do the same)
- Create: `backend/frontend/src/routes/Legal.svelte`, `lib/components/AuthFooter.svelte`
- Modify: `App.svelte`, `routes/Register.svelte` (links), `routes/Login.svelte` (footer)
- Test: `backend/src/legal/load.test.ts`, `backend/src/api/legal.test.ts`

**Interfaces:**

```ts
// load.ts
export const LEGAL_DOCS = ['terms', 'privacy', 'imprint'] as const
export type LegalDoc = (typeof LEGAL_DOCS)[number]
export type LegalValues = { operatorName?: string; address?: string; contactEmail?: string; updated?: string }
export function legalValues(env: Record<string, string | undefined>): LegalValues
/** Fills {{operator.name}}, {{address}}, {{contact.email}}, {{updated}}; returns the text and the placeholders left unfilled. */
export function fillPlaceholders(md: string, v: LegalValues): { md: string; missing: string[] }
export function loadLegal(dir: string | undefined, v: LegalValues): Promise<Record<LegalDoc, { html: string; updated: string | null; missing: string[] }>>
// GET /api/legal/{doc} → { html: string, updated: string | null }   (404 for an unknown doc)
```

- [ ] **Step 1: Failing test** `load.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { fillPlaceholders, loadLegal, legalValues } from './load.js'

describe('fillPlaceholders', () => {
  it('fills known placeholders and reports the empty ones', () => {
    const r = fillPlaceholders('By {{operator.name}}, {{address}}. Mail {{contact.email}}.', { operatorName: 'Chris W.', contactEmail: 'hi@x.org' })
    expect(r.md).toBe('By Chris W., {{address}}. Mail hi@x.org.')
    expect(r.missing).toEqual(['address'])
  })
})
describe('loadLegal', () => {
  it('renders the bundled defaults to html', async () => {
    const docs = await loadLegal(undefined, legalValues({ LEGAL_OPERATOR_NAME: 'Chris W.', LEGAL_ADDRESS: 'Graz', LEGAL_CONTACT_EMAIL: 'hi@x.org', LEGAL_UPDATED: '2026-10-17' }))
    expect(docs.terms.html).toContain('<h1')
    expect(docs.privacy.html).toContain('Chris W.')
    expect(docs.imprint.missing).toEqual([])
    expect(docs.terms.updated).toBe('2026-10-17')
  })
  it('takes a file from LEGAL_DIR over the default, the default for the rest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'legal-'))
    await writeFile(join(dir, 'terms.md'), '# Our own terms')
    const docs = await loadLegal(dir, {})
    expect(docs.terms.html).toContain('Our own terms')
    expect(docs.privacy.html).toContain('<h1')
  })
})
```

- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement `load.ts`** with `marked.parse(md, { async: false })`. Defaults resolve
      from `fileURLToPath(new URL('./defaults/', import.meta.url))`. Add
      `// shortcut: the html isn't sanitized because the texts come from the operator; sanitize if users ever supply them`.
      Placeholder regex: `/\{\{(operator\.name|address|contact\.email|updated)\}\}/g`.
- [ ] **Step 4: Write the three defaults.** Each starts with `# <Title>` and a
      `Last updated: {{updated}}` line. They're plain English in short sections, covering exactly the
      points in the spec's "Legal texts (defaults)" section:
  - `terms.md`: 1 Who runs Dartcade · 2 The service · 3 Your account (age 14, one per person,
    keep your password safe) · 4 Fair play · 5 What you upload · 6 Suspension · 7 Liability ·
    8 Changes · 9 Law
  - `privacy.md`: 1 Controller · 2 What we store and why (a table: data, purpose, legal basis) ·
    3 Camera stills · 4 Cookies · 5 Who else sees data (mail provider, hosting on the operator's
    own server in Austria) · 6 How long · 7 After you delete your account (the name stays in
    others' match history) · 8 Your rights and the Datenschutzbehörde
    (https://www.dsb.gv.at) · 9 Contact
  - `imprint.md`: Medieninhaber/operator `{{operator.name}}`, `{{address}}`,
    `{{contact.email}}`, "Information under §5 ECG and §25 MedienG", and the purpose (a private,
    non-commercial dart game platform).
    Before writing, search for the current requirements of §5 ECG and §25 MedienG for a private
    non-commercial site (see the memory "look up rules before writing them up"), and match the
    fields to them.
- [ ] **Step 5:** Run it. Expected: PASS.
- [ ] **Step 6: Endpoint.** Add to `schema/api-v1.yaml`:

```yaml
  /api/legal/{doc}:
    get:
      operationId: getLegalDoc
      summary: A legal text of this deployment (Terms, Privacy Policy, Imprint), as HTML
      tags: [system]
      security: []
      parameters:
        - { name: doc, in: path, required: true, schema: { type: string, enum: [terms, privacy, imprint] } }
      responses:
        '200':
          description: The text
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LegalDoc' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

```yaml
    LegalDoc:
      type: object
      required: [html, updated]
      additionalProperties: false
      properties:
        html: { type: string }
        updated: { type: string, nullable: true, description: When the text last changed (LEGAL_UPDATED) }
```

Run `npm run gen:api`. In `api/legal.ts`, add `legalApiPlugin(app, { docs }, done)`. In
`app.ts`, load the docs once at startup:
`await loadLegal(process.env.LEGAL_DIR, legalValues(process.env))`. Log one warning per unfilled
placeholder: `app.log.warn({ doc, missing }, 'legal text has unfilled placeholders')`.
`legal.test.ts` asserts a 200 with html and a 400 for `/api/legal/cookies`.

- [ ] **Step 7: Frontend.**
  - `Legal.svelte`, following the `Legal` artboards:
    - The doc comes from the route (`/terms`, `/privacy`, `/imprint` all map to `Legal`; read
      `$location`).
    - It fetches `api.GET('/api/legal/{doc}')` and renders `{@html data.html}` inside a `prose`
      wrapper styled in the component's `<style>`, for h1/h2/p/ul/table.
  - `AuthFooter.svelte` holds the three links. Put it under both forms.
  - The Register checkbox reads
    `I agree to the <a href="#/terms">Terms</a> and <a href="#/privacy">Privacy Policy</a>.`
  - Add the three routes to `App.svelte`.
- [ ] **Step 8: Verify in the app.** Open each page at phone and desktop size, compare them with
      the artboards, and confirm the placeholders are filled from the dev `.env`. Add
      `LEGAL_OPERATOR_NAME` and the rest to `docker-compose.dev.yaml` with dev values.
- [ ] **Step 9:** Add the `LEGAL_*` rows to `DEVELOPMENT.md`. Run tests, typecheck and lint in
      both packages. Commit:
      `feat(legal): serve terms, privacy policy and imprint`

---

### Task 7: Sign in and register rebuilt to the canvas

**Files:** `lib/components/AuthPanel.svelte`, `AuthHero.svelte`, `routes/Login.svelte`, `routes/Register.svelte`, `lib/components/NameField.svelte` (only if it can't take a hint prop)
**Test:** `lib/__tests__/authPages.test.ts` (SSR render, like `friendsComponents.test.ts`)

- [ ] **Step 1: Failing SSR test**

```ts
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import AuthPanel from '../components/AuthPanel.svelte'
describe('AuthPanel', () => {
  it('shows the board and headline when signing in', () => {
    const out = render(AuthPanel, { props: { variant: 'signin' } }).body
    expect(out).toContain('Step up to the oche.')
  })
  it('shows the 180 and the three steps when registering', () => {
    const out = render(AuthPanel, { props: { variant: 'register' } }).body
    expect(out).toContain('Three darts.')
    for (const s of ['Create your account', 'Connect your board', 'Pick a game and throw']) expect(out).toContain(s)
  })
})
```

- [ ] **Step 2:** Run it. Expected: FAIL (no `variant`).
- [ ] **Step 3: `AuthPanel`.** Add `let { variant = 'signin' }: { variant?: 'signin' | 'register' } = $props()`.
      For `register`, render the `Register.dc.html` section:
  - the outlined `180` (`text-transparent`, `[-webkit-text-stroke:2px_var(--color-…)]`, using
    the token closest to `#2c3028` from `tokens.json`/`app.css`), positioned as in the artboard
    at xl and scaled down at md
  - the headline "Three darts. Endless games."
  - the `<ol>` with mono numbers: 01 in accent, the others dim
    Keep the signin branch as it is.
- [ ] **Step 4: Register:**
  - `<AuthPanel variant="register" />`
  - In place of the mono "Step 1 of 2", two 36×4 bars (accent, `line-2`) plus "Step 1 of 2 ·
    Account" in 13 px muted.
  - Pass the NameField the label "Player name", the placeholder "e.g. The Oche Ghost" and the
    hint "Shown on scoreboards and tournament brackets." Add a `hint` prop to `NameField` if it
    lacks one, shown when there's no status message.
  - The checkbox label is top-aligned (`items-start`, `mt-[2px]` on the box) with the
    Terms/Privacy links from Task 6.
  - The button is "Create account" followed by `<ArrowRight size={20} />`.
  - Drop the paragraph "Your name is your handle…" since the artboard has none. Keep the hint
    instead.
- [ ] **Step 5: Login on phones.** Below `md`:
  - "Keep me signed in" (short label) and "Forgot password?" share one `justify-between` row.
  - The button group gets `mt-auto` so it sits at the bottom.
  - From `md` up, keep "Forgot password?" next to the Password label and the long checkbox label.
  - Use `hidden md:…` and `md:hidden` pairs, as the file already does.
- [ ] **Step 6:** Run the tests. Expected: PASS.
- [ ] **Step 7: Verify in the app.** Screenshot `#/login` and `#/register` at 390×844, 1180×820
      and 1440×900. Put each next to its artboard (`Mobile-SignIn`, `Tablet-SignIn`, `Main`,
      `Register`) and fix every visible difference in spacing, sizes, colours or copy.
- [ ] **Step 8:** Run tests, typecheck and lint. Commit:
      `feat(frontend): match sign in and register to the design`

---

### Task 8: Delete account

**Files:**

- Create: `backend/src/auth/cleanup.ts`, `backend/src/auth/deleteAccount.test.ts` (DB)
- Modify: `backend/src/auth/options.ts`, `backend/src/index.ts`
- Create: `backend/frontend/src/lib/components/settings/DeleteAccount.svelte`
- Modify: `lib/components/settings/AccountCard.svelte`, `routes/Login.svelte` (notice `?deleted=1`)
- Test: `lib/__tests__/deleteAccount.test.ts`

**Interfaces:**

```ts
// cleanup.ts
export type AccountCleanup = (userId: string) => Promise<void>
export function setAccountCleanup(fn: AccountCleanup): void
export function runAccountCleanup(userId: string): Promise<void>   // no-op until set
// index.ts wires it:
setAccountCleanup(async userId => {
  const lobby = await lobbies.current(userId)
  if (lobby) await lobbies.leave(userId, lobby.id)
  const game = engine.getSessionByUser(userId)
  if (game) {
    const r = await engine.onUserAction(game.id, userId, { type: 'forfeit' })
    // Nobody left to lose to (solo, or everyone else already forfeited): the game can't go on
    if (!r.ok) await engine.deleteSession(game.id, userId)
  }
})
```

Check `LobbyRef`'s id field name and the `forfeit` action's shape in `session/types.ts` before
wiring. If `onUserAction` needs `seats`, pass none and let `authorizeAction` fill them in.

- [ ] **Step 1: Failing DB test** `deleteAccount.test.ts`. It uses the same harness as
      `verification.test.ts`, with `mailer: null` and verification off:

```ts
it('deletes the account at once without mail, keeping its name in shared history', async () => {
  // sign up Lena and Max (acceptTerms), get Lena's session cookie from the sign-in response
  // insert a finished game_sessions row with game_players seats for both (copy the row shape from src/db/history.test.ts)
  const cleaned: string[] = []
  setAccountCleanup(async id => { cleaned.push(id) })
  const res = await auth.handler(new Request(base + '/api/auth/delete-user', { method: 'POST', headers: { 'content-type': 'application/json', origin: base, cookie }, body: JSON.stringify({ password: 'doubletop-16' }) }))
  expect(res.status).toBe(200)
  expect(cleaned).toEqual([lenaId])
  expect(await db.selectFrom('user').where('id', '=', lenaId).selectAll().executeTakeFirst()).toBeUndefined()
  const seat = await db.selectFrom('game_players').selectAll().where('session_id', '=', gameId).where('seat', '=', 0).executeTakeFirstOrThrow()
  expect(seat).toMatchObject({ name: 'Lena', user_id: null })
})
it('with mail on, mails a confirmation link and deletes only once it is opened', async () => { /* mailer captures; delete-user → 200, user still there; GET the mailed link → user gone */ })
it('refuses a wrong password', async () => { /* 400, user still there */ })
```

Write out the two stub bodies in full. They follow the first test, with a `sent` array as in
`verification.test.ts`.

- [ ] **Step 2:** Run it. Expected: FAIL, since deletion isn't enabled.
- [ ] **Step 3:** In `authOptions`, add
      `user.deleteUser = { enabled: true, beforeDelete: async user => { await runAccountCleanup(user.id) }, sendDeleteAccountVerification: mailer ? async ({ user, url }) => { mailer.send(deleteMail(user.email, user.name, url)) } : undefined }`.
      Wire `setAccountCleanup` in `index.ts` after `lobbies` exists, as in Interfaces.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5: Lobby and game DB test.** Add a case to an existing lobby service DB test (find
      one with `grep -l "new LobbyService" src/**/*.test.ts`). The host of a two-member lobby runs the
      cleanup: the other member becomes host, the lobby stays open, and an open game's seat is
      forfeited.
- [ ] **Step 6: Frontend.**
  - `DeleteAccount.svelte`, following the `Settings-DeleteAccount` artboard:
    - a danger-zone block whose button opens `Modal`
    - the confirm button enabled only when `typed.trim() === $currentUser.name` and a password
      is entered
    - it calls `authClient.deleteUser({ password, callbackURL: '/#/login?deleted=1' })`
    - with `$authInfo.mail`, it then shows "Check your inbox to confirm."; otherwise it runs
      `currentUser.set(null)` and then `push('/login?deleted=1')`
    - a wrong password shows the error inside the modal
  - Mount it at the bottom of `AccountCard`.
  - Login shows "Your account was deleted." for `deleted=1`.
  - The SSR test renders `DeleteAccount` closed and checks the danger-zone copy, and checks that
    `canConfirm(typed, name, password)` holds only for an exact name and a non-empty password.
    `canConfirm` is a small exported helper in `lib/deleteAccount.ts`.
- [ ] **Step 7: Verify in the app.**
  - With Mailpit: delete a fresh account and confirm through the mail; the user is gone and the
    login page shows the notice.
  - With `EMAIL_VERIFICATION=off` and no `SMTP_URL`: the account is deleted at once.
  - Screenshot the modal at phone and desktop size against the artboard.
- [ ] **Step 8:** Run tests, typecheck and lint in both packages. Commit:
      `feat(account): delete your account from settings`

---

### Task 9: Docs

- [ ] **Step 1:** `AGENTS.md` "Where to look" gets one row each for:
  - "Mail (SMTP transport, templates, config)": `backend/src/mail/`
  - "Email verification, password reset, account deletion": `backend/src/auth/options.ts`,
    `termsGate.ts`, `cleanup.ts`; frontend `routes/{Verify,Forgot,Reset}.svelte`, `lib/verify.ts`,
    `lib/publicRoutes.ts`, `lib/components/settings/DeleteAccount.svelte`
  - "Legal texts (Terms, Privacy, Imprint)": `backend/src/legal/` (defaults in `defaults/`,
    override with `LEGAL_DIR`), `api/legal.ts`, `routes/Legal.svelte`
- [ ] **Step 2:** `DEVELOPMENT.md`: check that all new env vars are listed (Tasks 2 and 6) and add
      a short "Mail in production" note: Resend's SMTP relay as the example, a verified sending
      domain, and the free tier's limits.
- [ ] **Step 3:** Run `npm run format`, then `mise run test` at the root if Postgres is running
      (otherwise the per-package tests). Commit: `docs: note mail, verification and legal pages`

---

## Self-review notes

- **Spec coverage:**
  - config: Task 2
  - verification and migration: Task 3
  - `#/verify`: Task 4
  - reset: Task 5
  - legal: Task 6
  - redesign: Task 7
  - deletion: Task 8
  - docs: Task 9
  - canvas: Task 1
- **One deviation from the spec:** the e2e test against Mailpit is dropped. The e2e stack runs
  without SMTP (verification off), so the existing e2e sign-ups keep working. The full mail flow
  is covered by `verification.test.ts` and `deleteAccount.test.ts` with a capturing mailer, plus
  the manual checks with Mailpit. Mention this to the user.
- **Names are consistent across tasks:** `MailConfig`, `Mailer.send`, `authOptions`,
  `runAccountCleanup`/`setAccountCleanup`, `verifyCallback`, `peekReturn`, `isPublicRoute`,
  `authInfo`.
