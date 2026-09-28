# Board Pairing Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bridge auto-pairs on first run (no token in config) via a device-code-like flow; users enter an 8-char code on the Boards page to claim it and name the board.

**Architecture:** The bridge POSTs to `/api/pairing/request` (no auth) to get a code, displays it, then polls `/api/pairing/:code/token` every 2 s. A logged-in user submits the code + board name via `POST /api/pairing/claim`; the backend creates the board and deposits the raw token. The bridge receives it once, saves it to the config TOML, and continues connecting normally. If a token is already present at startup (config, env, or flag), pairing is skipped — this is the dev path.

**Tech Stack:** TypeScript/Fastify 4 + Kysely + Postgres (backend), Go 1.23 + koanf + coder/websocket (bridge), Svelte 5 (frontend), `@fastify/rate-limit` v9 (new dep).

**Spec:** `docs/superpowers/specs/2026-09-28-board-pairing-design.md`

## Global Constraints

- `@fastify/rate-limit` must be **v9.x** (Fastify 4 compatible; v10+ requires Fastify 5).
- Code charset is exactly `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (uppercase, no `0/O/1/I`).
- Code length is exactly 8 characters.
- Codes expire 10 minutes after creation.
- `raw_token` in `pairing_codes` must be nulled after the **first** delivery poll.
- The bridge constructs its WS URL as `cfg.BackendURL + "?token=" + cfg.Token`.
- `persistToken` appends `token = "<value>"` to the TOML file at mode 0600 — identical pattern to `persistBridgeID`.
- Rate limits: `/api/pairing/request` → 10 req/min/IP; `/api/pairing/:code/token` → 5 req/min/IP.

## Review Focus

- **Expired code during claim (`expires_at` just passed while user typed the name):** `POST /api/pairing/claim` should return 410, not 404 or 500.
- **Race: two browsers claim the same code simultaneously:** second claim hits a row with `claimed_at` already set and must return 409.
- **`GET /api/pairing/:code/token` after token already delivered (`raw_token` is null, `claimed_at` set):** must return `{ status: "consumed" }`, not a server error on null dereference.
- **Bridge `toHTTPBase` receives an already-HTTP URL (dev setup with `http://`):** must pass through unchanged rather than corrupting it — covers `http://` and `https://` inputs.
- **Bridge polling after code expires (404 from server):** `runPairing` must return a descriptive error and `main.go` must call `log.Fatal`, not silently continue with an empty token.

---

## Task 1: DB migration, schema types, and query functions

