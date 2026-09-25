# Dartcade Auth v1 — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a self-hosted auth layer to the Dartcade backend — user accounts with username + password login via better-auth, per-board API tokens for bridge connections, and board ownership that ties physical boards to user accounts. All routes are gated behind auth. The auth implementation sits behind a clean interface so it can be swapped for a managed service (Clerk, Auth0) later.

**Architecture:** better-auth handles user/session management, mounted at `/api/auth/*`. A single `getAuthUser(req)` function is the only swappable boundary — everything else calls it. Bridge auth stays separate: per-board tokens replace the shared `BRIDGE_SECRET`. Dev mode seeds `admin:admin` + a `Dev Board` with a known token so `docker compose up` keeps working.

---

## Global Constraints

- better-auth v1 with Kysely adapter + emailAndPassword plugin
- `@node-rs/argon2` is used internally by better-auth — do not add a separate password-hashing dep
- The `getAuthUser(req)` function in `src/auth/session.ts` is the ONLY place that imports better-auth session APIs — this is the swappable boundary
- Rename existing `sessions` table → `game_sessions` (avoid collision with better-auth's `session` table)
- `BRIDGE_SECRET` env var is removed; replaced by per-board tokens in the `boards` DB table
- Dev seed runs only when `NODE_ENV=development`; never in production
- All routes except `GET /health`, `GET /api/games`, and `POST /api/auth/*` require a valid session

---

## Review Focus

1. **Token shown only once** — the raw board token must be returned exactly once at `POST /api/boards` and never stored or retrievable again. Only `sha256(token)` persists in the DB.
2. **Ownership checks** — `POST /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`, `DELETE /api/boards/:id` must verify `boards.owner_user_id = req.userId` before acting.
3. **Bridge token lookup is timing-safe** — use `timingSafeEqual` when comparing hashed tokens to prevent timing attacks.
4. **Dev seed is idempotent** — running the seed twice must not create duplicate users or boards (use `INSERT ... ON CONFLICT DO NOTHING` or equivalent).
5. **WS auth on upgrade** — `/ws?sessionId=` validates the better-auth session cookie at upgrade time; unauthenticated connections must be closed, not silently accepted.

---

## 1. Repository structure additions

```
backend/
  src/
    auth/
      index.ts        — better-auth init, export `auth` instance
      session.ts      — getAuthUser(req): Promise<{ userId: string } | null>  ← swappable boundary
      middleware.ts   — requireAuth Fastify preHandler (calls getAuthUser)
      seed.ts         — dev seed: admin:admin + Dev Board
    api/
      boards.ts       — GET/POST/DELETE /api/boards
    db/
      migrations/
        002_auth.sql  — users, session, boards tables; rename sessions→game_sessions
```

Files changed from existing:
- `backend/src/db/schema.ts` — add `UsersTable`, `SessionTable`, `BoardsTable`; rename `SessionsTable` → `GameSessionsTable`
- `backend/src/db/queries.ts` — add board queries; update session queries to use `game_sessions`
- `backend/src/bridge-gw/handler.ts` — replace env var auth with DB token lookup
- `backend/src/api/sessions.ts` — add `requireAuth` preHandler + ownership checks
- `backend/src/index.ts` — mount better-auth handler, wire auth, call seed

---

## 2. Database schema

Migration `002_auth.sql`:

```sql
-- better-auth managed tables
CREATE TABLE IF NOT EXISTS "user" (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  account_id            TEXT NOT NULL,
  provider_id           TEXT NOT NULL,
  user_id               TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  access_token          TEXT,
  refresh_token         TEXT,
  id_token              TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scope                 TEXT,
  password              TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "session" (
  id         TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Boards (owned by users)
CREATE TABLE IF NOT EXISTS boards (
  id            TEXT PRIMARY KEY,              -- ULID
  owner_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,          -- SHA-256(raw token), hex
  hardware_id   TEXT,                          -- board_id reported by bridge on first connect
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rename sessions → game_sessions
ALTER TABLE sessions RENAME TO game_sessions;

-- Update FK: game_sessions.board_id now references boards(id) instead of raw text
-- NOTE: existing rows reference hardware board_ids (no boards rows yet) — safe to
-- drop the column and re-add as nullable FK for migration, then make NOT NULL after backfill.
-- For a fresh install this is simply:
ALTER TABLE game_sessions
  ADD COLUMN board_db_id TEXT REFERENCES boards(id);
-- (legacy board_id TEXT column remains for reference; new sessions use board_db_id)
```

> **Migration note:** The `game_sessions` rename + FK change is the trickiest part. For a fresh install
> (no existing data), the migration can simply rename the table and add the FK column. The session
> engine must be updated to use `board_db_id` (our boards ULID) as the key, not the raw hardware ID.

---

## 3. Auth layer (`src/auth/`)

### `src/auth/index.ts`

```ts
import { betterAuth } from 'better-auth'
import { kyselyAdapter } from 'better-auth/adapters/kysely'
import { db } from '../db/index.js'

export const auth = betterAuth({
  database: kyselyAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
})
```

> **Email as identifier:** Users register and log in with email + password. The `name` field is a display name (e.g. "Alice"). Login form sends `{ email, password }` to `POST /api/auth/sign-in/email`. Dev seed uses `admin@dartcade.local` / `admin`.

### `src/auth/session.ts` — the swappable boundary

```ts
import type { FastifyRequest } from 'fastify'
import { auth } from './index.js'
import { fromNodeHeaders } from 'better-auth/node'

export async function getAuthUser(
  req: FastifyRequest,
): Promise<{ userId: string } | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  })
  return session ? { userId: session.user.id } : null
}
```

To swap to Clerk/Auth0: replace this file only. Everything else is unchanged.

### `src/auth/middleware.ts`

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import { getAuthUser } from './session.js'

export async function requireAuth(
  req: FastifyRequest & { userId?: string },
  reply: FastifyReply,
): Promise<void> {
  const user = await getAuthUser(req)
  if (!user) {
    reply.code(401).send({ error: 'unauthorized' })
    return
  }
  req.userId = user.userId
}
```

Applied as `preHandler` on all protected routes via Fastify's route options.

### `src/auth/seed.ts`

```ts
export async function seedDev(): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return

  // Ensure admin user exists
  const existing = await db.selectFrom('user').where('email', '=', 'admin@dartcade.local').executeTakeFirst()
  if (!existing) {
    await auth.api.signUpEmail({ body: { email: 'admin@dartcade.local', password: 'admin', name: 'Admin' } })
  }

  // Ensure Dev Board exists with known token (owned by admin)
  const admin = await db.selectFrom('user').select('id').where('email', '=', 'admin@dartcade.local').executeTakeFirstOrThrow()
  const DEV_TOKEN = 'dev-bridge-token'
  const tokenHash = createHash('sha256').update(DEV_TOKEN).digest('hex')
  await db.insertInto('boards')
    .values({ id: ulid(), owner_user_id: admin.id, name: 'Dev Board', token_hash: tokenHash })
    .onConflict(oc => oc.column('token_hash').doNothing())
    .execute()
}
```

---

## 4. Board routes (`src/api/boards.ts`)

```
GET  /api/boards
  → 200 { boards: [{ id, name, hardwareId, createdAt }] }
  — returns only boards owned by req.userId

