# Board Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a board owner share standing access to a board with one or more accepted friends (invite-and-accept), so a friend can pick that board for a session or lobby seat, view its camera during play, and flip its lights on/off — without renaming/deleting it, touching the bridge, or managing light presets/devices.

**Architecture:** A new `board_shares` table (one row per board+friend, `pending`/`accepted`) backs a small, service-free API (mirrors how `boards.ts`/`lights.ts` call `db/queries.ts` functions directly — no presence/push machinery like Friends has, since this feature has no live-push requirement). `GET /api/boards` merges the caller's own boards with boards shared with them (tagged `sharedBy`); a new `findAccessibleBoard` (owner OR accepted share) replaces `findOwnBoard` wherever a board is *picked* for a session or lobby seat, while every owner-only route (rename, delete, bridge actions, light presets/devices) is untouched. The lobby's pure `canSetBoard` rule gains a `sharedWithUserIds` list on its board-target fixture instead of a second access path, so existing tests barely change. The frontend needs almost no new logic: `GET /api/boards`'s existing merged list already flows into the lobby's board picker and a new Boards-page section.

**Tech Stack:** Fastify 4 + Kysely + Postgres (backend), Svelte 5 runes + Tailwind v4 (frontend), vitest, JSON Schema/OpenAPI in `schema/` with generated TS + zod (`npm run gen:api`).

**Spec:** `docs/superpowers/specs/2026-10-26-board-sharing-design.md` (binding, user-approved).

## Global Constraints