**Files:**
- Create: `backend/src/db/migrations/004_pairing.sql`
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/db/queries.ts`
- Modify: `backend/src/db/queries.test.ts`

**Interfaces:**
- Produces:
  - `insertPairingCode(db, { code: string, expiresAt: Date }): Promise<void>`
  - `getPairingCode(db, code: string): Promise<PairingCodesRow | undefined>`
  - `claimPairingCode(db, { code: string, rawToken: string, boardId: string }): Promise<void>`
  - `consumePairingToken(db, code: string): Promise<void>`
  - `PairingCodesRow` type (from Kysely select on `pairing_codes`)

---

- [ ] **Step 1: Write the migration**

Create `backend/src/db/migrations/004_pairing.sql`:

```sql
CREATE TABLE pairing_codes (
  code        TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  claimed_at  TIMESTAMPTZ,
  raw_token   TEXT,
  board_id    TEXT REFERENCES boards(id) ON DELETE CASCADE
);
CREATE INDEX pairing_codes_expires ON pairing_codes (expires_at);
```

- [ ] **Step 2: Add the schema type**

In `backend/src/db/schema.ts`, add after `BoardsTable`:

```ts
export interface PairingCodesTable {
  code: string
  created_at: ColumnType<Date, never, never>
  expires_at: Date
  claimed_at: Date | null
  raw_token: string | null
  board_id: string | null
}
```

Extend the `Database` interface:

```ts
export interface Database {
  user: UserTable
  boards: BoardsTable
  pairing_codes: PairingCodesTable   // add this line
  game_sessions: GameSessionsTable
  bridge_events: BridgeEventsTable
}
```

- [ ] **Step 3: Write the failing integration tests**

In `backend/src/db/queries.test.ts`, add to the `beforeAll` cleanup block (after the existing `deleteFrom` calls):

```ts
await db.deleteFrom('pairing_codes').execute()
```

Then add a new `describe` block at the bottom of the file:

```ts
describe('pairing_codes queries', () => {
  const code = 'TESTCODE'
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

  it('insertPairingCode creates a pending row', async () => {
    await insertPairingCode(db, { code, expiresAt })
    const row = await getPairingCode(db, code)
    expect(row).toBeDefined()
    expect(row!.code).toBe(code)
    expect(row!.claimed_at).toBeNull()
    expect(row!.raw_token).toBeNull()
    expect(row!.board_id).toBeNull()
  })

  it('getPairingCode returns undefined for unknown code', async () => {
    const row = await getPairingCode(db, 'NOTEXIST')
    expect(row).toBeUndefined()
  })

  it('claimPairingCode sets claimed_at, raw_token, and board_id', async () => {
    await insertBoard(db, {
      id: 'board-pair-1',
      owner_user_id: 'u-test-1',
      name: 'Paired Board',
      token_hash: 'hash-pair-1',
    })
    await claimPairingCode(db, { code, rawToken: 'secret-token', boardId: 'board-pair-1' })
    const row = await getPairingCode(db, code)
    expect(row!.claimed_at).not.toBeNull()
    expect(row!.raw_token).toBe('secret-token')
    expect(row!.board_id).toBe('board-pair-1')
  })

  it('consumePairingToken nulls out raw_token', async () => {
    await consumePairingToken(db, code)
    const row = await getPairingCode(db, code)
    expect(row!.raw_token).toBeNull()
    expect(row!.claimed_at).not.toBeNull()
  })
})
```

Also update the import at the top of the test file to include the four new functions:

```ts
import {
  runMigrations,
  insertGameSession,
  getActiveGameSessions,
  getGameSessionById,
  setGameSessionFinished,
  insertBridgeEvent,
  getBridgeEventsForBoardDbId,
  insertBoard,
  insertPairingCode,    // add
  getPairingCode,       // add
  claimPairingCode,     // add
  consumePairingToken,  // add
} from './queries.js'
```

- [ ] **Step 4: Run tests to confirm they fail (functions not yet exported)**

Run from `backend/`: `npx vitest run src/db/queries.test.ts`

With `TEST_DATABASE_URL` unset the pairing describe block is skipped — that's expected. With `TEST_DATABASE_URL` set you should see failures on the new imports.

- [ ] **Step 5: Implement the four query functions**

Add to the bottom of the `// Boards` section in `backend/src/db/queries.ts`:

```ts
// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

export async function insertPairingCode(
  db: Kysely<Database>,
  p: { code: string; expiresAt: Date },
): Promise<void> {
  await db.insertInto('pairing_codes')
    .values({ code: p.code, expires_at: p.expiresAt })
    .execute()
}

export async function getPairingCode(db: Kysely<Database>, code: string) {
  return db.selectFrom('pairing_codes')
    .selectAll()
    .where('code', '=', code)
    .executeTakeFirst()
}

export async function claimPairingCode(
  db: Kysely<Database>,
  p: { code: string; rawToken: string; boardId: string },
): Promise<void> {
  await db.updateTable('pairing_codes')
    .set({ claimed_at: new Date(), raw_token: p.rawToken, board_id: p.boardId })
    .where('code', '=', p.code)
    .execute()
}

export async function consumePairingToken(db: Kysely<Database>, code: string): Promise<void> {
  await db.updateTable('pairing_codes')
    .set({ raw_token: null })
    .where('code', '=', code)
    .execute()
}
```

- [ ] **Step 6: Run integration tests to confirm they pass**

With `TEST_DATABASE_URL` pointing at a test Postgres instance:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test \
  npx vitest run src/db/queries.test.ts
```

Expected: all tests pass, including the new `pairing_codes queries` describe block.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/migrations/004_pairing.sql \
        backend/src/db/schema.ts \
        backend/src/db/queries.ts \
        backend/src/db/queries.test.ts
git commit -m "feat(db): pairing_codes table, schema types, and query functions"
```