POST /api/boards
  Body: { name: string }
  → 201 { id, name, token }   ← token returned ONCE, never again
  — generates ULID + 32-byte random token; stores SHA-256(token)

DELETE /api/boards/:id
  → 204
  — ownership check; also sets any active game_sessions to finished
```

Token generation:
```ts
const rawToken = randomBytes(32).toString('hex')   // 64-char hex
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
```

---

## 5. Bridge gateway changes (`src/bridge-gw/handler.ts`)

**Auth change:** replace `checkSecret(provided, env.BRIDGE_SECRET)` with a DB lookup:

```ts
const tokenHash = createHash('sha256').update(provided).digest('hex')
const board = await db.selectFrom('boards')
  .selectAll()
  .where('token_hash', '=', tokenHash)
  .executeTakeFirst()
if (!board) { socket.close(4401, 'unauthorized'); return }
```

`BridgeConn` gains `boardDbId: string` (the `boards.id` ULID). All downstream code that used the hardware `board_id` string as a key switches to `boardDbId`.

On first envelope, if `board.hardware_id` is null, update it with the reported `board_id` from the wire.

`BRIDGE_SECRET` env var is removed from `index.ts` and `docker-compose.yaml`.

---

## 6. Session engine + API changes

**Session engine (`session/engine.ts`):**
- `create(boardDbId, ...)` takes the `boards.id` ULID (not hardware board_id)
- Internal maps key on `boardDbId`
- `game_sessions.board_db_id` FK used for persistence

**Session API (`api/sessions.ts`):**
- `POST /api/sessions` — add `requireAuth` preHandler; verify `board.owner_user_id = req.userId`
- `GET /api/sessions` — filter by `req.userId`'s boards
- `GET /api/sessions/:id` — ownership check
- `DELETE /api/sessions/:id` — ownership check

**Browser gateway (`browser-gw/handler.ts`):**
- Validate session cookie at WS upgrade: call `getAuthUser(req)` before accepting connection

---

## 7. Frontend additions

Two new routes + minor changes to existing:

**`/login` — `Login.svelte`**
- Email + password form → `POST /api/auth/sign-in/email`
- Register form → `POST /api/auth/sign-up/email` (requires email, password, name)
- Redirects to `/` on success
- App root redirects to `/login` if no active session

**`/boards` — `Boards.svelte`** (accessible from nav)
- Lists user's boards (`GET /api/boards`)
- "Add board" → `POST /api/boards` → shows token in a one-time modal with copy button
- Delete board with confirmation

**`CreateSession.svelte` change:**
- Replace free-text `boardId` input with a dropdown populated from `GET /api/boards`

---

## 8. Docker / environment changes

**`docker-compose.dev.yaml` bridge service:**
```yaml
bridge:
  environment:
    BRIDGE_BACKEND_URL: ws://backend:3000/bridge?token=dev-bridge-token
    # BRIDGE_SECRET removed
```

**`backend/docker-compose.yaml`:**
- Remove `BRIDGE_SECRET` env var
- No new env vars needed (token auth is DB-driven)

**`.env.example`:**
- Remove `BRIDGE_SECRET=`
- No replacement needed

---

## 9. Swappability contract

The contract is one function signature:

```ts
// src/auth/session.ts
export async function getAuthUser(
  req: FastifyRequest,
): Promise<{ userId: string } | null>
```

To replace better-auth with Clerk: delete `src/auth/index.ts` and rewrite `src/auth/session.ts` to call Clerk's SDK. `middleware.ts`, all route handlers, and `index.ts` are unchanged.

The auth routes themselves (`/api/auth/*`) would move to Clerk's hosted UI — remove the better-auth handler mount from `index.ts` and update the frontend login page to redirect to Clerk.