- `board_shares`: `id`, `board_id` (FK `boards.id` cascade), `friend_user_id` (FK `user.id` cascade), `status` (`pending` | `accepted`), `created_at`, `responded_at`; unique on `(board_id, friend_user_id)`.
- Permission boundary (from the spec, exact): a friend with an accepted share may start a session/lobby on the board, view its camera *during a game they're in* (existing `canWatchSession` path — no new camera-route change needed, see Task 3), and toggle the board's lights master switch on/off. They may **never** rename/delete the board, touch bridge install/update, change light presets, or manage light devices (scan/probe/blink/add/update/delete) — those routes keep their existing owner-only `ownBoard` check, untouched.
- Taking a board back to Manual in a lobby (`canSetBoard`'s `target === null` branch) stays **true-owner-only** (`person.boardOwnerUserId === actorUserId`) — a shared friend who put someone on the board may still take that person off it (`controls` branch, unaffected), but doesn't get the true owner's separate "reclaim" right. (My call: the spec is silent here; narrower is safer and nothing in the spec asks for it.)
- Unfriending the owner does **not** revoke an already-accepted share. Pending invites get no nav badge — visible only on the Boards page.
- `findOwnBoard` (`backend/src/boards/own.ts`) is unchanged and keeps gating every owner-only route. A **new**, separate `findAccessibleBoard` is added alongside it for the three places a board is *picked for use* (solo session create, lobby `ownFreeBoard`, lobby `canSetBoard`'s target branch).
- Schema first: change `schema/api-v1.yaml`, then `npm run gen:api` at the repo root; never hand-edit generated files (`backend/src/schema/*`, `backend/frontend/src/lib/api/*`).
- Migrations are append-only: add `042_board_shares.sql` (the latest existing migration is `041_big_screen.sql`); never edit 001–041.
- No new dependencies; never `npm install`. No TypeScript casts in non-test code. `svelte-check` 0 errors/warnings; `npm run lint` exit 0 in `backend/` and `backend/frontend/`.
- Backend DB tests need Postgres (`TEST_DATABASE_URL`, see `DEVELOPMENT.md`); without it those suites skip — a task isn't done until they ran.
- Commits: `type(scope): subject`, lower case, imperative, < 72 characters, unsigned (`git -c commit.gpgsign=false commit`), ending with the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Review Focus

1. **A board shared with several friends at once**, one accepts and one still has a pending invite: the accepter sees the board in their picker; the other doesn't, and still sees their own pending invite on their Boards page. → Task 1 `boardShares.test.ts` "a board can have more than one grantee, pending and accepted independently"; Task 5 manual check (two browser sessions) noted in that task.
2. **Inviting someone who isn't an accepted friend** (never friended, or a friend request still pending): refused with a clear 400, not a 500 from a stray FK insert. → Task 2 `boardShares.test.ts` (API) "refuses to share with someone who isn't an accepted friend".
3. **Double-accepting or double-declining** the same invite (two tabs, or a slow network retry): the second call 404s cleanly, doesn't throw, and doesn't flip an already-accepted share back to pending. → Task 2 `boardShares.test.ts` "accepting or declining twice 404s the second time".
4. **A friend picks the shared board for a lobby seat, then the owner revokes access before the friend's *next* board change** (not mid-game — see Global Constraints): the next attempt to assign that board is refused with 403, matching how an ordinary non-owner is refused today. → Task 3 `rules.test.ts` "a board whose share was revoked is no longer in sharedWithUserIds" plus `service.test.ts`/`lobbies.test.ts` integration case.
5. **A board shared with a friend who is also, separately, an owner of their own boards**: `GET /api/boards` must not duplicate or drop either set, and a board the friend actually owns is never mistakenly tagged `sharedBy`. → Task 3 `boards.test.ts` "lists owned and shared boards together, without duplicates, only shared ones tagged".

---

### Task 1: Board shares — data layer

**Files:**

- Create: `backend/src/db/migrations/042_board_shares.sql`
- Modify: `backend/src/db/schema.ts` (`BoardSharesTable`, register on `Database`)
- Create: `backend/src/db/boardShares.ts`, test `backend/src/db/boardShares.test.ts`

**Interfaces:**

- Produces:
  - `type BoardShareRow = { id: string; board_id: string; friend_user_id: string; status: 'pending' | 'accepted'; created_at: Date; responded_at: Date | null }`
  - `insertBoardShareInvite(db: Kysely<Database>, boardId: string, friendUserId: string): Promise<BoardShareRow>` — generates its own `ulid()` id (same convention as `insertWledDevice`); throws on a unique-constraint violation (duplicate `(board_id, friend_user_id)`), caller catches with `pgErrorCode`.
  - `getBoardShare(db, id: string): Promise<BoardShareRow | undefined>`
  - `acceptBoardShare(db, id: string, at: Date): Promise<boolean>` — `pending` → `accepted`; false if missing or already answered.
  - `deleteBoardShare(db, id: string): Promise<boolean>` — removes the row regardless of status (used for both an invitee's decline and an owner's revoke; the API layer decides who may call it).
  - `hasAcceptedBoardShare(db, boardId: string, userId: string): Promise<boolean>`
  - `sharedFriendIdsOfBoard(db, boardId: string): Promise<string[]>` — accepted only.
  - `type BoardGrantee = { id: string; friendUserId: string; friendName: string; status: 'pending' | 'accepted'; createdAt: Date }`
  - `granteesOfBoard(db, boardId: string): Promise<BoardGrantee[]>` — pending + accepted, newest first.
  - `type IncomingBoardShare = { id: string; boardId: string; boardName: string; ownerUserId: string; ownerName: string; createdAt: Date }`
  - `incomingSharesFor(db, userId: string): Promise<IncomingBoardShare[]>` — pending only, newest first.
  - `type SharedBoardRow = { id: string; name: string; hardware_id: string | null; created_at: Date; owner_name: string }`
  - `sharedBoardsFor(db, userId: string): Promise<SharedBoardRow[]>` — accepted only.

- [ ] **Step 1: Write the failing tests** (`backend/src/db/boardShares.test.ts`):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import {
  insertBoardShareInvite, getBoardShare, acceptBoardShare, deleteBoardShare,
  hasAcceptedBoardShare, sharedFriendIdsOfBoard, granteesOfBoard, incomingSharesFor, sharedBoardsFor,
} from './boardShares.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('board shares', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ;({ db, close } = await openTestSchema('board_shares_test'))
    await db.insertInto('user').values([
      { id: 'chris', name: 'Christoph', email: 'c@x', emailVerified: false, image: null },
      { id: 'lena', name: 'Lena', email: 'l@x', emailVerified: false, image: null },
      { id: 'max', name: 'Max', email: 'm@x', emailVerified: false, image: null },
    ]).execute()
    await db.insertInto('boards').values({ id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h1' }).execute()
  })
  afterAll(async () => { await close() })

  it('a board can have more than one grantee, pending and accepted independently', async () => {
    const toLena = await insertBoardShareInvite(db, 'living', 'lena')
    const toMax = await insertBoardShareInvite(db, 'living', 'max')
    expect(await acceptBoardShare(db, toLena.id, new Date())).toBe(true)

    expect(await hasAcceptedBoardShare(db, 'living', 'lena')).toBe(true)
    expect(await hasAcceptedBoardShare(db, 'living', 'max')).toBe(false)
    expect(await sharedFriendIdsOfBoard(db, 'living')).toEqual(['lena'])

    const grantees = await granteesOfBoard(db, 'living')
    expect(grantees.map(g => [g.friendUserId, g.status])).toEqual(
      expect.arrayContaining([['lena', 'accepted'], ['max', 'pending']]),
    )

    expect(await incomingSharesFor(db, 'max')).toEqual([
      expect.objectContaining({ id: toMax.id, boardId: 'living', boardName: 'Living room', ownerUserId: 'chris', ownerName: 'Christoph' }),
    ])
    expect(await incomingSharesFor(db, 'lena')).toEqual([]) // already accepted, not "incoming" any more

    expect(await sharedBoardsFor(db, 'lena')).toEqual([
      expect.objectContaining({ id: 'living', name: 'Living room', owner_name: 'Christoph' }),
    ])
    expect(await sharedBoardsFor(db, 'max')).toEqual([]) // still pending
  })

  it('accepting or deleting twice: the second call reports it did nothing', async () => {
    const share = await insertBoardShareInvite(db, 'living', 'max')
    expect(await acceptBoardShare(db, share.id, new Date())).toBe(true)
    expect(await acceptBoardShare(db, share.id, new Date())).toBe(false)
    expect(await deleteBoardShare(db, share.id)).toBe(true)
    expect(await deleteBoardShare(db, share.id)).toBe(false)
    expect(await getBoardShare(db, share.id)).toBeUndefined()
  })

  it('refuses a second invite for the same board and friend', async () => {
    await insertBoardShareInvite(db, 'living', 'lena')
    await expect(insertBoardShareInvite(db, 'living', 'lena')).rejects.toMatchObject({ code: '23505' })
  })
})
```

- [ ] **Step 2: Run; watch it fail.** `cd backend && npx vitest run src/db/boardShares.test.ts` — Expected: FAIL, `Cannot find module './boardShares.js'`.

- [ ] **Step 3: Write the migration**, `backend/src/db/migrations/042_board_shares.sql`:

```sql
-- Board sharing: an owner invites a friend to use their board; the friend accepts or declines.
-- Design: docs/superpowers/specs/2026-10-26-board-sharing-design.md
CREATE TABLE board_shares (
  id             TEXT PRIMARY KEY,
  board_id       TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  friend_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX board_shares_board_friend ON board_shares (board_id, friend_user_id);
CREATE INDEX board_shares_friend ON board_shares (friend_user_id);
```

In `backend/src/db/schema.ts`, add (near `FriendshipsTable`):

```ts
export interface BoardSharesTable {
  id: string
  board_id: string
  friend_user_id: string
  status: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date, never, never>
  responded_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}
```

and register it on the `Database` interface alongside `friendships: FriendshipsTable` as `board_shares: BoardSharesTable`.

- [ ] **Step 4: Write `backend/src/db/boardShares.ts`** implementing the functions in Interfaces above. `sharedBoardsFor` and `incomingSharesFor` each need one join; write them as plain Kysely (no raw SQL needed, unlike `friendshipsOf`'s symmetric-pair join):

```ts
export async function sharedBoardsFor(db: Kysely<Database>, userId: string): Promise<SharedBoardRow[]> {
  return db
    .selectFrom('board_shares')
    .innerJoin('boards', 'boards.id', 'board_shares.board_id')
    .innerJoin('user', 'user.id', 'boards.owner_user_id')
    .select(['boards.id', 'boards.name', 'boards.hardware_id', 'boards.created_at', 'user.name as owner_name'])
    .where('board_shares.friend_user_id', '=', userId)
    .where('board_shares.status', '=', 'accepted')
    .execute()
}

export async function incomingSharesFor(db: Kysely<Database>, userId: string): Promise<IncomingBoardShare[]> {
  const rows = await db
    .selectFrom('board_shares')
    .innerJoin('boards', 'boards.id', 'board_shares.board_id')
    .innerJoin('user', 'user.id', 'boards.owner_user_id')
    .select([
      'board_shares.id', 'board_shares.board_id', 'boards.name as board_name',
      'boards.owner_user_id', 'user.name as owner_name', 'board_shares.created_at',
    ])
    .where('board_shares.friend_user_id', '=', userId)
    .where('board_shares.status', '=', 'pending')
    .orderBy('board_shares.created_at', 'desc')
    .execute()
  return rows.map(r => ({
    id: r.id, boardId: r.board_id, boardName: r.board_name,
    ownerUserId: r.owner_user_id, ownerName: r.owner_name, createdAt: r.created_at,
  }))
}
```

`granteesOfBoard` mirrors `incomingSharesFor`'s shape but joins `user` on `board_shares.friend_user_id` instead, filters by `board_id`, and includes both statuses, newest first. The other functions (`insertBoardShareInvite`, `getBoardShare`, `acceptBoardShare`, `deleteBoardShare`, `hasAcceptedBoardShare`, `sharedFriendIdsOfBoard`) are plain single-table queries in the style of `db/lights.ts`'s `insertWledDevice`/`updateWledDevice`/`deleteWledDeviceRow`.

- [ ] **Step 5: Run.** `npx vitest run src/db/boardShares.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 6: Whole backend compiles.** `npm run typecheck` — Expected: 0 errors.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/db/migrations/042_board_shares.sql backend/src/db/schema.ts backend/src/db/boardShares.ts backend/src/db/boardShares.test.ts
git -c commit.gpgsign=false commit -m "feat(boards): add board_shares table and queries

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Board shares — API

**Files:**

- Create: `backend/src/api/boardShares.ts`, test `backend/src/api/boardShares.test.ts`
- Modify: `backend/src/app.ts` (register `boardSharesApiPlugin`)
- Modify: `schema/api-v1.yaml`, then `npm run gen:api`

**Interfaces:**

- Consumes: Task 1's `insertBoardShareInvite`, `getBoardShare`, `acceptBoardShare`, `deleteBoardShare`, `granteesOfBoard`, `incomingSharesFor`; `findOwnBoard` (`boards/own.ts`, unchanged); `areFriends` (`db/friends.ts`); `pgErrorCode`, `UNIQUE_VIOLATION` (`db/errors.ts`).
- Produces: `boardSharesApiPlugin(app, { db }, done)`, registered with just `{ db }` (no bridge/session deps, same as `pairingApiPlugin`).

- [ ] **Step 1: Add the HTTP contract to `schema/api-v1.yaml`.** Parameters (near `BoardId`/`FriendRequestId`):

```yaml
    BoardShareId:
      name: shareId
      in: path
      required: true
      schema: { type: string, minLength: 1 }
    BoardShareInviteId:
      name: id
      in: path
      required: true
      schema: { type: string, minLength: 1 }
```

Schemas (near `FriendRequest`/`FriendRequestResult`):

```yaml
    ShareBoardRequest:
      type: object
      required: [friendUserId]
      additionalProperties: false
      properties:
        friendUserId: { type: string }
    BoardGrantee:
      type: object
      required: [id, friendUserId, friendName, status, createdAt]
      additionalProperties: false
      properties:
        id: { type: string }
        friendUserId: { type: string }
        friendName: { type: string }
        status: { type: string, enum: [pending, accepted] }
        createdAt: { type: string, format: date-time }
    BoardShareList:
      type: object
      required: [shares]
      additionalProperties: false
      properties:
        shares: { type: array, items: { $ref: '#/components/schemas/BoardGrantee' } }
    IncomingBoardShare:
      type: object
      required: [id, boardId, boardName, ownerUserId, ownerName, createdAt]
      additionalProperties: false
      properties:
        id: { type: string }
        boardId: { type: string }
        boardName: { type: string }
        ownerUserId: { type: string }
        ownerName: { type: string }
        createdAt: { type: string, format: date-time }
    IncomingBoardShareList:
      type: object
      required: [shares]
      additionalProperties: false
      properties:
        shares: { type: array, items: { $ref: '#/components/schemas/IncomingBoardShare' } }
```

Also extend the existing `Board` schema: add `sharedBy` to `required` and to `properties`:

```yaml
        sharedBy: { type: string, nullable: true, description: "The owner's name, when this board was shared with you rather than being your own" }
```

(This `Board.sharedBy` field is actually populated in Task 3; adding it to the schema now keeps this task's `gen:api` the only one touching `Board`.)

Paths, inserted right after the existing `/api/boards/{id}/lights/test` block:

```yaml
  /api/boards/{id}/shares:
    parameters: [{ $ref: '#/components/parameters/BoardId' }]
    get:
      operationId: listBoardShares
      summary: Who has (or is invited to) this board, owner only
      tags: [boards]
      responses:
        '200': { description: The grantees, content: { application/json: { schema: { $ref: '#/components/schemas/BoardShareList' } } } }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
    post:
      operationId: shareBoard
      summary: Invite an accepted friend to use this board, owner only
      tags: [boards]
      requestBody:
        required: true
        content: { application/json: { schema: { $ref: '#/components/schemas/ShareBoardRequest' } } }
      responses:
        '201': { description: Invite sent, content: { application/json: { schema: { $ref: '#/components/schemas/BoardGrantee' } } } }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/Conflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/boards/{id}/shares/{shareId}:
    parameters: [{ $ref: '#/components/parameters/BoardId' }, { $ref: '#/components/parameters/BoardShareId' }]
    delete:
      operationId: revokeBoardShare
      summary: Revoke (or cancel a pending) share, owner only
      tags: [boards]
      responses:
        '204': { description: Revoked }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/board-shares/incoming:
    get:
      operationId: listIncomingBoardShares
      summary: Board-share invites waiting for you to accept or decline
      tags: [boards]
      responses:
        '200': { description: The invites, content: { application/json: { schema: { $ref: '#/components/schemas/IncomingBoardShareList' } } } }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/board-shares/{id}/accept:
    parameters: [{ $ref: '#/components/parameters/BoardShareInviteId' }]
    post:
      operationId: acceptBoardShare
      summary: Accept a board-share invite sent to you
      tags: [boards]
      responses:
        '204': { description: Accepted }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/board-shares/{id}/decline:
    parameters: [{ $ref: '#/components/parameters/BoardShareInviteId' }]
    post:
      operationId: declineBoardShare
      summary: Decline a board-share invite sent to you
      tags: [boards]
      responses:
        '204': { description: Declined }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

If `#/components/responses/Forbidden` doesn't already exist, check `boards.ts`'s existing 403s — they likely already share a `Forbidden` response ref used by other board routes; reuse that exact name instead of inventing a new one.

Run at the repo root: `npm run gen:api && npm run lint:api` — Expected: both exit 0.

- [ ] **Step 2: Write the failing API tests** (`backend/src/api/boardShares.test.ts`), following `api/boards.test.ts`'s/`api/lights.test.ts`'s convention: mock `db/queries.js`'s `getBoardById` and let the real `findOwnBoard` run over it, rather than mocking `boards/own.js` directly:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { boardSharesApiPlugin } from './boardShares.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'lena'; done() }),
}))
vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
vi.mock('../db/friends.js', () => ({ areFriends: vi.fn() }))
vi.mock('../db/boardShares.js', () => ({
  insertBoardShareInvite: vi.fn(), getBoardShare: vi.fn(), acceptBoardShare: vi.fn(),
  deleteBoardShare: vi.fn(), granteesOfBoard: vi.fn(), incomingSharesFor: vi.fn(),
}))