---

## Task 2: Backend pairing API

**Files:**
- Create: `backend/src/api/pairing.ts`
- Create: `backend/src/api/pairing.test.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json` (new dep: `@fastify/rate-limit@^9`)

**Interfaces:**
- Consumes: `insertPairingCode`, `getPairingCode`, `claimPairingCode`, `consumePairingToken`, `insertBoard` from `../db/queries.js`; `requireAuth` from `../auth/middleware.js`
- Produces: `pairingApiPlugin(app, { db })` — registers 3 routes on the Fastify instance

---

- [ ] **Step 1: Install the rate-limit dependency**

```bash
cd backend && npm install @fastify/rate-limit@^9
```

Confirm `package.json` now lists `"@fastify/rate-limit": "^9.x.x"`.

- [ ] **Step 2: Write the failing unit tests**

Create `backend/src/api/pairing.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { pairingApiPlugin } from './pairing.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: async (req: any, _reply: any) => { req.userId = 'user-1' },
}))

vi.mock('../db/queries.js', () => ({
  insertPairingCode: vi.fn().mockResolvedValue(undefined),
  getPairingCode: vi.fn().mockResolvedValue(undefined),
  claimPairingCode: vi.fn().mockResolvedValue(undefined),
  consumePairingToken: vi.fn().mockResolvedValue(undefined),
  insertBoard: vi.fn().mockResolvedValue(undefined),
}))

import * as queries from '../db/queries.js'

beforeEach(() => vi.clearAllMocks())

function makeApp() {
  const app = Fastify()
  app.register(rateLimit, { max: 1000, timeWindow: '1 minute' })
  app.register(pairingApiPlugin, { db: {} as any })
  return app
}

// ---- POST /api/pairing/request ----

describe('POST /api/pairing/request', () => {
  it('returns 201 with an 8-char uppercase code and expiresAt', async () => {
    const app = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/pairing/request' })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect(typeof body.expiresAt).toBe('string')
    expect(queries.insertPairingCode).toHaveBeenCalledOnce()
  })
})

// ---- GET /api/pairing/:code/token ----

describe('GET /api/pairing/:code/token', () => {
  it('returns 404 when code not found', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue(undefined)
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 when code is expired', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() - 1000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(404)
  })

  it('returns pending when code exists and not yet claimed', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('pending')
    expect(queries.consumePairingToken).not.toHaveBeenCalled()
  })

  it('returns claimed+token and consumes on first delivery', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: 'secret-abc',
      board_id: 'board-1',
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('claimed')
    expect(body.token).toBe('secret-abc')
    expect(queries.consumePairingToken).toHaveBeenCalledWith(expect.anything(), 'ABCD1234')
  })

  it('returns consumed when raw_token already nulled', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: null,
      board_id: 'board-1',
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({ method: 'GET', url: '/api/pairing/ABCD1234/token' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('consumed')
    expect(queries.consumePairingToken).not.toHaveBeenCalled()
  })
})

// ---- POST /api/pairing/claim ----

describe('POST /api/pairing/claim', () => {
  it('returns 400 when code or name is missing', async () => {
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { name: 'Living Room' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 404 when code does not exist', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue(undefined)
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 410 when code is expired', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() - 1000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(410)
  })

  it('returns 409 when code is already claimed', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: new Date(),
      raw_token: 'tok',
      board_id: 'b1',
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(409)
  })

  it('returns 201 with boardId and name on success', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'ABCD1234', name: 'Living Room' },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(typeof body.boardId).toBe('string')
    expect(body.name).toBe('Living Room')
    expect(queries.insertBoard).toHaveBeenCalledOnce()
    expect(queries.claimPairingCode).toHaveBeenCalledOnce()
  })

  it('accepts lowercase code by uppercasing it', async () => {
    vi.mocked(queries.getPairingCode).mockResolvedValue({
      code: 'ABCD1234',
      expires_at: new Date(Date.now() + 60_000),
      claimed_at: null,
      raw_token: null,
      board_id: null,
      created_at: new Date() as any,
    })
    const app = makeApp()
    const res = await app.inject({
      method: 'POST', url: '/api/pairing/claim',
      payload: { code: 'abcd1234', name: 'Board' },
    })
    expect(res.statusCode).toBe(201)
    expect(queries.getPairingCode).toHaveBeenCalledWith(expect.anything(), 'ABCD1234')
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd backend && npx vitest run src/api/pairing.test.ts
```

