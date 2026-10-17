# Email verification, legal pages and account deletion

Dartcade is run for friends and a club today, but it may open up, so it's built to suit a public
service: new accounts confirm their email, the sign-up links real Terms, a Privacy Policy and an
Imprint, and users can delete their account. Self-hosted deployments can turn verification off and
bring their own legal texts. The sign-in and register pages are rebuilt to match the design canvas
on the way.

Design: the Dartcade Platform Design canvas. Sign in is `Main`, `Tablet-SignIn` and
`Mobile-SignIn`; register is `Register`. The new screens get artboards first (see
[Screens](#screens)) and are built only after they're reviewed.

## Decisions

- **Mail goes out over SMTP** (nodemailer), so any provider works. Our instance uses Resend's SMTP
  relay (free tier: 3,000 a month, 100 a day). In dev, Mailpit catches everything.
- **Hard gate.** An unverified account can't sign in. Clicking the link verifies the account and
  signs the user in.
- **Existing accounts count as verified.** The migration marks them, so nobody is locked out.
- **Legal texts are Markdown files** with placeholders filled from env. A deployment can swap the
  files out with `LEGAL_DIR`.
- **One timestamp, `terms_accepted_at`**, is set at sign-up, with no version. The version is implied
  by the date plus the git history of `terms.md`. There is no re-accept flow yet; existing users
  have `null`.
- **Minimum age 14**, the Austrian age for consenting to data processing.
- **Account deletion lives in Settings → Account.** A deleted user's name stays in other players'
  match history; the Privacy Policy says so.
- **Out of scope:** an admin users page (another branch is building it; marking a user verified
  there is one `adminUpdateUser` call), analytics (adding it means updating `privacy.md`; prefer a
  cookieless one), the flow for re-accepting changed terms, and changing your email.

## Configuration

| Variable                                                                       | Meaning                                                                                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_URL`                                                                     | e.g. `smtps://resend:<key>@smtp.resend.com:465`. Unset means no mail.                                                                              |
| `MAIL_FROM`                                                                    | e.g. `Dartcade <noreply@example.org>`. Required with `SMTP_URL`.                                                                                   |
| `EMAIL_VERIFICATION`                                                           | `required` or `off`. Defaults to `required` when `SMTP_URL` is set and `off` otherwise. `required` without `SMTP_URL` stops startup with an error. |
| `BETTER_AUTH_URL`                                                              | The public URL that links in mails point to (already used by better-auth).                                                                         |
| `LEGAL_DIR`                                                                    | A folder holding `terms.md`, `privacy.md` and `imprint.md`. Each file it lacks falls back to the bundled default.                                  |
| `LEGAL_OPERATOR_NAME`, `LEGAL_ADDRESS`, `LEGAL_CONTACT_EMAIL`, `LEGAL_UPDATED` | Placeholder values. `LEGAL_UPDATED` is the date the terms last changed. A placeholder left unfilled logs a warning at startup.                     |

Startup logs the resolved mode: mail on or off, verification required or off.

## Backend

### Mail (`backend/src/mail/`)

- `transport.ts` builds one nodemailer transport from `SMTP_URL`/`MAIL_FROM`, or `null`.
- `templates.ts` has three mails: verify, reset password and confirm deletion. Each has a text and
  a simple HTML body: a short note, the link, and what to do if you didn't ask for it.
- better-auth's callbacks send _without awaiting_, so a response's timing doesn't show whether an
  address has an account. Failures are logged; the user can resend.

### better-auth (`backend/src/auth/index.ts`)

```ts
emailAndPassword: {
  enabled: true,
  requireEmailVerification: verify,
  sendResetPassword,            // only when mail is on
  revokeSessionsOnPasswordReset: true,
},
emailVerification: verify ? { sendOnSignUp: true, autoSignInAfterVerification: true, sendVerificationEmail } : undefined,
user: { deleteUser: { enabled: true, sendDeleteAccountVerification /* when mail is on */, beforeDelete } },
```

- Each link's `callbackURL` carries the page to return to (see `lib/returnTo.ts`). It has to,
  because the remembered return path lives in `sessionStorage` and the link opens a new tab. A
  fresh sign-up with nowhere to return to goes to step 2, `#/settings/boards`.
- `beforeDelete` makes the user leave every lobby they're in and forfeits their open games through
  the lobby service's existing paths. That way no lobby is left without a host, and no match waits
  on a seat that's gone.
- The built-in rate limiter covers `/send-verification-email`, `/request-password-reset` and
  `/delete-user`.

### Terms acceptance

The register request sends `acceptTerms: true` as an extra field. The `user.create.before` hook in
`nameHooks.ts` refuses sign-up without it and sets `terms_accepted_at = now()`.

### Migration `024_email_verification.sql`

```sql
UPDATE "user" SET "emailVerified" = true;
ALTER TABLE "user" ADD COLUMN terms_accepted_at TIMESTAMPTZ;
```

The foreign keys already handle deletion. Sessions, accounts, boards, friendships, voice packs,
ratings, courses and lobby seats cascade. Games other people played keep their `game_players` row,
including `name`, and `user_id` becomes NULL.

### Legal (`backend/src/legal/`)

- `GET /api/legal/{doc}` (`terms`, `privacy`, `imprint`) returns `{ html, updated }`. The server
  fills the placeholders and renders the Markdown with `marked`. That and nodemailer are
  the only new dependencies, both backend-only. The texts come from the operator, so the HTML isn't sanitized (marked with a
  `shortcut:` comment).
- The bundled defaults live in `backend/src/legal/defaults/`.

### Deployment info for the SPA

`GET /api/auth-info` returns `{ mail: boolean, verification: boolean }`, next to `/api/preview`
and in the same style. The SPA uses it to decide whether to show "Forgot password?" and how
deletion confirms.

Add both endpoints to `schema/api-v1.yaml` and regenerate.

### Dev

- Mailpit joins `scripts/dev.sh` and the dev compose (SMTP on :1025, UI on :8025). The dev `.env`
  gets `SMTP_URL=smtp://mailpit:1025`.
- `auth/seed.ts` creates its users already verified.
- `DEVELOPMENT.md` lists the new variables. `AGENTS.md` gets rows for mail, legal and the new
  routes.

## Screens

The canvas comes first. Add artboards for each screen at desktop and phone size, and wait for
review before building them:

- `Register-Verify`: check your inbox
- `Forgot`: enter your email
- `Reset`: set a new password
- `Legal`: reading layout
- `Settings-DeleteAccount`: danger zone and confirmation modal

They reuse the sign-in split layout and `AuthPanel`.

### Sign in and register: match the canvas

- `AuthPanel` gets a `variant`:
  - `signin`: today's board and "Step up to the oche."
  - `register`: the outlined "180" numeral and the 01/02/03 steps list: create your account,
    connect your board, pick a game and throw
- Register:
  - two step bars and "Step 1 of 2 · Account"
  - the label "Player name" with the hint "Shown on scoreboards and tournament brackets."
  - the checkbox "I agree to the Terms and Privacy Policy." linking both
  - an arrow icon on the button (`@lucide/svelte` `ArrowRight`)
- Sign in on phones: "Keep me signed in" and "Forgot password?" share one row, and the button sits
  at the bottom. On md and up, "Forgot password?" stays next to the Password label. It is hidden
  when `mail` is false.
- The auth pages get a footer: Terms · Privacy · Imprint.

### New routes (reachable signed out)

- `#/verify?email=…`:
  - It shows "Check your inbox" and the address. A Resend button has a 60 s cooldown and calls
    `authClient.sendVerificationEmail`, and "Wrong address?" goes back to Register.
  - Sign-up lands here. So does a sign-in that better-auth refuses with `EMAIL_NOT_VERIFIED`, and
    that sign-in also sends a fresh link.
  - `?error=` (an expired or used link) shows "That link has expired" with the Resend button.
- `#/forgot`: an email field that calls `authClient.requestPasswordReset`. It always answers "If
  that address has an account, we've sent a link."
- `#/reset?token=…`: a new password with the strength meter from Register, calling
  `authClient.resetPassword`, then goes to `#/login` with a notice. A bad token shows an error
  linking to `#/forgot`.
- `#/terms`, `#/privacy`, `#/imprint`: one `Legal.svelte` that shows the HTML and the date the text
  was last updated.

`App.svelte`'s signed-out allow-list (today it holds `#/login` and `#/register`) gains these routes.
`returnTo.ts` stops remembering them.

### Settings → Account: delete

`AccountCard` gets a danger zone. "Delete account" opens a `Modal` that explains what goes and what
stays (your name in others' match history). You type your name to enable the button and enter your
password.

- With mail on: "Check your inbox to confirm." The link deletes the account and lands on `#/login`
  with a notice.
- With mail off: the account is deleted at once and you're signed out to `#/login`.

## Legal texts (defaults)

They're written in English for an operator in Austria and in plain language, and they're a solid
draft, not legal advice.

- **Terms:**
  - who runs the service
  - free, run as a hobby, with no guaranteed availability
  - accounts from age 14
  - one account per person, and keep your password to yourself
  - fair play: no faking darts, no manipulating ranked
  - uploaded voice packs and courses must be yours to share, and you grant a licence to show them
    to other players
  - the operator may suspend accounts that abuse the service
  - liability limited as far as Austrian law allows
  - changes announced with notice; continuing to use the service after that means you accept them
  - Austrian law, with mandatory consumer protection unaffected
- **Privacy** (GDPR Art. 13):
  - the controller
  - what is stored: name, email, password hash, game history down to each dart, friends and
    presence, lobbies, ranked ratings, preferences, uploaded voice packs and courses
  - camera stills from the board, held in memory only
  - the legal basis for each: Art. 6(1)(b), performing the contract; (f), server logs
  - the session cookie, which is the only cookie
  - processors: the mail provider, plus hosting on the operator's own server in Austria
  - retention until you delete your account; names stay in shared match history after that
  - your rights (access, rectification, erasure, portability, objection) and the right to
    complain to the Datenschutzbehörde
  - contact
- **Imprint:** ECG §5 and MedienG §25: name, address, contact email, all from env.

## Errors

| Case                                             | Behaviour                                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| Mail send fails                                  | Logged. Resend is available on `#/verify`.                                          |
| Verify link expired or used                      | `#/verify?error=…` with Resend.                                                     |
| Sign-in while unverified                         | A fresh link is sent and the user is sent to `#/verify`.                            |
| Sign-up without `acceptTerms`                    | 400 from the hook. The SPA button is disabled anyway.                               |
| `EMAIL_VERIFICATION=required` without `SMTP_URL` | Startup fails with a message naming both variables.                                 |
| Too many resend or reset requests                | better-auth's rate limiter answers 429, and the page shows "Try again in a minute." |

## Testing

- **Backend unit tests:**
  - config resolution: each combination of `SMTP_URL` and `EMAIL_VERIFICATION`, including the
    startup error
  - template output
  - placeholder filling and the unfilled-placeholder warning
  - the hook refusing sign-up without `acceptTerms` and setting `terms_accepted_at`
- **DB tests:**
  - the migration marks existing users verified
  - deleting a user keeps others' `game_players` rows with the name
  - `beforeDelete` leaves lobbies and forfeits open games
- **Integration test with a capturing transport:**
  - sign up, sign-in is refused, open the captured link, signed in
  - resetting a password the same way
  - deletion with and without mail
- **Frontend (Vitest):** the `#/verify` states (sent, cooldown, expired), the delete modal's
  confirmation, and hiding "Forgot password?" without mail.
- **e2e:** sign up, then read the link from Mailpit's API, verify, and land on step 2.
- **In the running app:** screenshot every changed or new screen at phone, tablet and desktop size
  and compare against the artboards.

## Delivery

One branch, `feat/email-verification`, with one atomic commit per step:

1. The canvas artboards, reviewed before any UI is built.
2. Mail transport, config, Mailpit in dev.
3. Verification: migration, better-auth, `#/verify`, `terms_accepted_at`.
4. Password reset: `#/forgot`, `#/reset`.
5. Legal: endpoint, default texts, `Legal.svelte`, register links, footer.
6. Sign in and register rebuilt to the canvas.
7. Account deletion.
8. Docs: `DEVELOPMENT.md`, `AGENTS.md`.
