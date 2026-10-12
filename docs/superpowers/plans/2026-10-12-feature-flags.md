# Feature flags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenFeature flags evaluated per user on the backend and served to the SPA over OFREP, with
Minigolf behind `gamemode.minigolf.enabled` (on for admins, or for everyone via `FLAGS_ON`).

**Architecture:** `backend/src/flags/` registers `@openfeature/server-sdk`'s `TypedInMemoryProvider`
with the flag definitions and evaluates them for a user built from the session. `backend/src/api/ofrep.ts`
serves OFREP v1 (bulk and single). Game modes are gated in `GET /api/gamemodes` and in the lobby
(saving the next game, starting). The SPA reads flags through `@openfeature/web-sdk` with
`@openfeature/ofrep-web-provider`; the mode tiles hide flagged-off modes.

**Tech Stack:** `@openfeature/server-sdk` 1.23.0, `@openfeature/ofrep-core` 2.3.0 (types),
`@openfeature/web-sdk` 1.10.0, `@openfeature/ofrep-web-provider` 0.4.3, Fastify, Svelte 5, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-feature-flags-design.md`

## Global Constraints

- Exact versions (no `^`), as every dependency in this repo: `@openfeature/server-sdk@1.23.0` and `@openfeature/ofrep-core@2.3.0` in `backend/`; `@openfeature/web-sdk@1.10.0` and `@openfeature/ofrep-web-provider@0.4.3` in `backend/frontend/`. Install with the npm each lockfile was made with (backend: the system npm 11; frontend: `npx -y npm@10`), so the lockfiles only gain these entries.
- The evaluation context is always built on the server from the session: `{ targetingKey: <user id>, email, admin }`, or `{ targetingKey: 'anonymous' }` signed out. The OFREP request body's `context` is ignored.
- Flag keys: `gamemode.<mode id>.enabled`. Only modes with such a flag are gated; X01 and ATC have none.
- `FLAGS_ON` (env, comma-separated flag keys) turns those flags on for everyone.
- Signed out is not an error for OFREP: every flag evaluates off.
- Refusals: `409 { error: "That game isn't available", code: 'game_unavailable' }`.
- Commits: conventional, lower case, < 72 chars, with the session's attribution lines; `npm run format` at the root before each commit; `npm run gen:api` after changing `schema/api-v1.yaml`.

## Review Focus

- A non-admin whose saved Play page prefs pick Minigolf: the Play page must fall back to another mode, and Choose players must not create a lobby with Minigolf. Test in Task 4 (`chosenGame` already falls back when the backend doesn't list the mode; the e2e checks the tile is gone).
- A lobby whose next game is already Minigolf when a non-admin becomes its host (host hand-over): Start must refuse. Test in Task 3 (start with a non-admin host).
- The flag store before the provider has loaded: a flagged mode stays hidden (no flash of the Minigolf tile). Test in Task 4.
- The dev user switch from an admin to a non-admin: flags re-evaluate for the new user without a reload. Test in Task 4 (context change refetch).
- OFREP's ETag: an unchanged response for the same user answers 304; a different user (different context) never gets the other user's ETag match. Test in Task 2.

---

### Task 1: flags on the backend

**Files:**

- Modify: `backend/package.json`, `backend/package-lock.json` (deps)
- Create: `backend/src/flags/definitions.ts`, `backend/src/flags/index.ts`, `backend/src/flags/flags.test.ts`
- Modify: `backend/src/app.ts` (register the provider at startup, before routes)

**Interfaces:**

- `type FlagUser = { id: string; email: string; role: string | null } | null`
- `flagDefinitions(flagsOn: ReadonlySet<string>)`: the `TypedInMemoryProvider` configuration
- `envFlagsOn(): Set<string>` (parses `process.env.FLAGS_ON`)
- `setupFlags(flagsOn: ReadonlySet<string>): Promise<void>` (`OpenFeature.setProviderAndWait(new TypedInMemoryProvider(flagDefinitions(flagsOn)))`)
- `contextFor(user: FlagUser): EvaluationContext`
- `flagEnabled(key: string, user: FlagUser): Promise<boolean>`
- `evaluateAll(user: FlagUser): Promise<{ key: string; value: boolean; reason: string; variant: string }[]>`
- `FLAG_KEYS: readonly string[]`; `modeFlag(modeId: string): string | null` (the mode's flag key, or null when it has none)
- `loadFlagUser(db, userId: string | null): Promise<FlagUser>` (`getRoleAndEmail` from `db/users.ts`)

- [ ] **Step 1: Install**

```bash
cd backend && npm i -E @openfeature/server-sdk@1.23.0 @openfeature/ofrep-core@2.3.0
git diff --stat package-lock.json   # only the new packages
```

- [ ] **Step 2: Failing tests** (`backend/src/flags/flags.test.ts`)

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { contextFor, evaluateAll, flagEnabled, modeFlag, setupFlags, envFlagsOn } from './index.js'

const admin = { id: 'a', email: 'boss@x', role: 'admin' }
const player = { id: 'p', email: 'p@x', role: null }

describe('flags', () => {
  beforeAll(() => setupFlags(new Set()))

  it('turns Minigolf on for admins only', async () => {
    expect(await flagEnabled('gamemode.minigolf.enabled', admin)).toBe(true)
    expect(await flagEnabled('gamemode.minigolf.enabled', player)).toBe(false)
    expect(await flagEnabled('gamemode.minigolf.enabled', null)).toBe(false)
  })

  it('turns a flag on for everyone with FLAGS_ON', async () => {
    await setupFlags(new Set(['gamemode.minigolf.enabled']))
    expect(await flagEnabled('gamemode.minigolf.enabled', player)).toBe(true)
    expect(await flagEnabled('gamemode.minigolf.enabled', null)).toBe(true)
    await setupFlags(new Set())
  })

  it('reads FLAGS_ON from the environment', () => {
    process.env.FLAGS_ON = ' gamemode.minigolf.enabled , other '
    expect([...envFlagsOn()]).toEqual(['gamemode.minigolf.enabled', 'other'])
    delete process.env.FLAGS_ON
  })

  it('builds the context from the user, an anonymous one signed out', () => {
    expect(contextFor(admin)).toEqual({ targetingKey: 'a', email: 'boss@x', admin: true })
    expect(contextFor(null)).toEqual({ targetingKey: 'anonymous' })
  })

  it('evaluates every flag', async () => {
    expect(await evaluateAll(admin)).toEqual([{ key: 'gamemode.minigolf.enabled', value: true, reason: 'TARGETING_MATCH', variant: 'on' }])
  })

  it('knows which modes have a flag', () => {
    expect(modeFlag('minigolf')).toBe('gamemode.minigolf.enabled')
    expect(modeFlag('x01')).toBeNull()
  })
})
```