Expected: import error — `pairingApiPlugin` not found.

- [ ] **Step 4: Implement `pairingApiPlugin`**

Create `backend/src/api/pairing.ts`:

```ts
import { createHash, randomBytes } from 'crypto'
import { ulid } from 'ulid'
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import {
  insertPairingCode,
  getPairingCode,
  claimPairingCode,
  consumePairingToken,
  insertBoard,
} from '../db/queries.js'

const CODE_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 10 * 60 * 1000

function generateCode(): string {
  const bytes = randomBytes(8)
  return Array.from(bytes, b => CODE_CHARSET[b % CODE_CHARSET.length]).join('')
}

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

export async function pairingApiPlugin(app: FastifyInstance, opts: Opts): Promise<void> {
  const { db } = opts

  app.post('/api/pairing/request', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (_req, reply) => {
    const code = generateCode()
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)
    await insertPairingCode(db, { code, expiresAt })
    return reply.code(201).send({ code, expiresAt: expiresAt.toISOString() })
  })

  app.get('/api/pairing/:code/token', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { code } = req.params as { code: string }
    const row = await getPairingCode(db, code.toUpperCase())

    if (!row || row.expires_at < new Date()) {
      return reply.code(404).send({ error: 'not found' })
    }
    if (!row.claimed_at) {
      return reply.send({ status: 'pending' })
    }
    if (!row.raw_token) {
      return reply.send({ status: 'consumed' })
    }
    await consumePairingToken(db, row.code)
    return reply.send({ status: 'claimed', token: row.raw_token })
  })

  app.post('/api/pairing/claim', { preHandler: requireAuth }, async (req, reply) => {
    const { code, name } = req.body as { code?: string; name?: string }
    if (!code?.trim() || !name?.trim()) {
      return reply.code(400).send({ error: 'code and name required' })
    }
    const row = await getPairingCode(db, code.trim().toUpperCase())
    if (!row) return reply.code(404).send({ error: 'not found' })
    if (row.expires_at < new Date()) return reply.code(410).send({ error: 'expired' })
    if (row.claimed_at) return reply.code(409).send({ error: 'already claimed' })

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const boardId = ulid()

    await insertBoard(db, { id: boardId, owner_user_id: req.userId, name: name.trim(), token_hash: tokenHash })
    await claimPairingCode(db, { code: row.code, rawToken, boardId })

    return reply.code(201).send({ boardId, name: name.trim() })
  })
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/api/pairing.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Register rate-limit and pairing plugin in `src/index.ts`**

Add the import at the top of `src/index.ts` (after the existing imports):

```ts
import rateLimit from '@fastify/rate-limit'
import { pairingApiPlugin } from './api/pairing.js'
```

Register `rateLimit` **before** any other plugins (just after `await app.register(fastifyWebsocket)`):

```ts
await app.register(rateLimit, { max: 200, timeWindow: '1 minute' })
```

Register the pairing plugin alongside the other API plugins:

```ts
await app.register(pairingApiPlugin, { db })
```

- [ ] **Step 7: Run the full test suite**

```bash
cd backend && npx vitest run
```

Expected: all existing tests still pass plus the new pairing tests.

- [ ] **Step 8: Commit**

```bash
git add backend/src/api/pairing.ts \
        backend/src/api/pairing.test.ts \
        backend/src/index.ts \
        backend/package.json \
        backend/package-lock.json