import { getBoardById } from '../db/queries.js'
import { areFriends } from '../db/friends.js'
import * as shares from '../db/boardShares.js'

const app = () => { const a = createFastify(); a.register(boardSharesApiPlugin, { db: {} as any }); return a }

beforeEach(() => vi.clearAllMocks())

describe('POST /api/boards/:id/shares', () => {
  it('refuses to share with someone who is not an accepted friend', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(areFriends).mockResolvedValue(false)
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(400)
    expect(shares.insertBoardShareInvite).not.toHaveBeenCalled()
  })

  it('invites an accepted friend', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'lena' } as any)
    vi.mocked(areFriends).mockResolvedValue(true)
    vi.mocked(shares.insertBoardShareInvite).mockResolvedValue({
      id: 's1', board_id: 'living', friend_user_id: 'max', status: 'pending', created_at: new Date(), responded_at: null,
    })
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toMatchObject({ id: 's1', friendUserId: 'max', status: 'pending' })
  })

  it("403s someone else's board", async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'living', owner_user_id: 'someone-else' } as any)
    const res = await app().inject({ method: 'POST', url: '/api/boards/living/shares', payload: { friendUserId: 'max' } })
    expect(res.statusCode).toBe(403)
  })
})

describe('POST /api/board-shares/:id/accept', () => {
  it('accepts an invite addressed to you', async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1', board_id: 'living', friend_user_id: 'lena', status: 'pending', created_at: new Date(), responded_at: null,
    })
    vi.mocked(shares.acceptBoardShare).mockResolvedValue(true)
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(204)
  })

  it("404s an invite addressed to someone else, or already answered", async () => {
    vi.mocked(shares.getBoardShare).mockResolvedValue({
      id: 's1', board_id: 'living', friend_user_id: 'max', status: 'pending', created_at: new Date(), responded_at: null,
    })
    const res = await app().inject({ method: 'POST', url: '/api/board-shares/s1/accept' })
    expect(res.statusCode).toBe(404)
  })
})
```

Run: `npx vitest run src/api/boardShares.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement `backend/src/api/boardShares.ts`**, following `api/boards.ts`'s inline-checks style (no service class). Key shape:

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { requireAuth } from '../auth/middleware.js'
import { findOwnBoard } from '../boards/own.js'
import { areFriends } from '../db/friends.js'
import { pgErrorCode, UNIQUE_VIOLATION } from '../db/errors.js'
import {
  insertBoardShareInvite, getBoardShare, acceptBoardShare, deleteBoardShare, granteesOfBoard, incomingSharesFor,
} from '../db/boardShares.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }

const granteeView = (g: { id: string; friendUserId: string; friendName: string; status: string; createdAt: Date }) => ({
  id: g.id, friendUserId: g.friendUserId, friendName: g.friendName,
  status: g.status, createdAt: g.createdAt.toISOString(),
})

export function boardSharesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'listBoardShares'>>('/api/boards/:id/shares', { preValidation: requireAuth, schema: fromSpec('listBoardShares') }, async (req, reply) => {
    const own = await findOwnBoard(db, req.params.id, req.userId)
    if (!('board' in own)) return reply.code(own.problem === 'not_found' ? 404 : 403).send({ error: own.problem === 'not_found' ? 'not found' : 'forbidden' })
    return reply.send({ shares: (await granteesOfBoard(db, own.board.id)).map(granteeView) })
  })

  app.post<Route<'shareBoard'>>('/api/boards/:id/shares', { preValidation: requireAuth, schema: fromSpec('shareBoard') }, async (req, reply) => {
    const own = await findOwnBoard(db, req.params.id, req.userId)
    if (!('board' in own)) return reply.code(own.problem === 'not_found' ? 404 : 403).send({ error: own.problem === 'not_found' ? 'not found' : 'forbidden' })
    const { friendUserId } = req.body
    if (!(await areFriends(db, req.userId, friendUserId))) return reply.code(400).send({ error: 'not an accepted friend' })
    try {
      const row = await insertBoardShareInvite(db, own.board.id, friendUserId)
      // friendName isn't on the inserted row; look it up the same way granteesOfBoard would, or
      // just re-fetch via granteesOfBoard and find it — implementer's call, either is fine.
      return reply.code(201).send(/* BoardGrantee shape, friendName included */)
    } catch (err) {
      if (pgErrorCode(err) === UNIQUE_VIOLATION) return reply.code(409).send({ error: 'already shared with this friend' })
      throw err
    }
  })

  app.delete<Route<'revokeBoardShare'>>('/api/boards/:id/shares/:shareId', { preValidation: requireAuth, schema: fromSpec('revokeBoardShare') }, async (req, reply) => {
    const own = await findOwnBoard(db, req.params.id, req.userId)
    if (!('board' in own)) return reply.code(own.problem === 'not_found' ? 404 : 403).send({ error: own.problem === 'not_found' ? 'not found' : 'forbidden' })
    const share = await getBoardShare(db, req.params.shareId)
    if (!share || share.board_id !== own.board.id) return reply.code(404).send({ error: 'not found' })
    await deleteBoardShare(db, share.id)
    return reply.code(204).send()
  })

  app.get<Route<'listIncomingBoardShares'>>('/api/board-shares/incoming', { preValidation: requireAuth, schema: fromSpec('listIncomingBoardShares') }, async req => ({
    shares: (await incomingSharesFor(db, req.userId)).map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
  }))

  async function respond(req: { userId: string; params: { id: string } }, reply: { code(n: number): { send(b: { error: string }): unknown } }, apply: (id: string, at: Date) => Promise<boolean>) {
    const share = await getBoardShare(db, req.params.id)
    if (!share || share.friend_user_id !== req.userId || share.status !== 'pending') return reply.code(404).send({ error: 'not found' })
    await apply(share.id, new Date())
    return reply.code(204).send()
  }

  app.post<Route<'acceptBoardShare'>>('/api/board-shares/:id/accept', { preValidation: requireAuth, schema: fromSpec('acceptBoardShare') }, (req, reply) => respond(req, reply, (id, at) => acceptBoardShare(db, id, at)))
  app.post<Route<'declineBoardShare'>>('/api/board-shares/:id/decline', { preValidation: requireAuth, schema: fromSpec('declineBoardShare') }, (req, reply) => respond(req, reply, id => deleteBoardShare(db, id)))

  done()
}
```

The `shareBoard` handler's response needs the friend's display name; the implementer picks either a tiny dedicated lookup or re-reading via `granteesOfBoard` — the test above only asserts `friendUserId`/`status`, not `friendName`, so either is fine; add one assertion on `friendName` once the approach is picked.

- [ ] **Step 4: Register the plugin.** In `backend/src/app.ts`: `import { boardSharesApiPlugin } from './api/boardShares.js'`, and `await app.register(boardSharesApiPlugin, { db })` right after `boardsApiPlugin`'s registration.

- [ ] **Step 5: Run.** `npx vitest run src/api/boardShares.test.ts src/api` — Expected: PASS, including `spec.test.ts` (every spec'd route registered).

- [ ] **Step 6: Commit.**

```bash
git add schema/api-v1.yaml backend/src/schema/api.ts backend/src/schema/types.ts backend/frontend/src/lib/api backend/src/api/boardShares.ts backend/src/api/boardShares.test.ts backend/src/app.ts
git -c commit.gpgsign=false commit -m "feat(boards): add the board-share invite/accept/decline/revoke API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Shared boards usable for sessions and lobbies