Run: `cd backend && npx vitest run src/flags` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// backend/src/flags/definitions.ts
// The feature flags, as OpenFeature's in-memory provider takes them: variants, the default, and the
// targeting rule (contextEvaluator), which gets the context contextFor() builds from the session.
import type { EvaluationContext } from '@openfeature/server-sdk'

const isAdmin = (ctx: EvaluationContext) => ctx.admin === true

export function flagDefinitions(flagsOn: ReadonlySet<string>) {
  const on = (key: string, rule: (ctx: EvaluationContext) => boolean) => (ctx: EvaluationContext) =>
    flagsOn.has(key) || rule(ctx) ? ('on' as const) : ('off' as const)
  return {
    // Minigolf is played by admins until it ships (FLAGS_ON=gamemode.minigolf.enabled for everyone)
    'gamemode.minigolf.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('gamemode.minigolf.enabled', isAdmin),
    },
  } as const
}
```

```ts
// backend/src/flags/index.ts
// Feature flags (OpenFeature). Evaluated per user with a context built here from the session —
// never from what a browser sends. Design: docs/superpowers/specs/2026-10-12-feature-flags-design.md
import { OpenFeature, TypedInMemoryProvider, type EvaluationContext } from '@openfeature/server-sdk'
import type { Kysely } from 'kysely'
import { isAdmin } from '../auth/admin.js'
import type { Database } from '../db/schema.js'
import { getRoleAndEmail } from '../db/users.js'
import { flagDefinitions } from './definitions.js'

