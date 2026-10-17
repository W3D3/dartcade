# First admin and runtime feature flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A production deployment gets its first admin from `ADMIN_EMAIL` + `ADMIN_PASSWORD`, all admin tools live on one `#/admin` page in the sidebar, admins manage admins at `#/admin/users`, and feature flags change at runtime from `#/admin/flags` (Default · Off · Admins · Chosen users · Everyone; number values) with no restart.

**Architecture:** Startup bootstrap in `backend/src/auth/bootstrap.ts`. Flag overrides live in a `feature_flag_overrides` table. `backend/src/flags/index.ts` keeps the env defaults and the overrides as module state and rebuilds the OpenFeature in-memory provider whenever either changes. Admin-only REST endpoints (in `schema/api-v1.yaml`, typed client) back two Svelte admin pages.

**Tech Stack:** Fastify, Kysely/Postgres, better-auth (email/password, admin plugin's `role` column), OpenFeature (server in-memory provider, OFREP to the SPA), Svelte 5, bits-ui/shadcn-style components, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-17-admin-bootstrap-and-runtime-flags-design.md`

## Global Constraints

- Work in the git worktree `/home/wedenigc/Dev/dartcade-ops` (branch `feat/admin-bootstrap-and-runtime-flags`). Run `npm ci` at the root, in `backend/` and in `backend/frontend/` first if `node_modules` is missing.
- Admin means `role = 'admin'` (`isAdmin()` from `backend/src/auth/admin.ts`). Admin routes use `[requireAuth, requireAdmin]` like `api/minigolfCourses.ts`.
- New API endpoints go in `schema/api-v1.yaml`, then `npm run gen:api` at the repo root. Don't edit generated files.
- Flag modes, exactly: `'off' | 'admins' | 'users' | 'on'`; no row = Default. Number flags store `number`.
- Never log `ADMIN_PASSWORD`. The minimum password length is 8 (better-auth's default).
- Demoting the last admin is refused with the message "There must be at least one admin".
- Commits: conventional (`type(scope): subject`, lower case, < 72 chars), unsigned (`git -c commit.gpgsign=false commit`), each ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01VULn7Ep988Zc1dpFgEAVRi
  ```
- Before each commit: `npm run format` at the root (revert formatter changes to files outside your task), and `npm run typecheck` + `npm run lint` in each package you touched. DB tests: `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test`.
- Style: match the surrounding code (short why-comments, JSDoc on exports, no semicolons, single quotes, plain English UI copy). UI follows the design tokens and existing admin pages; use `lib/components/ui/` and bits-ui, icons from `@lucide/svelte`.

## Review Focus

- `ADMIN_EMAIL` set but an admin already exists (e.g. promoted by hand) → bootstrap does nothing, even if `ADMIN_EMAIL` names a different user (test in Task 1).
- A flag override naming a deleted user → evaluation ignores the stale id, the page shows it as "deleted user" (test in Task 3/4).
- An override row for a key no longer in `definitions.ts` → ignored by evaluation, listed as stale with Remove (test in Task 4).
- Concurrent role changes where two admins demote each other → at least one admin remains (the guard runs in one transaction; test in Task 2).
- Signed-out visitor and "Chosen users" / "Admins" modes → off; "Everyone" → on (test in Task 3).

---

### Task 1: First admin from env

**Files:**

- Create: `backend/src/auth/bootstrap.ts`, `backend/src/auth/bootstrap.test.ts`
- Modify: `backend/src/index.ts` (call it after `runMigrations`, next to `seedDev()`)

**Interfaces:**

- Produces: `export async function bootstrapAdmin(db: Kysely<Database>, env?: { email?: string; password?: string }, log?: { info(msg: string): void; warn(msg: string): void; error(msg: string): void }): Promise<'skipped' | 'exists' | 'promoted' | 'created'>` (env defaults to `process.env.ADMIN_EMAIL`/`ADMIN_PASSWORD`, log defaults to `console`).

- [ ] **Step 1: Write the failing tests** (DB-gated like other DB tests: `describe.skipIf(!process.env.TEST_DATABASE_URL)`; see `db/testSchema.ts` and an existing DB test such as `db/preferences.test.ts` for setup). Cases:
  - no env → `'skipped'`, no user created;
  - only email or only password → `'skipped'` and one `warn` naming the missing variable;
  - password of 7 chars → `'skipped'` and an `error`;
  - no admin, no account → `'created'`: a user with that email exists, `role = 'admin'`, and signing in with the password works (`auth.api.signInEmail`);
  - no admin, account exists with that email → `'promoted'`, its password unchanged, `info` mentions "existing account";
  - an admin exists (any user with role admin, even another email) → `'exists'`, nothing changes;
  - no log line contains the password (spy on the logger).
    Note: better-auth's `auth` instance in `auth/index.ts` uses the app's `db` module. Check how existing tests create users (search `signUpEmail` in `backend/src/**/*.test.ts`). `bootstrapAdmin` takes a `signUp` parameter (default `auth.api.signUpEmail`), so tests can pass one that targets the test schema; never write better-auth's user/account rows by hand.
- [ ] **Step 2: Run, expect failure.** `cd backend && TEST_DATABASE_URL=… npx vitest run src/auth/bootstrap.test.ts`
- [ ] **Step 3: Implement.**

```ts
// The first admin of a deployment, from ADMIN_EMAIL and ADMIN_PASSWORD: created (or promoted) on
// startup while no admin exists, so a fresh production instance has someone who can manage it.
// Once any admin exists this does nothing; with every admin gone, the next start restores it.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { auth } from './index.js'

const MIN_PASSWORD = 8
type Log = { info(msg: string): void; warn(msg: string): void; error(msg: string): void }

export async function bootstrapAdmin(
  db: Kysely<Database>,
  env: { email?: string; password?: string } = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  log: Log = console,
  signUp = (body: { email: string; password: string; name: string }) => auth.api.signUpEmail({ body }),
): Promise<'skipped' | 'exists' | 'promoted' | 'created'> {
  const email = env.email?.trim().toLowerCase()
  const password = env.password
  if (!email && !password) return 'skipped'
  if (!email || !password) {
    log.warn(`First admin: ${email ? 'ADMIN_PASSWORD' : 'ADMIN_EMAIL'} is not set, no admin created`)
    return 'skipped'
  }
  if (password.length < MIN_PASSWORD) {
    log.error(`First admin: ADMIN_PASSWORD is shorter than ${MIN_PASSWORD} characters, no admin created`)
    return 'skipped'
  }
  const admin = await db.selectFrom('user').select('id').where('role', '=', 'admin').executeTakeFirst()
  if (admin) return 'exists'
  const existing = await db.selectFrom('user').select('id').where(eb => eb(eb.fn('lower', ['email']), '=', email)).executeTakeFirst()
  if (existing) {
    await db.updateTable('user').set({ role: 'admin' }).where('id', '=', existing.id).execute()
    log.info(`First admin: promoted the existing account ${email} (its password is unchanged)`)
    return 'promoted'
  }
  await signUp({ email, password, name: email.split('@')[0] })
  await db.updateTable('user').set({ role: 'admin' }).where(eb => eb(eb.fn('lower', ['email']), '=', email)).execute()
  log.info(`First admin: created ${email}`)
  return 'created'
}
```

(The name goes through better-auth's `nameHooks`, which cleans it or marks it `name_needs_change`; that's fine — the admin picks a name after signing in.) In `index.ts`, after `await seedDev()`: `await bootstrapAdmin(db)`.

- [ ] **Step 4: Run, expect pass**, then `npm run typecheck && npm run lint`.
- [ ] **Step 5: Commit** — `feat(auth): create the first admin from ADMIN_EMAIL and ADMIN_PASSWORD`

---

### Task 2: Admin users API

**Files:**

- Create: `backend/src/api/adminUsers.ts`, `backend/src/api/adminUsers.test.ts`, `backend/src/db/adminUsers.ts`
- Modify: `schema/api-v1.yaml` (+ `npm run gen:api`), `backend/src/app.ts` (register the plugin next to `minigolfCoursesApiPlugin`)

**Interfaces:**

- Produces:
  - `GET /api/admin/users?q=` (operationId `listAdminUsers`) → `{ users: { id, name, email, role: 'admin' | null, createdAt }[] }`, newest first, at most 50; `q` matches name or email, case-insensitive, contains.
  - `PUT /api/admin/users/{id}/role` (operationId `setUserRole`) body `{ admin: boolean }` → 200 the updated user; 404 unknown id; 409 `{ error: 'There must be at least one admin' }` when it would leave no user with role `'admin'`.
  - `backend/src/db/adminUsers.ts`: `listUsers(db, q?)`, `setAdmin(db, id, admin): Promise<'ok' | 'not-found' | 'last-admin'>` — runs in a transaction that locks the admin rows (`SELECT … FROM "user" WHERE role = 'admin' FOR UPDATE`) before counting.

- [ ] **Step 1: Failing tests** (DB-gated, app built like `api/minigolfCourses.test.ts`): non-admin gets 403 on both routes; list filters by q; promote then demote works; demoting the only admin → 409 with the exact message; two admins demoting each other concurrently (`Promise.all` of two PUTs) → one 200, one 409, one admin left.
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement** the yaml paths (copy the shape and auth conventions of the minigolf-courses admin paths), `npm run gen:api`, the db functions and the plugin with `preValidation: [requireAuth, requireAdmin]`. Note: `role` in the DB is better-auth's; only `'admin'` and `null` are written here.
- [ ] **Step 4: Run, expect pass**; typecheck, lint.
- [ ] **Step 5: Commit** — `feat(api): let admins list users and promote or demote admins`

---

### Task 3: Flag overrides in the database and in evaluation

**Files:**

- Create: `backend/src/db/migrations/024_feature_flag_overrides.sql`, `backend/src/db/flagOverrides.ts`, `backend/src/db/flagOverrides.test.ts`
- Modify: `backend/src/db/schema.ts` (table type), `backend/src/flags/definitions.ts`, `backend/src/flags/index.ts`, `backend/src/flags/flags.test.ts`, `backend/src/index.ts`

**Interfaces:**

- Produces:
  - Migration (check `npm run check-migrations`/`scripts/check-migrations.sh` conventions):
    ```sql
    CREATE TABLE feature_flag_overrides (
      key         TEXT PRIMARY KEY,
      mode        TEXT CHECK (mode IN ('off', 'admins', 'users', 'on')),
      user_ids    TEXT[] NOT NULL DEFAULT '{}',
      number      DOUBLE PRECISION,
      updated_by  TEXT REFERENCES "user"(id) ON DELETE SET NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ```
  - `export type FlagOverride = { mode: 'off' | 'admins' | 'users' | 'on'; userIds: string[] } | { number: number }`
  - `db/flagOverrides.ts`: `loadOverrides(db): Promise<Map<string, FlagOverride & { updatedBy: string | null; updatedAt: Date }>>`, `upsertOverride(db, key, o: FlagOverride, by: string)`, `deleteOverride(db, key)`.
  - `definitions.ts`: `flagDefinitions(flagsOn, values, overrides = new Map<string, FlagOverride>())`; each flag also carries `description: string` (move the existing comment's text) and number flags `range: [min, max]` (`visitSeconds` [10, 300], `reserveSeconds` [0, 900]). Export `FLAG_META: Record<key, { kind: 'boolean' | 'number'; description: string; range?: [number, number]; defaultRule: 'admins' | 'nobody' }>` for the API.
  - `flags/index.ts`: `setupFlags(flagsOn, values)` keeps the env defaults in module state; new `setOverrides(overrides: Map<string, FlagOverride>)` keeps the overrides; both rebuild the provider from all three (`setProviderAndWait(new TypedInMemoryProvider(flagDefinitions(flagsOn, values, overrides)))`). New `currentOverrides()` returns the map.
- Evaluation with an override (on/off flags), context from `contextFor(user)` (`targetingKey` = user id, `admin`):

  | mode                                                                                                                                                                    | on for                                         |
  | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
  | `off`                                                                                                                                                                   | nobody                                         |
  | `admins`                                                                                                                                                                | `ctx.admin === true`                           |
  | `users`                                                                                                                                                                 | admins or `userIds.includes(ctx.targetingKey)` |
  | `on`                                                                                                                                                                    | everyone, signed out too                       |
  | No override → today's behaviour (`FLAGS_ON`, else the rule). Number flags: override `number`, else `FLAG_VALUES`, else default (express as a third variant `override`). |

- [ ] **Step 1: Failing tests** in `flags.test.ts` (pure, no DB): for each mode, `flagEnabled` for admin / a chosen user / another player / `null`; `users` mode ignores an id of a deleted user (just not matching anyone); a number override wins over `FLAG_VALUES`; `setOverrides(new Map())` returns to defaults, with and without `FLAGS_ON`; `setupFlags` after `setOverrides` keeps the overrides. In `db/flagOverrides.test.ts` (DB-gated): upsert, load (round-trips modes, ids, numbers, who/when), delete.
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement.** In `flagDefinitions`, wrap each on/off flag's evaluator: `override ? modeRule(override) : on(key, rule)`. In `index.ts` (startup), after `buildApp(...)` resolves (it calls `setupFlags` with the env defaults): `await setOverrides(await loadOverrides(db))` — before `app.listen`. Keep `buildApp` free of DB access (its doc says so).
- [ ] **Step 4: Run, expect pass**; `npm run typecheck && npm run lint`; existing flags/ofrep tests still pass.
- [ ] **Step 5: Commit** — `feat(flags): store flag overrides and apply them in evaluation`

---

### Task 4: Flags admin API

**Files:**

- Create: `backend/src/api/adminFlags.ts`, `backend/src/api/adminFlags.test.ts`
- Modify: `schema/api-v1.yaml` (+ `npm run gen:api`), `backend/src/app.ts`

**Interfaces:**

- Consumes: Task 3 (`FLAG_META`, `FlagOverride`, `setOverrides`, `currentOverrides`, db functions), `evaluateAll`, `loadFlagUser`, `getUsersByIds` (`db/queries.ts`).
- Produces:
  - `GET /api/admin/flags` (`listAdminFlags`) → `{ flags: { key, kind, description, range?, default: { rule: 'admins' | 'nobody', envOn: boolean, envValue?: number }, override: null | { mode?, users?: { id, name }[], number?, updatedBy: { id, name } | null, updatedAt }, value: boolean | number }[], stale: { key, updatedAt }[] }` — `value` is the flag's value for the requesting admin; `users` names come from `getUsersByIds` (missing ids listed as `{ id, name: null }`); `stale` lists override rows whose key isn't in `FLAG_META`.
  - `PUT /api/admin/flags/{key}` (`setFlagOverride`) body `{ mode: 'off'|'admins'|'users'|'on', userIds?: string[] } | { number: number }` → 200 the flag as in the list. 404 unknown key; 400 when the body doesn't fit the flag's kind, a number is out of range, `userIds` is missing/empty for `users`, or an id doesn't exist.
  - `DELETE /api/admin/flags/{key}` (`clearFlagOverride`) → 204 (also for stale keys).
  - Each write: DB first, then `setOverrides(await loadOverrides(db))`; log `flag override` with key, old, new, user id (`req.log.info`).
- [ ] **Step 1: Failing tests** (DB-gated): non-admin 403 on all three; set `gamemode.p121.enabled` to `on` → a non-admin's `POST /ofrep/v1/evaluate/flags` shows it `true` immediately (no restart); `users` with a player's id → that player true, another false; number out of range → 400; unknown key → 404; DELETE → back to default; a stale row appears under `stale` and DELETE removes it. Reset overrides in `afterEach` (`setOverrides(new Map())` + table truncate).
- [ ] **Step 2: Run, expect failure.**
- [ ] **Step 3: Implement** (yaml shapes, gen:api, zod validation of the body per `FLAG_META`, plugin with `[requireAuth, requireAdmin]`).
- [ ] **Step 4: Run, expect pass**; typecheck, lint.
- [ ] **Step 5: Commit** — `feat(api): let admins change feature flags at runtime`

---

### Task 5: Admin hub in the sidebar

All admin tools move to one page, `#/admin`, reached from the sidebar (admins only). The account
menu's Admin group goes away.

**Files:**

- Create: `backend/frontend/src/routes/Admin.svelte`, `backend/frontend/src/lib/admin/tools.ts`
- Modify: `backend/frontend/src/lib/nav.ts` (+ its test), the sidebar/rail/phone-tab components that render `nav.ts`'s items (find them by `isActiveRoute`/the nav item functions), `backend/frontend/src/App.svelte` (route `'/admin'`), `backend/frontend/src/lib/components/AccountMenu.svelte` (remove the Admin group and its now-unused imports/state)

**Interfaces:**

- Produces: `lib/admin/tools.ts` exports `ADMIN_TOOLS: { href: string; title: string; desc: string; icon: Component }[]`. This task adds the two existing tools: Minigolf courses (`/admin/minigolf/courses`, "Edit and publish the official courses") and Minigolf bench (`/admin/minigolf`, "Try shots and physics on any hole"). Tasks 6 and 7 append Users and Feature flags when their routes land.
- `nav.ts`: `sideLinks(liveSessionId, ranked, admin = false)` appends `{ href: '/admin', label: 'Admin', icon: 'admin' }` after Settings when `admin`. The callers pass `$currentUser?.isAdmin`. Map the `'admin'` icon to lucide `ShieldCheck` wherever nav icons are mapped. The tablet rail gets the same item if it renders from its own list; the phone tab bar stays as it is.
- Account menu: the Admin group (with its sub-links) is replaced by one "Admin" link to `#/admin`, so phones (no sidebar) still reach it.

- [ ] **Step 1: Failing test** in nav.ts's test: `sideLinks(null, false, true)` ends with Admin, and `sideLinks(null)` has no Admin.
- [ ] **Step 2: Implement** the nav change, the account-menu change and `Admin.svelte`: page title "Admin", subtitle "Tools for running this dartcade", a grid of cards from `ADMIN_TOOLS` (title, description, icon), styled like the Settings hub's section cards (reuse its component or classes). Non-admins on `#/admin` get the same "not allowed" treatment as the minigolf admin routes.
- [ ] **Step 3:** `cd backend/frontend && npm run typecheck && npm run lint && npx vitest run`.
- [ ] **Step 4: Commit** — `feat(admin): an admin page in the sidebar for all admin tools`

---

### Task 6: `#/admin/users` page

**Files:**

- Create: `backend/frontend/src/routes/AdminUsers.svelte`, `backend/frontend/src/lib/admin/users.ts` (API calls via the typed client `api` from `$lib/api`), a test for any non-trivial logic in `lib/admin/`
- Modify: `backend/frontend/src/App.svelte` (route `'/admin/users'`), `backend/frontend/src/lib/components/AccountMenu.svelte` (Admin group: "Users", icon `Users`; and "Feature flags", icon `ToggleRight`, linking `#/admin/flags` — the route lands in Task 6)

**Interfaces:**

- Consumes: Task 2 endpoints; Task 5's hub.
- [ ] **Step 1:** Build the page: title "Users", search input (debounced 250 ms), a list of rows (name, email, joined date, an "Admin" badge), and a Promote / Demote button per row with a confirm dialog (`Modal` from `lib/components/ui/modal` or bits-ui Dialog, whichever the admin pages use). A 409 shows its message inline. Non-admins visiting the route see the same "not allowed" treatment the minigolf admin routes use (check `MinigolfCourses.svelte`).
- [ ] **Step 2:** `cd backend/frontend && npm run typecheck && npm run lint && npx vitest run`.
- [ ] **Step 3: Commit** — `feat(admin): users page to promote and demote admins`

---

### Task 7: `#/admin/flags` page and faster flag pickup

**Files:**

- Create: `backend/frontend/src/routes/AdminFlags.svelte`, `backend/frontend/src/lib/admin/flags.ts` (+ test for the pure parts, e.g. turning the API row into the control's value and back)
- Modify: `backend/frontend/src/App.svelte` (route `'/admin/flags'`), `backend/frontend/src/lib/flags.ts`, `backend/frontend/src/lib/admin/tools.ts` (add the Feature flags card, icon `ToggleRight`)

**Interfaces:**

- Consumes: Task 4 endpoints; Task 2 `GET /api/admin/users?q=` for the user picker.
- [ ] **Step 1:** `lib/flags.ts`: pass `pollInterval: 30000` to `OFREPWebProvider` (check the option name in `@openfeature/ofrep-web-provider`'s types) and export `refreshFlags()` that makes the provider refetch now (re-set the context via `setFlagUser(currentUserId)`, or the provider's own refresh if it has one). Unit test if the module has tests; otherwise note it.
- [ ] **Step 2:** Build the page: title "Feature flags", one card per flag — key in mono, description, for on/off flags a segmented control (Default · Off · Admins · Chosen users · Everyone; the Default segment's label shows what default means, e.g. "Default (admins)"), for number flags a number input with its range and Save. "Chosen users" reveals a picker: search (Task 2 endpoint), selected users as removable chips; deleted users show as "Deleted user". Under an override: "Changed by NAME, 5 min ago". After any save: call `refreshFlags()` and show "Live now. Open tabs update within half a minute." Stale overrides listed at the bottom with Remove.
- [ ] **Step 3:** `npm run typecheck && npm run lint && npx vitest run` in backend/frontend.
- [ ] **Step 4: Commit** — `feat(admin): feature flags page with runtime overrides`

---

### Task 8: Docs, e2e and screenshots

**Files:**

- Modify: `docs/SELFHOSTING.md`, `DEVELOPMENT.md` (env table: `ADMIN_EMAIL`, `ADMIN_PASSWORD`), `AGENTS.md` ("Where to look": admin bootstrap, flag overrides, admin pages; the Feature flags row mentions runtime overrides)
- Create: `e2e/tests/admin-flags.spec.ts`; screenshot scenes for the admin pages in `e2e/screenshots/` → `docs/admin/hub-desktop.png`, `docs/admin/users-desktop.png`, `docs/admin/flags-desktop.png`

- [ ] **Step 1:** `SELFHOSTING.md`: add the env vars the compose example lacks (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `BETTER_AUTH_TRUSTED_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) to its compose snippet and an env table, and a "First start" section with the spec's go-live runbook (steps 1–6), in plain words.
- [ ] **Step 2:** e2e: an admin opens `#/admin/flags`, sets 121 to Everyone; a second browser context signed in as a non-admin reloads the Play page and sees the 121 card enabled; the admin sets it back to Default. Follow `e2e/fixtures/auth.ts` (`adminPage` and a player page) and clean up the override in `afterEach` via the API. Run `cd e2e && npx playwright test tests/admin-flags.spec.ts` (it starts the e2e compose stack; don't disturb other running stacks — if ports clash, report it).
- [ ] **Step 3:** Screenshots: add two scenes to `e2e/screenshots/` following the existing scenes, run `cd e2e && npm run screenshots` (own stack on 3021/5181), check the PNGs by eye, keep other refreshed PNGs only if they're unchanged in content (revert pixel-noise diffs of unrelated images with `git checkout -- docs/...`).
- [ ] **Step 4:** `npm run format` at the root.
- [ ] **Step 5: Commit** — `docs(ops): first start, admin env and admin page screenshots` (the e2e test may be its own commit `test(e2e): turn a flag on for everyone at runtime`).