git commit -m "feat(api): board pairing endpoints with rate limiting"
```

---

## Task 3: Bridge startup pairing flow

**Files:**
- Modify: `bridge/cmd/bridge/config.go`
- Modify: `bridge/cmd/bridge/main.go`

**Interfaces:**
- Consumes: `loadConfig` (already exists), `configFilePath` (make exported or call from `main.go`)
- Produces:
  - `runPairing(ctx context.Context, cfg Config) (token string, err error)`
  - `persistToken(path, token string)`
  - `toHTTPBase(wsURL string) string` (unexported, testable via `config_test.go`)

---

- [ ] **Step 1: Write failing Go tests**

Create `bridge/cmd/bridge/config_test.go`:

```go
package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestToHTTPBase(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"wss://dartcade.example.com", "https://dartcade.example.com"},
		{"ws://localhost:3000", "http://localhost:3000"},
		{"https://already.example.com", "https://already.example.com"},
		{"http://localhost:3000", "http://localhost:3000"},
	}
	for _, tc := range cases {
		got := toHTTPBase(tc.in)
		if got != tc.want {
			t.Errorf("toHTTPBase(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestPersistToken(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bridge.toml")
	persistToken(path, "mytoken123")

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `token = "mytoken123"`) {
		t.Errorf("token not written, got: %s", data)
	}
	// File should be mode 0600
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0600 {
		t.Errorf("expected 0600, got %o", info.Mode().Perm())
	}
}

func TestRunPairing_Success(t *testing.T) {
	expiry := time.Now().Add(10 * time.Minute)

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/api/pairing/"):
			callCount++
			if callCount < 2 {
				json.NewEncoder(w).Encode(map[string]string{"status": "pending"})
			} else {
				json.NewEncoder(w).Encode(map[string]string{"status": "claimed", "token": "tok-secret"})
			}
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	token, err := runPairing(context.Background(), cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if token != "tok-secret" {
		t.Errorf("got token %q, want %q", token, "tok-secret")
	}
}

func TestRunPairing_Expired(t *testing.T) {
	// Server always returns 404 (code expired or not found)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == "POST" && r.URL.Path == "/api/pairing/request":
			// Return an expiry 100ms from now so the deadline fires quickly
			expiry := time.Now().Add(100 * time.Millisecond)
			json.NewEncoder(w).Encode(map[string]string{
				"code":      "ABCD1234",
				"expiresAt": expiry.Format(time.RFC3339),
			})
		default:
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
		}
	}))
	defer srv.Close()

	cfg := Config{BackendURL: srv.URL, BridgeID: "br_test"}
	_, err := runPairing(context.Background(), cfg)
	if err == nil {
		t.Fatal("expected an error for expired code, got nil")
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd bridge && go test ./cmd/bridge/ -run "TestToHTTPBase|TestPersistToken|TestRunPairing" -v
```

Expected: compile errors — `toHTTPBase`, `persistToken`, `runPairing` not defined.

- [ ] **Step 3: Add `Token` field, `toHTTPBase`, `persistToken`, and `runPairing` to `config.go`**

In `Config` struct, add after `LogLevel`:

```go
Token string `koanf:"token"`
```

Add flag parsing in `loadConfig`'s `overrides` map in `main.go` — handled in step 4. For now, it is loaded from TOML/env via koanf automatically.

Add these functions to `config.go` (after `persistBridgeID`):

```go
func persistToken(path, token string) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "\ntoken = %q\n", token)
}

func toHTTPBase(wsURL string) string {
	switch {
	case strings.HasPrefix(wsURL, "wss://"):
		return "https://" + strings.TrimPrefix(wsURL, "wss://")
	case strings.HasPrefix(wsURL, "ws://"):
		return "http://" + strings.TrimPrefix(wsURL, "ws://")
	default:
		return wsURL
	}
}