export type FlagUser = { id: string; email: string; role: string | null } | null

export const FLAG_KEYS: readonly string[] = Object.keys(flagDefinitions(new Set()))

export function envFlagsOn(): Set<string> {
  return new Set((process.env.FLAGS_ON ?? '').split(',').map(s => s.trim()).filter(Boolean))
}

export async function setupFlags(flagsOn: ReadonlySet<string>): Promise<void> {
  await OpenFeature.setProviderAndWait(new TypedInMemoryProvider(flagDefinitions(flagsOn)))
}

export function contextFor(user: FlagUser): EvaluationContext {
  return user ? { targetingKey: user.id, email: user.email, admin: isAdmin(user) } : { targetingKey: 'anonymous' }
}

export async function flagEnabled(key: string, user: FlagUser): Promise<boolean> {
  return OpenFeature.getClient().getBooleanValue(key, false, contextFor(user))
}

export async function evaluateAll(user: FlagUser) {
  const client = OpenFeature.getClient()
  return Promise.all(
    FLAG_KEYS.map(async key => {
      const d = await client.getBooleanDetails(key, false, contextFor(user))
      return { key, value: d.value, reason: d.reason ?? 'UNKNOWN', variant: d.variant ?? '' }
    }),
  )
}

/** The flag that gates a game mode, or null for a mode that isn't gated. */
export function modeFlag(modeId: string): string | null {
  const key = `gamemode.${modeId}.enabled`
  return FLAG_KEYS.includes(key) ? key : null
}

export async function loadFlagUser(db: Kysely<Database>, userId: string | null): Promise<FlagUser> {
  if (!userId) return null
  const u = await getRoleAndEmail(db, userId)
  return u ? { id: userId, ...u } : null
}
```

In `backend/src/app.ts`, before the API plugins: `await setupFlags(envFlagsOn())` (import from `./flags/index.js`).
Check `isAdmin`'s signature (`auth/admin.ts`): it takes `{ role, email }` — `FlagUser` has both.

- [ ] **Step 4: Run** `npx vitest run src/flags`, `npm run typecheck`, `npm run lint` → green. If the reason string differs
      (`TARGETING_MATCH` is what the in-memory provider reports for a contextEvaluator), use the provider's value in the test.

- [ ] **Step 5: Commit** `feat(flags): evaluate feature flags with openfeature` (body: why OpenFeature and the in-memory provider).

---

### Task 2: OFREP endpoints

**Files:**

- Create: `backend/src/api/ofrep.ts`, `backend/src/api/ofrep.test.ts`
- Modify: `backend/src/app.ts` (register `ofrepApiPlugin, { db }`), `schema/api-v1.yaml` (the two routes + `OfrepBulkResponse`, `OfrepEvaluation`, `OfrepFailure`), `backend/frontend/vite.config.ts` (proxy `/ofrep` to the backend like `/api`)
- Regenerate: `npm run gen:api`

**Interfaces:**

- `POST /ofrep/v1/evaluate/flags` → 200 `{ flags: [{ key, value, reason, variant }] }` with `ETag`; `If-None-Match` equal → 304 empty
- `POST /ofrep/v1/evaluate/flags/:key` → 200 `{ key, value, reason, variant }`; unknown → 404 `{ key, errorCode: 'FLAG_NOT_FOUND' }`
- Both: optional session (`getAuthUser` from `auth/session.ts`), body `{ context? }` accepted and ignored.

- [ ] **Step 1: Failing tests** (`backend/src/api/ofrep.test.ts`), with `vi.mock('../auth/session.js')` (as `auth/middleware.test.ts` does) and `vi.mock('../db/users.js')` for `getRoleAndEmail`:
  - signed out: bulk → `gamemode.minigolf.enabled` false, status 200 (not 401)
  - admin: bulk → true; a body `{ context: { admin: true } }` from a non-admin still → false
  - single: `/ofrep/v1/evaluate/flags/gamemode.minigolf.enabled` → value; `/…/nope` → 404 `{ key: 'nope', errorCode: 'FLAG_NOT_FOUND' }`
  - ETag: the same user twice with `If-None-Match: <etag>` → 304; a non-admin sending the admin's ETag → 200 (the ETag hashes the evaluated values)

- [ ] **Step 2: Implement**

```ts
// backend/src/api/ofrep.ts
// OpenFeature Remote Evaluation Protocol (v1) for the SPA's OFREP web provider. No OFREP server
// library exists for Fastify, so this serves the two routes the web provider uses. The context the
// browser sends is ignored: flags are evaluated for the signed-in user (anonymous signed out).
import { createHash } from 'node:crypto'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { BulkEvaluationSuccessResponse, EvaluationFailureResponse, EvaluationSuccessResponse } from '@openfeature/ofrep-core'
import { getAuthUser } from '../auth/session.js'
import type { Database } from '../db/schema.js'
import { FLAG_KEYS, evaluateAll, loadFlagUser } from '../flags/index.js'
import { fromSpec } from './spec.js'