**Files:**

- Modify: `backend/src/boards/own.ts` (`findAccessibleBoard`)
- Modify: `backend/src/api/boards.ts` (`listBoards` merges shared boards)
- Modify: `backend/src/api/boards.test.ts`
- Modify: `backend/src/api/sessions.ts` (`findOwnBoard` → `findAccessibleBoard`)
- Modify: `backend/src/lobby/rules.ts` (`BoardTarget`, `canSetBoard`), `backend/src/lobby/rules.test.ts`
- Modify: `backend/src/lobby/service.ts` (`ownFreeBoard`, `boardChange`)
- Modify: `backend/frontend/src/lib/lobby/rules.ts` (`OwnBoard.ownerName`, `boardChoices` detail text), its test (`backend/frontend/src/lib/__tests__/lobbyRules.test.ts`)
- Modify: `backend/frontend/src/routes/Lobby.svelte` (`toOwnBoards`)

**Interfaces:**

- Consumes: Task 1's `hasAcceptedBoardShare`, `sharedFriendIdsOfBoard`, `sharedBoardsFor`.
- Produces:
  - `findAccessibleBoard(db, boardId, userId): Promise<{ board: BoardRow } | { problem: 'not_found' | 'not_owner' }>` in `boards/own.ts` — same shape as `findOwnBoard`, but also true when `hasAcceptedBoardShare(db, boardId, userId)`.
  - `BoardTarget = { boardId: string; ownerUserId: string; sharedWithUserIds: readonly string[] }` in `lobby/rules.ts` (was `{ boardId, ownerUserId }`).
  - `OwnBoard = { id: string; name: string; online: boolean; ownerName?: string | null }` in `lib/lobby/rules.ts` (frontend).

- [ ] **Step 1: Write the failing `findAccessibleBoard` test.** Add to `backend/src/boards/own.test.ts` (create it if it doesn't exist yet, following `own.ts`'s own doc comment for style):

```ts
import { describe, it, expect, vi } from 'vitest'
import { findAccessibleBoard } from './own.js'

vi.mock('../db/queries.js', () => ({ getBoardById: vi.fn() }))
vi.mock('../db/boardShares.js', () => ({ hasAcceptedBoardShare: vi.fn() }))
import { getBoardById } from '../db/queries.js'
import { hasAcceptedBoardShare } from '../db/boardShares.js'

describe('findAccessibleBoard', () => {
  it('finds it for the owner without checking shares', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'b', owner_user_id: 'chris' } as any)
    const r = await findAccessibleBoard({} as any, 'b', 'chris')
    expect(r).toEqual({ board: { id: 'b', owner_user_id: 'chris' } })
    expect(hasAcceptedBoardShare).not.toHaveBeenCalled()
  })

  it('finds it for an accepted grantee, refuses everyone else', async () => {
    vi.mocked(getBoardById).mockResolvedValue({ id: 'b', owner_user_id: 'chris' } as any)
    vi.mocked(hasAcceptedBoardShare).mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect(await findAccessibleBoard({} as any, 'b', 'lena')).toEqual({ board: { id: 'b', owner_user_id: 'chris' } })
    expect(await findAccessibleBoard({} as any, 'b', 'max')).toEqual({ problem: 'not_owner' })
  })

  it('not_found when the board does not exist', async () => {
    vi.mocked(getBoardById).mockResolvedValue(undefined)
    expect(await findAccessibleBoard({} as any, 'nope', 'chris')).toEqual({ problem: 'not_found' })
  })
})
```

Run: `npx vitest run src/boards/own.test.ts` — Expected: FAIL.

- [ ] **Step 2: Implement `findAccessibleBoard`** in `backend/src/boards/own.ts`, next to `findOwnBoard` (which stays exactly as-is):