func runPairing(ctx context.Context, cfg Config) (string, error) {
	httpBase := toHTTPBase(cfg.BackendURL)

	reqBody := strings.NewReader("{}")
	resp, err := http.Post(httpBase+"/api/pairing/request", "application/json", reqBody) //nolint:noctx
	if err != nil {
		return "", fmt.Errorf("pairing request: %w", err)
	}
	defer resp.Body.Close()

	var pairResp struct {
		Code      string `json:"code"`
		ExpiresAt string `json:"expiresAt"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&pairResp); err != nil {
		return "", fmt.Errorf("pairing request decode: %w", err)
	}

	expiresAt, err := time.Parse(time.RFC3339, pairResp.ExpiresAt)
	if err != nil {
		return "", fmt.Errorf("pairing expiry parse: %w", err)
	}
	remaining := time.Until(expiresAt).Round(time.Second)

	log.Info("bridge not paired — visit the web UI to complete setup",
		"code", pairResp.Code,
		"url", httpBase,
		"expires_in", remaining,
	)

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	deadline := time.NewTimer(time.Until(expiresAt))
	defer deadline.Stop()

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-deadline.C:
			return "", fmt.Errorf("pairing code %s expired before it was claimed", pairResp.Code)
		case <-ticker.C:
			token, done, err := pollPairingToken(ctx, httpBase, pairResp.Code)
			if err != nil {
				return "", err
			}
			if done {
				return token, nil
			}
		}
	}
}

func pollPairingToken(ctx context.Context, httpBase, code string) (token string, done bool, err error) {
	req, err := http.NewRequestWithContext(ctx, "GET", httpBase+"/api/pairing/"+code+"/token", nil)
	if err != nil {
		return "", false, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		log.Warn("polling pairing token failed, will retry", "err", err)
		return "", false, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		return "", false, fmt.Errorf("pairing code %s not found or expired", code)
	}

	var body struct {
		Status string `json:"status"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		log.Warn("polling response decode error, will retry", "err", err)
		return "", false, nil
	}

	switch body.Status {
	case "claimed":
		return body.Token, true, nil
	case "consumed":
		return "", false, fmt.Errorf("pairing token already consumed — restart bridge to generate a new code")
	default:
		return "", false, nil // still pending
	}
}
```

Add the required imports to `config.go` — you'll need `"context"`, `"encoding/json"`, `"net/http"`, `"strings"`:

```go
import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/knadh/koanf/parsers/toml/v2"
	"github.com/knadh/koanf/providers/env/v2"
	"github.com/knadh/koanf/providers/file"
	"github.com/knadh/koanf/v2"
	"github.com/oklog/ulid/v2"
)
```

- [ ] **Step 4: Update `main.go` — token flag, pairing gate, and WS URL construction**

In `main.go`, add `--token` to the flag set (after `logLevel`):

```go
token := fs.String("token", "", "Bridge authentication token")
```

Add `"token": *token` to the `overrides` map passed to `loadConfig`:

```go
cfg, err := loadConfig(map[string]string{
    "board_url":   *boardURL,
    "backend_url": *backendURL,
    "bridge_id":   *bridgeID,
    "log_level":   *logLevel,
    "token":       *token,
})
```

After the `loadConfig` call and `setLogLevel` call, add the pairing gate:

```go
if cfg.Token == "" {
    log.Info("no token configured — starting pairing flow")
    pairedToken, err := runPairing(ctx, cfg)
    if err != nil {
        log.Fatal("pairing failed", "err", err)
    }
    cfg.Token = pairedToken
    if cfgPath, _ := configFilePath(); cfgPath != "" {
        persistToken(cfgPath, cfg.Token)
    }
}
```

Update the transport construction to append the token to the WS URL:

```go
tr := transport.New(transport.Config{
    BackendURL: cfg.BackendURL + "?token=" + cfg.Token,
    BridgeID:   cfg.BridgeID,
    BootID:     bootID,
    BoardID:    client.BoardID(),
    BMVersion:  client.BMVersion(),
    BMUrl:      cfg.BoardURL,
}, exec)
```

- [ ] **Step 5: Run Go tests to confirm they pass**

```bash
cd bridge && go test ./cmd/bridge/ -run "TestToHTTPBase|TestPersistToken|TestRunPairing" -v
```

Expected: all three test functions pass.

- [ ] **Step 6: Build the binary to confirm no compile errors**

```bash
cd bridge && go build ./cmd/bridge/
```

Expected: binary `bridge` produced without errors.

- [ ] **Step 7: Commit**

```bash
git add bridge/cmd/bridge/config.go \
        bridge/cmd/bridge/config_test.go \
        bridge/cmd/bridge/main.go
