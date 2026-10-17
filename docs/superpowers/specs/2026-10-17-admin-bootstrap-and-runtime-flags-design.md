# First admin and runtime feature flags: design

dartcade is about to get a production deployment (on the host that runs the sprout previews). Two
things are missing for running it:

1. **A first admin.** Nothing creates an admin outside development, and `ADMIN_EMAILS` is unsafe
   while sign-up has no email verification (#226).
2. **Changing feature flags without a restart.** Flags are built once at startup from `FLAGS_ON`,
   `FLAG_VALUES` and each flag's rule.

This adds an env-based first admin, an admin page to manage admins, and flag overrides stored in the
database and set from an admin page, applied at once.

## Go-live runbook

What happens on a fresh production deploy, in order:

1. Set the deployment's env: `DATABASE_URL`, `BRIDGE_SECRET`, `BETTER_AUTH_SECRET`,
   `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS` (the public URL), and **`ADMIN_EMAIL` +
   `ADMIN_PASSWORD`**. `FLAGS_ON` and `FLAG_VALUES` are optional defaults.
2. The backend starts, runs its migrations, and sees that no user has `role = 'admin'`. It creates
   the account `ADMIN_EMAIL` with `ADMIN_PASSWORD` and the admin role, and logs one line saying so
   (without the password).
3. Sign in with that account. It keeps `ADMIN_PASSWORD` as its password: there's no in-app
   password change yet.
4. `#/admin/users`: promote anyone else who should be an admin.
5. `#/admin/flags`: turn features on for admins, chosen users or everyone. Changes apply at once,
   with no restart.
6. Remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the container's env after the first sign-in:
   `ADMIN_PASSWORD` is the live password and `docker inspect` shows it. Once any admin exists they
   do nothing; they're only needed again to recover from a lockout.

`docs/SELFHOSTING.md` gets this as a section, with the env table.

## Decisions

- **A first admin from env, not a sign-up race.** `ADMIN_EMAIL` + `ADMIN_PASSWORD` create the
  first admin on startup, and only while no admin exists. An existing account with `ADMIN_EMAIL`
  is promoted only when `ADMIN_PASSWORD` signs into it. An admin created this way can be demoted
  like any other. If every admin's role is removed, the next start runs this again, which is the
  way back in after a lockout (or give an account the role with SQL).
- **Admins are `role = 'admin'` only** (since #226).
- **Flag overrides live in the database.** Defaults stay where they are (the flag's rule, then
  `FLAGS_ON`/`FLAG_VALUES`); an override beats them; clearing it returns to the default.
- **Modes per on/off flag:** _Default_ (no override), **Off**, **Admins**, **Chosen users**
  (admins plus a list of users) and **Everyone**. Number flags take a value.
- **Applied at once on the server.** An override write rebuilds the OpenFeature provider's
  definitions in memory. Browsers see it on their next OFREP poll, or at once on a reload.
- **One backend process.** Overrides are cached in that process; #224 guards against a second one.
  Running several backends would need a reload signal: a known limit, not built now.

## First admin

`backend/src/auth/bootstrap.ts`, called at startup after migrations (where `seedDev` runs today):

- If `ADMIN_EMAIL` or `ADMIN_PASSWORD` is unset, do nothing. If only one of them is set, log a
  warning naming the missing one.
- If any user has `role = 'admin'`, do nothing.
- If a user with `ADMIN_EMAIL` exists, sign in to it with `ADMIN_PASSWORD` (better-auth
  `signInEmail`). If that works, give it `role = 'admin'` and log that an existing account was
  promoted. If it doesn't, don't promote it: log an error pointing at the SQL in
  `docs/SELFHOSTING.md`, and skip. Whoever registered the address owns it; see Risks.
- Otherwise create the account (better-auth `signUpEmail`, name from the part of the email before
  the `@`, cut to the name rules, `admin` if too little is left, numbered if taken), then set
  `role = 'admin'`.
- `ADMIN_PASSWORD` shorter than better-auth's minimum (8): log an error and skip, don't crash.
- Never log the password.

### Managing admins: `#/admin/users`

- Lists users (name, handle, email, created, role), with a search box. It uses better-auth's admin
  plugin (`listUsers`, `setRole`), which is already installed and requires `role = 'admin'`.
- Promote or demote with a button and a confirmation. You can't demote yourself if you're the last
  admin (the server refuses with "There must be at least one admin").
- Linked from the account menu's admin section, next to the minigolf links.

## Runtime feature flags

### Storage

Migration `0NN_feature_flags.sql`:

```sql
CREATE TABLE feature_flag_overrides (
  key         TEXT PRIMARY KEY,
  mode        TEXT,              -- 'off' | 'admins' | 'users' | 'on'; null for number flags
  user_ids    TEXT[] NOT NULL DEFAULT '{}',  -- for mode 'users'
  number      DOUBLE PRECISION,  -- for number flags
  updated_by  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

A row is an override; no row means the default. A key that no longer exists in `definitions.ts` is
ignored, and listed on the admin page as stale with a Remove button.

### Evaluation

`backend/src/flags/definitions.ts` gains an `overrides` argument:
`flagDefinitions(flagsOn, values, overrides)`. For an on/off flag:

| Override       | On for                                       |
| -------------- | -------------------------------------------- |
| none (Default) | as today: `FLAGS_ON`, else the flag's rule   |
| Off            | nobody, admins too                           |
| Admins         | admins                                       |
| Chosen users   | admins and the listed users (`targetingKey`) |
| Everyone       | everyone, signed out too                     |

A number flag uses its override value if one is set, else `FLAG_VALUES`, else the default. Values are
checked against a per-flag range declared next to the flag (e.g. `visitSeconds` 10–300).

`backend/src/flags/index.ts`:

- `loadOverrides(db)` at startup, before `setupFlags`.
- `setOverride(db, key, override, by)` / `clearOverride(db, key)`: write the row, then re-run
  `setupFlags` with the new overrides, so later evaluations use them. The provider swap is
  synchronous for in-memory definitions; requests evaluated mid-swap see either the old or the new
  value, never an error.

### API (admin only, `requireAuth` + `requireAdmin`, in `schema/api-v1.yaml`)

- `GET /api/admin/flags`: every flag with its kind (on/off or number), description (the comment
  from `definitions.ts`, moved into a `description` field), default (the rule's summary plus
  `FLAGS_ON`/`FLAG_VALUES`), override (if any, with the chosen users' names and who changed it
  when), and the value it has for you.
- `PUT /api/admin/flags/{key}`: body `{ mode, userIds? }` or `{ number }`, validated with zod
  (known key, mode fits the kind, user ids exist, number in range).
- `DELETE /api/admin/flags/{key}`: back to the default.
- Every change is logged (key, old, new, by).

### Admin page `#/admin/flags`

- A DataTable (the same sortable, filterable table as `#/admin/users`): one row per flag, columns
  flag (key + description), state (a badge: Everyone/Admins/"Chosen users · N"/Off, or "Default
  (...)" with none), source (Override/FLAGS_ON/FLAG_VALUES/Rule), your value, and changed (relative
  time and who, "—" with none). A filter box narrows by key/description, client-side. A row opens
  (click, or Enter — rows are keyboard-reachable) a right-hand details panel; stale overrides stay
  listed below the table with Remove, same as before.
- The details panel (a bits-ui Dialog as a sheet, full width on phones): the key, description and
  current state, then Global (Default · Off · Everyone, a segmented control) and Conditional
  (Admins · Chosen users, another one) — or, for a number flag, its value field, range, default
  and Reset to default. "Changed by X, 5 min ago" in the footer for an override.
- Chosen users: a picker that searches users by name or handle (the `#/admin/users` list endpoint)
  and shows them as removable chips.
- Saving shows "Live now; open tabs update within a minute".
- Uses the shadcn-style components, bits-ui and the design tokens, following the admin pages'
  existing look.

### The SPA

- The OFREP web provider polls; set its poll interval to 30 s (check the current default in
  `lib/flags.ts`) so other tabs and devices follow within half a minute.
- After a change on the flags page, the admin's own tab refetches at once (`setFlagUser` again, or
  the provider's refresh).

## Risks

- **Someone registers `ADMIN_EMAIL` before the first boot.** They don't get promoted: that needs
  `ADMIN_PASSWORD` to sign into the account. The backend logs an error instead, and the operator
  promotes the right account with SQL.
- **Lockout:** demoting the last admin is refused; removing every admin's role in the database
  brings the env admin back on the next start (with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set again),
  or the SQL in `docs/SELFHOSTING.md` gives an account the role directly.
- **A typo in a user list** can't happen: the picker only offers existing users, and the server
  checks ids.

## Testing

- `bootstrap.ts`, against the DB test schema: creates an admin when none exists, does nothing
  when one does, promotes an existing account only when `ADMIN_PASSWORD` signs into it, cleans the
  derived name, skips with one env var or a short password, never logs the password.
- Flag evaluation (pure): each mode for an admin, a chosen user, another user and signed out;
  number overrides with range checks; Default keeps today's behaviour, with and without `FLAGS_ON`.
- Flags API: admin only (403 otherwise), validation errors, and a change visible in OFREP right
  after the PUT without a restart; DELETE falls back.
- Users API use: demoting the last admin is refused.
- Frontend: the flags page and the users page render and save (component tests where the repo has
  them); e2e: an admin turns `gamemode.p121.enabled` to Everyone and a non-admin sees 121 on the
  Play page after a reload.

## Out of scope

- Email verification and SMTP.
- Percentage rollouts, flag scheduling, or an audit-log page (the log lines cover changes).
- Several backend processes sharing overrides live.