```ts
import { hasAcceptedBoardShare } from '../db/boardShares.js'

/** The board if it exists and the user may use it: owns it, or has an accepted share. */
export async function findAccessibleBoard(
  db: Kysely<Database>,
  boardId: string,
  userId: string,
): Promise<{ board: BoardRow } | { problem: 'not_found' | 'not_owner' }> {
  const board = await getBoardById(db, boardId)
  if (!board) return { problem: 'not_found' }
  if (board.owner_user_id === userId) return { board }
  if (await hasAcceptedBoardShare(db, boardId, userId)) return { board }
  return { problem: 'not_owner' }
}
```

Run: `npx vitest run src/boards/own.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing `listBoards` test** in `backend/src/api/boards.test.ts` (add alongside the existing `GET /api/boards` tests; mock `sharedBoardsFor` too):

```ts
// add to the existing vi.mock('../db/queries.js', ...) block's neighbors:
vi.mock('../db/boardShares.js', () => ({ sharedBoardsFor: vi.fn().mockResolvedValue([]) }))
import * as boardShares from '../db/boardShares.js'

it('lists owned and shared boards together, without duplicates, only shared ones tagged', async () => {
  vi.mocked(queries.getBoardsByOwner).mockResolvedValue([
    { id: 'own-1', name: 'Mine', hardware_id: null, created_at: new Date(), owner_user_id: 'user-1', token_hash: 'h', lights_enabled: true },
  ])
  vi.mocked(boardShares.sharedBoardsFor).mockResolvedValue([
    { id: 'shared-1', name: "Chris's", hardware_id: null, created_at: new Date(), owner_name: 'Christoph' },
  ])
  const res = await makeApp().inject({ method: 'GET', url: '/api/boards' })
  const boards = JSON.parse(res.body).boards
  expect(boards).toHaveLength(2)
  expect(boards.find((b: any) => b.id === 'own-1').sharedBy).toBeNull()
  expect(boards.find((b: any) => b.id === 'shared-1').sharedBy).toBe('Christoph')
})
```

Run: `npx vitest run src/api/boards.test.ts` — Expected: FAIL (`sharedBy` undefined, extra board missing).

- [ ] **Step 4: Update `listBoards`** in `backend/src/api/boards.ts`: import `sharedBoardsFor` from `../db/boardShares.js`; fetch both lists (`Promise.all`); map owned rows with `sharedBy: null` and shared rows with `sharedBy: b.owner_name` through the same per-board view logic already there (both need `bridgeConnections.get`/`isOnline`, so factor the existing `rows.map(b => {...})` body into a small local function taking `(b: { id; name; hardware_id; created_at }, sharedBy: string | null)` and call it once per list, concatenating the results).

Run: `npx vitest run src/api/boards.test.ts` — Expected: PASS.

- [ ] **Step 5: `sessions.ts` uses `findAccessibleBoard`.** In `backend/src/api/sessions.ts`, change the import and the one call site: `findOwnBoard` → `findAccessibleBoard`. `sessions.test.ts` already mocks `db/queries.js`'s `getBoardById` and lets the real board-access helper run over it (same convention as Tasks 2/4); add `vi.mock('../db/boardShares.js', () => ({ hasAcceptedBoardShare: vi.fn() }))` and one new test: `getBoardById` resolves a board owned by `'other-user'`, `hasAcceptedBoardShare` resolves `true`, `POST /api/sessions` with that `boardId` → 201 (mirrors the existing test at line 145 that currently expects 403 for a board owned by `'other-user'`, but with the share mocked true).

- [ ] **Step 6: Write the failing `canSetBoard` tests.** In `backend/src/lobby/rules.test.ts`, update the three existing `BoardTarget` fixtures to add the new field, and add shared-access tests:

```ts
const living = { boardId: 'living', ownerUserId: 'chris', sharedWithUserIds: [] }
const garage = { boardId: 'garage', ownerUserId: 'chris', sharedWithUserIds: [] }
const lenas = { boardId: 'lenas', ownerUserId: 'lena', sharedWithUserIds: [] }
```

New tests, in the `canSetBoard` describe block:

```ts
it("a board owner's friend with an accepted share can give it out too", () => {
  const livingSharedWithLena = { ...living, sharedWithUserIds: ['lena'] }
  expect(canSetBoard('lena', max, livingSharedWithLena)).toBe(true)
  expect(canSetBoard('max', max, livingSharedWithLena)).toBe(false) // max has no share
})

it("sharing doesn't grant the true owner's separate right to reclaim the board from Manual", () => {
  const maxOnLiving = person({ id: 'x', userId: 'max', addedByUserId: 'max', boardId: 'living', boardOwnerUserId: 'chris' })
  // lena has a share on 'living' but canSetBoard's null-target branch never looks at sharedWithUserIds
  expect(canSetBoard('lena', maxOnLiving, null)).toBe(false)
})
```

Run: `npx vitest run src/lobby/rules.test.ts` — Expected: FAIL (type error on the fixtures, then on the new tests).

- [ ] **Step 7: Update `canSetBoard`** in `backend/src/lobby/rules.ts`:

```ts
export type BoardTarget = { boardId: string; ownerUserId: string; sharedWithUserIds: readonly string[] }