export function ofrepApiPlugin(app: FastifyInstance, opts: FastifyPluginOptions & { db: Kysely<Database> }, done: (err?: Error) => void): void {
  const userOf = async (req: Parameters<typeof getAuthUser>[0]) => loadFlagUser(opts.db, (await getAuthUser(req))?.userId ?? null)

  app.post('/ofrep/v1/evaluate/flags', { schema: fromSpec('ofrepEvaluateFlags') }, async (req, reply) => {
    const flags = await evaluateAll(await userOf(req))
    const body: BulkEvaluationSuccessResponse = { flags }
    const etag = `"${createHash('sha1').update(JSON.stringify(flags)).digest('hex')}"`
    reply.header('ETag', etag)
    if (req.headers['if-none-match'] === etag) return reply.code(304).send()
    return body
  })

  app.post<{ Params: { key: string } }>('/ofrep/v1/evaluate/flags/:key', { schema: fromSpec('ofrepEvaluateFlag') }, async (req, reply) => {
    const { key } = req.params
    if (!FLAG_KEYS.includes(key)) {
      const body: EvaluationFailureResponse = { key, errorCode: 'FLAG_NOT_FOUND' as EvaluationFailureResponse['errorCode'] }
      return reply.code(404).send(body)
    }
    const [flag] = (await evaluateAll(await userOf(req))).filter(f => f.key === key)
    const body: EvaluationSuccessResponse = flag
    return body
  })

  done()
}
```

Follow the route typing the other plugins use (`Route<'…'>` from `./route.js` once the spec has the
operations) instead of the inline generic if the typecheck allows; replace the `as` with the
`ErrorCode.FLAG_NOT_FOUND` enum from `@openfeature/core` if lint refuses the assertion.

`schema/api-v1.yaml`: under `paths`, `/ofrep/v1/evaluate/flags` (`post`, operationId `ofrepEvaluateFlags`,
tag `flags`, requestBody optional `{ context: object }`, responses 200 `OfrepBulkResponse`, 304) and
`/ofrep/v1/evaluate/flags/{key}` (`post`, `ofrepEvaluateFlag`, 200 `OfrepEvaluation`, 404 `OfrepFailure`).
Schemas: `OfrepEvaluation { key, value: boolean, reason: string, variant: string }`, `OfrepBulkResponse
{ flags: OfrepEvaluation[] }`, `OfrepFailure { key, errorCode: string }`. Then `npm run gen:api`.

`backend/frontend/vite.config.ts`: `'/ofrep': { target: \`http://${backendHost}:3000\`, changeOrigin: true },`.

- [ ] **Step 3: Run** `npx vitest run src/api/ofrep.test.ts`, typecheck, lint → green.
- [ ] **Step 4: Commit** `feat(flags): serve flags over ofrep`.

---

### Task 3: gate game modes

**Files:**

- Modify: `backend/src/api/games.ts` (`/api/gamemodes`: optional user, leave out flagged-off modes), `backend/src/lobby/errors.ts` (`ConflictCode` + `'game_unavailable'`), `schema/api-v1.yaml` (the `LobbyConflict.code` enum), `backend/src/lobby/service.ts` (a `gameAvailable(userId, gameId)` dep checked in `update` when `nextGame` is set and in `launch`), `backend/src/app.ts` (pass the dep)
- Test: `backend/src/api/games.test.ts`, `backend/src/lobby/service.test.ts`

**Interfaces:**

- `LobbyDeps.gameAvailable: (userId: string, gameId: string) => Promise<boolean>`
- In `app.ts`: `gameAvailable: async (userId, gameId) => { const key = modeFlag(gameId); return key === null || flagEnabled(key, await loadFlagUser(db, userId)) }`
- `GET /api/gamemodes`: unchanged shape; modes whose flag is off for the viewer (or signed out) are left out.

- [ ] **Step 1: Failing tests**
  - `games.test.ts`: signed out → no `minigolf`; an admin session → `minigolf` listed (mock `getAuthUser`/`getRoleAndEmail` as in Task 2; `setupFlags(new Set())` in `beforeAll`). Update the existing "lists the game modes" expectation accordingly.
  - `service.test.ts` (uses the service's test deps): with `gameAvailable` returning false for `minigolf`, `update(host, lobby, { nextGame: { gameId: 'minigolf', config } })` rejects with status 409 and `code: 'game_unavailable'`; with the next game already Minigolf (set while allowed), `start(host, …)` rejects the same way once `gameAvailable` says no; X01 is unaffected.

- [ ] **Step 2: Implement**
  - `lobby/service.ts` `update`: after the unknown-game check, `if (patch.nextGame && !(await this.deps.gameAvailable(userId, patch.nextGame.gameId))) throw LobbyError.conflict({ error: "That game isn't available", code: 'game_unavailable' })`. Same check at the start of `launch` for `game.gameId` with `hostUserId` (covers Start and Rematch).
  - `api/games.ts`: `const user = await loadFlagUser(opts.db, (await getAuthUser(req))?.userId ?? null)`; filter `gameList` with `m => { const k = modeFlag(m.id); return k === null || await flagEnabled(k, user) }` (resolve with `Promise.all` first).
  - `lobby/errors.ts` + the yaml enum: `game_unavailable`; `npm run gen:api`.

- [ ] **Step 3: Run** backend tests (with `TEST_DATABASE_URL`, the lobby service tests use Postgres), typecheck, lint → green.
- [ ] **Step 4: Commit** `feat(flags): put minigolf behind gamemode.minigolf.enabled`.

---

### Task 4: flags in the SPA

**Files:**

- Modify: `backend/frontend/package.json`, `backend/frontend/package-lock.json`
- Create: `backend/frontend/src/lib/flags.ts`, `backend/frontend/src/lib/__tests__/flags.test.ts`
- Modify: `backend/frontend/src/App.svelte` (start flags once, follow the signed-in user), `backend/frontend/src/lib/gameModes.ts` (`GameMode.flag?: string`; Minigolf: `'gamemode.minigolf.enabled'`), `backend/frontend/src/lib/components/GameModeTiles.svelte` (leave out a mode whose flag is off)

**Interfaces:**

- `startFlags(userId: string | null): Promise<void>` — `OpenFeature.setContext({ targetingKey: userId ?? 'anonymous' })` then `OpenFeature.setProviderAndWait(new OFREPWebProvider({ baseUrl: window.location.origin }))`
- `setFlagUser(userId: string | null): Promise<void>` — `OpenFeature.setContext(...)` (the provider refetches on a context change)
- `flag(key: string, fallback = false): Readable<boolean>` — `client.getBooleanValue(key, fallback)` now and on `ProviderEvents.Ready`, `ConfigurationChanged` and `ContextChanged`

- [ ] **Step 1: Install**

```bash
cd backend/frontend && npx -y npm@10 i -E @openfeature/web-sdk@1.10.0 @openfeature/ofrep-web-provider@0.4.3
git diff --stat package-lock.json   # only the new packages
```

- [ ] **Step 2: Failing tests** (`lib/__tests__/flags.test.ts`), with web-sdk's `InMemoryProvider` standing in for OFREP:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { InMemoryProvider, OpenFeature } from '@openfeature/web-sdk'
import { flag } from '$lib/flags'

const config = (on: boolean) => ({ 'gamemode.minigolf.enabled': { variants: { on: true, off: false }, defaultVariant: on ? 'on' : 'off', disabled: false } })

describe('flag()', () => {
  afterEach(() => OpenFeature.clearProviders())

  it('is the fallback (off) until the provider has loaded', () => {
    expect(get(flag('gamemode.minigolf.enabled'))).toBe(false)
  })

  it('follows the provider when its flags change', async () => {
    const provider = new InMemoryProvider(config(false))
    await OpenFeature.setProviderAndWait(provider)
    const values: boolean[] = []
    const stop = flag('gamemode.minigolf.enabled').subscribe(v => values.push(v))
    await provider.putConfiguration(config(true))
    stop()
    expect(values).toEqual([false, true])
  })
})
```

- [ ] **Step 3: Implement** `lib/flags.ts` per the interfaces (handlers added in `readable`'s start, removed in its stop).
      `App.svelte`: after `currentUser.refresh()` in `onMount`, `void startFlags(get(currentUser)?.id ?? null)`; an `$effect`
      that calls `setFlagUser($currentUser?.id ?? null)` when the id changes (skip the first run, `startFlags` set it).
      `GameModeTiles.svelte`: `const minigolfOn = flag('gamemode.minigolf.enabled')`; generalised:
      `const shown = $derived(GAME_MODES.filter(m => !m.flag || flagValues[m.flag]))` with one store per flagged mode
      (build `flag(m.flag)` stores once at module level for the modes that have one).

- [ ] **Step 4: Run** `npm test`, typecheck, lint in `backend/frontend` → green.
- [ ] **Step 5: Commit** `feat(flags): read flags in the spa over ofrep`.

---

### Task 5: e2e, docs

**Files:**

- Modify: `e2e/tests/game-minigolf.spec.ts` (sign in as `e2e-admin@test.local` — the e2e compose already lists it in `ADMIN_EMAILS` — instead of `authedPage`), `e2e/tests/minigolf-bench.spec.ts` (or a new spec): a non-admin's Play page has no Minigolf tile
- Modify: `DEVELOPMENT.md` (`FLAGS_ON` in the env table), `AGENTS.md` (a "Feature flags" row: `backend/src/flags/`, `api/ofrep.ts`, `lib/flags.ts`; how to add a flag)

- [ ] **Step 1:** Update the e2e tests; run `cd e2e && npx playwright test game-minigolf minigolf-bench`.
- [ ] **Step 2:** Docs.
- [ ] **Step 3:** Full run: backend tests (with DB), frontend tests, both typechecks and lints, `npm run format:check`.
- [ ] **Step 4: Commit** `test(flags): play minigolf as an admin, hide it from others`; push.