git commit -m "feat(bridge): auto-pairing flow on startup when no token is configured"
```

---

## Task 4: Frontend pairing modal

**Files:**
- Modify: `backend/frontend/src/routes/Boards.svelte`

**Interfaces:**
- Consumes: `POST /api/pairing/claim` → `{ code, name }` → `{ boardId, name }` or error

---

- [ ] **Step 1: Add pairing state and submit logic to `Boards.svelte`**

In the `<script>` block, add after the existing `let` declarations:

```ts
let pairOpen = $state(false)
let pairCode = $state('')
let pairName = $state('')
let pairError = $state<string | null>(null)
let pairLoading = $state(false)

async function submitPair() {
  pairError = null
  pairLoading = true
  try {
    const res = await fetch('/api/pairing/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pairCode.toUpperCase().trim(), name: pairName.trim() }),
    })
    if (res.ok) {
      pairOpen = false
      pairCode = ''
      pairName = ''
      const d = await fetch('/api/boards').then(r => r.json())
      boards = d.boards ?? []
    } else {
      const body = await res.json().catch(() => ({}))
      if (res.status === 404) pairError = 'Code not found — check it and try again'
      else if (res.status === 410) pairError = 'Code has expired — restart the bridge to get a new one'
      else if (res.status === 409) pairError = 'Code already used'
      else pairError = body.error ?? 'Something went wrong'
    }
  } catch {
    pairError = 'Network error — check your connection'
  } finally {
    pairLoading = false
  }
}
```

- [ ] **Step 2: Wire the "Pair new board" button**

Find the existing button:

```svelte
<Button variant="primary" class="h-12 text-[18px]">
```

Replace with:

```svelte
<Button variant="primary" class="h-12 text-[18px]" onclick={() => { pairOpen = true }}>
```

- [ ] **Step 3: Add the modal markup**

Inside `<main>`, just before the closing `</main>` tag, add:

```svelte
{#if pairOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
       role="dialog" aria-modal="true">
    <div class="w-full max-w-md box-border p-8 rounded-[18px] bg-surface-1 border border-line-2
                flex flex-col gap-6">
      <h2 class="m-0 font-display font-bold text-[28px] uppercase">Pair new board</h2>
      <p class="m-0 text-[14px] text-text-muted">
        Run <code class="font-mono bg-surface-2 px-1 rounded">dartcade-bridge</code> on your
        board's machine, then enter the code it displays.
      </p>
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <label class="text-[13px] text-text-dim" for="pair-code">Pairing code</label>
          <input
            id="pair-code"
            type="text"
            maxlength="8"
            placeholder="ABCD1234"
            class="h-11 px-3 rounded-[10px] bg-surface-2 border border-line-2 font-mono text-[18px]
                   uppercase tracking-widest text-center focus:outline-none focus:border-accent"
            bind:value={pairCode}
            oninput={() => { pairCode = pairCode.toUpperCase() }}
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-[13px] text-text-dim" for="pair-name">Board name</label>
          <input
            id="pair-name"
            type="text"
            placeholder="Living Room"
            class="h-11 px-3 rounded-[10px] bg-surface-2 border border-line-2 text-[15px]
                   focus:outline-none focus:border-accent"
            bind:value={pairName}
          />
        </div>
        {#if pairError}
          <p class="m-0 text-[13px] text-red-400">{pairError}</p>
        {/if}
      </div>
      <div class="flex gap-3 justify-end">
        <Button variant="ghost" onclick={() => { pairOpen = false; pairError = null }}
                disabled={pairLoading}>
          Cancel
        </Button>
        <Button variant="primary"
                onclick={submitPair}
                disabled={pairLoading || pairCode.length !== 8 || !pairName.trim()}>
          {pairLoading ? 'Pairing…' : 'Pair board'}
        </Button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Verify in the browser**

Start the dev server:

```bash
cd backend && npm run dev
```

Navigate to `/boards`. Click "Pair new board" — the modal appears. Verify:
- Code input auto-uppercases typed text.
- "Pair board" button is disabled until code is 8 chars and name is non-empty.
- Cancel closes the modal.
- Submitting a non-existent code returns an inline "Code not found" error (you can test this without a running bridge by typing any 8-char code and submitting).

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/routes/Boards.svelte
git commit -m "feat(frontend): board pairing modal on Boards page"
```