export function canSetBoard(actorUserId: string, person: LobbyPerson, target: BoardTarget | null): boolean {
  if (person.bot !== null) return false
  const controls = controllerOf(person) === actorUserId
  if (target === null) return controls || (person.boardId !== null && person.boardOwnerUserId === actorUserId)
  if (target.ownerUserId !== actorUserId && !target.sharedWithUserIds.includes(actorUserId)) return false
  return controls || person.boardId === null
}
```

Run: `npx vitest run src/lobby/rules.test.ts` — Expected: PASS.

- [ ] **Step 8: Wire `sharedWithUserIds` through `lobby/service.ts`.** Import `sharedFriendIdsOfBoard` from `../db/boardShares.js`, and `findAccessibleBoard` from `../boards/own.js` (replacing the `findOwnBoard` import).

In `ownFreeBoard`: swap `findOwnBoard` → `findAccessibleBoard`; change the forbidden message to `'you can only pick a board you own or have access to'` (my call — the old message was literally wrong once sharing exists).

In `boardChange`: after `const target = ...`, add `const sharedWithUserIds = target === null ? [] : await sharedFriendIdsOfBoard(this.db, target.id)`, and change the `rules.canSetBoard(...)` call's target argument to `{ boardId: target.id, ownerUserId: target.owner_user_id, sharedWithUserIds }`.

Add one integration test to `backend/src/lobby/service.test.ts` (or wherever `boardChange`/`updatePerson` is already covered — follow that file's existing fixture/DB setup pattern): a lobby host picks a board shared with them (not owned) for a guest, and it succeeds; picking a board with no share at all still 403s.

- [ ] **Step 9: Run the whole backend lobby + boards + sessions suites.** `cd backend && npx vitest run src/lobby src/api/boards.test.ts src/api/sessions.test.ts src/boards` — Expected: PASS.

- [ ] **Step 10: Frontend mirror.** In `backend/frontend/src/lib/lobby/rules.ts`: change `OwnBoard` to `{ id: string; name: string; online: boolean; ownerName?: string | null }`; in `boardChoices`'s `for (const b of own)` loop, change `detail` to:

```ts
detail: `${b.ownerName ? `${b.ownerName}'s` : 'Your'} board · ${b.online ? 'online' : 'offline'}`,
```

Add a test to `backend/frontend/src/lib/__tests__/lobbyRules.test.ts`: a board with `ownerName: 'Christoph'` in the `own` list produces a choice whose `detail` is `"Christoph's board · online"`.

- [ ] **Step 11: `Lobby.svelte`'s `toOwnBoards`.** Change its parameter type to include `sharedBy: string | null` (matching the `Board` schema from Task 2) and map it through: `ownerName: b.sharedBy`.

- [ ] **Step 12: Run frontend tests and typecheck.** `cd backend/frontend && npm test -- lobbyRules && npm run typecheck` — Expected: PASS, 0 errors.

- [ ] **Step 13: Commit.**

```bash
git add backend/src/boards/own.ts backend/src/boards/own.test.ts backend/src/api/boards.ts backend/src/api/boards.test.ts backend/src/api/sessions.ts backend/src/api/sessions.test.ts backend/src/lobby/rules.ts backend/src/lobby/rules.test.ts backend/src/lobby/service.ts backend/src/lobby/service.test.ts backend/frontend/src/lib/lobby/rules.ts backend/frontend/src/lib/__tests__/lobbyRules.test.ts backend/frontend/src/routes/Lobby.svelte
git -c commit.gpgsign=false commit -m "feat(boards): let an accepted share pick a board for a session or lobby seat

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Lights master switch for a shared board

**Files:**

- Modify: `backend/src/api/lights.ts` (`getBoardLights`, `setBoardLights` only)
- Modify: `backend/src/api/lights.test.ts`

**Interfaces:**

- Consumes: `findAccessibleBoard` (Task 3, used for real — not mocked, same as how this file already lets the real `findOwnBoard` run over a mocked `getBoardById`); `hasAcceptedBoardShare` (Task 1, mocked).

My call: the `lights.enabled` flag is checked against the **board's owner's** account, not the caller's — the hardware and the flag rollout belong to the owner; a shared friend shouldn't lose the on/off toggle just because their own account individually lacks the flag the owner already has. The existing test file's flag harness (`setupFlags`, all-or-nothing for the whole process) can't distinguish "caller's flag" from "owner's flag" either way, so this is a code-reading-verified decision, not something the new test below separately proves — don't write a test that claims to cover it when it can't.

- [ ] **Step 1: Write the failing test.** Add to `backend/src/api/lights.test.ts`, near the `ownership: 403/404` describe block. It needs a board owned by someone other than the fixed `req.userId = 'user-1'`, and `../db/boardShares.js` added to this file's `vi.mock` list (new import, mirroring how `dbLights` is already mocked):

```ts
// add to the top-level vi.mock block alongside the existing ones:
vi.mock('../db/boardShares.js', () => ({ hasAcceptedBoardShare: vi.fn() }))
import * as boardShares from '../db/boardShares.js'
// add to beforeEach: vi.mocked(boardShares.hasAcceptedBoardShare).mockReset().mockResolvedValue(false)

describe('a board shared with the caller (not owned)', () => {
  it('may see and toggle the lights master switch', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board({ owner_user_id: 'chris' }) as any)
    vi.mocked(boardShares.hasAcceptedBoardShare).mockResolvedValue(true)
    const { app } = makeApp()
    expect((await app.inject({ method: 'GET', url: '/api/boards/board-1/lights' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'PUT', url: '/api/boards/board-1/lights', payload: { enabled: false } })).statusCode).toBe(204)
  })

  it('still 403s device management', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue(board({ owner_user_id: 'chris' }) as any)
    vi.mocked(boardShares.hasAcceptedBoardShare).mockResolvedValue(true)
    const { app } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/boards/board-1/lights/scan' })).statusCode).toBe(403)
  })
})
```

Run: `npx vitest run src/api/lights.test.ts` — Expected: FAIL (both 404/403 today, since `hasAcceptedBoardShare` isn't consulted yet).

- [ ] **Step 2: Add a second helper in `lightsApiPlugin`**, used only by `getBoardLights`/`setBoardLights`. Add `import { findAccessibleBoard } from '../boards/own.js'` alongside the existing `findOwnBoard` import:

```ts
async function accessibleBoard(id: string, userId: string, reply: { code(n: number): { send(b: { error: string }): unknown } }) {
  const access = await findAccessibleBoard(db, id, userId)
  if (!('board' in access)) {
    reply.code(access.problem === 'not_found' ? 404 : 403).send({ error: access.problem === 'not_found' ? 'not found' : 'forbidden' })
    return null
  }
  if (!(await flagEnabled('lights.enabled', await loadFlagUser(db, access.board.owner_user_id)))) {
    reply.code(404).send({ error: 'not found' })
    return null
  }
  return access.board
}
```

In `getBoardLights` and `setBoardLights`, replace the `ownBoard(id, req.userId, reply)` call with `accessibleBoard(id, req.userId, reply)`. Every other route in the file (`scan`, `probe`, `blink`, `addWledDevice`, `updateWledDevice`, `deleteWledDevice`, `testBoardLight`) keeps calling the existing `ownBoard`, unchanged.

- [ ] **Step 3: Run.** `npx vitest run src/api/lights.test.ts` — Expected: PASS.

- [ ] **Step 4: Whole backend.** `cd backend && npm test && npm run typecheck && npm run lint` — Expected: all pass.

- [ ] **Step 5: Commit.**

```bash
git add backend/src/api/lights.ts backend/src/api/lights.test.ts
git -c commit.gpgsign=false commit -m "feat(lights): let a shared board's friend flip the master switch

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Boards page — sharing UI

**Files:**

- Modify: `backend/frontend/src/lib/components/boards/BoardsSection.svelte`
- Modify: `backend/frontend/src/lib/components/boards/BoardCard.svelte`
- Create: `backend/frontend/src/lib/components/boards/ShareBoardModal.svelte`, `backend/frontend/src/lib/components/boards/PendingBoardInvites.svelte`, `backend/frontend/src/lib/components/boards/BoardGrantees.svelte`
- Create: `backend/frontend/src/lib/boardShares.ts` (thin API wrappers, mirrors `lib/boards.ts`'s style)

**Interfaces:**

- Consumes: `GET /api/board-shares/incoming`, `POST .../accept`, `POST .../decline`, `GET/POST /api/boards/{id}/shares`, `DELETE /api/boards/{id}/shares/{shareId}` (Task 2); `Board.sharedBy` (Task 2/3); `friendIdsOf`-equivalent on the frontend — reuse whatever the Friends page already uses to list accepted friends (check `lib/friends/` before adding a new fetch).
- Produces: `lib/boardShares.ts`: `listIncomingBoardShares()`, `acceptBoardShare(id)`, `declineBoardShare(id)`, `listBoardShares(boardId)`, `shareBoard(boardId, friendUserId)`, `revokeBoardShare(boardId, shareId)` — each a one-line `api.GET`/`api.POST`/`api.DELETE` wrapper, following `lib/boards.ts`'s existing wrappers for style (read that file first; if it doesn't exist and routes are called inline from components instead, follow that convention — one wrapper file per domain is this plan's preference, not a hard requirement).

- [ ] **Step 1: `BoardCard.svelte` — the "shared by" tag.** Read the current file; add a small badge/line shown when `board.sharedBy` is non-null (e.g. next to the existing online/offline dot), reading "Shared by {board.sharedBy}". Add a test in `backend/frontend/src/lib/components/boards/__tests__/boardCard.test.ts` (create if none exists, following another `boards/` component test's render-and-assert style) asserting the tag's text renders only when `sharedBy` is set.

- [ ] **Step 2: `PendingBoardInvites.svelte`.** A small list, one row per incoming invite: "`{boardName}` from `{ownerName}`" with Accept/Decline buttons (reuse `Button`; reuse whatever friend-invite row component already renders a name + two actions for layout inspiration, but this is its own component per the design's explicit call to keep it off the existing invites page). Props: `invites: IncomingBoardShare[]`, `onaccept: (id: string) => void`, `ondecline: (id: string) => void`. Empty when `invites.length === 0` — render nothing (no `EmptyState`; this section simply doesn't appear when there's nothing pending, per the design's "visible only by opening the Boards page" decision — no need to announce absence).

Test (`backend/frontend/src/lib/components/boards/__tests__/pendingBoardInvites.test.ts`): renders one row per invite with both action buttons; renders nothing with an empty list.

- [ ] **Step 3: `BoardGrantees.svelte`.** The owner's "who has access" list for the selected board: one row per grantee ("`{friendName}` · `{status}`"), a Revoke button per row, and a "Share this board" button that opens `ShareBoardModal`. Props: `grantees: BoardGrantee[]`, `onrevoke: (shareId: string) => void`, `onshare: () => void`.

Test: renders a row per grantee with a Revoke button; the Share button fires `onshare`.

- [ ] **Step 4: `ShareBoardModal.svelte`.** A simple modal (reuse `Modal`/`ConfirmModal`'s structure) listing the owner's accepted friends (fetched however `routes/Friends.svelte` already does — read it first) as selectable rows, already-shared friends shown disabled/checked; confirming calls `onshare(friendUserId)` and closes. Props: `onshare: (friendUserId: string) => void`, `onclose: () => void`, `alreadyShared: string[]` (friend ids to grey out).

Test: a friend not already in `alreadyShared` is clickable and fires `onshare` with their id; one already in it is disabled.

- [ ] **Step 5: Wire it all into `BoardsSection.svelte`.**
  - On mount (alongside the existing `GET /api/boards` call), also fetch `GET /api/board-shares/incoming`; render `<PendingBoardInvites>` above the board grid when non-empty; `onaccept`/`ondecline` call the Task 2 endpoints, then refresh both the invites list and `GET /api/boards` (a newly-accepted board needs to appear in the grid).
  - For the selected board: when `selected.sharedBy` is **null** (the viewer owns it), render `<BoardGrantees>` (fetched via `GET /api/boards/{id}/shares`) somewhere in the existing aside/bar (e.g. under the existing board-info `<dl>`), wired to the Task 2 endpoints; `onrevoke` and a successful `onshare` both refetch that board's grantee list.
  - When `selected.sharedBy` is **non-null** (shared with the viewer, not owned): skip `boardDetails`'s camera tiles, BM controls, events feed, rename and unpair entirely (none of those routes are reachable for a non-owner — Task 3/4 deliberately left them owner-only); render a smaller detail view instead: the "Shared by {sharedBy}" line, the lights master toggle if `$lightsOn` (reusing the existing `PUT /api/boards/{id}/lights` call, now reachable per Task 4), and the existing `boardActions` "Play on this board" button (unchanged — it already just navigates to `/?board=:id`, which works for any board the viewer may use once Task 3 lands).

- [ ] **Step 6: Run frontend tests and typecheck.** `cd backend/frontend && npm test && npm run typecheck && npm run lint` — Expected: all pass.

- [ ] **Step 7: Manual check** (per AGENTS.md: UI changes get a real run before calling this done). `scripts/dev.sh`, two signed-in accounts that are friends, one with a paired board: share it, accept it from the other account, confirm it appears tagged in the Boards page and in a lobby's board picker with the "`{name}`'s board" detail text, confirm Revoke removes it from the friend's list, and take a screenshot for `docs/board-sharing/` per AGENTS.md's screenshot convention for a significant UI change.

- [ ] **Step 8: Commit.**

```bash
git add backend/frontend/src/lib/components/boards backend/frontend/src/lib/boardShares.ts docs/board-sharing
git -c commit.gpgsign=false commit -m "feat(boards): add the Boards-page sharing UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
