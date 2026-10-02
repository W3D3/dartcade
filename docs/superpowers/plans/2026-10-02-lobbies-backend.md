# Lobbies (backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Friends gather in a private lobby (by code, link or invite), pick their boards, add guests, and the host starts games from it: the roster becomes seats with a controller and a board each. Every change reaches everyone live, and the lobby resets itself after each game.

**Architecture:** Lobbies are plain mutable rows (`lobbies`, `lobby_people`, `lobby_invites`, `lobby_activity`); only games keep an event log. A `LobbyService` (`backend/src/lobby/service.ts`) owns every rule. It runs the changes to one lobby one after another (an in-process queue per lobby, like the engine's per-session queue), reloads the lobby after each change and pushes it. Pure modules hold what can be tested without a database: the permission rules (`rules.ts`), building a game from the roster (`startPlan.ts`) and the pushed views (`view.ts`). The REST routes (`api/lobbies.ts`) are thin. Two push-only sockets carry the live state: `/ws/lobby?lobbyId=` (the full lobby, with presence) and `/ws/me` (pending invites and the user's lobby summary). The engine learns a lobby game's `lobbyId`, can shuffle seats with the game's seed, records who aborted, and calls a hook when a game ends so the lobby resets.

**Tech Stack:** TypeScript, Fastify 4, @fastify/websocket, Kysely + Postgres, zod (generated), ajv, json-schema-to-typescript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`. Its last section, "Update after the lobby designs", overrides the earlier sections. This plan is "Work split" item 2. The engine side (seats, routing, forfeit) is already built (`docs/superpowers/plans/2026-10-02-multiplayer-sessions.md`).

## Global Constraints

- No casts in non-test code (strict type-aware ESLint). Run `cd backend && npm run lint`.
- Generated files aren't edited by hand. Edit `schema/*.json` / `schema/api-v1.yaml`, then run `npm run gen:api` at the repo root. Generated: `backend/src/schema/{api,game-ws,lobby-ws,zod}.ts`, `backend/src/schema/*.deref.json`, `backend/src/schema/api-v1.bundled.json`, `backend/frontend/src/lib/api/{schema,game-ws,lobby-ws,zod}.ts`.
- Games stay pure reducers. Nothing in `backend/src/games/` learns about lobbies.
- The local flow doesn't change: `POST /api/sessions` keeps its shapes; a local game has `lobbyId: null`.
- Board menus only ever list your own boards. Anyone gives a person on Manual one of their own boards. After that only the person (for a guest: the member who added them) or the board's owner changes it. There is no "picked it myself" lock. The host has no extra board rights.
- Nobody sets someone else's ready, not even the host.
- Sitting out lasts a single game. After every game: everyone plays again, members' ready is false, guests' ready is true.
- One open lobby per user (unique index on `lobby_people.user_id`). One active game per user (the engine).
- No frontend work in this plan, except updating frontend test fixtures when a required snapshot field is added.
- Don't touch the match-remote plan's fields: per-seat `disconnectedAt` and the notice's `throwerName`/`throwerBoard`. `lobbyName` is shared, see Task 3.
- DB tests run only with `TEST_DATABASE_URL` set. Each DB test file uses its own Postgres schema (`openTestSchema`), because Vitest runs files in parallel and `queries.test.ts` wipes the shared tables.
- Test command used below: `cd backend && TEST_DATABASE_URL=postgres://dartgames:dev@172.18.0.2:5432/dartcade_mp_test npx vitest run <file>`. Abbreviated as `$T <file>`.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96
  ```

## Rulings on the spec (decided while planning; Task 14 writes them into the spec)

1. **Migration number.** `008` is taken (`008_multiplayer_seats.sql`), so this is `009_lobbies.sql`.
2. **Codes.** 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no I, L, O, 0, 1). They're unique among *open* lobbies only (partial unique index), so closed lobbies keep theirs. Input is normalized: case and any non-alphanumeric characters (`K7Q4-MD`, `k7q4 md`) are ignored. The API returns the raw code; the client formats it.
3. **Rematch.** `lobbies.last_game` (JSONB `{ gameId, config, personIds }`) records each lobby game at start. A rematch repeats exactly that: the same people (minus anyone who left the lobby), mode and settings. It ignores the current "Who plays" flags and the next-game card. It works after a finished or an aborted game, with the same soft ready gate as Start.
4. **Soft ready gate.** Start and rematch answer `409 { code: 'not_ready', notReady: [{ personId, name }] }`. The client confirms by sending the same request with `{ "force": true }`. `force` only skips the ready check. Hard problems (unknown game, nobody plays, an offline board, a busy board, someone already in a game) are checked first and always refuse.
5. **Throw order.**
   - `bulloff` turns the game's own `bullOff` setting on: it keeps `wdc`/`pdc` if the host set one, otherwise `wdc`.
   - `lobby` and `random` force `bullOff: 'off'`.
   - A game without a bull off (ATC) refuses `bulloff` at start (400).
   - `random` shuffles the seats in the engine with the game's `rng_seed` (`createWithSeats({ shuffleSeats: true })`). Seats are stored in the shuffled order, so a replay needs nothing extra.
6. **Next game.** Stored as `{ gameId, config }` (the spec's "mode" is the API's `gameId`). It defaults to null, and Start then answers 400 "pick a game first". At start the config is merged over the module's `defaultConfig`.
7. **Ready** is a field of `PATCH /api/lobbies/:id/people/:pid`, next to `boardId`, `plays` and `position`. A PATCH is all-or-nothing: if one field isn't allowed, nothing is written.
8. **Invites.**
   - Any member may invite (the Update section lets members invite from their phone).
   - Inviting yourself is 400. Inviting a member or someone with a pending invite is 409.
   - `POST /api/lobbies/:id/join` takes only `{ code }`. An invite is accepted with `POST /api/invites/:id/accept`, which joins directly.
   - Accepting while in another lobby is `409 in_lobby`, and the invite stays pending.
   - Joining by code marks your pending invite to that lobby accepted.
9. **Leaving.** A member who leaves (or is removed) takes their guests along. People on the leaver's boards go to Manual. A left member's lobby sockets are closed with 4403.
10. **Host handover.**
    - If the host leaves between games, the member who joined longest ago becomes host (ties: lobby order), with a `host_changed` line.
    - If the host leaves during a game, `host_user_id` stays until the game ends; then the role passes on.
    - A lobby whose last member leaves during a game stays open (empty) until the game ends, then closes.
    - `host_user_id` is nullable (`ON DELETE SET NULL`, for account deletion). The next change to the lobby hands over.
11. **Board changes.**
    - `board_moved_by` is set when someone other than the person (or the guest's adder) puts them on a board. It's cleared on any change made by the person themselves and on any move to Manual.
    - Every board change, including take-backs, logs `board_moved`.
    - "Busy" at assignment means the board is in an active game that isn't this lobby's own.
12. **Activity data** stores names at write time (`data.name`, board names, `winnerName`, `players`), so the feed still reads right after people leave. `game_played` has no actor. `game_aborted`'s actor is whoever aborted.
13. **Where the lobby schema lives.** `schema/lobby-ws-v1.json` is a new draft-07 schema for both push sockets. It isn't in `game-ws-v1.json` for three reasons:
    - Lobby messages aren't game messages.
    - The match-remote plan edits `game-ws-v1.json` in parallel.
    - The full lobby needs nullable fields (`type: [string, null]`), which `common-v1.json` can't hold (it must stay valid OpenAPI 3.0).

    REST answers with small shapes (`LobbyRef`, `LobbyPreview`, `Invite`) in `api-v1.yaml`, the same way `SessionDetail.game` points at `game-ws-v1.json`. The full lobby only comes over the socket. `PendingInvite` (socket) and `Invite` (REST) are the same shape, built by one function (`inviteView`).
14. **`/ws/me` summary.**
    - `youThrowNext`: the viewer controls the seat that's up now in the lobby's running game.
    - `leg`: 0-based, from the module's `getLeg`; null for games without legs.
    - A message equal to the last one sent to that user isn't sent again. Game snapshots trigger a check after every dart.
15. **Presence.** A member is `online` while they have at least one lobby socket open, otherwise `away`. Guests have `presence: null`.
16. **Watching lobby games.** Members of the game's lobby may open its socket and `GET /api/sessions/:id`, besides the host and seat controllers. `GET /api/sessions` (my sessions) is unchanged.
17. **Lobby name in the match header.** It's captured at start; a rename shows from the next game.
18. **User search** reuses the existing `GET /api/users?q=` (the spec's `/api/users/search` isn't added).
19. **Snapshot `lobbyId`.** It's added now (the spec lists it under "comes with lobbies").

## Review Focus

1. **Two creates or joins at once** (a double click, two tabs) leave exactly one membership; the other request gets `409 in_lobby` and no orphan lobby row stays open. Test in Task 7.
2. **The host leaves mid-game, or everyone does.** The game runs on, the host can still abort, and the handover or close happens when the game ends. Test in Task 10.
3. **A member leaves while others sit at their board.** Those people go to Manual, so no game starts on a board whose owner is gone. Test in Task 8.
4. **A confirmed start (`force`) with an offline board** is still refused, naming the boards; `force` only skips ready. Test in Task 5.
5. **Codes as people type them** (lowercase, with a dash or spaces) join; a regenerated code makes the old one 404. Test in Task 7.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/db/migrations/009_lobbies.sql` | Tables, indexes, `game_sessions.lobby_id`, `game_sessions.aborted_by_user_id` |
| `backend/src/db/schema.ts` | Kysely table types |
| `backend/src/db/testSchema.ts` | A fresh migrated Postgres schema per DB test file |
| `backend/src/db/lobbies.ts` | Lobby queries; reads JSON columns defensively |
| `backend/src/lobby/types.ts` | `LobbyState` and friends (the loaded lobby) |
| `backend/src/lobby/rules.ts` | Who may do what; host handover; reordering (pure) |
| `backend/src/lobby/code.ts` | Lobby codes |
| `backend/src/lobby/errors.ts` | `LobbyError` (status + body) |
| `backend/src/lobby/startPlan.ts` | Roster + game → seats, config, problems (pure) |
| `backend/src/lobby/view.ts` | Lobby, summary and invite views (pure) |
| `backend/src/lobby/validation.ts` | Dev/test check of pushed messages against `schema/lobby-ws-v1.json` |
| `backend/src/lobby/hub.ts` | Open lobby and `/ws/me` sockets; `/ws/me` dedupe |
| `backend/src/lobby/service.ts` | All lobby operations, the per-lobby queue, pushes, game-end reset |
| `backend/src/api/lobbies.ts` | REST routes for lobbies and invites |
| `backend/src/browser-gw/lobby.ts` | `/ws/lobby` and `/ws/me` |
| `schema/lobby-ws-v1.json` | Messages of both push sockets |
| `schema/api-v1.yaml` | Lobby and invite operations |

---

### Task 1: DB: lobby tables, lobby games, who aborted

**Files:**
- Create: `backend/src/db/migrations/009_lobbies.sql`
- Create: `backend/src/db/testSchema.ts`
- Modify: `backend/src/db/schema.ts`
- Modify: `backend/src/db/queries.ts` (`NewGameSession`, `insertGameSession`, `StoredGameSession`, `getActiveGameSessions`, `abortGameSession`)
- Modify: `backend/src/session/engine.test.ts` (three `StoredGameSession` literals)
- Test: `backend/src/db/lobbies.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // db/testSchema.ts
  export async function openTestSchema(schema: string): Promise<{ db: Kysely<Database>; close: () => Promise<void> }>
  // db/queries.ts
  export type NewGameSession = { id: string; owner_user_id: string; board_db_id: string | null; game_id: string; game_version: number; rng_seed: number; config: unknown; players: SeatRow[]; lobby_id?: string | null }
  export type StoredGameSession = { id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string; game_version: number; rng_seed: number; config: unknown; created_at: Date; players: StoredSeatRow[]; lobby_id: string | null; lobby_name: string | null }
  export async function abortGameSession(db: Kysely<Database>, id: string, finishedAt: Date, abortedByUserId?: string | null): Promise<void>
  // db/schema.ts: LobbiesTable, LobbyPeopleTable, LobbyInvitesTable, LobbyActivityTable; Database gains lobbies, lobby_people, lobby_invites, lobby_activity
  ```

- [ ] **Step 1: Write the migration**

`backend/src/db/migrations/009_lobbies.sql`. The migration runner splits on `;` after dropping `--` lines, so keep semicolons out of comments.

```sql
-- Lobbies: friends gather, pick boards and play games together.
-- Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md
-- Only games keep an event log: lobbies are plain rows. Rows of lobby_people and
-- lobby_activity exist only while a lobby is open.

CREATE TABLE lobbies (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  host_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  code         TEXT NOT NULL,
  throw_order  TEXT NOT NULL DEFAULT 'lobby' CHECK (throw_order IN ('lobby', 'random', 'bulloff')),
  next_game    JSONB,
  last_game    JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at    TIMESTAMPTZ
);
-- A code names one open lobby. Closed lobbies keep theirs.
CREATE UNIQUE INDEX lobbies_open_code ON lobbies (code) WHERE closed_at IS NULL;

CREATE TABLE lobby_people (
  id               TEXT PRIMARY KEY,
  lobby_id         TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  user_id          TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  added_by_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  board_id         TEXT REFERENCES boards(id) ON DELETE SET NULL,
  position         INT NOT NULL,
  plays            BOOLEAN NOT NULL DEFAULT true,
  ready            BOOLEAN NOT NULL DEFAULT false,
  board_moved_by   TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NULL OR user_id = added_by_user_id)
);
-- One open lobby per user: rows only exist for open lobbies
CREATE UNIQUE INDEX lobby_people_one_open_lobby ON lobby_people (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX lobby_people_lobby ON lobby_people (lobby_id, position);
CREATE INDEX lobby_people_board ON lobby_people (board_id);

CREATE TABLE lobby_invites (
  id              TEXT PRIMARY KEY,
  lobby_id        TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  inviter_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lobby_invites_one_pending ON lobby_invites (lobby_id, invitee_user_id) WHERE status = 'pending';
CREATE INDEX lobby_invites_invitee ON lobby_invites (invitee_user_id) WHERE status = 'pending';

CREATE TABLE lobby_activity (
  id            BIGSERIAL PRIMARY KEY,
  lobby_id      TEXT NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
  at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,
  actor_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  data          JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX lobby_activity_lobby ON lobby_activity (lobby_id, id DESC);

-- Games played in a lobby stay linked to it after it closes
ALTER TABLE game_sessions ADD COLUMN lobby_id TEXT REFERENCES lobbies(id) ON DELETE SET NULL;
ALTER TABLE game_sessions ADD COLUMN aborted_by_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
CREATE INDEX game_sessions_lobby ON game_sessions (lobby_id);
```

- [ ] **Step 2: Add the Kysely types**

In `backend/src/db/schema.ts`, add to `GameSessionsTable`:

```ts
  /** The lobby the game was started from; null for local games. */
  lobby_id: ColumnType<string | null, string | null | undefined, string | null>
  /** Who aborted the game (the host); null otherwise. */
  aborted_by_user_id: ColumnType<string | null, string | null | undefined, string | null>
```

Add these tables after `BridgeEventsTable`:

```ts
export interface LobbiesTable {
  id: string
  name: string
  /** null only once the host's account is gone; the next change hands over. */
  host_user_id: string | null
  /** 6 characters, unique among open lobbies. */
  code: string
  throw_order: ColumnType<string, string | undefined, string>
  /** { gameId, config } as the host last set it. */
  next_game: unknown
  /** { gameId, config, personIds } of the last game started here: what a rematch repeats. */
  last_game: unknown
  created_at: ColumnType<Date, never, never>
  closed_at: ColumnType<Date | null, Date | null | undefined, Date | null>
}

export interface LobbyPeopleTable {
  id: string
  lobby_id: string
  /** Set for members, null for a guest. */
  user_id: string | null
  /** The member themselves; for a guest, who added them (and acts for them in games). */
  added_by_user_id: string
  name: string
  /** null: Manual (darts entered by hand). */
  board_id: string | null
  position: number
  plays: ColumnType<boolean, boolean | undefined, boolean>
  ready: ColumnType<boolean, boolean | undefined, boolean>
  /** Who put them on their board when it wasn't their own (or their adder's) pick. */
  board_moved_by: string | null
  joined_at: ColumnType<Date, Date | undefined, never>
}

export interface LobbyInvitesTable {
  id: string
  lobby_id: string
  invitee_user_id: string
  inviter_user_id: string | null
  status: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date, never, never>
}

export interface LobbyActivityTable {
  /** BIGSERIAL; node-postgres returns it as a string */
  id: Generated<string>
  lobby_id: string
  at: ColumnType<Date, Date | undefined, never>
  kind: string
  actor_user_id: string | null
  data: unknown
}
```

Add to `Database`:

```ts
  lobbies: LobbiesTable
  lobby_people: LobbyPeopleTable
  lobby_invites: LobbyInvitesTable
  lobby_activity: LobbyActivityTable
```

- [ ] **Step 3: Add the test-schema helper**

`backend/src/db/testSchema.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations } from './queries.js'
import type { Database } from './schema.js'

/**
 * A fresh, migrated Postgres schema of its own for one DB test file: Vitest runs files in
 * parallel, and queries.test.ts wipes the shared tables. Needs TEST_DATABASE_URL.
 */
export async function openTestSchema(schema: string): Promise<{ db: Kysely<Database>; close: () => Promise<void> }> {
  const url = process.env.TEST_DATABASE_URL ?? ''
  const admin = createDb(url)
  await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(admin)
  await sql.raw(`CREATE SCHEMA ${schema}`).execute(admin)
  const db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${schema}`)
  await runMigrations(db)
  return {
    db,
    close: async () => {
      await db.destroy()
      await sql.raw(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).execute(admin)
      await admin.destroy()
    },
  }
}
```

- [ ] **Step 4: Write the failing DB tests**

`backend/src/db/lobbies.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from './schema.js'
import { openTestSchema } from './testSchema.js'
import { abortGameSession, getActiveGameSessions, insertGameSession } from './queries.js'
import { pgErrorCode } from './errors.js'

describe.skipIf(!process.env.TEST_DATABASE_URL)('lobby tables', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('lobbies_db_test'))
    await db.insertInto('user').values([
      { id: 'chris', name: 'Christoph', email: 'c@example.com', emailVerified: false, image: null },
      { id: 'lena', name: 'Lena', email: 'l@example.com', emailVerified: false, image: null },
      { id: 'max', name: 'Max', email: 'm@example.com', emailVerified: false, image: null },
      { id: 'sam', name: 'Sam', email: 's@example.com', emailVerified: false, image: null },
    ]).execute()
  })
  afterAll(async () => { await close() })

  describe('games from a lobby', () => {
    it('links a game to its lobby and reads the lobby name back', async () => {
      await db.insertInto('lobbies').values({ id: 'l1', name: "Christoph's lobby", host_user_id: 'chris', code: 'K7Q4MA' }).execute()
      await insertGameSession(db, {
        id: 'g1', owner_user_id: 'chris', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {}, lobby_id: 'l1',
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g1')
      expect(game).toMatchObject({ lobby_id: 'l1', lobby_name: "Christoph's lobby" })
    })

    it('reads a local game with no lobby', async () => {
      await insertGameSession(db, {
        id: 'g-local', owner_user_id: 'chris', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 1, config: {},
        players: [{ name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null }],
      })
      const game = (await getActiveGameSessions(db)).find(s => s.id === 'g-local')
      expect(game).toMatchObject({ lobby_id: null, lobby_name: null })
    })

    it('records who aborted a game', async () => {
      await abortGameSession(db, 'g1', new Date(), 'chris')
      await abortGameSession(db, 'g-local', new Date())
      const rows = await db.selectFrom('game_sessions').select(['id', 'status', 'aborted_by_user_id']).orderBy('id').execute()
      expect(rows).toEqual([
        { id: 'g-local', status: 'aborted', aborted_by_user_id: null },
        { id: 'g1', status: 'aborted', aborted_by_user_id: 'chris' },
      ])
    })
  })

  describe('constraints', () => {
    afterAll(async () => { await db.deleteFrom('lobby_people').execute() })

    it('keeps a user in one open lobby', async () => {
      await db.insertInto('lobbies').values([
        { id: 'c1', name: 'A', host_user_id: 'sam', code: 'AAAAAA' },
        { id: 'c2', name: 'B', host_user_id: 'sam', code: 'BBBBBB' },
      ]).execute()
      const row = (id: string, lobbyId: string) => ({
        id, lobby_id: lobbyId, user_id: 'sam', added_by_user_id: 'sam', name: 'Sam', board_id: null, position: 0, board_moved_by: null,
      })
      await db.insertInto('lobby_people').values(row('p1', 'c1')).execute()
      const err = await db.insertInto('lobby_people').values(row('p2', 'c2')).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })

    it('lets a closed lobby\'s code be used again, but not an open one\'s', async () => {
      await db.updateTable('lobbies').set({ closed_at: new Date() }).where('id', '=', 'c1').execute()
      await db.insertInto('lobbies').values({ id: 'c3', name: 'C', host_user_id: 'sam', code: 'AAAAAA' }).execute()
      const err = await db.insertInto('lobbies').values({ id: 'c4', name: 'D', host_user_id: 'sam', code: 'BBBBBB' }).execute().catch((e: unknown) => e)
      expect(pgErrorCode(err)).toBe('23505')
    })
  })
})
```

- [ ] **Step 5: Run them to verify they fail**

Run: `$T src/db/lobbies.test.ts`
Expected: FAIL. TypeScript errors or assertions show that `lobby_id`, `lobby_name` and the third argument of `abortGameSession` don't exist yet.

- [ ] **Step 6: Update the session queries**

In `backend/src/db/queries.ts`:

```ts
export type NewGameSession = {
  id: string; owner_user_id: string; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; players: SeatRow[]
  /** The lobby the game is started from; absent or null for a local game. */
  lobby_id?: string | null
}
```

```ts
export type StoredGameSession = {
  id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; created_at: Date; players: StoredSeatRow[]
  /** The lobby of a lobby game, with its current name (null for local games). */
  lobby_id: string | null; lobby_name: string | null
}
```

In `insertGameSession`, add `lobby_id: s.lobby_id ?? null` to the `game_sessions` values.

`getActiveGameSessions`: read the lobby id and name.

```ts
export async function getActiveGameSessions(db: Kysely<Database>): Promise<StoredGameSession[]> {
  const rows = await db.selectFrom('game_sessions as gs')
    .leftJoin('lobbies as l', 'l.id', 'gs.lobby_id')
    .select(['gs.id', 'gs.owner_user_id', 'gs.board_db_id', 'gs.game_id', 'gs.game_version', 'gs.rng_seed', 'gs.config', 'gs.created_at', 'gs.lobby_id', 'l.name as lobby_name'])
    .where('gs.status', '=', 'active')
    .execute()
  // ... the seat query and the mapping stay as they are
```

`abortGameSession`: record who aborted.

```ts
/** The game was ended without a result; its log and darts stay. */
export async function abortGameSession(db: Kysely<Database>, id: string, finishedAt: Date, abortedByUserId: string | null = null): Promise<void> {
  await db.updateTable('game_sessions')
    .set({ status: 'aborted', finished_at: finishedAt, aborted_by_user_id: abortedByUserId })
    .where('id', '=', id).execute()
}
```

- [ ] **Step 7: Fix the fixtures the new required fields break**

Run: `cd backend && npm run typecheck`

`backend/src/session/engine.test.ts` builds three `StoredGameSession` literals (in `describe('rebuild')` the `good` and `bad` rows, and in `describe('rebuild with seats')`). Add `lobby_id: null, lobby_name: null` to each. Fix any other literal the typecheck reports the same way.

Expected: typecheck passes.

- [ ] **Step 8: Run the tests to verify they pass**

Run: `$T src/db/ && cd backend && npm test`
Expected: PASS. Without `TEST_DATABASE_URL` the DB suites are skipped and the rest still pass.

- [ ] **Step 9: Commit**

```bash
git add backend/src/db backend/src/session/engine.test.ts
git commit -m "feat(db): lobby tables, games linked to their lobby, who aborted"
```

---

### Task 2: Lobby queries

**Files:**
- Create: `backend/src/lobby/types.ts`
- Create: `backend/src/db/lobbies.ts`
- Test: `backend/src/db/lobbies.test.ts` (append)

**Interfaces:**
- Consumes: the Task 1 tables.
- Produces:
  ```ts
  // lobby/types.ts
  export type ThrowOrder = 'lobby' | 'random' | 'bulloff'
  export type NextGame = { gameId: string; config: GameConfig }
  export type LastGame = NextGame & { personIds: string[] }
  export type LobbyPerson = { id: string; userId: string | null; addedByUserId: string; name: string; boardId: string | null; boardName: string | null; boardOwnerUserId: string | null; position: number; plays: boolean; ready: boolean; boardMovedBy: string | null; joinedAt: Date; usualBoardName: string | null }
  export type LobbyInvitee = { id: string; userId: string; name: string; invitedByUserId: string | null; createdAt: Date }
  export const ACTIVITY_KINDS: readonly ['opened', 'joined', 'left', 'removed', 'guest_added', 'board_moved', 'game_played', 'game_aborted', 'host_changed']
  export type ActivityKind = (typeof ACTIVITY_KINDS)[number]
  export type ActivityPlayer = { name: string; placement: number; forfeited: boolean }
  export type ActivityData = { name?: string; fromBoardName?: string | null; toBoardName?: string | null; sessionId?: string; gameId?: string; winnerName?: string | null; players?: ActivityPlayer[] }
  export type LobbyActivityEntry = { id: string; at: Date; kind: ActivityKind; actorUserId: string | null; actorName: string | null; data: ActivityData }
  export type LobbyState = { id: string; name: string; hostUserId: string | null; code: string; throwOrder: ThrowOrder; nextGame: NextGame | null; lastGame: LastGame | null; createdAt: Date; closedAt: Date | null; people: LobbyPerson[]; invites: LobbyInvitee[]; activity: LobbyActivityEntry[] }
  export type InviteRow = { id: string; lobbyId: string; lobbyName: string; inviterUserId: string | null; inviterName: string | null; createdAt: Date }
  // db/lobbies.ts (db may be a transaction)
  export const ACTIVITY_LIMIT = 50
  export type NewLobby = { id: string; name: string; hostUserId: string; code: string }
  export type NewPerson = { id: string; lobbyId: string; userId: string | null; addedByUserId: string; name: string; boardId: string | null; ready: boolean; joinedAt?: Date }
  export type LobbyUpdate = { name?: string; host_user_id?: string | null; code?: string; throw_order?: ThrowOrder; next_game?: NextGame | null; last_game?: LastGame | null }
  export type PersonUpdate = { board_id?: string | null; board_moved_by?: string | null; plays?: boolean; ready?: boolean }
  insertLobby(db, lobby: NewLobby, host: Omit<NewPerson, 'lobbyId'>): Promise<void>   // own transaction: pass the plain db
  insertPerson(db, p: NewPerson): Promise<void>
  loadLobby(db, id: string): Promise<LobbyState | undefined>
  getOpenLobbyIdOfUser(db, userId: string): Promise<string | undefined>
  getOpenLobbyIdByCode(db, code: string): Promise<string | undefined>
  updateLobby(db, id: string, u: LobbyUpdate): Promise<void>
  updatePerson(db, id: string, u: PersonUpdate): Promise<void>
  setPositions(db, lobbyId: string, ids: string[]): Promise<void>
  setPlaying(db, lobbyId: string, personIds: string[]): Promise<void>
  deletePeople(db, ids: string[]): Promise<void>
  clearBoardsOf(db, lobbyId: string, ownerUserId: string): Promise<void>
  releaseBoard(db, boardId: string): Promise<string[]>
  resetAfterGame(db, lobbyId: string): Promise<void>
  addActivity(db, lobbyId: string, kind: ActivityKind, actorUserId: string | null, data: ActivityData): Promise<void>
  closeLobbyRows(db, lobbyId: string, at: Date): Promise<string[]>   // own transaction: pass the plain db
  usualBoards(db, userIds: string[]): Promise<Map<string, { id: string; name: string }>>
  insertInvite(db, i: { id: string; lobbyId: string; inviteeUserId: string; inviterUserId: string }): Promise<void>
  getInvite(db, id: string): Promise<{ id: string; lobby_id: string; invitee_user_id: string; inviter_user_id: string | null; status: string; created_at: Date } | undefined>
  setInviteStatus(db, id: string, status: 'accepted' | 'declined'): Promise<void>
  acceptInvites(db, lobbyId: string, userId: string): Promise<void>
  pendingInvitesFor(db, userId: string): Promise<InviteRow[]>
  ```

- [ ] **Step 1: Write the types**

`backend/src/lobby/types.ts`:

```ts
import type { GameConfig } from '../session/types.js'

/** lobby: as the lobby lists people. random: shuffled per game. bulloff: a bull off decides. */
export type ThrowOrder = 'lobby' | 'random' | 'bulloff'

/** The game the host set up next. */
export type NextGame = { gameId: string; config: GameConfig }

/** The last game started in the lobby: what a rematch repeats (lobby person ids). */
export type LastGame = NextGame & { personIds: string[] }

/** A member (userId set) or a guest at a member's board (userId null). */
export type LobbyPerson = {
  id: string
  userId: string | null
  /** The member themselves; for a guest, who added them (and controls their seat). */
  addedByUserId: string
  name: string
  boardId: string | null
  boardName: string | null
  boardOwnerUserId: string | null
  position: number
  plays: boolean
  ready: boolean
  boardMovedBy: string | null
  joinedAt: Date
  /** A member's usual board (latest game's own board, else first paired); null for guests. */
  usualBoardName: string | null
}

/** Someone invited into the lobby who hasn't answered yet. */
export type LobbyInvitee = { id: string; userId: string; name: string; invitedByUserId: string | null; createdAt: Date }

export const ACTIVITY_KINDS = [
  'opened', 'joined', 'left', 'removed', 'guest_added', 'board_moved', 'game_played', 'game_aborted', 'host_changed',
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export type ActivityPlayer = { name: string; placement: number; forfeited: boolean }

/**
 * What an activity line shows, stored with names as they were then. Per kind:
 * opened/joined/left/removed/guest_added/host_changed: name. board_moved: name,
 * fromBoardName, toBoardName. game_played: sessionId, gameId, winnerName, players.
 * game_aborted: sessionId, gameId.
 */
export type ActivityData = {
  name?: string
  fromBoardName?: string | null
  toBoardName?: string | null
  sessionId?: string
  gameId?: string
  winnerName?: string | null
  players?: ActivityPlayer[]
}

export type LobbyActivityEntry = {
  id: string; at: Date; kind: ActivityKind; actorUserId: string | null; actorName: string | null; data: ActivityData
}

/** A lobby as loaded from the database. */
export type LobbyState = {
  id: string
  name: string
  hostUserId: string | null
  code: string
  throwOrder: ThrowOrder
  nextGame: NextGame | null
  lastGame: LastGame | null
  createdAt: Date
  closedAt: Date | null
  /** In lobby order. */
  people: LobbyPerson[]
  /** Pending invites, oldest first. */
  invites: LobbyInvitee[]
  /** Newest first, at most ACTIVITY_LIMIT. */
  activity: LobbyActivityEntry[]
}

/** A pending invite as its invitee sees it. */
export type InviteRow = {
  id: string; lobbyId: string; lobbyName: string; inviterUserId: string | null; inviterName: string | null; createdAt: Date
}
```

- [ ] **Step 2: Write the failing DB tests**

Append to `backend/src/db/lobbies.test.ts`, inside the outer `describe`, after `describe('constraints')`. Add the new imports at the top:

```ts
import { insertBoard } from './queries.js'
import {
  insertLobby, insertPerson, loadLobby, updateLobby, updatePerson, setPositions, setPlaying, resetAfterGame,
  clearBoardsOf, releaseBoard, insertInvite, getInvite, setInviteStatus, acceptInvites, pendingInvitesFor,
  closeLobbyRows, getOpenLobbyIdByCode, getOpenLobbyIdOfUser, usualBoards, addActivity,
} from './lobbies.js'
```

```ts
  describe('lobby queries', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 2, 18, min))

    beforeAll(async () => {
      await insertBoard(db, { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h-living' })
      await insertBoard(db, { id: 'lenas', owner_user_id: 'lena', name: "Lena's place", token_hash: 'h-lenas' })
      // Lena's latest game was on her own board; Christoph's had none (g1), so his first board counts
      await insertGameSession(db, {
        id: 'old', owner_user_id: 'lena', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {},
        players: [{ name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: 'lenas' }],
      })
      await insertLobby(db, { id: 'q1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD' },
        { id: 'host', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', ready: false, joinedAt: t(0) })
      await insertPerson(db, { id: 'lena-p', lobbyId: 'q1', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', ready: false, joinedAt: t(1) })
      await insertPerson(db, { id: 'guest', lobbyId: 'q1', userId: null, addedByUserId: 'chris', name: 'Guest 1', boardId: 'living', ready: true, joinedAt: t(2) })
    })

    it('finds the usual board: the own board of the latest game, else the first paired one', async () => {
      const usual = await usualBoards(db, ['chris', 'lena', 'max'])
      expect(usual.get('chris')).toEqual({ id: 'living', name: 'Living room' })
      expect(usual.get('lena')).toEqual({ id: 'lenas', name: "Lena's place" })
      expect(usual.has('max')).toBe(false)
    })

    it('loads a lobby with its people in order, their boards and usual boards', async () => {
      const lobby = await loadLobby(db, 'q1')
      expect(lobby).toMatchObject({
        id: 'q1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD',
        throwOrder: 'lobby', nextGame: null, lastGame: null, closedAt: null,
      })
      expect(lobby?.people.map(p => [p.id, p.name, p.boardName, p.boardOwnerUserId, p.usualBoardName, p.plays, p.ready])).toEqual([
        ['host', 'Christoph', 'Living room', 'chris', 'Living room', true, false],
        ['lena-p', 'Lena', "Lena's place", 'lena', "Lena's place", true, false],
        ['guest', 'Guest 1', 'Living room', 'chris', null, true, true],
      ])
      expect(lobby?.activity.map(a => [a.kind, a.actorName, a.data])).toEqual([['opened', 'Christoph', { name: 'Christoph' }]])
    })

    it('lists activity newest first', async () => {
      await addActivity(db, 'q1', 'joined', 'lena', { name: 'Lena' })
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.activity.map(a => a.kind)).toEqual(['joined', 'opened'])
    })

    it('keeps the JSON settings', async () => {
      await updateLobby(db, 'q1', {
        throw_order: 'random', next_game: { gameId: 'x01', config: { startScore: 301 } },
        last_game: { gameId: 'x01', config: {}, personIds: ['host'] },
      })
      expect(await loadLobby(db, 'q1')).toMatchObject({
        throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } }, lastGame: { personIds: ['host'] },
      })
    })

    it('reorders people and sets who plays', async () => {
      await setPositions(db, 'q1', ['guest', 'host', 'lena-p'])
      await setPlaying(db, 'q1', ['guest', 'lena-p'])
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.plays])).toEqual([['guest', true], ['host', false], ['lena-p', true]])
    })

    it('resets after a game: everyone plays, members not ready, guests ready', async () => {
      await updatePerson(db, 'lena-p', { ready: true })
      await updatePerson(db, 'guest', { ready: false })
      await resetAfterGame(db, 'q1')
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.plays, p.ready])).toEqual([['guest', true, true], ['host', true, false], ['lena-p', true, false]])
    })

    it('sends people on an owner\'s boards to Manual', async () => {
      await updatePerson(db, 'guest', { board_moved_by: 'chris' })
      await clearBoardsOf(db, 'q1', 'chris')
      const lobby = await loadLobby(db, 'q1')
      expect(lobby?.people.map(p => [p.id, p.boardId, p.boardMovedBy])).toEqual([['guest', null, null], ['host', null, null], ['lena-p', 'lenas', null]])
    })

    it('releases a board in every lobby', async () => {
      expect(await releaseBoard(db, 'lenas')).toEqual(['q1'])
      const lena = (await loadLobby(db, 'q1'))?.people.find(p => p.id === 'lena-p')
      expect(lena).toMatchObject({ boardId: null, boardMovedBy: null })
    })

    it('lists pending invites of open lobbies, and expires them when the lobby closes', async () => {
      await insertInvite(db, { id: 'inv1', lobbyId: 'q1', inviteeUserId: 'max', inviterUserId: 'lena' })
      expect(await pendingInvitesFor(db, 'max')).toEqual([
        { id: 'inv1', lobbyId: 'q1', lobbyName: "Christoph's lobby", inviterUserId: 'lena', inviterName: 'Lena', createdAt: expect.any(Date) },
      ])
      expect((await loadLobby(db, 'q1'))?.invites).toEqual([
        { id: 'inv1', userId: 'max', name: 'Max', invitedByUserId: 'lena', createdAt: expect.any(Date) },
      ])
      expect(await getOpenLobbyIdByCode(db, 'K7Q4MD')).toBe('q1')
      expect(await getOpenLobbyIdOfUser(db, 'lena')).toBe('q1')

      expect(await closeLobbyRows(db, 'q1', new Date())).toEqual(['max'])
      const closed = await loadLobby(db, 'q1')
      expect(closed?.closedAt).toBeInstanceOf(Date)
      expect(closed?.people).toEqual([])
      expect(closed?.activity).toEqual([])
      expect((await getInvite(db, 'inv1'))?.status).toBe('expired')
      expect(await pendingInvitesFor(db, 'max')).toEqual([])
      expect(await getOpenLobbyIdByCode(db, 'K7Q4MD')).toBeUndefined()
      expect(await getOpenLobbyIdOfUser(db, 'lena')).toBeUndefined()
    })

    it('accepts and declines invites', async () => {
      await insertLobby(db, { id: 'q2', name: "Max's lobby", hostUserId: 'max', code: 'QQQQQQ' },
        { id: 'max-p', userId: 'max', addedByUserId: 'max', name: 'Max', boardId: null, ready: false })
      await insertInvite(db, { id: 'inv2', lobbyId: 'q2', inviteeUserId: 'lena', inviterUserId: 'max' })
      await insertInvite(db, { id: 'inv3', lobbyId: 'q2', inviteeUserId: 'chris', inviterUserId: 'max' })
      await acceptInvites(db, 'q2', 'lena')
      await setInviteStatus(db, 'inv3', 'declined')
      expect((await getInvite(db, 'inv2'))?.status).toBe('accepted')
      expect((await getInvite(db, 'inv3'))?.status).toBe('declined')
      expect((await loadLobby(db, 'q2'))?.invites).toEqual([])
    })
  })
```

- [ ] **Step 3: Run them to verify they fail**

Run: `$T src/db/lobbies.test.ts`
Expected: FAIL with "Cannot find module './lobbies.js'" (or the TypeScript equivalent).

- [ ] **Step 4: Write the queries**

`backend/src/db/lobbies.ts`:

```ts
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import {
  ACTIVITY_KINDS, type ActivityData, type ActivityKind, type InviteRow, type LastGame, type LobbyState, type NextGame, type ThrowOrder,
} from '../lobby/types.js'

/** How many activity lines a lobby shows (newest first). */
export const ACTIVITY_LIMIT = 50

export type NewLobby = { id: string; name: string; hostUserId: string; code: string }
export type NewPerson = {
  id: string; lobbyId: string; userId: string | null; addedByUserId: string; name: string
  boardId: string | null; ready: boolean; joinedAt?: Date
}
export type LobbyUpdate = {
  name?: string; host_user_id?: string | null; code?: string; throw_order?: ThrowOrder
  next_game?: NextGame | null; last_game?: LastGame | null
}
export type PersonUpdate = { board_id?: string | null; board_moved_by?: string | null; plays?: boolean; ready?: boolean }

// JSON columns are read defensively: a value that doesn't parse reads as absent
const ConfigSchema = z.record(z.string(), z.unknown())
const NextGameSchema = z.object({ gameId: z.string(), config: ConfigSchema })
const LastGameSchema = NextGameSchema.extend({ personIds: z.array(z.string()) })
const ThrowOrderSchema = z.enum(['lobby', 'random', 'bulloff'])
const ActivityKindSchema = z.enum(ACTIVITY_KINDS)
const ActivityDataSchema = z.object({
  name: z.string().optional(),
  fromBoardName: z.string().nullable().optional(),
  toBoardName: z.string().nullable().optional(),
  sessionId: z.string().optional(),
  gameId: z.string().optional(),
  winnerName: z.string().nullable().optional(),
  players: z.array(z.object({ name: z.string(), placement: z.number().int(), forfeited: z.boolean() })).optional(),
})

function parsed<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const r = schema.safeParse(value)
  return r.success ? r.data : null
}

const json = (v: NextGame | LastGame | null): string | null => v === null ? null : JSON.stringify(v)

/** A new lobby with its host as the first person and an "opened" line. Its own transaction. */
export async function insertLobby(db: Kysely<Database>, lobby: NewLobby, host: Omit<NewPerson, 'lobbyId'>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('lobbies').values({ id: lobby.id, name: lobby.name, host_user_id: lobby.hostUserId, code: lobby.code }).execute()
    await insertPerson(trx, { ...host, lobbyId: lobby.id })
    await addActivity(trx, lobby.id, 'opened', lobby.hostUserId, { name: host.name })
  })
}

/** Adds a person at the end of the lobby order. */
export async function insertPerson(db: Kysely<Database>, p: NewPerson): Promise<void> {
  await db.insertInto('lobby_people').values({
    id: p.id, lobby_id: p.lobbyId, user_id: p.userId, added_by_user_id: p.addedByUserId, name: p.name,
    board_id: p.boardId, ready: p.ready, board_moved_by: null, joined_at: p.joinedAt ?? new Date(),
    position: sql<number>`(SELECT COALESCE(MAX(position) + 1, 0) FROM lobby_people WHERE lobby_id = ${p.lobbyId})`,
  }).execute()
}

export async function getOpenLobbyIdOfUser(db: Kysely<Database>, userId: string): Promise<string | undefined> {
  const row = await db.selectFrom('lobby_people').select('lobby_id').where('user_id', '=', userId).executeTakeFirst()
  return row?.lobby_id
}

export async function getOpenLobbyIdByCode(db: Kysely<Database>, code: string): Promise<string | undefined> {
  const row = await db.selectFrom('lobbies').select('id').where('code', '=', code).where('closed_at', 'is', null).executeTakeFirst()
  return row?.id
}

/**
 * Each user's usual board: the own board of their latest game that had one, else the
 * first board they paired. A joiner starts on it; the lobby shows it as "usually X".
 */
export async function usualBoards(db: Kysely<Database>, userIds: string[]): Promise<Map<string, { id: string; name: string }>> {
  const usual = new Map<string, { id: string; name: string }>()
  if (userIds.length === 0) return usual
  const recent = await db.selectFrom('game_players as gp')
    .innerJoin('game_sessions as gs', 'gs.id', 'gp.session_id')
    .innerJoin('boards as b', 'b.id', 'gp.board_db_id')
    .select(['gp.controller_user_id as user_id', 'b.id', 'b.name'])
    .where('gp.controller_user_id', 'in', userIds)
    .whereRef('b.owner_user_id', '=', 'gp.controller_user_id')
    .distinctOn('gp.controller_user_id')
    .orderBy('gp.controller_user_id').orderBy('gs.created_at', 'desc')
    .execute()
  for (const r of recent) if (r.user_id !== null) usual.set(r.user_id, { id: r.id, name: r.name })
  const owned = await db.selectFrom('boards').select(['owner_user_id', 'id', 'name'])
    .where('owner_user_id', 'in', userIds).orderBy('created_at').orderBy('id').execute()
  for (const b of owned) if (!usual.has(b.owner_user_id)) usual.set(b.owner_user_id, { id: b.id, name: b.name })
  return usual
}

/** The lobby with its people (board names, owners, usual boards), pending invites and feed. */
export async function loadLobby(db: Kysely<Database>, id: string): Promise<LobbyState | undefined> {
  const row = await db.selectFrom('lobbies').selectAll().where('id', '=', id).executeTakeFirst()
  if (!row) return undefined
  const people = await db.selectFrom('lobby_people as p')
    .leftJoin('boards as b', 'b.id', 'p.board_id')
    .select([
      'p.id', 'p.user_id', 'p.added_by_user_id', 'p.name', 'p.board_id', 'b.name as board_name', 'b.owner_user_id as board_owner_user_id',
      'p.position', 'p.plays', 'p.ready', 'p.board_moved_by', 'p.joined_at',
    ])
    .where('p.lobby_id', '=', id)
    .orderBy('p.position').orderBy('p.joined_at')
    .execute()
  const usual = await usualBoards(db, people.flatMap(p => p.user_id === null ? [] : [p.user_id]))
  const invites = await db.selectFrom('lobby_invites as i')
    .innerJoin('user as u', 'u.id', 'i.invitee_user_id')
    .select(['i.id', 'i.invitee_user_id', 'u.name', 'i.inviter_user_id', 'i.created_at'])
    .where('i.lobby_id', '=', id).where('i.status', '=', 'pending')
    .orderBy('i.created_at')
    .execute()
  const activity = await db.selectFrom('lobby_activity as a')
    .leftJoin('user as u', 'u.id', 'a.actor_user_id')
    .select(['a.id', 'a.at', 'a.kind', 'a.actor_user_id', 'u.name as actor_name', 'a.data'])
    .where('a.lobby_id', '=', id)
    .orderBy('a.id', 'desc')
    .limit(ACTIVITY_LIMIT)
    .execute()
  return {
    id: row.id, name: row.name, hostUserId: row.host_user_id, code: row.code,
    throwOrder: parsed(ThrowOrderSchema, row.throw_order) ?? 'lobby',
    nextGame: parsed(NextGameSchema, row.next_game),
    lastGame: parsed(LastGameSchema, row.last_game),
    createdAt: row.created_at, closedAt: row.closed_at,
    people: people.map(p => ({
      id: p.id, userId: p.user_id, addedByUserId: p.added_by_user_id, name: p.name,
      boardId: p.board_id, boardName: p.board_name, boardOwnerUserId: p.board_owner_user_id,
      position: p.position, plays: p.plays, ready: p.ready, boardMovedBy: p.board_moved_by, joinedAt: p.joined_at,
      usualBoardName: p.user_id === null ? null : usual.get(p.user_id)?.name ?? null,
    })),
    invites: invites.map(i => ({ id: i.id, userId: i.invitee_user_id, name: i.name, invitedByUserId: i.inviter_user_id, createdAt: i.created_at })),
    activity: activity.flatMap(a => {
      // A kind this build doesn't know (written by a newer one) is left out
      const kind = parsed(ActivityKindSchema, a.kind)
      if (kind === null) return []
      return [{ id: a.id, at: a.at, kind, actorUserId: a.actor_user_id, actorName: a.actor_name, data: parsed(ActivityDataSchema, a.data) ?? {} }]
    }),
  }
}

export async function updateLobby(db: Kysely<Database>, id: string, u: LobbyUpdate): Promise<void> {
  const { next_game, last_game, ...plain } = u
  await db.updateTable('lobbies').set({
    ...plain,
    ...(next_game === undefined ? {} : { next_game: json(next_game) }),
    ...(last_game === undefined ? {} : { last_game: json(last_game) }),
  }).where('id', '=', id).execute()
}

export async function updatePerson(db: Kysely<Database>, id: string, u: PersonUpdate): Promise<void> {
  await db.updateTable('lobby_people').set(u).where('id', '=', id).execute()
}

/** Rewrites the lobby order: `ids` first to last. */
export async function setPositions(db: Kysely<Database>, lobbyId: string, ids: string[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await db.updateTable('lobby_people').set({ position }).where('id', '=', id).where('lobby_id', '=', lobbyId).execute()
  }
}

/** Exactly these people play the game that starts; the others sit it out. */
export async function setPlaying(db: Kysely<Database>, lobbyId: string, personIds: string[]): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ plays: sql<boolean>`id = ANY(${personIds})` })
    .where('lobby_id', '=', lobbyId)
    .execute()
}

export async function deletePeople(db: Kysely<Database>, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await db.deleteFrom('lobby_people').where('id', 'in', ids).execute()
}

/** People in the lobby on one of the owner's boards go to Manual: the boards left with their owner. */
export async function clearBoardsOf(db: Kysely<Database>, lobbyId: string, ownerUserId: string): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ board_id: null, board_moved_by: null })
    .where('lobby_id', '=', lobbyId)
    .where('board_id', 'in', db.selectFrom('boards').select('id').where('owner_user_id', '=', ownerUserId))
    .execute()
}

/** A board is going away: everyone on it in any lobby goes to Manual. Returns the lobbies changed. */
export async function releaseBoard(db: Kysely<Database>, boardId: string): Promise<string[]> {
  const rows = await db.updateTable('lobby_people')
    .set({ board_id: null, board_moved_by: null })
    .where('board_id', '=', boardId)
    .returning('lobby_id')
    .execute()
  return [...new Set(rows.map(r => r.lobby_id))]
}

/** After every game: everyone is back in; members are not ready again, guests are. */
export async function resetAfterGame(db: Kysely<Database>, lobbyId: string): Promise<void> {
  await db.updateTable('lobby_people')
    .set({ plays: true, ready: sql<boolean>`user_id IS NULL` })
    .where('lobby_id', '=', lobbyId)
    .execute()
}

export async function addActivity(db: Kysely<Database>, lobbyId: string, kind: ActivityKind, actorUserId: string | null, data: ActivityData): Promise<void> {
  await db.insertInto('lobby_activity').values({ lobby_id: lobbyId, kind, actor_user_id: actorUserId, data: JSON.stringify(data) }).execute()
}

/** Closes the lobby: its people and feed go, pending invites expire. Returns who had one. Its own transaction. */
export async function closeLobbyRows(db: Kysely<Database>, lobbyId: string, at: Date): Promise<string[]> {
  return db.transaction().execute(async (trx) => {
    await trx.deleteFrom('lobby_people').where('lobby_id', '=', lobbyId).execute()
    await trx.deleteFrom('lobby_activity').where('lobby_id', '=', lobbyId).execute()
    const expired = await trx.updateTable('lobby_invites')
      .set({ status: 'expired' })
      .where('lobby_id', '=', lobbyId).where('status', '=', 'pending')
      .returning('invitee_user_id')
      .execute()
    await trx.updateTable('lobbies').set({ closed_at: at }).where('id', '=', lobbyId).execute()
    return expired.map(r => r.invitee_user_id)
  })
}

export async function insertInvite(db: Kysely<Database>, i: { id: string; lobbyId: string; inviteeUserId: string; inviterUserId: string }): Promise<void> {
  await db.insertInto('lobby_invites').values({ id: i.id, lobby_id: i.lobbyId, invitee_user_id: i.inviteeUserId, inviter_user_id: i.inviterUserId }).execute()
}

export async function getInvite(db: Kysely<Database>, id: string) {
  return db.selectFrom('lobby_invites').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function setInviteStatus(db: Kysely<Database>, id: string, status: 'accepted' | 'declined'): Promise<void> {
  await db.updateTable('lobby_invites').set({ status }).where('id', '=', id).where('status', '=', 'pending').execute()
}

/** The user joined: their pending invites to this lobby are accepted. */
export async function acceptInvites(db: Kysely<Database>, lobbyId: string, userId: string): Promise<void> {
  await db.updateTable('lobby_invites').set({ status: 'accepted' })
    .where('lobby_id', '=', lobbyId).where('invitee_user_id', '=', userId).where('status', '=', 'pending')
    .execute()
}

/** The user's pending invites to open lobbies, newest first. */
export async function pendingInvitesFor(db: Kysely<Database>, userId: string): Promise<InviteRow[]> {
  const rows = await db.selectFrom('lobby_invites as i')
    .innerJoin('lobbies as l', 'l.id', 'i.lobby_id')
    .leftJoin('user as u', 'u.id', 'i.inviter_user_id')
    .select(['i.id', 'i.lobby_id', 'l.name as lobby_name', 'i.inviter_user_id', 'u.name as inviter_name', 'i.created_at'])
    .where('i.invitee_user_id', '=', userId).where('i.status', '=', 'pending').where('l.closed_at', 'is', null)
    .orderBy('i.created_at', 'desc')
    .execute()
  return rows.map(r => ({
    id: r.id, lobbyId: r.lobby_id, lobbyName: r.lobby_name, inviterUserId: r.inviter_user_id, inviterName: r.inviter_name, createdAt: r.created_at,
  }))
}
```

If Kysely's types reject `distinctOn` together with the two `orderBy` calls, keep `distinctOn` and drop nothing else. Postgres requires `DISTINCT ON` to lead the `ORDER BY`, which the first `orderBy` does.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `$T src/db/lobbies.test.ts && cd backend && npm run typecheck && npm run lint`
Expected: PASS, and no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lobby/types.ts backend/src/db/lobbies.ts backend/src/db/lobbies.test.ts
git commit -m "feat(db): lobby queries: people, boards, feed, invites, close and reset"
```

---

### Task 3: Engine: lobby games, shuffled seats, who aborted, game-end hook

**Files:**
- Modify: `backend/src/session/rng.ts` (`shuffle`)
- Modify: `backend/src/session/types.ts` (`Session.lobbyId`, `Session.lobbyName` if missing)
- Modify: `backend/src/session/replay.ts` (`newSession`)
- Modify: `backend/src/session/engine.ts`
- Modify: `schema/game-ws-v1.json` (`lobbyId`, and `lobbyName` if missing), then regenerate
- Modify: `backend/frontend/src/lib/__tests__/fixtures/x01-snapshot.json`, `backend/frontend/src/lib/__tests__/gameState.test.ts` (fixture fields only)
- Test: `backend/src/session/rng.test.ts`, `backend/src/session/engine.test.ts`

**Interfaces:**
- Consumes: `StoredGameSession.lobby_id/lobby_name`, `NewGameSession.lobby_id`, `abortGameSession(..., abortedByUserId)` (Task 1).
- Produces:
  ```ts
  // rng.ts
  export function shuffle<T>(xs: readonly T[], rng: Rng): T[]
  // types.ts — Session gains
  lobbyId: string | null
  lobbyName: string | null   // ADD ONLY IF MISSING: the match-remote plan adds the same field (see Step 1)
  // engine.ts
  export type GameEnded = {
    sessionId: string; lobbyId: string | null; gameId: string
    status: 'finished' | 'aborted'; abortedByUserId: string | null
    /** Seat results in seat order; empty when aborted. */
    results: { name: string; placement: number; forfeited: boolean }[]
  }
  export type EndedFn = (e: GameEnded) => void
  export type NewSessionSpec = { ownerUserId: string; gameId: string; config: GameConfig; seats: Seat[]; lobbyId?: string | null; lobbyName?: string | null; shuffleSeats?: boolean }
  // EngineStore.abortSession(id: string, finishedAt: Date, abortedByUserId: string | null): Promise<void>
  // new SessionEngine(store, push, warn?, notify?, ended?: EndedFn)
  // SessionEngine.deleteSession(sessionId: string, abortedByUserId?: string | null): Promise<boolean>
  // SessionEngine.getLobbySession(lobbyId: string): Session | undefined   // the lobby's active game
  // Snapshot gains lobbyId: string | null (and lobbyName: string | null, see Step 1)
  ```

- [ ] **Step 1: Check what the match-remote plan already added**

Run: `grep -c lobbyName schema/game-ws-v1.json backend/src/session/types.ts`

- **Both print 0:** this task adds `lobbyName`, exactly as written below (Session field, `newSession` default null, snapshot field). The match-remote plan then finds it present and skips its own copy.
- **Both print more than 0:** the field exists already. Skip every step marked "(lobbyName)" below, and only fill it in `start()` and `rebuildOne()`.

Neither plan touches the per-seat `disconnectedAt` or the notice's `throwerName`/`throwerBoard` here.

- [ ] **Step 2: Write the failing tests**

`backend/src/session/rng.test.ts`, add:

```ts
import { shuffle } from './rng.js'

describe('shuffle', () => {
  it('is a permutation, the same for the same seed', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f']
    const once = shuffle(xs, seededRng(9))
    expect(shuffle(xs, seededRng(9))).toEqual(once)
    expect([...once].sort()).toEqual(xs)
    expect(xs).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])   // the input is left alone
  })
})
```

`backend/src/session/engine.test.ts`:
- Add `import { seededRng, shuffle } from './rng.js'` at the top.
- Update the two existing `toHaveBeenCalledWith(<id>, expect.any(Date))` assertions on `store.abortSession` (in "frees the slot once the session ends" and in `describe('rebuild')`) to `toHaveBeenCalledWith(<id>, expect.any(Date), null)`.
- Add:

```ts
describe('lobby games', () => {
  const lobbySeats = () => [seat('Christoph', 'chris', 'living'), seat('Lena', 'lena', 'lenas')]
  const lobbyGame = { ownerUserId: 'chris', gameId: 'x01', config: x01Module.defaultConfig, lobbyId: 'l1', lobbyName: "Christoph's lobby" }

  it('keeps the lobby on the game and in its snapshot', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    expect(store.insertSession).toHaveBeenCalledWith(expect.objectContaining({ lobby_id: 'l1', board_db_id: null }))
    expect(engine.getLobbySession('l1')?.id).toBe(sessionId)
    expect(engine.getSnapshot(sessionId)).toMatchObject({ lobbyId: 'l1', lobbyName: "Christoph's lobby" })
  })

  it('a local game has no lobby', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', null, 'atc', {}, [{ name: 'Alice' }])
    expect(engine.getSnapshot(sessionId)).toMatchObject({ lobbyId: null, lobbyName: null })
    expect(engine.getLobbySession('l1')).toBeUndefined()
  })

  it('shuffles the seats with the game\'s own seed for a random throw order', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    const seats = ['A', 'B', 'C', 'D', 'E', 'F'].map(n => seat(n, n.toLowerCase(), null))
    await engine.createWithSeats({ ownerUserId: 'a', gameId: 'atc', config: {}, seats, shuffleSeats: true })
    const stored = store.insertSession.mock.calls[0][0]
    const names = stored.players.map((p: { name: string }) => p.name)
    expect(names).toEqual(shuffle(seats, seededRng(stored.rng_seed)).map(s => s.name))
    expect([...names].sort()).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('tells the lobby when its game is won, with the results', async () => {
    const ended = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(ended).toHaveBeenCalledWith({
      sessionId, lobbyId: 'l1', gameId: 'x01', status: 'finished', abortedByUserId: null,
      results: [{ name: 'Christoph', placement: 1, forfeited: false }, { name: 'Lena', placement: 2, forfeited: true }],
    })
    expect(engine.getLobbySession('l1')).toBeUndefined()
  })

  it('records who aborted, and tells the lobby', async () => {
    const store = makeStore()
    const ended = vi.fn()
    const engine = new SessionEngine(store, push, undefined, undefined, ended)
    const { sessionId } = await engine.createWithSeats({ ...lobbyGame, seats: lobbySeats() })
    await engine.deleteSession(sessionId, 'chris')
    expect(store.abortSession).toHaveBeenCalledWith(sessionId, expect.any(Date), 'chris')
    expect(ended).toHaveBeenCalledWith({ sessionId, lobbyId: 'l1', gameId: 'x01', status: 'aborted', abortedByUserId: 'chris', results: [] })
  })

  it('restores a lobby game after a restart, and tells the lobby about one it can\'t restore', async () => {
    const store = makeStore()
    const ended = vi.fn()
    const row = (id: string, owner: string | null): StoredGameSession => ({
      id, owner_user_id: owner, board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: x01Module.defaultConfig,
      created_at: new Date(), lobby_id: id === 'ok' ? 'l1' : 'l2', lobby_name: 'Friday darts',
      players: [
        { name: 'Christoph', user_id: 'chris', controller_user_id: 'chris', board_db_id: null, board_name: null },
        { name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: null, board_name: null },
      ],
    })
    // No owner: it can't be played on, so it's aborted
    store.getActiveSessions.mockResolvedValue([row('ok', 'chris'), row('gone', null)])
    const engine = new SessionEngine(store, push, undefined, undefined, ended)
    await engine.rebuild()
    expect(engine.getLobbySession('l1')).toMatchObject({ id: 'ok', lobbyId: 'l1', lobbyName: 'Friday darts' })
    expect(ended).toHaveBeenCalledWith({ sessionId: 'gone', lobbyId: 'l2', gameId: 'x01', status: 'aborted', abortedByUserId: null, results: [] })
    expect(ended).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && npx vitest run src/session/rng.test.ts src/session/engine.test.ts`
Expected: FAIL. `shuffle`, `getLobbySession`, the fifth constructor argument and the snapshot fields don't exist yet.

- [ ] **Step 4: Add `shuffle`**

In `backend/src/session/rng.ts`:

```ts
/** A shuffled copy (Fisher–Yates): the same order for the same generator state. */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
```

ATC keeps its own private shuffle in `games/atc.ts`. Don't replace it, because that would change how old ATC games replay.

- [ ] **Step 5: Add the lobby to `Session` and `newSession`**

`backend/src/session/types.ts`, in `Session` after `boardId`:

```ts
  /** The lobby the game was started from; null for a local game. */
  lobbyId: string | null
  /** (lobbyName) The lobby's name at the start, for the match header; null for a local game. */
  lobbyName: string | null
```

`backend/src/session/replay.ts`, in `newSession`:
- add `lobbyId?: string | null; lobbyName?: string | null` to the argument type;
- add `lobbyId: a.lobbyId ?? null, lobbyName: a.lobbyName ?? null` to the returned object.

The `lobbyName` part is skipped if Step 1 found it.

- [ ] **Step 6: Change the engine**

In `backend/src/session/engine.ts`:

1. Imports: `import { newSeed, seededRng, shuffle } from './rng.js'`.

2. Types:

```ts
/** A game ended: the lobby it came from resets and logs it (see LobbyService.onGameEnded). */
export type GameEnded = {
  sessionId: string
  lobbyId: string | null
  gameId: string
  status: 'finished' | 'aborted'
  abortedByUserId: string | null
  /** Seat results in seat order; empty when aborted. */
  results: { name: string; placement: number; forfeited: boolean }[]
}
export type EndedFn = (e: GameEnded) => void
```

3. `EngineStore.abortSession(id: string, finishedAt: Date, abortedByUserId: string | null): Promise<void>`, and in `createEngineStore`: `abortSession: (id, at, by) => queries.abortGameSession(db, id, at, by)`.

4. `NewSessionSpec`:

```ts
export type NewSessionSpec = {
  ownerUserId: string; gameId: string; config: GameConfig; seats: Seat[]
  /** A lobby game: its lobby and that lobby's name (for the match header). */
  lobbyId?: string | null; lobbyName?: string | null
  /** Random throw order: the seats are shuffled with the game's seed before they're stored. */
  shuffleSeats?: boolean
}
```

5. Constructor: add a fifth parameter `private readonly ended: EndedFn = () => undefined`.

6. `start()`: shuffle and pass the lobby on. Replace the lines from `const sessionId = ulid()` to the `insertSession` call with:

```ts
    const sessionId = ulid()
    const seed = newSeed()
    // Stored in this order, so a replay needs no shuffle of its own
    const seats = spec.shuffleSeats === true ? shuffle(spec.seats, seededRng(seed)) : spec.seats
    const lobbyId = spec.lobbyId ?? null
    const session = newSession({
      id: sessionId, ownerUserId: spec.ownerUserId, boardId: sessionBoardId, module: mod, config: spec.config,
      seats, seed, createdAt: new Date(), lobbyId, lobbyName: spec.lobbyName ?? null,
    })
    // Claim the players and boards before the first await, so a second create running
    // at the same time sees them taken; give them back if the session can't be stored
    this.index(session)
    try {
      await this.store.insertSession({
        id: sessionId, owner_user_id: spec.ownerUserId, board_db_id: sessionBoardId, game_id: spec.gameId,
        game_version: mod.version, rng_seed: seed, config: spec.config, lobby_id: lobbyId,
        players: seats.map(s => ({ name: s.name, user_id: s.userId, controller_user_id: s.controllerUserId, board_db_id: s.boardId })),
      })
```

The `catch` stays as it is.

7. A helper and `finish()`:

```ts
  private endedOf(session: Session, status: GameEnded['status'], abortedByUserId: string | null, seatResults: FinishedSeat[]): GameEnded {
    return {
      sessionId: session.id, lobbyId: session.lobbyId, gameId: session.module.id, status, abortedByUserId,
      results: seatResults.map((r, i) => ({ name: session.players[i].name, placement: r.placement, forfeited: r.forfeited })),
    }
  }

  private async finish(session: Session, at: Date): Promise<void> {
    session.status = 'finished'
    const seatResults = results(session)
    await this.store.finishSession(session.id, at, seatResults)
    this.release(session)
    this.ended(this.endedOf(session, 'finished', null, seatResults))
  }
```

8. `rebuild()`'s catch: pass `null` as the third argument to `abortSession`, and tell the lobby:

```ts
        try {
          await this.store.abortSession(row.id, new Date(), null)
          this.ended({ sessionId: row.id, lobbyId: row.lobby_id, gameId: row.game_id, status: 'aborted', abortedByUserId: null, results: [] })
        } catch (abortErr) {
```

9. `rebuildOne()`:
   - The early abort becomes:
     ```ts
     await this.store.abortSession(row.id, new Date(), null)
     this.ended({ sessionId: row.id, lobbyId: row.lobby_id, gameId: row.game_id, status: 'aborted', abortedByUserId: null, results: [] })
     return
     ```
   - Pass `lobbyId: row.lobby_id, lobbyName: row.lobby_name` to `newSession`.
   - The won branch:
     ```ts
     if (won) {
       session.status = 'finished'
       const seatResults = results(session)
       await this.store.finishSession(row.id, events.at(-1)?.created_at ?? new Date(), seatResults)
       this.ended(this.endedOf(session, 'finished', null, seatResults))
       return
     }
     ```

10. `deleteSession`:

```ts
  async deleteSession(sessionId: string, abortedByUserId: string | null = null): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    await this.enqueue(sessionId, async () => {
      const wasActive = session.status === 'active'
      if (wasActive) {
        await this.store.abortSession(sessionId, new Date(), abortedByUserId)
        session.status = 'aborted'
      }
      this.release(session)
      // Everyone still watching sees the game end before it goes away
      this.push(sessionId)
      this.byId.delete(sessionId)
      if (wasActive) this.ended(this.endedOf(session, 'aborted', abortedByUserId, []))
    })
    return true
  }
```

11. `getLobbySession`, next to `getSessionByUser`:

```ts
  /** The lobby's running game, if any. */
  getLobbySession(lobbyId: string): Session | undefined {
    for (const s of this.byId.values()) if (s.lobbyId === lobbyId && s.status === 'active') return s
    return undefined
  }
```

12. `getSnapshot`: add to `common`:

```ts
      lobbyId: session.lobbyId,
      lobbyName: session.lobbyName,   // (lobbyName)
```

- [ ] **Step 7: Add the snapshot fields to the WS schema**

In `schema/game-ws-v1.json`, in both `X01Snapshot` and `AtcSnapshot`:
- append `"lobbyId"` (and `"lobbyName"`, if Step 1 found it missing) to `required`;
- add to `properties`:

```json
"lobbyId": { "type": ["string", "null"], "description": "The lobby the game was started from; null for a local game." },
"lobbyName": { "type": ["string", "null"], "description": "The lobby's name, for the match header; null for a local game." }
```

Run: `npm run gen:api` (repo root)

Then fix the frontend fixtures. Add `"lobbyId": null` (and `"lobbyName": null` if added here) next to `"ownerUserId"` in `backend/frontend/src/lib/__tests__/fixtures/x01-snapshot.json`. Add `lobbyId: null,` (and `lobbyName: null,`) after `ownerUserId: 'u1',` in `backend/frontend/src/lib/__tests__/gameState.test.ts`. Find any other fixture with `grep -rln "ownerUserId" backend/frontend/src --exclude-dir=api`.

- [ ] **Step 8: Run all tests and checks**

Run: `cd backend && npm run typecheck && npm run lint && npm test && cd frontend && npm run typecheck && npm test`
Expected: PASS. `snapshot.contract.test.ts` now also validates `lobbyId` through `checkSnapshot`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/session schema/game-ws-v1.json backend/src/schema backend/frontend/src/lib/api backend/frontend/src/lib/__tests__
git commit -m "feat(engine): lobby games: lobby on the session, shuffled seats, who aborted, game-end hook"
```

---

### Task 4: Lobby rules, codes and errors

**Files:**
- Create: `backend/src/lobby/rules.ts`, `backend/src/lobby/code.ts`, `backend/src/lobby/errors.ts`
- Modify: `backend/src/api/errors.ts` (`ApiError` and its handling)
- Test: `backend/src/lobby/rules.test.ts`, `backend/src/lobby/code.test.ts`, `backend/src/api/errors.test.ts`

**Interfaces:**
- Consumes: `LobbyPerson`, `LobbyState` (Task 2).
- Produces:
  ```ts
  // api/errors.ts
  export class ApiError extends Error { constructor(readonly statusCode: number, readonly body: { error: string }) }
  // lobby/errors.ts
  export type ConflictCode = 'in_lobby' | 'not_ready' | 'board_offline' | 'board_busy' | 'active_session' | 'game_running' | 'already_member' | 'already_invited'
  export type LobbyErrorBody = { error: string; code?: ConflictCode; lobbyId?: string; sessionId?: string; notReady?: { personId: string; name: string }[]; offlineBoards?: string[] }
  export class LobbyError extends ApiError {
    static badRequest(error: string): LobbyError; static forbidden(error: string): LobbyError
    static notFound(error: string): LobbyError; static conflict(body: LobbyErrorBody & { code: ConflictCode }): LobbyError
  }
  export const inLobby: (lobbyId: string) => LobbyError
  // lobby/code.ts
  export const CODE_ALPHABET: string; export const CODE_LENGTH = 6
  export function newLobbyCode(): string
  export function normalizeCode(input: string): string
  // lobby/rules.ts
  export type BoardTarget = { boardId: string; ownerUserId: string }
  export function controllerOf(p: LobbyPerson): string
  export function memberOf(lobby: LobbyState, userId: string): LobbyPerson | undefined
  export function isMember(lobby: LobbyState, userId: string): boolean
  export function isHost(lobby: LobbyState, userId: string): boolean
  export function canSetBoard(actorUserId: string, person: LobbyPerson, target: BoardTarget | null): boolean
  export function canSetReady(actorUserId: string, person: LobbyPerson): boolean
  export function canSetPlays(lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean
  export function canMove(lobby: LobbyState, actorUserId: string): boolean
  export function canRemove(lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean
  export function nextHost(lobby: LobbyState): { userId: string; name: string } | null
  export function leavingWith(lobby: LobbyState, userId: string): LobbyPerson[]
  export function reorder(people: LobbyPerson[], personId: string, index: number): string[]
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/lobby/rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { LobbyPerson, LobbyState } from './types.js'
import { canMove, canRemove, canSetBoard, canSetPlays, canSetReady, isHost, leavingWith, nextHost, reorder } from './rules.js'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: false, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const lobbyOf = (people: LobbyPerson[], hostUserId: string | null = 'chris'): LobbyState => ({
  id: 'l', name: 'L', hostUserId, code: 'AAAAAA', throwOrder: 'lobby', nextGame: null, lastGame: null,
  createdAt: new Date(0), closedAt: null, people, invites: [], activity: [],
})

const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardOwnerUserId: 'chris', position: 0 })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardOwnerUserId: 'lena', position: 1, joinedAt: new Date(1) })
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', position: 2, joinedAt: new Date(2) })
const guest = person({ id: 'g', userId: null, addedByUserId: 'lena', name: 'Guest 1', boardId: 'lenas', boardOwnerUserId: 'lena', position: 3 })
const living = { boardId: 'living', ownerUserId: 'chris' }
const garage = { boardId: 'garage', ownerUserId: 'chris' }
const lenas = { boardId: 'lenas', ownerUserId: 'lena' }
const lobby = lobbyOf([chris, lena, max, guest])

describe('canSetBoard', () => {
  it('anyone gives a person on Manual one of their own boards', () => {
    expect(canSetBoard('chris', max, living)).toBe(true)
    expect(canSetBoard('lena', max, lenas)).toBe(true)
  })

  it('nobody gives out a board they don\'t own', () => {
    expect(canSetBoard('chris', max, lenas)).toBe(false)
    expect(canSetBoard('max', max, living)).toBe(false)
  })

  it('once someone has a board, only they (or a guest\'s adder) change it; the host has no extra rights', () => {
    expect(canSetBoard('chris', lena, living)).toBe(false)
    expect(canSetBoard('lena', lena, null)).toBe(true)
    expect(canSetBoard('lena', guest, lenas)).toBe(true)
    expect(canSetBoard('chris', guest, living)).toBe(false)
  })

  it('the board\'s owner takes it back to Manual, from anyone, but can\'t swap it for another', () => {
    const maxOnLiving = person({ id: 'x', userId: 'max', addedByUserId: 'max', boardId: 'living', boardOwnerUserId: 'chris' })
    expect(canSetBoard('chris', maxOnLiving, null)).toBe(true)
    expect(canSetBoard('lena', maxOnLiving, null)).toBe(false)
    expect(canSetBoard('chris', maxOnLiving, garage)).toBe(false)
  })

  it('only the person moves themselves from Manual to Manual', () => {
    expect(canSetBoard('max', max, null)).toBe(true)
    expect(canSetBoard('chris', max, null)).toBe(false)
  })
})

describe('ready, plays, order, removal', () => {
  it('ready: only the person or a guest\'s adder, not even the host', () => {
    expect(canSetReady('lena', lena)).toBe(true)
    expect(canSetReady('lena', guest)).toBe(true)
    expect(canSetReady('chris', lena)).toBe(false)
  })

  it('plays: the person, a guest\'s adder, or the host', () => {
    expect(canSetPlays(lobby, 'max', max)).toBe(true)
    expect(canSetPlays(lobby, 'lena', guest)).toBe(true)
    expect(canSetPlays(lobby, 'chris', lena)).toBe(true)
    expect(canSetPlays(lobby, 'max', lena)).toBe(false)
  })

  it('only the host reorders', () => {
    expect(canMove(lobby, 'chris')).toBe(true)
    expect(canMove(lobby, 'lena')).toBe(false)
  })

  it('the host removes anyone else; members remove only their own guests; nobody removes themselves', () => {
    expect(canRemove(lobby, 'chris', lena)).toBe(true)
    expect(canRemove(lobby, 'chris', guest)).toBe(true)
    expect(canRemove(lobby, 'lena', guest)).toBe(true)
    expect(canRemove(lobby, 'max', guest)).toBe(false)
    expect(canRemove(lobby, 'lena', max)).toBe(false)
    expect(canRemove(lobby, 'chris', chris)).toBe(false)
  })

  it('a host who isn\'t in the lobby any more has no host rights', () => {
    expect(isHost(lobbyOf([lena, max], 'chris'), 'chris')).toBe(false)
  })
})

describe('membership changes', () => {
  it('the member who has been in the lobby longest takes over (ties: lobby order)', () => {
    expect(nextHost(lobbyOf([guest, max, lena], null))).toEqual({ userId: 'lena', name: 'Lena' })
    const tied = person({ id: 't', userId: 'sam', addedByUserId: 'sam', name: 'Sam', joinedAt: new Date(1), position: 0 })
    expect(nextHost(lobbyOf([lena, tied], null))).toEqual({ userId: 'sam', name: 'Sam' })
    expect(nextHost(lobbyOf([guest], null))).toBeNull()
  })

  it('a member leaves with their guests', () => {
    expect(leavingWith(lobby, 'lena').map(p => p.id)).toEqual(['l', 'g'])
  })

  it('reorders by moving one person to an index (clamped)', () => {
    expect(reorder(lobby.people, 'm', 0)).toEqual(['m', 'c', 'l', 'g'])
    expect(reorder(lobby.people, 'c', 99)).toEqual(['l', 'm', 'g', 'c'])
  })
})
```

`backend/src/lobby/code.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { newLobbyCode, normalizeCode } from './code.js'

describe('lobby codes', () => {
  it('are 6 characters without look-alikes (I, L, O, 0, 1)', () => {
    for (let i = 0; i < 200; i++) expect(newLobbyCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)
  })

  it('are read the way people type them', () => {
    expect(normalizeCode(' k7q4-md ')).toBe('K7Q4MD')
    expect(normalizeCode('K7Q4 MD')).toBe('K7Q4MD')
  })
})
```

`backend/src/api/errors.test.ts`, add:

```ts
import { ApiError } from './errors.js'

describe('ApiError', () => {
  it('answers with its status and body', async () => {
    const a = createFastify()
    a.get('/boom', async () => { throw new ApiError(409, { error: 'taken', code: 'in_lobby' } as { error: string }) })
    const res = await a.inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'taken', code: 'in_lobby' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/lobby src/api/errors.test.ts`
Expected: FAIL. The modules `./rules.js` and `./code.js` and the export `ApiError` don't exist yet.

- [ ] **Step 3: Add `ApiError`**

In `backend/src/api/errors.ts`:

```ts
/**
 * Thrown by a handler to answer with this status and body: an ErrorResponse, or the
 * richer body the spec gives that status (e.g. LobbyConflict).
 */
export class ApiError extends Error {
  constructor(readonly statusCode: number, readonly body: { error: string }) { super(body.error) }
}
```

In `registerErrorHandler`, first thing in the handler:

```ts
    if (err instanceof ApiError) return reply.code(err.statusCode).send(err.body)
```

- [ ] **Step 4: Write `errors.ts`, `code.ts` and `rules.ts`**

`backend/src/lobby/errors.ts`:

```ts
import { ApiError } from '../api/errors.js'

export type ConflictCode =
  | 'in_lobby' | 'not_ready' | 'board_offline' | 'board_busy' | 'active_session' | 'game_running' | 'already_member' | 'already_invited'

/** A lobby error's body (LobbyConflict in schema/api-v1.yaml); only 409s carry more than `error`. */
export type LobbyErrorBody = {
  error: string
  code?: ConflictCode
  lobbyId?: string
  sessionId?: string
  notReady?: { personId: string; name: string }[]
  offlineBoards?: string[]
}

/** A refused lobby operation; the REST layer answers with its status and body. */
export class LobbyError extends ApiError {
  // Read back as err.statusCode and err.body (ApiError)
  private constructor(status: 400 | 403 | 404 | 409, body: LobbyErrorBody) { super(status, body) }
  static badRequest(error: string): LobbyError { return new LobbyError(400, { error }) }
  static forbidden(error: string): LobbyError { return new LobbyError(403, { error }) }
  static notFound(error: string): LobbyError { return new LobbyError(404, { error }) }
  static conflict(body: LobbyErrorBody & { code: ConflictCode }): LobbyError { return new LobbyError(409, body) }
}

/** The user is in another lobby: they leave it first. */
export const inLobby = (lobbyId: string): LobbyError =>
  LobbyError.conflict({ error: 'leave your current lobby first', code: 'in_lobby', lobbyId })
```

`backend/src/lobby/code.ts`:

```ts
import { randomInt } from 'crypto'

/** No I, L, O, 0 or 1: nothing to mix up when reading a code aloud or off a screen. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

/** A new lobby code, shown as K7Q4-MD (the client adds the dash). */
export function newLobbyCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return code
}

/** A code as typed: case, dashes and spaces don't matter. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}
```

`backend/src/lobby/rules.ts`:

```ts
import type { LobbyPerson, LobbyState } from './types.js'

/** A board someone picks for a person: its id and owner. */
export type BoardTarget = { boardId: string; ownerUserId: string }

/** Who acts for a person: a member for themselves, a guest's adder for the guest. */
export const controllerOf = (p: LobbyPerson): string => p.userId ?? p.addedByUserId

export const memberOf = (lobby: LobbyState, userId: string): LobbyPerson | undefined =>
  lobby.people.find(p => p.userId === userId)

export const isMember = (lobby: LobbyState, userId: string): boolean => memberOf(lobby, userId) !== undefined

/** The host has host rights only while they're in the lobby. */
export const isHost = (lobby: LobbyState, userId: string): boolean =>
  lobby.hostUserId === userId && isMember(lobby, userId)

/**
 * The board rule (spec, Decisions → Boards). Menus only list your own boards. Anyone
 * gives a person on Manual one of their own boards. Once they have one, only the person
 * (a guest's adder) changes it, and the board's owner can take it back (to Manual).
 * `target` null means Manual.
 */
export function canSetBoard(actorUserId: string, person: LobbyPerson, target: BoardTarget | null): boolean {
  const controls = controllerOf(person) === actorUserId
  if (target === null) return controls || (person.boardId !== null && person.boardOwnerUserId === actorUserId)
  if (target.ownerUserId !== actorUserId) return false
  return controls || person.boardId === null
}

/** Nobody sets someone else's ready, not even the host. */
export const canSetReady = (actorUserId: string, person: LobbyPerson): boolean => controllerOf(person) === actorUserId

/** "I'm in" / "sitting out": the person (a guest's adder), or the host for anyone. */
export const canSetPlays = (lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean =>
  controllerOf(person) === actorUserId || isHost(lobby, actorUserId)

export const canMove = (lobby: LobbyState, actorUserId: string): boolean => isHost(lobby, actorUserId)

/** The host removes anyone else; a member removes their own guests. Leaving is separate. */
export function canRemove(lobby: LobbyState, actorUserId: string, person: LobbyPerson): boolean {
  if (person.userId === actorUserId) return false
  if (isHost(lobby, actorUserId)) return true
  return person.userId === null && person.addedByUserId === actorUserId
}

/** Who takes over as host: the member who has been in the lobby longest (ties: lobby order). */
export function nextHost(lobby: LobbyState): { userId: string; name: string } | null {
  let best: { userId: string; name: string; at: number; position: number } | null = null
  for (const p of lobby.people) {
    if (p.userId === null) continue
    const at = p.joinedAt.getTime()
    if (best === null || at < best.at || (at === best.at && p.position < best.position)) {
      best = { userId: p.userId, name: p.name, at, position: p.position }
    }
  }
  return best === null ? null : { userId: best.userId, name: best.name }
}

/** The people a member's leaving takes along: themselves and their guests. */
export const leavingWith = (lobby: LobbyState, userId: string): LobbyPerson[] =>
  lobby.people.filter(p => p.userId === userId || (p.userId === null && p.addedByUserId === userId))

/** Person ids in lobby order after moving one person to `index` (clamped to the list). */
export function reorder(people: LobbyPerson[], personId: string, index: number): string[] {
  const ids = people.map(p => p.id).filter(id => id !== personId)
  ids.splice(Math.max(0, Math.min(index, ids.length)), 0, personId)
  return ids
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/lobby src/api/errors.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lobby backend/src/api/errors.ts backend/src/api/errors.test.ts
git commit -m "feat(lobby): permission rules, lobby codes and errors"
```

---

### Task 5: A game from the lobby roster

**Files:**
- Create: `backend/src/lobby/startPlan.ts`
- Test: `backend/src/lobby/startPlan.test.ts`

**Interfaces:**
- Consumes: `controllerOf` (Task 4), `LobbyState`, `LastGame` (Task 2), `games` (`backend/src/games/index.ts`).
- Produces:
  ```ts
  export type GamePlan = { gameId: string; config: GameConfig; seats: Seat[]; shuffleSeats: boolean; personIds: string[] }
  export type PlanProblem =
    | { status: 400; error: string }
    | { status: 409; code: 'board_offline'; error: string; offlineBoards: string[] }
    | { status: 409; code: 'not_ready'; error: string; notReady: { personId: string; name: string }[] }
  export function planGame(lobby: LobbyState, game: LastGame, opts: { force: boolean; isBoardOnline: (boardId: string) => boolean }):
    { ok: true; plan: GamePlan } | { ok: false; problem: PlanProblem }
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/lobby/startPlan.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { LobbyPerson, LobbyState } from './types.js'
import { planGame } from './startPlan.js'

const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: true, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const chris = person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris' })
const lena = person({ id: 'l', userId: 'lena', addedByUserId: 'lena', name: 'Lena', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', position: 1 })
const guest = person({ id: 'g', userId: null, addedByUserId: 'lena', name: 'Guest 1', boardId: 'lenas', boardName: "Lena's place", boardOwnerUserId: 'lena', position: 2 })
const max = person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', position: 3 })   // Manual
const lobby = (over: Partial<LobbyState> = {}): LobbyState => ({
  id: 'l1', name: 'L', hostUserId: 'chris', code: 'AAAAAA', throwOrder: 'lobby', nextGame: null, lastGame: null,
  createdAt: new Date(0), closedAt: null, people: [chris, lena, guest, max], invites: [], activity: [], ...over,
})
const all = { gameId: 'x01', config: { startScore: 301 }, personIds: ['c', 'l', 'g', 'm'] }
const online = { force: false, isBoardOnline: () => true }

describe('planGame', () => {
  it('seats the players in lobby order: members control themselves, guests their adder', () => {
    const r = planGame(lobby(), { ...all, personIds: ['m', 'g', 'c'] }, online)
    expect(r.ok && r.plan.seats).toEqual([
      { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: 'living', boardName: 'Living room' },
      { name: 'Guest 1', userId: null, controllerUserId: 'lena', boardId: 'lenas', boardName: "Lena's place" },
      { name: 'Max', userId: 'max', controllerUserId: 'max', boardId: null, boardName: null },
    ])
    expect(r.ok && r.plan.personIds).toEqual(['c', 'g', 'm'])
    expect(r.ok && r.plan.shuffleSeats).toBe(false)
  })

  it('merges the settings over the game\'s defaults', () => {
    const r = planGame(lobby(), all, online)
    expect(r.ok && r.plan.config).toMatchObject({ startScore: 301, outMode: 'double', bullOff: 'off' })
  })

  it('throw order: bull off turns the game\'s bull off on (keeping PDC), random shuffles, lobby order turns it off', () => {
    const bull = planGame(lobby({ throwOrder: 'bulloff' }), all, online)
    expect(bull.ok && bull.plan.config.bullOff).toBe('wdc')
    const pdc = planGame(lobby({ throwOrder: 'bulloff' }), { ...all, config: { bullOff: 'pdc' } }, online)
    expect(pdc.ok && pdc.plan.config.bullOff).toBe('pdc')
    const random = planGame(lobby({ throwOrder: 'random' }), { ...all, config: { bullOff: 'pdc' } }, online)
    expect(random.ok && random.plan).toMatchObject({ shuffleSeats: true, config: { bullOff: 'off' } })
  })

  it('refuses a bull off for a game without one, an unknown game, nobody playing, and an invalid config', () => {
    expect(planGame(lobby({ throwOrder: 'bulloff' }), { ...all, gameId: 'atc', config: {} }, online)).toMatchObject({ ok: false, problem: { status: 400 } })
    expect(planGame(lobby(), { ...all, gameId: 'nope' }, online)).toMatchObject({ ok: false, problem: { status: 400, error: 'unknown game: nope' } })
    expect(planGame(lobby(), { ...all, personIds: [] }, online)).toMatchObject({ ok: false, problem: { status: 400, error: 'nobody plays' } })
    // X01's bull off needs two players
    expect(planGame(lobby({ throwOrder: 'bulloff' }), { ...all, personIds: ['c'] }, online)).toMatchObject({ ok: false, problem: { status: 400 } })
  })

  it('refuses offline boards by name, even when the host confirmed; Manual seats are always fine', () => {
    const opts = { force: true, isBoardOnline: (b: string) => b !== 'lenas' }
    expect(planGame(lobby(), all, opts)).toEqual({
      ok: false, problem: { status: 409, code: 'board_offline', error: "offline: Lena's place", offlineBoards: ["Lena's place"] },
    })
    expect(planGame(lobby(), { ...all, personIds: ['c', 'm'] }, opts).ok).toBe(true)
  })

  it('names who isn\'t ready, and starts anyway once the host confirms', () => {
    const notReady = lobby({ people: [{ ...chris, ready: false }, lena, { ...max, ready: false }] })
    expect(planGame(notReady, all, online)).toEqual({
      ok: false, problem: { status: 409, code: 'not_ready', error: 'not everyone is ready', notReady: [{ personId: 'c', name: 'Christoph' }, { personId: 'm', name: 'Max' }] },
    })
    expect(planGame(notReady, all, { ...online, force: true }).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/lobby/startPlan.test.ts`
Expected: FAIL with "Cannot find module './startPlan.js'".

- [ ] **Step 3: Write `startPlan.ts`**

`backend/src/lobby/startPlan.ts`:

```ts
import { games } from '../games/index.js'
import type { GameConfig, Seat } from '../session/types.js'
import { controllerOf } from './rules.js'
import type { LastGame, LobbyState } from './types.js'

/** The game a lobby start (or rematch) creates. */
export type GamePlan = { gameId: string; config: GameConfig; seats: Seat[]; shuffleSeats: boolean; personIds: string[] }

export type PlanProblem =
  | { status: 400; error: string }
  | { status: 409; code: 'board_offline'; error: string; offlineBoards: string[] }
  | { status: 409; code: 'not_ready'; error: string; notReady: { personId: string; name: string }[] }

const BULL_OFF_MODES = new Set(['wdc', 'pdc'])

/**
 * Who plays (in lobby order), in which seats, with what settings. Hard problems come
 * first; `force` (the host confirmed) only gets past people who aren't ready.
 */
export function planGame(
  lobby: LobbyState,
  game: LastGame,
  opts: { force: boolean; isBoardOnline: (boardId: string) => boolean },
): { ok: true; plan: GamePlan } | { ok: false; problem: PlanProblem } {
  const mod = games[game.gameId]
  if (!mod) return { ok: false, problem: { status: 400, error: `unknown game: ${game.gameId}` } }
  const playing = new Set(game.personIds)
  const players = lobby.people.filter(p => playing.has(p.id))
  if (players.length === 0) return { ok: false, problem: { status: 400, error: 'nobody plays' } }

  // The lobby's throw order decides the game's own bull off setting
  const hasBullOff = 'bullOff' in mod.defaultConfig
  if (lobby.throwOrder === 'bulloff' && !hasBullOff) {
    return { ok: false, problem: { status: 400, error: `${game.gameId} has no bull off: pick another throw order` } }
  }
  const config: GameConfig = { ...mod.defaultConfig, ...game.config }
  if (hasBullOff) {
    const chosen = config.bullOff
    const keep = typeof chosen === 'string' && BULL_OFF_MODES.has(chosen)
    config.bullOff = lobby.throwOrder !== 'bulloff' ? 'off' : keep ? chosen : 'wdc'
  }
  const invalid = mod.validate?.(config, players.map(p => ({ name: p.name })))
  if (invalid) return { ok: false, problem: { status: 400, error: `invalid config: ${invalid}` } }

  const offlineBoards = [...new Set(players.flatMap(p =>
    p.boardId !== null && !opts.isBoardOnline(p.boardId) ? [p.boardName ?? p.boardId] : []))]
  if (offlineBoards.length > 0) {
    return { ok: false, problem: { status: 409, code: 'board_offline', error: `offline: ${offlineBoards.join(', ')}`, offlineBoards } }
  }

  const notReady = players.filter(p => !p.ready).map(p => ({ personId: p.id, name: p.name }))
  if (notReady.length > 0 && !opts.force) {
    return { ok: false, problem: { status: 409, code: 'not_ready', error: 'not everyone is ready', notReady } }
  }

  return {
    ok: true,
    plan: {
      gameId: game.gameId,
      config,
      shuffleSeats: lobby.throwOrder === 'random',
      personIds: players.map(p => p.id),
      seats: players.map(p => ({ name: p.name, userId: p.userId, controllerUserId: controllerOf(p), boardId: p.boardId, boardName: p.boardName })),
    },
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/lobby/startPlan.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lobby/startPlan.ts backend/src/lobby/startPlan.test.ts
git commit -m "feat(lobby): plan a game from the roster: seats, throw order, soft ready gate"
```

---

### Task 6: Lobby socket schema and views

**Files:**
- Create: `schema/lobby-ws-v1.json`
- Modify: `scripts/gen-api.mjs` (generate `lobby-ws.ts`, its deref JSON and two zod schemas)
- Regenerate: `npm run gen:api` (writes `backend/src/schema/lobby-ws.ts`, `backend/src/schema/lobby-ws-v1.deref.json`, `backend/src/schema/zod.ts`, and their frontend copies)
- Create: `backend/src/lobby/view.ts`, `backend/src/lobby/validation.ts`
- Test: `backend/src/lobby/view.test.ts`

**Interfaces:**
- Consumes: `LobbyState`, `InviteRow` (Task 2), `currentSeat` (`session/access.ts`), `Session.lobbyId` (Task 3).
- Produces:
  ```ts
  // generated backend/src/schema/lobby-ws.ts
  export type ThrowOrder = 'lobby' | 'random' | 'bulloff'
  export interface NextGame { gameId: string; config: { [k: string]: unknown } }
  export interface LobbyPerson { id; userId: string | null; addedByUserId; name; boardId: string | null; boardName: string | null; boardOwnerUserId: string | null; boardOnline: boolean; boardMovedBy: string | null; usualBoardName: string | null; plays: boolean; ready: boolean; presence: 'online' | 'away' | null }
  export interface Lobby { id; name; code; hostUserId: string | null; throwOrder: ThrowOrder; nextGame: NextGame | null; canRematch: boolean; currentSessionId: string | null; createdAt: string; people: LobbyPerson[]; invites: LobbyInvitee[]; activity: LobbyActivity[] }
  export interface LobbyMessage { type: 'lobby'; lobby: Lobby }
  export interface LobbyClosedMessage { type: 'lobby_closed'; lobbyId: string }
  export type LobbyServerMessage = LobbyMessage | LobbyClosedMessage
  export interface PendingInvite { id; lobbyId; lobbyName; inviterUserId: string | null; inviterName: string | null; createdAt: string }
  export interface LobbySummary { id; name; peopleCount: number; nextGame: NextGame | null; sessionId: string | null; gameId: string | null; youThrowNext: boolean; leg: number | null }
  export interface MeMessage { type: 'me'; invites: PendingInvite[]; lobby: LobbySummary | null }
  // generated zod (frontend use): LobbyServerMessageSchema, MeMessageSchema
  // lobby/view.ts
  export type ViewContext = { online: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean; sessionId: string | null }
  export function lobbyView(lobby: LobbyState, ctx: ViewContext): Lobby
  export function lobbySummary(lobby: LobbyState, userId: string, session: Session | undefined): LobbySummary
  export function inviteView(row: InviteRow): PendingInvite
  // lobby/validation.ts
  export function checkLobbyMessage(msg: LobbyServerMessage | MeMessage, log: (message: string) => void): void
  ```

- [ ] **Step 1: Write the schema**

`schema/lobby-ws-v1.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "lobby-ws/v1",
  "title": "LobbyWs",
  "description": "Messages the backend pushes on the lobby WebSocket (/ws/lobby?lobbyId=…) and on the per-user WebSocket (/ws/me). Both only push: changes go through the REST API (schema/api-v1.yaml). The server closes them with a WsCloseCode from game-ws-v1.json: 4403 after you left or were removed, 4404 after the lobby closed.",
  "$defs": {
    "ThrowOrder": {
      "title": "ThrowOrder",
      "description": "lobby: as the lobby lists people. random: shuffled for each game. bulloff: a bull off decides (games that have one).",
      "type": "string",
      "enum": ["lobby", "random", "bulloff"]
    },
    "NextGame": {
      "title": "NextGame",
      "type": "object",
      "required": ["gameId", "config"],
      "additionalProperties": false,
      "properties": {
        "gameId": { "type": "string" },
        "config": { "type": "object", "additionalProperties": true }
      }
    },
    "LobbyPerson": {
      "title": "LobbyPerson",
      "description": "A member (userId set) or a guest at a member's board (userId null), in lobby order.",
      "type": "object",
      "required": ["id", "userId", "addedByUserId", "name", "boardId", "boardName", "boardOwnerUserId", "boardOnline", "boardMovedBy", "usualBoardName", "plays", "ready", "presence"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "userId": { "type": ["string", "null"] },
        "addedByUserId": { "type": "string", "description": "The member themselves; for a guest, who added them (and acts for them in games)." },
        "name": { "type": "string" },
        "boardId": { "type": ["string", "null"], "description": "null: Manual (darts entered by hand)." },
        "boardName": { "type": ["string", "null"] },
        "boardOwnerUserId": { "type": ["string", "null"], "description": "The board's owner, who can take it back." },
        "boardOnline": { "type": "boolean", "description": "The board's bridge is connected." },
        "boardMovedBy": { "type": ["string", "null"], "description": "Who put them on this board when it wasn't their own pick (\"Moved by you\")." },
        "usualBoardName": { "type": ["string", "null"], "description": "A member's usual board (\"usually X\"); null for guests." },
        "plays": { "type": "boolean", "description": "false: sits out the next game. Back to true after every game." },
        "ready": { "type": "boolean", "description": "Soft ready. After every game: false for members, true for guests." },
        "presence": {
          "anyOf": [{ "type": "string", "enum": ["online", "away"] }, { "type": "null" }],
          "description": "Members: online while they have the lobby open. null for guests."
        }
      }
    },
    "LobbyInvitee": {
      "title": "LobbyInvitee",
      "description": "A pending invite, shown after the joined people (\"Waiting for X to confirm\").",
      "type": "object",
      "required": ["id", "userId", "name", "invitedByUserId", "createdAt"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "userId": { "type": "string" },
        "name": { "type": "string" },
        "invitedByUserId": { "type": ["string", "null"] },
        "createdAt": { "type": "string", "format": "date-time" }
      }
    },
    "LobbyActivityData": {
      "title": "LobbyActivityData",
      "description": "Names as they were then. Per kind: opened, joined, left, removed, guest_added, host_changed: name. board_moved: name, fromBoardName, toBoardName (null = Manual). game_played: sessionId, gameId, winnerName, players. game_aborted: sessionId, gameId.",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "name": { "type": "string" },
        "fromBoardName": { "type": ["string", "null"] },
        "toBoardName": { "type": ["string", "null"] },
        "sessionId": { "type": "string" },
        "gameId": { "type": "string" },
        "winnerName": { "type": ["string", "null"] },
        "players": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["name", "placement", "forfeited"],
            "additionalProperties": false,
            "properties": {
              "name": { "type": "string" },
              "placement": { "type": "integer", "minimum": 1 },
              "forfeited": { "type": "boolean" }
            }
          }
        }
      }
    },
    "LobbyActivity": {
      "title": "LobbyActivity",
      "type": "object",
      "required": ["id", "at", "kind", "actorUserId", "actorName", "data"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "at": { "type": "string", "format": "date-time" },
        "kind": { "type": "string", "enum": ["opened", "joined", "left", "removed", "guest_added", "board_moved", "game_played", "game_aborted", "host_changed"] },
        "actorUserId": { "type": ["string", "null"], "description": "Who did it; null for game_played." },
        "actorName": { "type": ["string", "null"] },
        "data": { "$ref": "#/$defs/LobbyActivityData" }
      }
    },
    "Lobby": {
      "title": "Lobby",
      "type": "object",
      "required": ["id", "name", "code", "hostUserId", "throwOrder", "nextGame", "canRematch", "currentSessionId", "createdAt", "people", "invites", "activity"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "code": { "type": "string", "description": "6 characters; shown as K7Q4-MD." },
        "hostUserId": { "type": ["string", "null"] },
        "throwOrder": { "$ref": "#/$defs/ThrowOrder" },
        "nextGame": { "anyOf": [{ "$ref": "#/$defs/NextGame" }, { "type": "null" }] },
        "canRematch": { "type": "boolean", "description": "A game was played here: Rematch repeats it." },
        "currentSessionId": { "type": ["string", "null"], "description": "The lobby's running game." },
        "createdAt": { "type": "string", "format": "date-time" },
        "people": { "type": "array", "items": { "$ref": "#/$defs/LobbyPerson" } },
        "invites": { "type": "array", "items": { "$ref": "#/$defs/LobbyInvitee" } },
        "activity": { "type": "array", "items": { "$ref": "#/$defs/LobbyActivity" }, "description": "Newest first, at most 50." }
      }
    },
    "LobbyMessage": {
      "title": "LobbyMessage",
      "description": "The whole lobby, after every change and when presence changes.",
      "type": "object",
      "required": ["type", "lobby"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "lobby" },
        "lobby": { "$ref": "#/$defs/Lobby" }
      }
    },
    "LobbyClosedMessage": {
      "title": "LobbyClosedMessage",
      "description": "The lobby closed; the socket closes next (4404).",
      "type": "object",
      "required": ["type", "lobbyId"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "lobby_closed" },
        "lobbyId": { "type": "string" }
      }
    },
    "LobbyServerMessage": {
      "title": "LobbyServerMessage",
      "oneOf": [{ "$ref": "#/$defs/LobbyMessage" }, { "$ref": "#/$defs/LobbyClosedMessage" }]
    },
    "PendingInvite": {
      "title": "PendingInvite",
      "description": "An invite waiting for the viewer's answer (same shape as Invite in api-v1.yaml).",
      "type": "object",
      "required": ["id", "lobbyId", "lobbyName", "inviterUserId", "inviterName", "createdAt"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "lobbyId": { "type": "string" },
        "lobbyName": { "type": "string" },
        "inviterUserId": { "type": ["string", "null"] },
        "inviterName": { "type": ["string", "null"] },
        "createdAt": { "type": "string", "format": "date-time" }
      }
    },
    "LobbySummary": {
      "title": "LobbySummary",
      "description": "The viewer's lobby for the lobby indicator.",
      "type": "object",
      "required": ["id", "name", "peopleCount", "nextGame", "sessionId", "gameId", "youThrowNext", "leg"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "peopleCount": { "type": "integer", "minimum": 0 },
        "nextGame": { "anyOf": [{ "$ref": "#/$defs/NextGame" }, { "type": "null" }] },
        "sessionId": { "type": ["string", "null"], "description": "The lobby's running game." },
        "gameId": { "type": ["string", "null"], "description": "Its game mode." },
        "youThrowNext": { "type": "boolean", "description": "The viewer controls the seat that's up in the running game." },
        "leg": { "type": ["integer", "null"], "minimum": 0, "description": "The running game's leg, 0-based; null for games without legs or without a game." }
      }
    },
    "MeMessage": {
      "title": "MeMessage",
      "description": "Pushed on /ws/me when it opens and whenever it changes.",
      "type": "object",
      "required": ["type", "invites", "lobby"],
      "additionalProperties": false,
      "properties": {
        "type": { "const": "me" },
        "invites": { "type": "array", "items": { "$ref": "#/$defs/PendingInvite" } },
        "lobby": { "anyOf": [{ "$ref": "#/$defs/LobbySummary" }, { "type": "null" }] }
      }
    }
  }
}
```

- [ ] **Step 2: Generate from it**

In `scripts/gen-api.mjs`, replace `genWs` with one function per WS schema file:

```js
// TypeScript types (backend + frontend copy) and the fully inlined JSON (runtime checks)
async function genWsFile(name) {
  const src = r(`schema/${name}-v1.json`)
  const ts = await compileFromFile(src, {
    bannerComment: '',
    cwd: r('schema'),
    unreachableDefinitions: true,   // emit every $def, not only those reachable from the root
    enableConstEnums: false,        // WsCloseCode must exist at runtime
    additionalProperties: false,
    style: { singleQuote: true, semi: false },
  })
  writeTs(join(BACKEND_SCHEMA, `${name}.ts`), `schema/${name}-v1.json`, ts)
  copyFileSync(join(BACKEND_SCHEMA, `${name}.ts`), join(FRONTEND_API, `${name}.ts`))
  const deref = await $RefParser.dereference(src)
  writeFileSync(join(BACKEND_SCHEMA, `${name}-v1.deref.json`), JSON.stringify(deref, null, 2) + '\n')
}

async function genWs() {
  await genWsFile('game-ws')
  await genWsFile('lobby-ws')
}
```

In `genZod`, add after the `ws` line:

```js
  const lobby = prepForZod(await $RefParser.dereference(r('schema/lobby-ws-v1.json')))
```

Add to `schemas`:

```js
    LobbyServerMessageSchema: lobby.$defs.LobbyServerMessage,
    MeMessageSchema: lobby.$defs.MeMessage,
```

Run: `npm run gen:api` (repo root)
Expected: it writes `backend/src/schema/lobby-ws.ts`, `backend/src/schema/lobby-ws-v1.deref.json` and `backend/frontend/src/lib/api/lobby-ws.ts`, and `zod.ts` gains the two schemas. `git diff backend/src/schema/game-ws.ts` shows no change.

- [ ] **Step 3: Write the failing tests**

`backend/src/lobby/view.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { x01Module } from '../games/x01.js'
import type { LobbyPerson, LobbyState } from './types.js'
import { inviteView, lobbySummary, lobbyView } from './view.js'
import { checkLobbyMessage } from './validation.js'

const store = (): EngineStore => ({
  insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
})
const person = (over: Partial<LobbyPerson>): LobbyPerson => ({
  id: 'p', userId: null, addedByUserId: 'chris', name: 'X', boardId: null, boardName: null, boardOwnerUserId: null,
  position: 0, plays: true, ready: false, boardMovedBy: null, joinedAt: new Date(0), usualBoardName: null, ...over,
})
const at = new Date(Date.UTC(2026, 9, 2, 18, 0))
const lobby: LobbyState = {
  id: 'l1', name: "Christoph's lobby", hostUserId: 'chris', code: 'K7Q4MD', throwOrder: 'lobby',
  nextGame: { gameId: 'x01', config: { startScore: 501 } }, lastGame: null, createdAt: at, closedAt: null,
  people: [
    person({ id: 'c', userId: 'chris', addedByUserId: 'chris', name: 'Christoph', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris', usualBoardName: 'Living room' }),
    person({ id: 'm', userId: 'max', addedByUserId: 'max', name: 'Max', boardId: 'living', boardName: 'Living room', boardOwnerUserId: 'chris', boardMovedBy: 'chris' }),
    person({ id: 'g', name: 'Guest 1', ready: true }),
  ],
  invites: [{ id: 'i1', userId: 'lena', name: 'Lena', invitedByUserId: 'chris', createdAt: at }],
  activity: [{ id: '7', at, kind: 'joined', actorUserId: 'max', actorName: 'Max', data: { name: 'Max' } }],
}

describe('lobbyView', () => {
  it('shows presence for members, boards online, and dates as ISO strings', () => {
    const view = lobbyView(lobby, { online: new Set(['chris']), isBoardOnline: b => b === 'living', sessionId: null })
    expect(view.people.map(p => [p.name, p.presence, p.boardOnline, p.boardMovedBy])).toEqual([
      ['Christoph', 'online', true, null],
      ['Max', 'away', true, 'chris'],
      ['Guest 1', null, false, null],
    ])
    expect(view).toMatchObject({ canRematch: false, currentSessionId: null, createdAt: at.toISOString() })
    expect(view.invites).toEqual([{ id: 'i1', userId: 'lena', name: 'Lena', invitedByUserId: 'chris', createdAt: at.toISOString() }])
    expect(() => { checkLobbyMessage({ type: 'lobby', lobby: view }, () => undefined) }).not.toThrow()
  })
})

describe('lobbySummary', () => {
  it('says whose turn it is in the lobby\'s game, and the leg', async () => {
    const engine = new SessionEngine(store(), vi.fn())
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'chris', gameId: 'x01', config: x01Module.defaultConfig, lobbyId: 'l1', lobbyName: lobby.name,
      seats: [
        { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: null, boardName: null },
        { name: 'Max', userId: 'max', controllerUserId: 'max', boardId: null, boardName: null },
      ],
    })
    const session = engine.getSession(sessionId)
    expect(lobbySummary(lobby, 'chris', session)).toEqual({
      id: 'l1', name: "Christoph's lobby", peopleCount: 3, nextGame: { gameId: 'x01', config: { startScore: 501 } },
      sessionId, gameId: 'x01', youThrowNext: true, leg: 0,
    })
    expect(lobbySummary(lobby, 'max', session).youThrowNext).toBe(false)
    expect(lobbySummary(lobby, 'max', undefined)).toMatchObject({ sessionId: null, gameId: null, youThrowNext: false, leg: null })
    const me = { type: 'me' as const, invites: [inviteView({ id: 'i1', lobbyId: 'l1', lobbyName: 'L', inviterUserId: null, inviterName: null, createdAt: at })], lobby: lobbySummary(lobby, 'chris', session) }
    expect(() => { checkLobbyMessage(me, () => undefined) }).not.toThrow()
  })
})

describe('checkLobbyMessage', () => {
  it('throws in tests when a message doesn\'t match the schema', () => {
    expect(() => { checkLobbyMessage({ type: 'me', invites: [], lobby: { id: 1 } } as any, () => undefined) }).toThrow(/lobby-ws-v1/)
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd backend && npx vitest run src/lobby/view.test.ts`
Expected: FAIL with "Cannot find module './view.js'".

- [ ] **Step 5: Write `view.ts` and `validation.ts`**

`backend/src/lobby/view.ts`:

```ts
import type { Lobby, LobbySummary, PendingInvite } from '../schema/lobby-ws.js'
import type { Session } from '../session/types.js'
import { currentSeat } from '../session/access.js'
import type { InviteRow, LobbyState } from './types.js'

/** What a view needs besides the lobby: who has it open, which boards are online, its running game. */
export type ViewContext = { online: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean; sessionId: string | null }

/** The lobby as its socket pushes it (schema/lobby-ws-v1.json). */
export function lobbyView(lobby: LobbyState, ctx: ViewContext): Lobby {
  return {
    id: lobby.id,
    name: lobby.name,
    code: lobby.code,
    hostUserId: lobby.hostUserId,
    throwOrder: lobby.throwOrder,
    nextGame: lobby.nextGame,
    canRematch: lobby.lastGame !== null,
    currentSessionId: ctx.sessionId,
    createdAt: lobby.createdAt.toISOString(),
    people: lobby.people.map(p => ({
      id: p.id, userId: p.userId, addedByUserId: p.addedByUserId, name: p.name,
      boardId: p.boardId, boardName: p.boardName, boardOwnerUserId: p.boardOwnerUserId,
      boardOnline: p.boardId !== null && ctx.isBoardOnline(p.boardId),
      boardMovedBy: p.boardMovedBy, usualBoardName: p.usualBoardName, plays: p.plays, ready: p.ready,
      presence: p.userId === null ? null : ctx.online.has(p.userId) ? 'online' : 'away',
    })),
    invites: lobby.invites.map(i => ({
      id: i.id, userId: i.userId, name: i.name, invitedByUserId: i.invitedByUserId, createdAt: i.createdAt.toISOString(),
    })),
    activity: lobby.activity.map(a => ({
      id: a.id, at: a.at.toISOString(), kind: a.kind, actorUserId: a.actorUserId, actorName: a.actorName, data: a.data,
    })),
  }
}

/** The user's lobby as the indicator shows it (/ws/me). */
export function lobbySummary(lobby: LobbyState, userId: string, session: Session | undefined): LobbySummary {
  return {
    id: lobby.id,
    name: lobby.name,
    peopleCount: lobby.people.length,
    nextGame: lobby.nextGame,
    sessionId: session?.id ?? null,
    gameId: session?.module.id ?? null,
    youThrowNext: session !== undefined && session.seats[currentSeat(session)].controllerUserId === userId,
    leg: session?.module.getLeg?.(session.currentState) ?? null,
  }
}

/** A pending invite as its invitee sees it: on /ws/me and from GET /api/invites. */
export function inviteView(row: InviteRow): PendingInvite {
  return {
    id: row.id, lobbyId: row.lobbyId, lobbyName: row.lobbyName,
    inviterUserId: row.inviterUserId, inviterName: row.inviterName, createdAt: row.createdAt.toISOString(),
  }
}
```

`backend/src/lobby/validation.ts`:

```ts
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import lobbySchema from '../schema/lobby-ws-v1.deref.json' with { type: 'json' }
import type { LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'

// ajv-formats is CommonJS: see session/snapshotValidation.ts
const addFormats = addFormatsModule.default

const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const validateLobby = ajv.compile(lobbySchema.$defs.LobbyServerMessage)
const validateMe = ajv.compile(lobbySchema.$defs.MeMessage)

/**
 * Dev/test check of a pushed lobby or /ws/me message against schema/lobby-ws-v1.json.
 * Throws in tests (drift fails CI); logs in development.
 */
export function checkLobbyMessage(msg: LobbyServerMessage | MeMessage, log: (message: string) => void): void {
  if (process.env.NODE_ENV === 'production') return
  const validate = msg.type === 'me' ? validateMe : validateLobby
  if (validate(msg)) return
  const message = `${msg.type} message does not match schema/lobby-ws-v1.json: ${ajv.errorsText(validate.errors)}`
  if (process.env.NODE_ENV === 'test') throw new Error(message)
  log(message)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/lobby && npm run typecheck && npm run lint && cd frontend && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add schema/lobby-ws-v1.json scripts/gen-api.mjs backend/src/schema backend/frontend/src/lib/api backend/src/lobby/view.ts backend/src/lobby/validation.ts backend/src/lobby/view.test.ts
git commit -m "feat(schema): lobby socket messages, lobby and summary views"
```

---

### Task 7: Lobby service: create, join, leave, host handover, settings, close, pushes

**Files:**
- Modify: `backend/src/browser-gw/connections.ts` (`has`, `closeAll`)
- Create: `backend/src/lobby/hub.ts`
- Create: `backend/src/lobby/service.ts`
- Test: `backend/src/lobby/hub.test.ts`, `backend/src/lobby/service.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–6; `SessionEngine.getLobbySession` (Task 3); `getUsersByIds` (`db/queries.ts`); `pgErrorCode` (`db/errors.ts`).
- Produces:
  ```ts
  // browser-gw/connections.ts — BrowserConnections gains
  has(key: string): boolean
  closeAll(key: string, code: number, reason: string, userId?: string): void
  // lobby/hub.ts
  export class LobbyHub {
    addLobbySocket(lobbyId: string, ws: WebSocket, userId: string): void
    removeLobbySocket(lobbyId: string, ws: WebSocket): void
    online(lobbyId: string): Set<string>
    sendLobby(lobbyId: string, msg: LobbyServerMessage): void
    closeLobby(lobbyId: string, code: number, reason: string): void
    closeLobbyFor(lobbyId: string, userId: string, code: number, reason: string): void
    addMeSocket(userId: string, ws: WebSocket, first: MeMessage): void
    removeMeSocket(userId: string, ws: WebSocket): void
    hasMe(userId: string): boolean
    sendMe(userId: string, msg: MeMessage): void
  }
  // lobby/service.ts
  export type LobbyRef = { id: string; name: string; code: string }
  export type LobbyPreview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
  export type LobbyPatch = { name?: string; throwOrder?: ThrowOrder; nextGame?: NextGame | null; regenerateCode?: boolean }
  export type LobbyDeps = { db: Kysely<Database>; engine: SessionEngine; hub: LobbyHub; isBoardOnline: (boardId: string) => boolean; warn?: (message: string, details: unknown) => void }
  export class LobbyService {
    constructor(deps: LobbyDeps)
    create(userId: string): Promise<LobbyRef>
    current(userId: string): Promise<LobbyRef | null>
    preview(code: string): Promise<LobbyPreview | null>
    join(userId: string, lobbyId: string, code: string): Promise<LobbyRef>
    leave(userId: string, lobbyId: string): Promise<void>
    update(userId: string, lobbyId: string, patch: LobbyPatch): Promise<void>
    close(userId: string, lobbyId: string): Promise<void>
    isMember(lobbyId: string, userId: string): Promise<boolean>
    lobbyAccess(lobbyId: string, userId: string): Promise<'ok' | 'not_found' | 'forbidden'>
    view(lobbyId: string): Promise<Lobby | null>
    refreshPresence(lobbyId: string): Promise<void>
    meMessage(userId: string): Promise<MeMessage>
    pushMe(userId: string): Promise<void>
    whenIdle(lobbyId: string): Promise<void>
  }
  ```
  Every refused operation rejects with a `LobbyError` (status 400/403/404/409). A lobby you're not in reads as 404.

- [ ] **Step 1: Write the failing hub tests**

`backend/src/lobby/hub.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { LobbyHub } from './hub.js'

const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
const me = (n: number) => ({ type: 'me' as const, invites: [], lobby: n === 0 ? null : { id: 'l1', name: 'L', peopleCount: n, nextGame: null, sessionId: null, gameId: null, youThrowNext: false, leg: null } })

describe('LobbyHub', () => {
  it('knows who has a lobby open, and closes one user\'s sockets or everyone\'s', () => {
    const hub = new LobbyHub()
    const a = sock(); const b = sock(); const c = sock()
    hub.addLobbySocket('l1', a, 'chris'); hub.addLobbySocket('l1', b, 'lena'); hub.addLobbySocket('l1', c, 'lena')
    expect(hub.online('l1')).toEqual(new Set(['chris', 'lena']))
    hub.closeLobbyFor('l1', 'lena', 4403, 'left the lobby')
    expect(b.close).toHaveBeenCalledWith(4403, 'left the lobby')
    expect(c.close).toHaveBeenCalledWith(4403, 'left the lobby')
    expect(hub.online('l1')).toEqual(new Set(['chris']))
    hub.closeLobby('l1', 4404, 'lobby closed')
    expect(a.close).toHaveBeenCalledWith(4404, 'lobby closed')
    expect(hub.online('l1')).toEqual(new Set())
  })

  it('sends /ws/me only when it changed', () => {
    const hub = new LobbyHub()
    const ws = sock()
    hub.addMeSocket('lena', ws, me(0))
    expect(ws.send).toHaveBeenCalledTimes(1)
    hub.sendMe('lena', me(0))
    expect(ws.send).toHaveBeenCalledTimes(1)
    hub.sendMe('lena', me(2))
    expect(ws.send).toHaveBeenCalledTimes(2)
    expect(hub.hasMe('lena')).toBe(true)
    hub.removeMeSocket('lena', ws)
    expect(hub.hasMe('lena')).toBe(false)
  })
})
```

- [ ] **Step 2: Write the failing service tests**

`backend/src/lobby/service.test.ts`. This file grows in Tasks 8–10; each adds a `describe` inside the outer one.

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { openTestSchema } from '../db/testSchema.js'
import { insertBoard } from '../db/queries.js'
import { SessionEngine, type EngineStore } from '../session/engine.js'
import { LobbyHub } from './hub.js'
import { LobbyService } from './service.js'

const makeStore = () => ({
  insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
} satisfies EngineStore)
const sock = () => ({ readyState: 1, send: vi.fn(), close: vi.fn() }) as any
const lastMsg = (ws: { send: { mock: { calls: unknown[][] } } }) => JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))
const user = (id: string, name: string) => ({ id, name, email: `${id}@example.com`, emailVerified: false, image: null })

describe.skipIf(!process.env.TEST_DATABASE_URL)('LobbyService', () => {
  let db: Kysely<Database>
  let close: () => Promise<void>
  let engineStore: ReturnType<typeof makeStore>
  let engine: SessionEngine
  let hub: LobbyHub
  let lobbies: LobbyService
  const online = new Set<string>()

  beforeAll(async () => {
    ({ db, close } = await openTestSchema('lobby_service_test'))
    await db.insertInto('user').values([user('chris', 'Christoph'), user('lena', 'Lena'), user('max', 'Max'), user('sam', 'Sam')]).execute()
    await insertBoard(db, { id: 'living', owner_user_id: 'chris', name: 'Living room', token_hash: 'h-living' })
    await insertBoard(db, { id: 'lenas', owner_user_id: 'lena', name: "Lena's place", token_hash: 'h-lenas' })
    await insertBoard(db, { id: 'garage', owner_user_id: 'chris', name: 'Garage', token_hash: 'h-garage' })
  })
  afterAll(async () => { await close() })

  beforeEach(async () => {
    await db.deleteFrom('lobby_activity').execute()
    await db.deleteFrom('lobby_invites').execute()
    await db.deleteFrom('lobby_people').execute()
    await db.deleteFrom('lobbies').execute()
    online.clear()
    for (const b of ['living', 'lenas', 'garage']) online.add(b)
    engineStore = makeStore()
    engine = new SessionEngine(engineStore, vi.fn())
    hub = new LobbyHub()
    lobbies = new LobbyService({ db, engine, hub, isBoardOnline: b => online.has(b) })
  })

  describe('create, join, leave', () => {
    it('opens a lobby with you as host on your usual board', async () => {
      const ref = await lobbies.create('chris')
      expect(ref).toEqual({ id: expect.any(String), name: "Christoph's lobby", code: expect.stringMatching(/^[A-Z2-9]{6}$/) })
      const lobby = await lobbies.view(ref.id)
      expect(lobby?.hostUserId).toBe('chris')
      expect(lobby?.people).toMatchObject([{ userId: 'chris', name: 'Christoph', boardId: 'living', ready: false, plays: true }])
      expect(lobby?.activity.map(a => a.kind)).toEqual(['opened'])
      expect(await lobbies.current('chris')).toEqual(ref)
    })

    it('refuses a second lobby, even when two creates race', async () => {
      const results = await Promise.allSettled([lobbies.create('chris'), lobbies.create('chris')])
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
      const failed = results.find(r => r.status === 'rejected')
      expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ statusCode: 409, body: { code: 'in_lobby' } })
      expect(await db.selectFrom('lobbies').select('id').where('closed_at', 'is', null).execute()).toHaveLength(1)
    })

    it('joins by code as people type it, on the joiner\'s usual board; Manual without boards', async () => {
      const { id, code } = await lobbies.create('chris')
      expect(await lobbies.join('lena', id, `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`)).toMatchObject({ id })
      await lobbies.join('max', id, code)
      await lobbies.join('max', id, code)   // twice is fine
      const lobby = await lobbies.view(id)
      expect(lobby?.people.map(p => [p.name, p.boardName, p.ready])).toEqual([
        ['Christoph', 'Living room', false], ['Lena', "Lena's place", false], ['Max', null, false],
      ])
      expect(lobby?.activity.map(a => a.kind)).toEqual(['joined', 'joined', 'opened'])
    })

    it('refuses a wrong code, a joiner who is in another lobby, and a closed lobby', async () => {
      const a = await lobbies.create('chris')
      const b = await lobbies.create('lena')
      await expect(lobbies.join('max', a.id, a.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ')).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.join('lena', a.id, a.code)).rejects.toMatchObject({ statusCode: 409, body: { code: 'in_lobby', lobbyId: b.id } })
      await lobbies.close('chris', a.id)
      await expect(lobbies.join('max', a.id, a.code)).rejects.toMatchObject({ statusCode: 404 })
      expect(await lobbies.preview(a.code)).toBeNull()
    })

    it('previews a lobby for the join page', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      expect(await lobbies.preview(code.toLowerCase())).toEqual({
        id, name: "Christoph's lobby", hostName: 'Christoph', peopleCount: 2, boardNames: ['Living room', "Lena's place"],
      })
    })

    it('hands the host role to the member who has been there longest when the host leaves', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await lobbies.join('max', id, code)
      await lobbies.leave('chris', id)
      const lobby = await lobbies.view(id)
      expect(lobby?.hostUserId).toBe('lena')
      expect(lobby?.activity.map(a => [a.kind, a.data.name])).toEqual([
        ['host_changed', 'Lena'], ['left', 'Christoph'], ['joined', 'Max'], ['joined', 'Lena'], ['opened', 'Christoph'],
      ])
      expect(await lobbies.current('chris')).toBeNull()
      await expect(lobbies.leave('chris', id)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('closes when the last member leaves', async () => {
      const { id } = await lobbies.create('chris')
      await lobbies.leave('chris', id)
      const row = await db.selectFrom('lobbies').select('closed_at').where('id', '=', id).executeTakeFirstOrThrow()
      expect(row.closed_at).toBeInstanceOf(Date)
      expect(await lobbies.view(id)).toBeNull()
    })

    it('the host closes the lobby: people and feed go, open sockets are told and closed', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      const ws = sock()
      hub.addLobbySocket(id, ws, 'lena')
      await expect(lobbies.close('lena', id)).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.close('chris', id)
      expect(lastMsg(ws)).toEqual({ type: 'lobby_closed', lobbyId: id })
      expect(ws.close).toHaveBeenCalledWith(4404, 'lobby closed')
      expect(await db.selectFrom('lobby_people').selectAll().where('lobby_id', '=', id).execute()).toEqual([])
      expect(await lobbies.current('lena')).toBeNull()
    })

    it('a host whose account is gone hands over on the next change', async () => {
      const { id, code } = await lobbies.create('sam')
      await lobbies.join('lena', id, code)
      await db.deleteFrom('user').where('id', '=', 'sam').execute()
      await lobbies.update('lena', id, { name: 'Ours now' })
      expect(await lobbies.view(id)).toMatchObject({ hostUserId: 'lena', name: 'Ours now' })
      await db.insertInto('user').values(user('sam', 'Sam')).execute()
    })
  })

  describe('settings', () => {
    it('the host renames, sets the throw order and next game, and regenerates the code', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.update('chris', id, { name: ' Friday darts ', throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } }, regenerateCode: true })
      const lobby = await lobbies.view(id)
      expect(lobby).toMatchObject({ name: 'Friday darts', throwOrder: 'random', nextGame: { gameId: 'x01', config: { startScore: 301 } } })
      expect(lobby?.code).not.toBe(code)
      expect(await lobbies.preview(code)).toBeNull()
      expect(await lobbies.preview(lobby?.code ?? '')).toMatchObject({ id })
    })

    it('refuses members, an empty name and unknown games', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await expect(lobbies.update('lena', id, { throwOrder: 'random' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.update('chris', id, { name: '  ' })).rejects.toMatchObject({ statusCode: 400 })
      await expect(lobbies.update('chris', id, { nextGame: { gameId: 'nope', config: {} } })).rejects.toMatchObject({ statusCode: 400 })
    })
  })

  describe('pushes', () => {
    it('pushes every change to the lobby sockets, with presence', async () => {
      const { id, code } = await lobbies.create('chris')
      const ws = sock()
      hub.addLobbySocket(id, ws, 'chris')
      await lobbies.refreshPresence(id)
      expect(lastMsg(ws).lobby.people[0].presence).toBe('online')
      await lobbies.join('lena', id, code)
      expect(lastMsg(ws).lobby.people.map((p: { presence: string }) => p.presence)).toEqual(['online', 'away'])
    })

    it('pushes /ws/me to members, only when it changed', async () => {
      const me = sock()
      hub.addMeSocket('lena', me, await lobbies.meMessage('lena'))
      expect(lastMsg(me)).toEqual({ type: 'me', invites: [], lobby: null })
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      expect(lastMsg(me).lobby).toMatchObject({ id, name: "Christoph's lobby", peopleCount: 2, sessionId: null, youThrowNext: false })
      const sent = me.send.mock.calls.length
      await lobbies.pushMe('lena')
      expect(me.send.mock.calls.length).toBe(sent)
      await lobbies.leave('lena', id)
      expect(lastMsg(me).lobby).toBeNull()
    })

    it('tells the sockets who may open a lobby', async () => {
      const { id } = await lobbies.create('chris')
      expect(await lobbies.lobbyAccess(id, 'chris')).toBe('ok')
      expect(await lobbies.lobbyAccess(id, 'lena')).toBe('forbidden')
      expect(await lobbies.lobbyAccess('nope', 'chris')).toBe('not_found')
      expect(await lobbies.isMember(id, 'chris')).toBe(true)
      expect(await lobbies.isMember(id, 'lena')).toBe(false)
    })
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `$T src/lobby/hub.test.ts src/lobby/service.test.ts`
Expected: FAIL with "Cannot find module './hub.js'" and "./service.js".

- [ ] **Step 4: Extend `BrowserConnections`**

In `backend/src/browser-gw/connections.ts`, add to the class:

```ts
  /** Whether any socket is open under this key. */
  has(key: string): boolean {
    return (this.sessions.get(key)?.size ?? 0) > 0
  }

  /** Closes and forgets the key's sockets (only the user's, when given). */
  closeAll(key: string, code: number, reason: string, userId?: string): void {
    const m = this.sessions.get(key)
    if (!m) return
    for (const [ws, owner] of [...m]) {
      if (userId !== undefined && owner !== userId) continue
      m.delete(ws)
      ws.close(code, reason)
    }
    if (m.size === 0) this.sessions.delete(key)
  }
```

The class is keyed by any channel id, so the hub reuses it twice: once per lobby, and once per user (key = user id).

- [ ] **Step 5: Write the hub**

`backend/src/lobby/hub.ts`:

```ts
import type { WebSocket } from 'ws'
import { BrowserConnections } from '../browser-gw/connections.js'
import type { LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'

/** Open lobby sockets (per lobby) and per-user sockets (/ws/me, per user). */
export class LobbyHub {
  private readonly lobbies = new BrowserConnections()
  private readonly users = new BrowserConnections()
  // What each user's /ws/me last got: an unchanged message isn't sent again
  private readonly lastMe = new Map<string, string>()

  addLobbySocket(lobbyId: string, ws: WebSocket, userId: string): void { this.lobbies.add(lobbyId, ws, userId) }
  removeLobbySocket(lobbyId: string, ws: WebSocket): void { this.lobbies.remove(lobbyId, ws) }

  /** Members with the lobby open: shown online, the others away. */
  online(lobbyId: string): Set<string> { return this.lobbies.connectedUsers(lobbyId) }

  sendLobby(lobbyId: string, msg: LobbyServerMessage): void { this.lobbies.pushEach(lobbyId, () => msg) }
  closeLobby(lobbyId: string, code: number, reason: string): void { this.lobbies.closeAll(lobbyId, code, reason) }
  closeLobbyFor(lobbyId: string, userId: string, code: number, reason: string): void { this.lobbies.closeAll(lobbyId, code, reason, userId) }

  /** A /ws/me socket opened: it gets the user's current state right away. */
  addMeSocket(userId: string, ws: WebSocket, first: MeMessage): void {
    this.users.add(userId, ws, userId)
    const payload = JSON.stringify(first)
    this.lastMe.set(userId, payload)
    ws.send(payload)
  }

  removeMeSocket(userId: string, ws: WebSocket): void {
    this.users.remove(userId, ws)
    if (!this.users.has(userId)) this.lastMe.delete(userId)
  }

  hasMe(userId: string): boolean { return this.users.has(userId) }

  /** Sends the user's /ws/me sockets their state, unless it's what they already have. */
  sendMe(userId: string, msg: MeMessage): void {
    const payload = JSON.stringify(msg)
    if (this.lastMe.get(userId) === payload) return
    this.lastMe.set(userId, payload)
    this.users.pushEach(userId, () => msg)
  }
}
```

- [ ] **Step 6: Write the service (lifecycle part)**

`backend/src/lobby/service.ts`:

```ts
import { ulid } from 'ulid'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/lobbies.js'
import { getUsersByIds } from '../db/queries.js'
import { pgErrorCode } from '../db/errors.js'
import type { SessionEngine } from '../session/engine.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { Lobby, LobbyServerMessage, MeMessage } from '../schema/lobby-ws.js'
import { games } from '../games/index.js'
import { LobbyError, inLobby } from './errors.js'
import type { LobbyHub } from './hub.js'
import * as rules from './rules.js'
import { newLobbyCode, normalizeCode } from './code.js'
import { inviteView, lobbySummary, lobbyView } from './view.js'
import { checkLobbyMessage } from './validation.js'
import type { LobbyState, NextGame, ThrowOrder } from './types.js'

const UNIQUE_VIOLATION = '23505'
const CODE_ATTEMPTS = 5

export type LobbyRef = { id: string; name: string; code: string }
export type LobbyPreview = { id: string; name: string; hostName: string | null; peopleCount: number; boardNames: string[] }
export type LobbyPatch = { name?: string; throwOrder?: ThrowOrder; nextGame?: NextGame | null; regenerateCode?: boolean }

export type LobbyDeps = {
  db: Kysely<Database>
  engine: SessionEngine
  hub: LobbyHub
  isBoardOnline: (boardId: string) => boolean
  warn?: (message: string, details: unknown) => void
}

const refOf = (l: LobbyState): LobbyRef => ({ id: l.id, name: l.name, code: l.code })
const memberIds = (l: LobbyState): string[] => l.people.flatMap(p => p.userId === null ? [] : [p.userId])

/**
 * Lobbies: every rule, and every push. Changes to one lobby run one after another (like
 * the engine's per-session queue), so each change checks the state it changes. After a
 * change the lobby is reloaded and pushed to its sockets, and /ws/me to everyone it concerns.
 */
export class LobbyService {
  private readonly queues = new Map<string, Promise<unknown>>()
  // Open lobbies as last loaded; every change reloads its lobby
  private readonly cache = new Map<string, LobbyState>()

  constructor(private readonly deps: LobbyDeps) {}

  private get db(): Kysely<Database> { return this.deps.db }

  private warn(message: string, details: unknown = {}): void {
    if (this.deps.warn) this.deps.warn(message, details)
    else console.warn(message, details)
  }

  private enqueue<T>(lobbyId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(lobbyId) ?? Promise.resolve()).then(task)
    this.queues.set(lobbyId, run.catch(() => undefined))
    return run
  }

  /** Resolves once the lobby's queued changes are done. */
  async whenIdle(lobbyId: string): Promise<void> {
    await this.queues.get(lobbyId)
  }

  private async reload(lobbyId: string): Promise<LobbyState | undefined> {
    const lobby = await q.loadLobby(this.db, lobbyId)
    if (lobby && lobby.closedAt === null) this.cache.set(lobbyId, lobby)
    else this.cache.delete(lobbyId)
    return lobby
  }

  private async state(lobbyId: string): Promise<LobbyState | undefined> {
    return this.cache.get(lobbyId) ?? this.reload(lobbyId)
  }

  // Runs in the lobby's queue. The open lobby, with the user in it; a lobby you're not in reads as 404
  private async openFor(lobbyId: string, userId: string): Promise<LobbyState> {
    let lobby = await this.reload(lobbyId)
    // A host whose account is gone hands over on the next change
    if (lobby && lobby.closedAt === null && lobby.hostUserId === null) {
      await this.settleHost(lobbyId)
      lobby = this.cache.get(lobbyId)
    }
    if (!lobby || lobby.closedAt !== null || !rules.isMember(lobby, userId)) throw LobbyError.notFound('lobby not found')
    return lobby
  }

  private async openAsHost(lobbyId: string, userId: string): Promise<LobbyState> {
    const lobby = await this.openFor(lobbyId, userId)
    if (!rules.isHost(lobby, userId)) throw LobbyError.forbidden('only the host can do this')
    return lobby
  }

  // ---- views and pushes -------------------------------------------------------------

  private viewOf(lobby: LobbyState): Lobby {
    return lobbyView(lobby, {
      online: this.deps.hub.online(lobby.id),
      isBoardOnline: this.deps.isBoardOnline,
      sessionId: this.deps.engine.getLobbySession(lobby.id)?.id ?? null,
    })
  }

  /** The lobby as its socket shows it; null when it's closed or unknown. */
  async view(lobbyId: string): Promise<Lobby | null> {
    const lobby = await this.state(lobbyId)
    return lobby && lobby.closedAt === null ? this.viewOf(lobby) : null
  }

  private send(lobby: LobbyState): void {
    const msg: LobbyServerMessage = { type: 'lobby', lobby: this.viewOf(lobby) }
    checkLobbyMessage(msg, m => { this.warn(m) })
    this.deps.hub.sendLobby(lobby.id, msg)
  }

  /** Pushes the lobby to its sockets, and /ws/me to its members, invitees and `alsoUsers`. */
  private async publish(lobbyId: string, alsoUsers: string[] = []): Promise<void> {
    const lobby = this.cache.get(lobbyId)
    if (lobby) this.send(lobby)
    const users = new Set([...(lobby ? [...memberIds(lobby), ...lobby.invites.map(i => i.userId)] : []), ...alsoUsers])
    await Promise.all([...users].map(u => this.pushMe(u)))
  }

  /** A lobby socket opened or closed: everyone sees who's online. */
  async refreshPresence(lobbyId: string): Promise<void> {
    const lobby = await this.state(lobbyId)
    if (lobby && lobby.closedAt === null) this.send(lobby)
  }

  async meMessage(userId: string): Promise<MeMessage> {
    const invites = (await q.pendingInvitesFor(this.db, userId)).map(inviteView)
    const lobbyId = await q.getOpenLobbyIdOfUser(this.db, userId)
    const lobby = lobbyId === undefined ? undefined : await this.state(lobbyId)
    const msg: MeMessage = {
      type: 'me', invites,
      lobby: lobby ? lobbySummary(lobby, userId, this.deps.engine.getLobbySession(lobby.id)) : null,
    }
    checkLobbyMessage(msg, m => { this.warn(m) })
    return msg
  }

  /** Sends the user's /ws/me their state if they have it open (and it changed). */
  async pushMe(userId: string): Promise<void> {
    if (!this.deps.hub.hasMe(userId)) return
    this.deps.hub.sendMe(userId, await this.meMessage(userId))
  }

  // ---- who may look -----------------------------------------------------------------

  async isMember(lobbyId: string, userId: string): Promise<boolean> {
    const lobby = await this.state(lobbyId)
    return lobby !== undefined && lobby.closedAt === null && rules.isMember(lobby, userId)
  }

  /** Whether the user may open the lobby's socket. */
  async lobbyAccess(lobbyId: string, userId: string): Promise<'ok' | 'not_found' | 'forbidden'> {
    const lobby = await this.state(lobbyId)
    if (!lobby || lobby.closedAt !== null) return 'not_found'
    return rules.isMember(lobby, userId) ? 'ok' : 'forbidden'
  }

  async current(userId: string): Promise<LobbyRef | null> {
    const id = await q.getOpenLobbyIdOfUser(this.db, userId)
    const lobby = id === undefined ? undefined : await this.state(id)
    return lobby ? refOf(lobby) : null
  }

  /** What the Join page shows before joining. */
  async preview(code: string): Promise<LobbyPreview | null> {
    const id = await q.getOpenLobbyIdByCode(this.db, normalizeCode(code))
    const lobby = id === undefined ? undefined : await this.state(id)
    if (!lobby) return null
    const host = lobby.hostUserId === null ? undefined : rules.memberOf(lobby, lobby.hostUserId)
    return {
      id: lobby.id, name: lobby.name, hostName: host?.name ?? null, peopleCount: lobby.people.length,
      boardNames: [...new Set(lobby.people.flatMap(p => p.boardName === null ? [] : [p.boardName]))],
    }
  }

  // ---- lifecycle --------------------------------------------------------------------

  async create(userId: string): Promise<LobbyRef> {
    const open = await q.getOpenLobbyIdOfUser(this.db, userId)
    if (open !== undefined) throw inLobby(open)
    const [user] = await getUsersByIds(this.db, [userId])
    if (!user) throw LobbyError.notFound('account not found')
    const board = (await q.usualBoards(this.db, [userId])).get(userId) ?? null
    const id = ulid()
    await this.withFreshCode(userId, code => q.insertLobby(this.db,
      { id, name: `${user.name}'s lobby`, hostUserId: userId, code },
      { id: ulid(), userId, addedByUserId: userId, name: user.name, boardId: board?.id ?? null, ready: false }))
    const lobby = await this.reload(id)
    if (!lobby) throw new Error(`lobby ${id} missing after insert`)
    await this.publish(id)
    return refOf(lobby)
  }

  // Writes with fresh codes until one is free (codes are unique among open lobbies). With
  // a user, a clash can also mean they got into a lobby meanwhile (two creates racing).
  private async withFreshCode(userId: string | null, write: (code: string) => Promise<void>): Promise<void> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      try {
        await write(newLobbyCode())
        return
      } catch (err) {
        if (pgErrorCode(err) !== UNIQUE_VIOLATION) throw err
        if (userId !== null) {
          const open = await q.getOpenLobbyIdOfUser(this.db, userId)
          if (open !== undefined) throw inLobby(open)
        }
      }
    }
    throw new Error('no free lobby code')
  }

  async join(userId: string, lobbyId: string, code: string): Promise<LobbyRef> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null || lobby.code !== normalizeCode(code)) throw LobbyError.notFound('no open lobby with this code')
      return this.addMember(lobby, userId)
    })
  }

  // Runs in the lobby's queue
  private async addMember(lobby: LobbyState, userId: string): Promise<LobbyRef> {
    if (rules.isMember(lobby, userId)) return refOf(lobby)
    const open = await q.getOpenLobbyIdOfUser(this.db, userId)
    if (open !== undefined) throw inLobby(open)
    const [user] = await getUsersByIds(this.db, [userId])
    if (!user) throw LobbyError.notFound('account not found')
    const board = (await q.usualBoards(this.db, [userId])).get(userId) ?? null
    try {
      await this.db.transaction().execute(async (trx) => {
        await q.insertPerson(trx, { id: ulid(), lobbyId: lobby.id, userId, addedByUserId: userId, name: user.name, boardId: board?.id ?? null, ready: false })
        await q.acceptInvites(trx, lobby.id, userId)
        await q.addActivity(trx, lobby.id, 'joined', userId, { name: user.name })
      })
    } catch (err) {
      // They got into another lobby meanwhile
      const other = pgErrorCode(err) === UNIQUE_VIOLATION ? await q.getOpenLobbyIdOfUser(this.db, userId) : undefined
      if (other !== undefined) throw inLobby(other)
      throw err
    }
    const fresh = await this.reload(lobby.id)
    await this.publish(lobby.id, [userId])
    return refOf(fresh ?? lobby)
  }

  async leave(userId: string, lobbyId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      await this.dropMember(lobby, userId, 'left', userId)
    })
  }

  // Runs in the lobby's queue. The member goes with their guests; whoever sat at their
  // boards goes to Manual (the boards leave with their owner).
  private async dropMember(lobby: LobbyState, memberUserId: string, kind: 'left' | 'removed', actorUserId: string): Promise<void> {
    const going = rules.leavingWith(lobby, memberUserId)
    const name = rules.memberOf(lobby, memberUserId)?.name ?? ''
    await this.db.transaction().execute(async (trx) => {
      await q.deletePeople(trx, going.map(p => p.id))
      await q.clearBoardsOf(trx, lobby.id, memberUserId)
      await q.addActivity(trx, lobby.id, kind, actorUserId, { name })
    })
    this.deps.hub.closeLobbyFor(lobby.id, memberUserId, WsCloseCode.Forbidden, kind === 'left' ? 'left the lobby' : 'removed from the lobby')
    if (await this.settleHost(lobby.id) === 'open') await this.publish(lobby.id, [memberUserId])
    else await this.pushMe(memberUserId)
  }

  // Runs in the lobby's queue, after people left. Between games the lobby needs a host
  // who's in it: the member who has been there longest takes over; with no members left
  // it closes. During a game nothing changes: the host stays (and can abort) until it ends.
  private async settleHost(lobbyId: string): Promise<'open' | 'closed'> {
    const lobby = await this.reload(lobbyId)
    if (!lobby || lobby.closedAt !== null) return 'closed'
    if (this.deps.engine.getLobbySession(lobbyId)) return 'open'
    if (memberIds(lobby).length === 0) {
      await this.closeNow(lobby)
      return 'closed'
    }
    if (lobby.hostUserId !== null && rules.isMember(lobby, lobby.hostUserId)) return 'open'
    const next = rules.nextHost(lobby)
    if (next === null) return 'open'
    await this.db.transaction().execute(async (trx) => {
      await q.updateLobby(trx, lobbyId, { host_user_id: next.userId })
      await q.addActivity(trx, lobbyId, 'host_changed', next.userId, { name: next.name })
    })
    await this.reload(lobbyId)
    return 'open'
  }

  // Runs in the lobby's queue. `lobby` is the state just before closing: its members get /ws/me.
  private async closeNow(lobby: LobbyState): Promise<void> {
    const invitees = await q.closeLobbyRows(this.db, lobby.id, new Date())
    this.cache.delete(lobby.id)
    this.deps.hub.sendLobby(lobby.id, { type: 'lobby_closed', lobbyId: lobby.id })
    this.deps.hub.closeLobby(lobby.id, WsCloseCode.NotFound, 'lobby closed')
    await Promise.all([...new Set([...memberIds(lobby), ...invitees])].map(u => this.pushMe(u)))
  }

  async close(userId: string, lobbyId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      const running = this.deps.engine.getLobbySession(lobbyId)
      if (running) throw LobbyError.conflict({ error: 'a game is running: abort it first', code: 'game_running', sessionId: running.id })
      await this.closeNow(lobby)
    })
  }

  async update(userId: string, lobbyId: string, patch: LobbyPatch): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      await this.openAsHost(lobbyId, userId)
      const set: q.LobbyUpdate = {}
      if (patch.name !== undefined) {
        const name = patch.name.trim()
        if (name === '') throw LobbyError.badRequest('the name is empty')
        set.name = name
      }
      if (patch.throwOrder !== undefined) set.throw_order = patch.throwOrder
      if (patch.nextGame !== undefined) {
        if (patch.nextGame !== null && !games[patch.nextGame.gameId]) throw LobbyError.badRequest(`unknown game: ${patch.nextGame.gameId}`)
        set.next_game = patch.nextGame
      }
      if (Object.keys(set).length > 0) await q.updateLobby(this.db, lobbyId, set)
      if (patch.regenerateCode === true) await this.withFreshCode(null, code => q.updateLobby(this.db, lobbyId, { code }))
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `$T src/lobby && cd backend && npm run typecheck && npm run lint`
Expected: PASS.

If "refuses a second lobby, even when two creates race" fails because both creates succeeded, the unique index `lobby_people_one_open_lobby` is missing: check the migration (Task 1). Don't add locking in the service.

- [ ] **Step 8: Commit**

```bash
git add backend/src/browser-gw/connections.ts backend/src/lobby
git commit -m "feat(lobby): create, join by code, leave with host handover, settings, close, live pushes"
```

---

### Task 8: Lobby service: guests, boards, ready, who plays, order, removal

**Files:**
- Modify: `backend/src/lobby/service.ts`
- Test: `backend/src/lobby/service.test.ts` (new `describe('people')`)

**Interfaces:**
- Consumes: `rules.canSetBoard/canSetReady/canSetPlays/canMove/canRemove/controllerOf/reorder` (Task 4); `getBoardById` (`db/queries.ts`); `SessionEngine.getSessionByBoard`.
- Produces:
  ```ts
  export type PersonPatch = { boardId?: string | null; plays?: boolean; ready?: boolean; position?: number }
  LobbyService.addGuest(userId: string, lobbyId: string, guest: { name: string; boardId?: string | null }): Promise<{ id: string }>
  LobbyService.updatePerson(userId: string, lobbyId: string, personId: string, patch: PersonPatch): Promise<void>
  LobbyService.removePerson(userId: string, lobbyId: string, personId: string): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests**

Add inside the outer `describe` of `backend/src/lobby/service.test.ts`:

```ts
  describe('people', () => {
    let id: string
    const person = async (name: string) => {
      const p = (await lobbies.view(id))?.people.find(x => x.name === name)
      if (!p) throw new Error(`${name} is not in the lobby`)
      return p
    }

    beforeEach(async () => {
      const lobby = await lobbies.create('chris')
      id = lobby.id
      await lobbies.join('lena', id, lobby.code)
      await lobbies.join('max', id, lobby.code)
    })

    it('adds a guest at the adder\'s board, ready to play', async () => {
      const { id: guestId } = await lobbies.addGuest('lena', id, { name: '  Guest 1 ' })
      expect(await person('Guest 1')).toMatchObject({ id: guestId, userId: null, addedByUserId: 'lena', boardId: 'lenas', ready: true, plays: true })
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({ kind: 'guest_added', actorUserId: 'lena', data: { name: 'Guest 1' } })
    })

    it('puts a guest on Manual or on one of the adder\'s own boards only', async () => {
      await lobbies.addGuest('chris', id, { name: 'Pia', boardId: null })
      await lobbies.addGuest('chris', id, { name: 'Tom', boardId: 'garage' })
      expect(await person('Pia')).toMatchObject({ boardId: null })
      expect(await person('Tom')).toMatchObject({ boardId: 'garage', boardMovedBy: null })
      await expect(lobbies.addGuest('chris', id, { name: 'Ann', boardId: 'lenas' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.addGuest('chris', id, { name: ' ' })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('anyone gives a person on Manual one of their own boards, marked as moved', async () => {
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { boardId: 'garage' })
      expect(await person('Max')).toMatchObject({ boardId: 'garage', boardName: 'Garage', boardMovedBy: 'chris' })
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({
        kind: 'board_moved', actorUserId: 'chris', data: { name: 'Max', fromBoardName: null, toBoardName: 'Garage' },
      })
    })

    it('after that only the person, or the board\'s owner taking it back', async () => {
      const max = await person('Max')
      await lobbies.updatePerson('chris', id, max.id, { boardId: 'garage' })
      await expect(lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })).rejects.toMatchObject({ statusCode: 403 })
      await expect(lobbies.updatePerson('lena', id, max.id, { boardId: null })).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.updatePerson('chris', id, max.id, { boardId: null })
      expect(await person('Max')).toMatchObject({ boardId: null, boardMovedBy: null })
      // On Manual again: anyone may give theirs
      await lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })
      expect(await person('Max')).toMatchObject({ boardId: 'lenas', boardMovedBy: 'lena' })
      await lobbies.updatePerson('max', id, max.id, { boardId: null })
      expect(await person('Max')).toMatchObject({ boardId: null })
    })

    it('the host has no extra board rights', async () => {
      await expect(lobbies.updatePerson('chris', id, (await person('Lena')).id, { boardId: 'living' })).rejects.toMatchObject({ statusCode: 403 })
    })

    it('refuses a board that is in another game', async () => {
      await engine.create('chris', 'garage', 'atc', {}, [{ name: 'Christoph' }])
      await expect(lobbies.updatePerson('chris', id, (await person('Max')).id, { boardId: 'garage' }))
        .rejects.toMatchObject({ statusCode: 409, body: { code: 'board_busy' } })
    })

    it('ready: only the person, not even the host; plays: the person or the host', async () => {
      const lena = await person('Lena')
      await expect(lobbies.updatePerson('chris', id, lena.id, { ready: true })).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.updatePerson('lena', id, lena.id, { ready: true })
      await lobbies.updatePerson('chris', id, lena.id, { plays: false })
      await expect(lobbies.updatePerson('max', id, lena.id, { plays: true })).rejects.toMatchObject({ statusCode: 403 })
      expect(await person('Lena')).toMatchObject({ ready: true, plays: false })
    })

    it('writes nothing when one field of a change is refused', async () => {
      const lena = await person('Lena')
      await expect(lobbies.updatePerson('lena', id, lena.id, { ready: true, position: 0 })).rejects.toMatchObject({ statusCode: 403 })
      expect(await person('Lena')).toMatchObject({ ready: false })
    })

    it('the host reorders people', async () => {
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { position: 0 })
      expect((await lobbies.view(id))?.people.map(p => p.name)).toEqual(['Max', 'Christoph', 'Lena'])
    })

    it('the host removes a member with their guests; a member removes only their own guests', async () => {
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await expect(lobbies.removePerson('max', id, (await person('Guest 1')).id)).rejects.toMatchObject({ statusCode: 403 })
      const lenaWs = sock()
      hub.addLobbySocket(id, lenaWs, 'lena')
      await lobbies.removePerson('chris', id, (await person('Lena')).id)
      expect((await lobbies.view(id))?.people.map(p => p.name)).toEqual(['Christoph', 'Max'])
      expect(lenaWs.close).toHaveBeenCalledWith(4403, 'removed from the lobby')
      await lobbies.addGuest('max', id, { name: 'Pia' })
      await lobbies.removePerson('max', id, (await person('Pia')).id)
      expect((await lobbies.view(id))?.activity.slice(0, 1)).toMatchObject([{ kind: 'removed', actorUserId: 'max', data: { name: 'Pia' } }])
    })

    it('a member who leaves takes their boards along: people on them go to Manual', async () => {
      const max = await person('Max')
      await lobbies.updatePerson('lena', id, max.id, { boardId: 'lenas' })
      await lobbies.leave('lena', id)
      expect(await person('Max')).toMatchObject({ boardId: null, boardMovedBy: null })
    })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$T src/lobby/service.test.ts`
Expected: FAIL with "lobbies.addGuest is not a function" (and the same for the others).

- [ ] **Step 3: Implement**

In `backend/src/lobby/service.ts`, replace the `db/queries.js` and `./types.js` imports with:

```ts
import { getBoardById, getUsersByIds } from '../db/queries.js'
import type { LobbyPerson, LobbyState, NextGame, ThrowOrder } from './types.js'
```

and the type:

```ts
export type PersonPatch = { boardId?: string | null; plays?: boolean; ready?: boolean; position?: number }
```

Add to the class:

```ts
  // ---- people -----------------------------------------------------------------------

  async addGuest(userId: string, lobbyId: string, guest: { name: string; boardId?: string | null }): Promise<{ id: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const name = guest.name.trim()
      if (name === '') throw LobbyError.badRequest('the name is empty')
      // A guest sits at their adder's board, unless the adder picks one of their own or Manual
      let boardId: string | null
      if (guest.boardId === undefined) boardId = rules.memberOf(lobby, userId)?.boardId ?? null
      else if (guest.boardId === null) boardId = null
      else boardId = (await this.ownFreeBoard(lobbyId, userId, guest.boardId)).id
      const id = ulid()
      await this.db.transaction().execute(async (trx) => {
        await q.insertPerson(trx, { id, lobbyId, userId: null, addedByUserId: userId, name, boardId, ready: true })
        await q.addActivity(trx, lobbyId, 'guest_added', userId, { name })
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
      return { id }
    })
  }

  // A board the user owns that isn't in another game
  private async ownFreeBoard(lobbyId: string, userId: string, boardId: string): Promise<{ id: string; name: string }> {
    const board = await getBoardById(this.db, boardId)
    if (!board) throw LobbyError.badRequest('board not found')
    if (board.owner_user_id !== userId) throw LobbyError.forbidden('you can only pick your own boards')
    this.assertBoardFree(lobbyId, board.id)
    return { id: board.id, name: board.name }
  }

  // Busy: in an active game that isn't this lobby's own (that one ends before the next starts)
  private assertBoardFree(lobbyId: string, boardId: string): void {
    const session = this.deps.engine.getSessionByBoard(boardId)
    if (session && session.lobbyId !== lobbyId) throw LobbyError.conflict({ error: 'that board is in another game', code: 'board_busy' })
  }

  async updatePerson(userId: string, lobbyId: string, personId: string, patch: PersonPatch): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const person = lobby.people.find(p => p.id === personId)
      if (!person) throw LobbyError.notFound('person not found')
      // Every field is checked before anything is written
      if (patch.ready !== undefined && !rules.canSetReady(userId, person)) throw LobbyError.forbidden('only they set their own ready')
      if (patch.plays !== undefined && !rules.canSetPlays(lobby, userId, person)) throw LobbyError.forbidden('only they or the host decide whether they play')
      if (patch.position !== undefined && !rules.canMove(lobby, userId)) throw LobbyError.forbidden('only the host reorders people')
      const board = patch.boardId === undefined ? undefined : await this.boardChange(lobby, userId, person, patch.boardId)

      const set: q.PersonUpdate = {}
      if (patch.ready !== undefined) set.ready = patch.ready
      if (patch.plays !== undefined) set.plays = patch.plays
      if (board) {
        set.board_id = board.boardId
        set.board_moved_by = board.movedBy
      }
      await this.db.transaction().execute(async (trx) => {
        if (Object.keys(set).length > 0) await q.updatePerson(trx, personId, set)
        if (patch.position !== undefined) await q.setPositions(trx, lobbyId, rules.reorder(lobby.people, personId, patch.position))
        if (board) {
          await q.addActivity(trx, lobbyId, 'board_moved', userId, { name: person.name, fromBoardName: person.boardName, toBoardName: board.boardName })
        }
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }

  // The board rule (spec, Decisions → Boards); undefined when the board stays the same
  private async boardChange(lobby: LobbyState, userId: string, person: LobbyPerson, boardId: string | null):
    Promise<{ boardId: string | null; boardName: string | null; movedBy: string | null } | undefined> {
    const target = boardId === null ? null : await getBoardById(this.db, boardId)
    if (target === undefined) throw LobbyError.badRequest('board not found')
    const allowed = rules.canSetBoard(userId, person, target === null ? null : { boardId: target.id, ownerUserId: target.owner_user_id })
    if (!allowed) throw LobbyError.forbidden('you can give out your own boards to people on Manual, change your own rows, or take your board back')
    if ((target?.id ?? null) === person.boardId) return undefined
    if (target !== null) this.assertBoardFree(lobby.id, target.id)
    // "Moved by you": someone put them on a board they (or their adder) didn't pick
    const movedBy = target !== null && rules.controllerOf(person) !== userId ? userId : null
    return { boardId: target?.id ?? null, boardName: target?.name ?? null, movedBy }
  }

  async removePerson(userId: string, lobbyId: string, personId: string): Promise<void> {
    await this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      const person = lobby.people.find(p => p.id === personId)
      if (!person) throw LobbyError.notFound('person not found')
      if (!rules.canRemove(lobby, userId, person)) throw LobbyError.forbidden('the host removes people; members remove their own guests')
      if (person.userId !== null) {
        await this.dropMember(lobby, person.userId, 'removed', userId)
        return
      }
      await this.db.transaction().execute(async (trx) => {
        await q.deletePeople(trx, [person.id])
        await q.addActivity(trx, lobbyId, 'removed', userId, { name: person.name })
      })
      await this.reload(lobbyId)
      await this.publish(lobbyId)
    })
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$T src/lobby/service.test.ts && cd backend && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lobby/service.ts backend/src/lobby/service.test.ts
git commit -m "feat(lobby): guests, the board rule, ready, who plays, order and removal"
```

---

### Task 9: Lobby service: invites

**Files:**
- Modify: `backend/src/lobby/service.ts`
- Test: `backend/src/lobby/service.test.ts` (new `describe('invites')`)

**Interfaces:**
- Consumes: invite queries (Task 2), `addMember` (Task 7), `inviteView` (Task 6).
- Produces:
  ```ts
  LobbyService.invite(userId: string, lobbyId: string, inviteeUserId: string): Promise<{ id: string }>
  LobbyService.listInvites(userId: string): Promise<PendingInvite[]>
  LobbyService.acceptInvite(userId: string, inviteId: string): Promise<LobbyRef>
  LobbyService.declineInvite(userId: string, inviteId: string): Promise<void>
  ```

- [ ] **Step 1: Write the failing tests**

Add inside the outer `describe` of `backend/src/lobby/service.test.ts`:

```ts
  describe('invites', () => {
    it('a member invites an account; the invitee sees it live and accepts into the lobby', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      const me = sock()
      hub.addMeSocket('max', me, await lobbies.meMessage('max'))
      const { id: inviteId } = await lobbies.invite('lena', id, 'max')
      expect(lastMsg(me).invites).toEqual([
        { id: inviteId, lobbyId: id, lobbyName: "Christoph's lobby", inviterUserId: 'lena', inviterName: 'Lena', createdAt: expect.any(String) },
      ])
      expect((await lobbies.view(id))?.invites).toMatchObject([{ userId: 'max', name: 'Max', invitedByUserId: 'lena' }])
      expect(await lobbies.listInvites('max')).toHaveLength(1)

      expect(await lobbies.acceptInvite('max', inviteId)).toMatchObject({ id })
      const lobby = await lobbies.view(id)
      expect(lobby?.invites).toEqual([])
      expect(lobby?.people.map(p => p.name)).toEqual(['Christoph', 'Lena', 'Max'])
      expect(lastMsg(me)).toMatchObject({ invites: [], lobby: { id } })
    })

    it('refuses inviting yourself, a member, someone invited already, or an unknown account', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await lobbies.invite('chris', id, 'max')
      await expect(lobbies.invite('chris', id, 'chris')).rejects.toMatchObject({ statusCode: 400 })
      await expect(lobbies.invite('chris', id, 'lena')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_member' } })
      await expect(lobbies.invite('lena', id, 'max')).rejects.toMatchObject({ statusCode: 409, body: { code: 'already_invited' } })
      await expect(lobbies.invite('chris', id, 'nobody')).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.invite('sam', id, 'max')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('declines; only the invitee answers', async () => {
      const { id } = await lobbies.create('chris')
      const { id: inviteId } = await lobbies.invite('chris', id, 'max')
      await expect(lobbies.declineInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 404 })
      await expect(lobbies.acceptInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 404 })
      await lobbies.declineInvite('max', inviteId)
      expect(await lobbies.listInvites('max')).toEqual([])
      expect((await lobbies.view(id))?.invites).toEqual([])
      await expect(lobbies.acceptInvite('max', inviteId)).rejects.toMatchObject({ statusCode: 404 })
    })

    it('accepting while in another lobby asks to leave it first, and the invite stays', async () => {
      const { id } = await lobbies.create('chris')
      const { id: inviteId } = await lobbies.invite('chris', id, 'lena')
      const own = await lobbies.create('lena')
      await expect(lobbies.acceptInvite('lena', inviteId)).rejects.toMatchObject({ statusCode: 409, body: { code: 'in_lobby', lobbyId: own.id } })
      expect(await lobbies.listInvites('lena')).toHaveLength(1)
    })

    it('a closed lobby\'s invites expire; joining by code accepts a pending invite', async () => {
      const a = await lobbies.create('chris')
      const { id: expiring } = await lobbies.invite('chris', a.id, 'max')
      await lobbies.close('chris', a.id)
      expect(await lobbies.listInvites('max')).toEqual([])
      await expect(lobbies.acceptInvite('max', expiring)).rejects.toMatchObject({ statusCode: 404 })

      const b = await lobbies.create('lena')
      await lobbies.invite('lena', b.id, 'max')
      await lobbies.join('max', b.id, b.code)
      expect(await lobbies.listInvites('max')).toEqual([])
    })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$T src/lobby/service.test.ts`
Expected: FAIL with "lobbies.invite is not a function".

- [ ] **Step 3: Implement**

In `backend/src/lobby/service.ts`, import `PendingInvite` alongside `Lobby` from `../schema/lobby-ws.js`, and add to the class:

```ts
  // ---- invites ----------------------------------------------------------------------

  /** Any member invites an account; it shows in the invitee's pending invites. */
  async invite(userId: string, lobbyId: string, inviteeUserId: string): Promise<{ id: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openFor(lobbyId, userId)
      if (inviteeUserId === userId) throw LobbyError.badRequest('you are in the lobby already')
      const [invitee] = await getUsersByIds(this.db, [inviteeUserId])
      if (!invitee) throw LobbyError.notFound('account not found')
      if (rules.isMember(lobby, inviteeUserId)) throw LobbyError.conflict({ error: `${invitee.name} is in the lobby already`, code: 'already_member' })
      const invitedAlready = LobbyError.conflict({ error: `${invitee.name} is invited already`, code: 'already_invited' })
      if (lobby.invites.some(i => i.userId === inviteeUserId)) throw invitedAlready
      const id = ulid()
      try {
        await q.insertInvite(this.db, { id, lobbyId, inviteeUserId, inviterUserId: userId })
      } catch (err) {
        if (pgErrorCode(err) === UNIQUE_VIOLATION) throw invitedAlready
        throw err
      }
      await this.reload(lobbyId)
      await this.publish(lobbyId)
      return { id }
    })
  }

  async listInvites(userId: string): Promise<PendingInvite[]> {
    return (await q.pendingInvitesFor(this.db, userId)).map(inviteView)
  }

  // The user's own pending invite to an open lobby, or 404
  private async pendingInvite(userId: string, inviteId: string): Promise<{ lobbyId: string }> {
    const invite = await q.getInvite(this.db, inviteId)
    if (!invite || invite.invitee_user_id !== userId || invite.status !== 'pending') throw LobbyError.notFound('invite not found')
    return { lobbyId: invite.lobby_id }
  }

  /** Joins the lobby (which marks the invite accepted). */
  async acceptInvite(userId: string, inviteId: string): Promise<LobbyRef> {
    const { lobbyId } = await this.pendingInvite(userId, inviteId)
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null) throw LobbyError.notFound('invite not found')
      return this.addMember(lobby, userId)
    })
  }

  async declineInvite(userId: string, inviteId: string): Promise<void> {
    const { lobbyId } = await this.pendingInvite(userId, inviteId)
    await this.enqueue(lobbyId, async () => {
      await q.setInviteStatus(this.db, inviteId, 'declined')
      await this.reload(lobbyId)
      await this.publish(lobbyId, [userId])
    })
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `$T src/lobby/service.test.ts && cd backend && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lobby/service.ts backend/src/lobby/service.test.ts
git commit -m "feat(lobby): invites by account, accept, decline, expire with the lobby"
```

---

### Task 10: Lobby service: start, rematch, and the reset after each game

**Files:**
- Modify: `backend/src/lobby/service.ts`
- Test: `backend/src/lobby/service.test.ts` (engine construction in `beforeEach`, new `describe('games')`)

**Interfaces:**
- Consumes: `planGame` (Task 5); `SessionEngine.createWithSeats` with `lobbyId`, `lobbyName`, `shuffleSeats`, plus `getLobbySession`, `ActiveSessionError`, `BoardBusyError`, `GameEnded` (Task 3); `q.setPlaying`, `q.resetAfterGame` (Task 2).
- Produces:
  ```ts
  LobbyService.start(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }>
  LobbyService.rematch(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }>
  LobbyService.onGameEnded(e: GameEnded): void   // the engine's `ended` hook; resets the lobby in its queue
  ```

- [ ] **Step 1: Wire the engine's hook in the tests**

In `backend/src/lobby/service.test.ts` `beforeEach`, replace the engine line with:

```ts
    engine = new SessionEngine(engineStore, vi.fn(), undefined, undefined, e => { lobbies.onGameEnded(e) })
```

- [ ] **Step 2: Write the failing tests**

Add inside the outer `describe`:

```ts
  describe('games', () => {
    let id: string
    let code: string
    const person = async (name: string) => {
      const p = (await lobbies.view(id))?.people.find(x => x.name === name)
      if (!p) throw new Error(`${name} is not in the lobby`)
      return p
    }
    const setReady = async (userId: string, name: string) => { await lobbies.updatePerson(userId, id, (await person(name)).id, { ready: true }) }

    beforeEach(async () => {
      ({ id, code } = await lobbies.create('chris'))
      await lobbies.join('lena', id, code)
      await lobbies.update('chris', id, { nextGame: { gameId: 'x01', config: { startScore: 101 } } })
    })

    it('asks the host to confirm when people aren\'t ready, then starts with the roster as seats', async () => {
      await setReady('chris', 'Christoph')
      await expect(lobbies.start('chris', id, false)).rejects.toMatchObject({
        statusCode: 409, body: { code: 'not_ready', notReady: [{ name: 'Lena' }] },
      })
      const { sessionId } = await lobbies.start('chris', id, true)
      const session = engine.getSession(sessionId)
      expect(session).toMatchObject({ ownerUserId: 'chris', lobbyId: id, lobbyName: "Christoph's lobby", boardId: null })
      expect(session?.seats).toEqual([
        { name: 'Christoph', userId: 'chris', controllerUserId: 'chris', boardId: 'living', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena', controllerUserId: 'lena', boardId: 'lenas', boardName: "Lena's place" },
      ])
      expect(engineStore.insertSession).toHaveBeenCalledWith(expect.objectContaining({ lobby_id: id, config: expect.objectContaining({ startScore: 101, bullOff: 'off' }) }))
      expect((await lobbies.view(id))?.currentSessionId).toBe(sessionId)
    })

    it('seats a guest with their adder as controller, and leaves out who sits out', async () => {
      await lobbies.join('max', id, code)
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      const { sessionId } = await lobbies.start('chris', id, true)
      expect(engine.getSession(sessionId)?.seats.map(s => [s.name, s.controllerUserId, s.boardId])).toEqual([
        ['Christoph', 'chris', 'living'], ['Lena', 'lena', 'lenas'], ['Guest 1', 'lena', 'lenas'],
      ])
    })

    it('refuses members, no game set, offline boards, a second start, and closing during a game', async () => {
      await expect(lobbies.start('lena', id, true)).rejects.toMatchObject({ statusCode: 403 })
      await lobbies.update('chris', id, { nextGame: null })
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 400 })
      await lobbies.update('chris', id, { nextGame: { gameId: 'x01', config: {} } })
      online.delete('lenas')
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 409, body: { code: 'board_offline', offlineBoards: ["Lena's place"] } })
      online.add('lenas')
      const { sessionId } = await lobbies.start('chris', id, true)
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({ statusCode: 409, body: { code: 'game_running', sessionId } })
      await expect(lobbies.close('chris', id)).rejects.toMatchObject({ statusCode: 409, body: { code: 'game_running' } })
    })

    it('one game per person: someone already in a game blocks the start, by name', async () => {
      await engine.create('lena', null, 'atc', {}, [{ name: 'Lena' }])
      await expect(lobbies.start('chris', id, true)).rejects.toMatchObject({
        statusCode: 409, body: { code: 'active_session', error: 'Lena already has a game running' },
      })
    })

    it('after the game: everyone back in, members not ready, guests ready, a game_played line', async () => {
      await lobbies.join('max', id, code)
      await lobbies.addGuest('lena', id, { name: 'Guest 1' })
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      await setReady('chris', 'Christoph')
      await lobbies.updatePerson('lena', id, (await person('Guest 1')).id, { ready: false })
      const { sessionId } = await lobbies.start('chris', id, true)
      // Lena gives up her seat and her guest's: Christoph wins
      await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
      await lobbies.whenIdle(id)
      const lobby = await lobbies.view(id)
      expect(lobby?.currentSessionId).toBeNull()
      expect(lobby?.people.map(p => [p.name, p.plays, p.ready])).toEqual([
        ['Christoph', true, false], ['Lena', true, false], ['Max', true, false], ['Guest 1', true, true],
      ])
      expect(lobby?.activity[0]).toMatchObject({
        kind: 'game_played', actorUserId: null,
        data: {
          sessionId, gameId: 'x01', winnerName: 'Christoph',
          players: [{ name: 'Christoph', placement: 1, forfeited: false }, { name: 'Lena', forfeited: true }, { name: 'Guest 1', forfeited: true }],
        },
      })
    })

    it('an abort resets the lobby too and names who aborted', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect((await lobbies.view(id))?.activity[0]).toMatchObject({ kind: 'game_aborted', actorUserId: 'chris', data: { sessionId, gameId: 'x01' } })
    })

    it('rematch: the same players and settings, the same soft gate, also after an abort', async () => {
      await expect(lobbies.rematch('chris', id, true)).rejects.toMatchObject({ statusCode: 400 })
      await lobbies.join('max', id, code)
      await lobbies.updatePerson('chris', id, (await person('Max')).id, { plays: false })
      const first = await lobbies.start('chris', id, true)
      await engine.deleteSession(first.sessionId, 'chris')
      await lobbies.whenIdle(id)
      // The host changes the next game meanwhile: a rematch still repeats the last one
      await lobbies.update('chris', id, { nextGame: { gameId: 'atc', config: {} } })
      await expect(lobbies.rematch('chris', id, false)).rejects.toMatchObject({ body: { code: 'not_ready' } })
      const { sessionId } = await lobbies.rematch('chris', id, true)
      const session = engine.getSession(sessionId)
      expect(session?.module.id).toBe('x01')
      expect(session?.seats.map(s => s.name)).toEqual(['Christoph', 'Lena'])
      expect(engineStore.insertSession).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ startScore: 101 }) }))
      expect((await person('Max')).plays).toBe(false)
    })

    it('throw order: a bull off turns the game\'s bull off on', async () => {
      await lobbies.update('chris', id, { throwOrder: 'bulloff' })
      await lobbies.start('chris', id, true)
      expect(engineStore.insertSession).toHaveBeenLastCalledWith(expect.objectContaining({ config: expect.objectContaining({ bullOff: 'wdc' }) }))
    })

    it('a host who leaves mid-game stays host (and can abort) until the game ends; then the role passes on', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      expect((await lobbies.view(id))?.hostUserId).toBe('chris')
      expect(engine.getSession(sessionId)?.status).toBe('active')
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect((await lobbies.view(id))?.hostUserId).toBe('lena')
    })

    it('a lobby everyone left during a game closes when the game ends', async () => {
      const { sessionId } = await lobbies.start('chris', id, true)
      await lobbies.leave('chris', id)
      await lobbies.leave('lena', id)
      expect((await lobbies.view(id))?.people).toEqual([])
      await engine.deleteSession(sessionId, 'chris')
      await lobbies.whenIdle(id)
      expect(await lobbies.view(id)).toBeNull()
      const row = await db.selectFrom('lobbies').select('closed_at').where('id', '=', id).executeTakeFirstOrThrow()
      expect(row.closed_at).toBeInstanceOf(Date)
    })
  })
```

- [ ] **Step 3: Run them to verify they fail**

Run: `$T src/lobby/service.test.ts`
Expected: FAIL with "lobbies.start is not a function" (the `beforeEach` hook also fails to type-check until `onGameEnded` exists).

- [ ] **Step 4: Implement**

In `backend/src/lobby/service.ts`, replace the `session/engine.js` and `./types.js` imports and add the `startPlan` one:

```ts
import { ActiveSessionError, BoardBusyError, type GameEnded, type SessionEngine } from '../session/engine.js'
import { planGame, type PlanProblem } from './startPlan.js'
import type { LastGame, LobbyPerson, LobbyState, NextGame, ThrowOrder } from './types.js'
```

A module-level helper:

```ts
function planError(p: PlanProblem): LobbyError {
  if (p.status === 400) return LobbyError.badRequest(p.error)
  const { status: _status, ...body } = p
  return LobbyError.conflict(body)
}
```

Add to the class:

```ts
  // ---- games ------------------------------------------------------------------------

  /** The host starts the next game with everyone who plays. */
  async start(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      if (!lobby.nextGame) throw LobbyError.badRequest('pick a game first')
      const personIds = lobby.people.filter(p => p.plays).map(p => p.id)
      return this.launch(lobby, userId, { ...lobby.nextGame, personIds }, force)
    })
  }

  /** The host repeats the last game: the same people (minus who left), mode and settings. */
  async rematch(userId: string, lobbyId: string, force: boolean): Promise<{ sessionId: string }> {
    return this.enqueue(lobbyId, async () => {
      const lobby = await this.openAsHost(lobbyId, userId)
      if (!lobby.lastGame) throw LobbyError.badRequest('no game to repeat yet')
      const here = new Set(lobby.people.map(p => p.id))
      return this.launch(lobby, userId, { ...lobby.lastGame, personIds: lobby.lastGame.personIds.filter(id => here.has(id)) }, force)
    })
  }

  // Runs in the lobby's queue
  private async launch(lobby: LobbyState, hostUserId: string, game: LastGame, force: boolean): Promise<{ sessionId: string }> {
    const running = this.deps.engine.getLobbySession(lobby.id)
    if (running) throw LobbyError.conflict({ error: 'a game is running already', code: 'game_running', sessionId: running.id })
    const planned = planGame(lobby, game, { force, isBoardOnline: this.deps.isBoardOnline })
    if (!planned.ok) throw planError(planned.problem)
    const { plan } = planned
    let sessionId: string
    try {
      ({ sessionId } = await this.deps.engine.createWithSeats({
        ownerUserId: hostUserId, gameId: plan.gameId, config: plan.config, seats: plan.seats,
        shuffleSeats: plan.shuffleSeats, lobbyId: lobby.id, lobbyName: lobby.name,
      }))
    } catch (err) {
      throw this.startError(lobby, hostUserId, err)
    }
    // The lobby shows who plays this game; a rematch repeats it
    await q.updateLobby(this.db, lobby.id, { last_game: { gameId: plan.gameId, config: game.config, personIds: plan.personIds } })
    await q.setPlaying(this.db, lobby.id, plan.personIds)
    await this.reload(lobby.id)
    await this.publish(lobby.id)
    return { sessionId }
  }

  private startError(lobby: LobbyState, hostUserId: string, err: unknown): unknown {
    if (err instanceof ActiveSessionError) {
      const name = rules.memberOf(lobby, err.userId)?.name ?? 'A player'
      return LobbyError.conflict({
        error: `${name} already has a game running`, code: 'active_session',
        ...(err.userId === hostUserId ? { sessionId: err.sessionId } : {}),
      })
    }
    if (err instanceof BoardBusyError) return LobbyError.conflict({ error: 'a board is in another game', code: 'board_busy' })
    return err
  }

  /**
   * The engine's `ended` hook: the lobby's game finished (or was aborted). Everyone plays
   * again, members aren't ready, guests are; the feed gets a line; a host who left
   * during the game hands over now, and a lobby everyone left closes.
   */
  onGameEnded(e: GameEnded): void {
    const lobbyId = e.lobbyId
    if (lobbyId === null) return
    this.enqueue(lobbyId, async () => {
      const lobby = await this.reload(lobbyId)
      if (!lobby || lobby.closedAt !== null) return
      await this.db.transaction().execute(async (trx) => {
        await q.resetAfterGame(trx, lobbyId)
        if (e.status === 'finished') {
          const winner = e.results.find(r => r.placement === 1 && !r.forfeited)
          await q.addActivity(trx, lobbyId, 'game_played', null, { sessionId: e.sessionId, gameId: e.gameId, winnerName: winner?.name ?? null, players: e.results })
        } else {
          await q.addActivity(trx, lobbyId, 'game_aborted', e.abortedByUserId, { sessionId: e.sessionId, gameId: e.gameId })
        }
      })
      if (await this.settleHost(lobbyId) === 'open') await this.publish(lobbyId)
    }).catch((err: unknown) => { this.warn('lobby reset after a game failed', { lobbyId, sessionId: e.sessionId, error: String(err) }) })
  }
```

`LobbyPerson` stays imported for `boardChange` (Task 8).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `$T src/lobby/service.test.ts && cd backend && npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lobby/service.ts backend/src/lobby/service.test.ts
git commit -m "feat(lobby): start and rematch with the soft ready gate, reset after every game"
```

---

### Task 11: REST API for lobbies and invites

**Files:**
- Modify: `schema/api-v1.yaml` (tags, paths, parameters, responses, schemas), then `npm run gen:api`
- Create: `backend/src/api/lobbies.ts`
- Modify: `backend/src/app.ts` (`AppDeps.lobbies`, register the plugin)
- Modify: `backend/src/index.ts` (build the hub and the service; the engine's `ended` hook)
- Modify: `backend/src/app.test.ts`, `backend/src/api/docs.test.ts`, `backend/src/api/spec.test.ts` (pass `lobbies: {} as any` to `buildApp`)
- Test: `backend/src/api/lobbies.test.ts`

**Interfaces:**
- Consumes: `LobbyService` (Tasks 7–10), `LobbyError` → `ApiError` handling (Task 4).
- Produces: the operations `createLobby`, `getCurrentLobby`, `getLobbyByCode`, `updateLobby`, `joinLobby`, `leaveLobby`, `closeLobby`, `addLobbyGuest`, `updateLobbyPerson`, `removeLobbyPerson`, `startLobbyGame`, `rematchLobbyGame`, `inviteToLobby`, `listInvites`, `acceptInvite`, `declineInvite`; `export function lobbiesApiPlugin(app, opts: { lobbies: LobbyService }, done)`; `AppDeps.lobbies: LobbyService`.

- [ ] **Step 1: Describe the API**

In `schema/api-v1.yaml`:

Add to `tags`, after `users`:

```yaml
  - name: lobbies
    description: Lobbies, to play games with friends (live state is on the lobby socket, schema/lobby-ws-v1.json)
  - name: invites
    description: Invites into lobbies
```

Add to `paths`, after `/api/sessions/{id}`:

```yaml
  /api/lobbies:
    post:
      operationId: createLobby
      summary: Open a lobby with the signed-in user as host, on their usual board
      tags: [lobbies]
      responses:
        '201':
          description: The new lobby
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LobbyRef' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/current:
    get:
      operationId: getCurrentLobby
      summary: The signed-in user's open lobby
      tags: [lobbies]
      responses:
        '200':
          description: The lobby; open /ws/lobby?lobbyId= for its live state
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LobbyRef' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/by-code/{code}:
    parameters:
      - $ref: '#/components/parameters/LobbyCode'
    get:
      operationId: getLobbyByCode
      summary: What the Join page shows about an open lobby before joining
      tags: [lobbies]
      responses:
        '200':
          description: The lobby's preview
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LobbyPreview' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    patch:
      operationId: updateLobby
      summary: 'Host: rename, set the throw order or the next game, regenerate the code'
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdateLobbyRequest' }
      responses:
        '204': { description: Changed }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/join:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: joinLobby
      summary: Join an open lobby by its code
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/JoinLobbyRequest' }
      responses:
        '200':
          description: The lobby (joining again is fine)
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LobbyRef' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/leave:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: leaveLobby
      summary: Leave the lobby, with your guests
      tags: [lobbies]
      responses:
        '204': { description: Left }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/close:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: closeLobby
      summary: 'Host: close the lobby (not while a game runs)'
      tags: [lobbies]
      responses:
        '204': { description: Closed }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/people:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: addLobbyGuest
      summary: Add a guest at a board; the adder acts for them in games
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/AddGuestRequest' }
      responses:
        '201':
          description: The guest's person id
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CreatedId' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/people/{personId}:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
      - $ref: '#/components/parameters/PersonId'
    patch:
      operationId: updateLobbyPerson
      summary: A person's board, ready, whether they play, or their place in the order (as the lobby's rules allow)
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/UpdatePersonRequest' }
      responses:
        '204': { description: Changed }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
    delete:
      operationId: removeLobbyPerson
      summary: 'Remove someone: the host anyone, a member their own guests'
      tags: [lobbies]
      responses:
        '204': { description: Removed }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/start:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: startLobbyGame
      summary: 'Host: start the next game with everyone who plays'
      description: 'Answers 409 not_ready (with the names) when someone who plays isn''t ready; send it again with force: true to start anyway.'
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StartLobbyRequest' }
      responses:
        '201':
          description: The new game
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CreatedSession' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/rematch:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: rematchLobbyGame
      summary: 'Host: play the last game again with the same players and settings'
      description: 'The same soft ready gate as start. Works after a finished or an aborted game.'
      tags: [lobbies]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/StartLobbyRequest' }
      responses:
        '201':
          description: The new game
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CreatedSession' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '403': { $ref: '#/components/responses/Forbidden' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/lobbies/{id}/invites:
    parameters:
      - $ref: '#/components/parameters/LobbyId'
    post:
      operationId: inviteToLobby
      summary: Invite an account into the lobby (any member)
      tags: [invites]
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: '#/components/schemas/CreateInviteRequest' }
      responses:
        '201':
          description: The invite's id
          content:
            application/json:
              schema: { $ref: '#/components/schemas/CreatedId' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/invites:
    get:
      operationId: listInvites
      summary: The signed-in user's pending invites to open lobbies, newest first
      tags: [invites]
      responses:
        '200':
          description: Pending invites
          content:
            application/json:
              schema: { $ref: '#/components/schemas/InviteList' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/invites/{id}/accept:
    parameters:
      - $ref: '#/components/parameters/InviteId'
    post:
      operationId: acceptInvite
      summary: Accept an invite and join its lobby
      tags: [invites]
      responses:
        '200':
          description: The lobby joined
          content:
            application/json:
              schema: { $ref: '#/components/schemas/LobbyRef' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '409': { $ref: '#/components/responses/LobbyConflict' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/invites/{id}/decline:
    parameters:
      - $ref: '#/components/parameters/InviteId'
    post:
      operationId: declineInvite
      summary: Decline an invite
      tags: [invites]
      responses:
        '204': { description: Declined }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

Add to `components.parameters`:

```yaml
    LobbyId:
      name: id
      in: path
      required: true
      schema: { type: string, minLength: 1 }
    PersonId:
      name: personId
      in: path
      required: true
      schema: { type: string, minLength: 1 }
    InviteId:
      name: id
      in: path
      required: true
      schema: { type: string, minLength: 1 }
    LobbyCode:
      name: code
      in: path
      required: true
      description: Lobby code; case, dashes and spaces are ignored
      schema: { type: string, minLength: 1, maxLength: 16 }
```

Add to `components.responses`:

```yaml
    LobbyConflict:
      description: Conflicts with the lobby's state (see code)
      content:
        application/json:
          schema: { $ref: '#/components/schemas/LobbyConflict' }
```

Add to `components.schemas`, at the end:

```yaml
    LobbyRef:
      type: object
      required: [id, name, code]
      additionalProperties: false
      properties:
        id: { type: string }
        name: { type: string }
        code: { type: string, description: '6 characters; shown as K7Q4-MD' }
    LobbyPreview:
      type: object
      required: [id, name, hostName, peopleCount, boardNames]
      additionalProperties: false
      properties:
        id: { type: string }
        name: { type: string }
        hostName: { type: string, nullable: true }
        peopleCount: { type: integer, minimum: 0 }
        boardNames: { type: array, items: { type: string } }
    UpdateLobbyRequest:
      type: object
      minProperties: 1
      additionalProperties: false
      properties:
        name: { type: string, pattern: '\S', maxLength: 48 }
        throwOrder: { type: string, enum: [lobby, random, bulloff] }
        nextGame:
          type: object
          nullable: true
          required: [gameId, config]
          additionalProperties: false
          properties:
            gameId: { type: string, minLength: 1 }
            config: { type: object, additionalProperties: true }
        regenerateCode: { type: boolean }
    JoinLobbyRequest:
      type: object
      required: [code]
      additionalProperties: false
      properties:
        code: { type: string, minLength: 1, maxLength: 16 }
    AddGuestRequest:
      type: object
      required: [name]
      additionalProperties: false
      properties:
        name: { type: string, pattern: '\S', maxLength: 32 }
        boardId: { type: string, nullable: true, minLength: 1, description: "Absent: the adder's board. null: Manual. Otherwise one of the adder's own boards" }
    UpdatePersonRequest:
      type: object
      minProperties: 1
      additionalProperties: false
      properties:
        boardId: { type: string, nullable: true, minLength: 1, description: 'One of your own boards, or null for Manual' }
        plays: { type: boolean, description: 'false: sits out the next game' }
        ready: { type: boolean }
        position: { type: integer, minimum: 0, description: 'Host: move to this place in the lobby order' }
    StartLobbyRequest:
      type: object
      additionalProperties: false
      properties:
        force: { type: boolean, description: "Start even though people who play aren't ready" }
    CreateInviteRequest:
      type: object
      required: [userId]
      additionalProperties: false
      properties:
        userId: { type: string, minLength: 1 }
    CreatedId:
      type: object
      required: [id]
      additionalProperties: false
      properties:
        id: { type: string }
    LobbyConflict:
      type: object
      required: [error]
      additionalProperties: false
      properties:
        error: { type: string }
        code: { type: string, enum: [in_lobby, not_ready, board_offline, board_busy, active_session, game_running, already_member, already_invited] }
        lobbyId: { type: string, description: 'in_lobby: the lobby you are in; leave it first' }
        sessionId: { type: string, description: "game_running: the lobby's game. active_session: your own running game" }
        notReady:
          type: array
          description: "not_ready: who plays but isn't ready"
          items:
            type: object
            required: [personId, name]
            additionalProperties: false
            properties:
              personId: { type: string }
              name: { type: string }
        offlineBoards: { type: array, items: { type: string }, description: 'board_offline: the boards that are offline' }
    Invite:
      type: object
      required: [id, lobbyId, lobbyName, inviterUserId, inviterName, createdAt]
      additionalProperties: false
      description: Same shape as PendingInvite in schema/lobby-ws-v1.json
      properties:
        id: { type: string }
        lobbyId: { type: string }
        lobbyName: { type: string }
        inviterUserId: { type: string, nullable: true }
        inviterName: { type: string, nullable: true }
        createdAt: { type: string, format: date-time }
    InviteList:
      type: object
      required: [invites]
      additionalProperties: false
      properties:
        invites: { type: array, items: { $ref: '#/components/schemas/Invite' } }
```

Run: `npm run lint:api && npm run gen:api` (repo root)
Expected: the lint says the description is valid, with only the existing `info-license-strict` warning. Generation succeeds.

- [ ] **Step 2: Write the failing route tests**

`backend/src/api/lobbies.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { lobbiesApiPlugin } from './lobbies.js'
import { LobbyError, inLobby } from '../lobby/errors.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'chris'; done() }),
}))

const ref = { id: 'l1', name: "Christoph's lobby", code: 'K7Q4MD' }

function makeApp() {
  const lobbies = {
    create: vi.fn().mockResolvedValue(ref), current: vi.fn().mockResolvedValue(null), preview: vi.fn().mockResolvedValue(null),
    join: vi.fn().mockResolvedValue(ref), leave: vi.fn().mockResolvedValue(undefined), update: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined), addGuest: vi.fn().mockResolvedValue({ id: 'p9' }),
    updatePerson: vi.fn().mockResolvedValue(undefined), removePerson: vi.fn().mockResolvedValue(undefined),
    start: vi.fn().mockResolvedValue({ sessionId: 's1' }), rematch: vi.fn().mockResolvedValue({ sessionId: 's2' }),
    invite: vi.fn().mockResolvedValue({ id: 'i1' }), listInvites: vi.fn().mockResolvedValue([]),
    acceptInvite: vi.fn().mockResolvedValue(ref), declineInvite: vi.fn().mockResolvedValue(undefined),
  }
  const app = createFastify()
  app.register(lobbiesApiPlugin, { lobbies: lobbies as any })
  return { app, lobbies }
}

beforeEach(() => vi.clearAllMocks())

describe('lobbies API', () => {
  it('creates a lobby', async () => {
    const { app, lobbies } = makeApp()
    const res = await app.inject({ method: 'POST', url: '/api/lobbies' })
    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body)).toEqual(ref)
    expect(lobbies.create).toHaveBeenCalledWith('chris')
  })

  it('answers a lobby conflict with its code and details', async () => {
    const { app, lobbies } = makeApp()
    lobbies.create.mockRejectedValueOnce(inLobby('l0'))
    const res = await app.inject({ method: 'POST', url: '/api/lobbies' })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body)).toEqual({ error: 'leave your current lobby first', code: 'in_lobby', lobbyId: 'l0' })
  })

  it('answers 404 without a current lobby, and the lobby otherwise', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'GET', url: '/api/lobbies/current' })).statusCode).toBe(404)
    lobbies.current.mockResolvedValueOnce(ref)
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/lobbies/current' })).body)).toEqual(ref)
  })

  it('previews a lobby by code', async () => {
    const { app, lobbies } = makeApp()
    lobbies.preview.mockResolvedValueOnce({ id: 'l1', name: 'L', hostName: 'Christoph', peopleCount: 2, boardNames: ['Living room'] })
    const res = await app.inject({ method: 'GET', url: '/api/lobbies/by-code/k7q4-md' })
    expect(res.statusCode).toBe(200)
    expect(lobbies.preview).toHaveBeenCalledWith('k7q4-md')
  })

  it('changes settings; an empty or invalid change is a 400', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: { throwOrder: 'random' } })).statusCode).toBe(204)
    expect(lobbies.update).toHaveBeenCalledWith('chris', 'l1', { throwOrder: 'random' })
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: {} })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1', payload: { throwOrder: 'sideways' } })).statusCode).toBe(400)
  })

  it('joins, leaves and closes', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/join', payload: { code: 'k7q4md' } })).statusCode).toBe(200)
    expect(lobbies.join).toHaveBeenCalledWith('chris', 'l1', 'k7q4md')
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/leave' })).statusCode).toBe(204)
    lobbies.close.mockRejectedValueOnce(LobbyError.forbidden('only the host can do this'))
    const res = await app.inject({ method: 'POST', url: '/api/lobbies/l1/close' })
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body)).toEqual({ error: 'only the host can do this' })
  })

  it('adds, changes and removes people', async () => {
    const { app, lobbies } = makeApp()
    const added = await app.inject({ method: 'POST', url: '/api/lobbies/l1/people', payload: { name: 'Guest 1' } })
    expect(added.statusCode).toBe(201)
    expect(JSON.parse(added.body)).toEqual({ id: 'p9' })
    expect(lobbies.addGuest).toHaveBeenCalledWith('chris', 'l1', { name: 'Guest 1' })
    expect((await app.inject({ method: 'PATCH', url: '/api/lobbies/l1/people/p2', payload: { boardId: null } })).statusCode).toBe(204)
    expect(lobbies.updatePerson).toHaveBeenCalledWith('chris', 'l1', 'p2', { boardId: null })
    expect((await app.inject({ method: 'DELETE', url: '/api/lobbies/l1/people/p2' })).statusCode).toBe(204)
    expect(lobbies.removePerson).toHaveBeenCalledWith('chris', 'l1', 'p2')
  })

  it('starts with the soft ready gate: 409 not_ready, then force', async () => {
    const { app, lobbies } = makeApp()
    lobbies.start.mockRejectedValueOnce(LobbyError.conflict({ error: 'not everyone is ready', code: 'not_ready', notReady: [{ personId: 'p2', name: 'Lena' }] }))
    const first = await app.inject({ method: 'POST', url: '/api/lobbies/l1/start', payload: {} })
    expect(first.statusCode).toBe(409)
    expect(JSON.parse(first.body)).toMatchObject({ code: 'not_ready', notReady: [{ name: 'Lena' }] })
    expect(lobbies.start).toHaveBeenLastCalledWith('chris', 'l1', false)
    const second = await app.inject({ method: 'POST', url: '/api/lobbies/l1/start', payload: { force: true } })
    expect(second.statusCode).toBe(201)
    expect(JSON.parse(second.body)).toEqual({ sessionId: 's1' })
    expect(lobbies.start).toHaveBeenLastCalledWith('chris', 'l1', true)
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/rematch', payload: { force: true } })).statusCode).toBe(201)
    expect(lobbies.rematch).toHaveBeenCalledWith('chris', 'l1', true)
  })

  it('invites, lists, accepts and declines', async () => {
    const { app, lobbies } = makeApp()
    expect((await app.inject({ method: 'POST', url: '/api/lobbies/l1/invites', payload: { userId: 'max' } })).statusCode).toBe(201)
    expect(lobbies.invite).toHaveBeenCalledWith('chris', 'l1', 'max')
    const invite = { id: 'i1', lobbyId: 'l1', lobbyName: 'L', inviterUserId: 'lena', inviterName: 'Lena', createdAt: new Date(0).toISOString() }
    lobbies.listInvites.mockResolvedValueOnce([invite])
    expect(JSON.parse((await app.inject({ method: 'GET', url: '/api/invites' })).body)).toEqual({ invites: [invite] })
    expect(JSON.parse((await app.inject({ method: 'POST', url: '/api/invites/i1/accept' })).body)).toEqual(ref)
    expect(lobbies.acceptInvite).toHaveBeenCalledWith('chris', 'i1')
    expect((await app.inject({ method: 'POST', url: '/api/invites/i1/decline' })).statusCode).toBe(204)
    expect(lobbies.declineInvite).toHaveBeenCalledWith('chris', 'i1')
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && npx vitest run src/api/lobbies.test.ts`
Expected: FAIL with "Cannot find module './lobbies.js'".

- [ ] **Step 4: Write the routes**

`backend/src/api/lobbies.ts`:

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { requireAuth } from '../auth/middleware.js'
import type { LobbyService } from '../lobby/service.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { lobbies: LobbyService }

/**
 * Lobbies and invites. The service throws a LobbyError for anything it refuses; the error
 * handler answers with its status and body (see ApiError). The live state isn't here:
 * every change is pushed on the lobby socket and /ws/me.
 */
export function lobbiesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { lobbies } = opts
  const auth = { preValidation: requireAuth }

  app.post<Route<'createLobby'>>('/api/lobbies', { ...auth, schema: fromSpec('createLobby') }, async (req, reply) =>
    reply.code(201).send(await lobbies.create(req.userId)))

  app.get<Route<'getCurrentLobby'>>('/api/lobbies/current', { ...auth, schema: fromSpec('getCurrentLobby') }, async (req, reply) => {
    const lobby = await lobbies.current(req.userId)
    return lobby ? reply.send(lobby) : reply.code(404).send({ error: 'not in a lobby' })
  })

  app.get<Route<'getLobbyByCode'>>('/api/lobbies/by-code/:code', { ...auth, schema: fromSpec('getLobbyByCode') }, async (req, reply) => {
    const preview = await lobbies.preview(req.params.code)
    return preview ? reply.send(preview) : reply.code(404).send({ error: 'no open lobby with this code' })
  })

  app.patch<Route<'updateLobby'>>('/api/lobbies/:id', { ...auth, schema: fromSpec('updateLobby') }, async (req, reply) => {
    await lobbies.update(req.userId, req.params.id, req.body)
    return reply.code(204).send()
  })

  app.post<Route<'joinLobby'>>('/api/lobbies/:id/join', { ...auth, schema: fromSpec('joinLobby') }, async (req, reply) =>
    reply.send(await lobbies.join(req.userId, req.params.id, req.body.code)))

  app.post<Route<'leaveLobby'>>('/api/lobbies/:id/leave', { ...auth, schema: fromSpec('leaveLobby') }, async (req, reply) => {
    await lobbies.leave(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.post<Route<'closeLobby'>>('/api/lobbies/:id/close', { ...auth, schema: fromSpec('closeLobby') }, async (req, reply) => {
    await lobbies.close(req.userId, req.params.id)
    return reply.code(204).send()
  })

  app.post<Route<'addLobbyGuest'>>('/api/lobbies/:id/people', { ...auth, schema: fromSpec('addLobbyGuest') }, async (req, reply) =>
    reply.code(201).send(await lobbies.addGuest(req.userId, req.params.id, req.body)))

  app.patch<Route<'updateLobbyPerson'>>('/api/lobbies/:id/people/:personId', { ...auth, schema: fromSpec('updateLobbyPerson') }, async (req, reply) => {
    await lobbies.updatePerson(req.userId, req.params.id, req.params.personId, req.body)
    return reply.code(204).send()
  })

  app.delete<Route<'removeLobbyPerson'>>('/api/lobbies/:id/people/:personId', { ...auth, schema: fromSpec('removeLobbyPerson') }, async (req, reply) => {
    await lobbies.removePerson(req.userId, req.params.id, req.params.personId)
    return reply.code(204).send()
  })

  app.post<Route<'startLobbyGame'>>('/api/lobbies/:id/start', { ...auth, schema: fromSpec('startLobbyGame') }, async (req, reply) =>
    reply.code(201).send(await lobbies.start(req.userId, req.params.id, req.body.force ?? false)))

  app.post<Route<'rematchLobbyGame'>>('/api/lobbies/:id/rematch', { ...auth, schema: fromSpec('rematchLobbyGame') }, async (req, reply) =>
    reply.code(201).send(await lobbies.rematch(req.userId, req.params.id, req.body.force ?? false)))

  app.post<Route<'inviteToLobby'>>('/api/lobbies/:id/invites', { ...auth, schema: fromSpec('inviteToLobby') }, async (req, reply) =>
    reply.code(201).send(await lobbies.invite(req.userId, req.params.id, req.body.userId)))

  app.get<Route<'listInvites'>>('/api/invites', { ...auth, schema: fromSpec('listInvites') }, async (req) =>
    ({ invites: await lobbies.listInvites(req.userId) }))

  app.post<Route<'acceptInvite'>>('/api/invites/:id/accept', { ...auth, schema: fromSpec('acceptInvite') }, async (req, reply) =>
    reply.send(await lobbies.acceptInvite(req.userId, req.params.id)))

  app.post<Route<'declineInvite'>>('/api/invites/:id/decline', { ...auth, schema: fromSpec('declineInvite') }, async (req, reply) => {
    await lobbies.declineInvite(req.userId, req.params.id)
    return reply.code(204).send()
  })

  done()
}
```

- [ ] **Step 5: Wire the app and the server**

`backend/src/app.ts`:
- `import { lobbiesApiPlugin } from './api/lobbies.js'` and `import type { LobbyService } from './lobby/service.js'`;
- add `lobbies: LobbyService` to `AppDeps` with the comment `/** Lobby rules and pushes (see lobby/service.ts). */`;
- destructure it in `buildApp`, and register after `usersApiPlugin`: `await app.register(lobbiesApiPlugin, { lobbies })`.

`backend/src/app.test.ts`, `backend/src/api/docs.test.ts`, `backend/src/api/spec.test.ts`: add `lobbies: {} as any` to every `buildApp({ ... })` call.

`backend/src/index.ts`: build the hub and the service, and give the engine its `ended` hook before the rebuild (which can end games). Replace the engine block with:

```ts
import { LobbyHub } from './lobby/hub.js'
import { LobbyService } from './lobby/service.js'
import { bridgeConnections } from './bridge-gw/connections.js'

// ...

const hub = new LobbyHub()
// The callbacks only run after the engine and the lobbies exist
const engine: SessionEngine = new SessionEngine(
  createEngineStore(db),
  sessionId => { pushSnapshot(sessionId, engine) },
  (message, details) => { app.log.warn({ details }, message) },
  (sessionId, userIds, notice) => { pushNotice(sessionId, userIds, notice) },
  ended => { lobbies.onGameEnded(ended) },
)
const lobbies: LobbyService = new LobbyService({ db, engine, hub, isBoardOnline: boardId => bridgeConnections.isOnline(boardId) })
await engine.rebuild()

const app = await buildApp({ engine, db, lobbies, frontendDist: join(__dirname, '../../frontend/dist') })
```

`LobbyService` gets no `warn`, so it logs with `console.warn`: `app` doesn't exist yet while the rebuild runs.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run lint:api && cd backend && npm run typecheck && npm run lint && npm test`
Expected: PASS. `spec.test.ts` confirms that every new operation is registered with its schema.

- [ ] **Step 7: Commit**

```bash
git add schema/api-v1.yaml backend/src/schema backend/frontend/src/lib/api backend/src/api backend/src/app.ts backend/src/app.test.ts backend/src/index.ts
git commit -m "feat(api): lobbies and invites"
```

---

### Task 12: Lobby members watch the game; aborts record who; boards going away or offline

**Files:**
- Modify: `backend/src/session/access.ts` (`IsLobbyMember`, `noLobbies`, `canWatchSession`)
- Modify: `backend/src/api/sessions.ts` (GET uses `canWatchSession`; DELETE passes the user)
- Modify: `backend/src/browser-gw/handler.ts` (socket access uses `canWatchSession`)
- Modify: `backend/src/api/boards.ts` (`releaseBoard` before deleting)
- Modify: `backend/src/bridge-gw/handler.ts` (`onBoardPresence` option)
- Modify: `backend/src/lobby/service.ts` (`releaseBoard`, `onBoardPresence`)
- Modify: `backend/src/app.ts` (wiring)
- Test: `backend/src/session/access.test.ts`, `backend/src/api/sessions.test.ts`, `backend/src/browser-gw/handler.test.ts`, `backend/src/api/boards.test.ts`, `backend/src/bridge-gw/handler.test.ts`, `backend/src/lobby/service.test.ts`

**Interfaces:**
- Consumes: `Session.lobbyId`, `deleteSession(id, abortedByUserId)` (Task 3), `q.releaseBoard` (Task 2), `LobbyService.isMember` (Task 7).
- Produces:
  ```ts
  // session/access.ts
  export type IsLobbyMember = (lobbyId: string, userId: string) => Promise<boolean>
  export const noLobbies: IsLobbyMember
  export async function canWatchSession(userId: string, session: Session, isLobbyMember: IsLobbyMember): Promise<boolean>
  // plugin options (all optional, defaulting to no lobbies / no-ops)
  sessionsApiPlugin: { engine, db, isLobbyMember?: IsLobbyMember }
  browserGwPlugin: { engine, isLobbyMember?: IsLobbyMember }
  boardsApiPlugin: { db, releaseBoard?: (boardId: string) => Promise<void> }
  bridgeGwPlugin / handleBridgeConnection opts: { engine, db, onBoardPresence?: (boardId: string) => void }
  // lobby/service.ts
  LobbyService.releaseBoard(boardId: string): Promise<void>
  LobbyService.onBoardPresence(boardId: string): void
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/session/access.test.ts`, add (this file builds sessions with `newSession`; pass `lobbyId` through its new optional argument):

```ts
import { canWatchSession } from './access.js'

describe('canWatchSession', () => {
  const lobbyGame = () => newSession({
    id: 's1', ownerUserId: 'host', boardId: null, module: x01Module, config: x01Module.defaultConfig, seed: 1, createdAt: new Date(), lobbyId: 'l1',
    seats: [{ name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null }],
  })

  it('lets the lobby\'s members watch its game, besides the host and controllers', async () => {
    const isMember = vi.fn((lobbyId: string, userId: string) => Promise.resolve(lobbyId === 'l1' && userId === 'lena'))
    expect(await canWatchSession('lena', lobbyGame(), isMember)).toBe(true)
    expect(await canWatchSession('max', lobbyGame(), isMember)).toBe(false)
    expect(await canWatchSession('host', lobbyGame(), isMember)).toBe(true)
  })

  it('never asks about lobbies for a local game', async () => {
    const isMember = vi.fn(() => Promise.resolve(true))
    const local = newSession({
      id: 's2', ownerUserId: 'host', boardId: null, module: x01Module, config: x01Module.defaultConfig, seed: 1, createdAt: new Date(),
      seats: [{ name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null }],
    })
    expect(await canWatchSession('lena', local, isMember)).toBe(false)
    expect(isMember).not.toHaveBeenCalled()
  })
})
```

Add `vi` to the file's `vitest` import if it's missing.

`backend/src/api/sessions.test.ts`, add:

```ts
describe('lobby games', () => {
  const lobbySession = {
    id: 's1', ownerUserId: 'host', boardId: null, lobbyId: 'l1', status: 'active', createdAt: new Date(),
    players: [{ name: 'Host' }], module: { id: 'x01' },
    seats: [{ name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null }],
  }

  it('lets a member of the game\'s lobby read it', async () => {
    const engine = { getSession: vi.fn().mockReturnValue(lobbySession), getSnapshot: vi.fn().mockReturnValue(undefined) } as any
    const isLobbyMember = vi.fn().mockResolvedValue(true)
    const app = createFastify()
    app.register(sessionsApiPlugin, { engine, db: {} as any, isLobbyMember })
    const res = await app.inject({ method: 'GET', url: '/api/sessions/s1' })
    expect(res.statusCode).toBe(200)
    expect(isLobbyMember).toHaveBeenCalledWith('l1', 'user-1')
  })

  it('records who aborted', async () => {
    const engine = { getSession: vi.fn().mockReturnValue({ ...lobbySession, ownerUserId: 'user-1' }), deleteSession: vi.fn().mockResolvedValue(true) } as any
    const app = createFastify()
    app.register(sessionsApiPlugin, { engine, db: {} as any })
    expect((await app.inject({ method: 'DELETE', url: '/api/sessions/s1' })).statusCode).toBe(204)
    expect(engine.deleteSession).toHaveBeenCalledWith('s1', 'user-1')
  })
})
```

`backend/src/browser-gw/handler.test.ts`, inside `describe('WS auth')`, add:

```ts
  it('lets a member of the game\'s lobby open it, without seats', async () => {
    const { getAuthUser } = await import('../auth/session.js')
    vi.mocked(getAuthUser).mockResolvedValueOnce({ userId: 'lena' })
    const { SessionEngine } = await import('../session/engine.js')
    const { x01Module } = await import('../games/x01.js')
    const store = {
      insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
      getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
      insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
      abortSession: vi.fn().mockResolvedValue(undefined),
    }
    const engine = new SessionEngine(store, vi.fn())
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'x01', config: x01Module.defaultConfig, lobbyId: 'l1', lobbyName: 'L',
      seats: [
        { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: null, boardName: null },
        { name: 'Max', userId: 'max', controllerUserId: 'max', boardId: null, boardName: null },
      ],
    })
    const isLobbyMember = vi.fn().mockResolvedValue(true)
    testApp = Fastify()
    await testApp.register(fastifyWebsocket)
    const { browserGwPlugin } = await import('./handler.js')
    await testApp.register(browserGwPlugin, { engine, isLobbyMember })
    await testApp.listen({ port: 0, host: '127.0.0.1' })
    const port = (testApp.server.address() as AddressInfo).port

    const first = await new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?sessionId=${sessionId}`)
      ws.addEventListener('message', e => { resolve(JSON.parse(String(e.data))); ws.close() })
      ws.addEventListener('close', e => { reject(new Error(`closed ${(e as any).code}`)) })
      setTimeout(() => reject(new Error('timeout')), 2000)
    })
    expect(first).toMatchObject({ type: 'snapshot', lobbyId: 'l1', mySeats: [] })
    expect(isLobbyMember).toHaveBeenCalledWith('l1', 'lena')
  })
```

`backend/src/api/boards.test.ts`, inside the delete `describe`, add:

```ts
  it('sends people on the board to Manual in their lobbies before deleting it', async () => {
    vi.mocked(queries.getBoardById).mockResolvedValue({ id: 'board-1', owner_user_id: 'user-1' } as any)
    const releaseBoard = vi.fn().mockResolvedValue(undefined)
    const app = createFastify()
    app.register(boardsApiPlugin, { db: {} as any, releaseBoard })
    expect((await app.inject({ method: 'DELETE', url: '/api/boards/board-1' })).statusCode).toBe(204)
    expect(releaseBoard).toHaveBeenCalledWith('board-1')
    expect(releaseBoard.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(queries.deleteBoard).mock.invocationCallOrder[0])
  })
```

`backend/src/bridge-gw/handler.test.ts`, inside `describe('handleBridgeConnection')` (it reuses the file's `FakeSocket` and `flush`):

```ts
  it('tells the lobbies when a board comes online and when it drops', async () => {
    vi.mocked(queries.getBoardByTokenHash).mockResolvedValue({ id: 'board-9', hardware_id: null } as any)
    const engine = { onBridgeEvent: vi.fn(), onBoardPresence: vi.fn() } as any
    const onBoardPresence = vi.fn()
    const socket = new FakeSocket()
    handleBridgeConnection(socket as any, { token: 'tok' }, { db: {} as any, engine, onBoardPresence })
    await flush()
    expect(onBoardPresence).toHaveBeenCalledWith('board-9')
    socket.emit('close')
    expect(onBoardPresence).toHaveBeenCalledTimes(2)
  })
```

`backend/src/lobby/service.test.ts`, add inside the outer `describe`:

```ts
  describe('boards going away or offline', () => {
    it('a deleted board sends everyone on it to Manual, live', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('max', id, code)
      const max = (await lobbies.view(id))?.people.find(p => p.name === 'Max')
      await lobbies.updatePerson('chris', id, max?.id ?? '', { boardId: 'garage' })
      const ws = sock()
      hub.addLobbySocket(id, ws, 'max')
      await lobbies.releaseBoard('garage')
      expect(lastMsg(ws).lobby.people[1]).toMatchObject({ name: 'Max', boardId: null, boardMovedBy: null })
    })

    it('pushes a lobby when one of its boards goes on- or offline', async () => {
      const { id } = await lobbies.create('chris')
      const ws = sock()
      hub.addLobbySocket(id, ws, 'chris')
      await lobbies.refreshPresence(id)
      online.delete('living')
      lobbies.onBoardPresence('living')
      expect(lastMsg(ws).lobby.people[0].boardOnline).toBe(false)
      const sent = ws.send.mock.calls.length
      lobbies.onBoardPresence('lenas')
      expect(ws.send.mock.calls.length).toBe(sent)
    })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$T src/session/access.test.ts src/api/sessions.test.ts src/browser-gw/handler.test.ts src/api/boards.test.ts src/bridge-gw/handler.test.ts src/lobby/service.test.ts`
Expected: FAIL. `canWatchSession`, the new plugin options and the new service methods don't exist yet. The member's socket closes with 4403. `deleteSession` is called without the user.

- [ ] **Step 3: Implement access**

`backend/src/session/access.ts`, add:

```ts
/** Whether the user is a member of the lobby (LobbyService.isMember). */
export type IsLobbyMember = (lobbyId: string, userId: string) => Promise<boolean>

/** For callers without lobbies (tests, the local flow): nobody is a lobby member. */
export const noLobbies: IsLobbyMember = () => Promise.resolve(false)

/** Who may watch a game: its host and seat controllers and, for a lobby game, everyone in the lobby. */
export async function canWatchSession(userId: string, session: Session, isLobbyMember: IsLobbyMember): Promise<boolean> {
  if (canAccessSession(userId, session)) return true
  return session.lobbyId !== null && await isLobbyMember(session.lobbyId, userId)
}
```

`backend/src/api/sessions.ts`:
- `type Opts = FastifyPluginOptions & { engine: SessionEngine; db: Kysely<Database>; isLobbyMember?: IsLobbyMember }`;
- `const { engine, db, isLobbyMember = noLobbies } = opts`;
- in `getSession`: `if (!await canWatchSession(req.userId, session, isLobbyMember)) return reply.code(403).send({ error: 'forbidden' })`;
- in `deleteSession`: `await engine.deleteSession(session.id, req.userId)`.

`listSessions` keeps `canAccessSession`: it lists your own games.

`backend/src/browser-gw/handler.ts`:
- `type Opts = FastifyPluginOptions & { engine: SessionEngine; isLobbyMember?: IsLobbyMember }`;
- `const { engine, isLobbyMember = noLobbies } = opts`;
- make the `getAuthUser(req).then(...)` callback `async`, and replace the access line with:

```ts
      if (!await canWatchSession(user.userId, session, isLobbyMember)) { socket.close(WsCloseCode.Forbidden, 'forbidden'); return }
      // Closed while access was checked: no close event will come to remove it again
      if (socket.readyState !== socket.OPEN) return
```

- [ ] **Step 4: Implement boards and bridge presence**

`backend/src/api/boards.ts`:
- `type Opts = FastifyPluginOptions & { db: Kysely<Database>; releaseBoard?: (boardId: string) => Promise<void> }`;
- `const { db, releaseBoard = () => Promise.resolve() } = opts`;
- in `deleteBoard`, just before `await deleteBoard(db, id)`:

```ts
    // Lobbies first: people on the board go to Manual, and their lobbies see it
    await releaseBoard(id)
```

`backend/src/bridge-gw/handler.ts`:
- `Opts` gains `onBoardPresence?: (boardId: string) => void`;
- `handleBridgeConnection`'s `opts` type gains the same optional field;
- in `handleBridgeConnection`, after `const { db, engine } = opts`:

```ts
  // A board came online or dropped: its game and the lobbies using it show it
  const presence = (boardId: string) => {
    engine.onBoardPresence(boardId)
    opts.onBoardPresence?.(boardId)
  }
```

- replace the three `engine.onBoardPresence(...)` calls (after `register`, in `close`, in `error`) with `presence(...)`;
- in `bridgeGwPlugin`, pass `onBoardPresence: opts.onBoardPresence` along: `{ db, engine, onBoardPresence: opts.onBoardPresence }`.

`backend/src/lobby/service.ts`, add to the class:

```ts
  // ---- boards -----------------------------------------------------------------------

  /** A board is being deleted: everyone on it, in any lobby, goes to Manual. */
  async releaseBoard(boardId: string): Promise<void> {
    const lobbyIds = await q.releaseBoard(this.db, boardId)
    for (const id of lobbyIds) {
      await this.enqueue(id, async () => {
        await this.reload(id)
        await this.publish(id)
      })
    }
  }

  /** A board's bridge connected or dropped: lobbies using it show it. */
  onBoardPresence(boardId: string): void {
    for (const lobby of this.cache.values()) {
      if (lobby.people.some(p => p.boardId === boardId)) this.send(lobby)
    }
  }
```

`backend/src/app.ts`, change the registrations:

```ts
  await app.register(bridgeGwPlugin, { engine, db, onBoardPresence: boardId => { lobbies.onBoardPresence(boardId) } })
  await app.register(browserGwPlugin, { engine, isLobbyMember: (lobbyId, userId) => lobbies.isMember(lobbyId, userId) })
  await app.register(sessionsApiPlugin, { engine, db, isLobbyMember: (lobbyId, userId) => lobbies.isMember(lobbyId, userId) })
  // ...
  await app.register(boardsApiPlugin, { db, releaseBoard: boardId => lobbies.releaseBoard(boardId) })
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `$T src && cd backend && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src
git commit -m "feat: lobby members watch lobby games, aborts record who, boards leave lobbies"
```

---

### Task 13: Lobby socket and /ws/me

**Files:**
- Create: `backend/src/browser-gw/lobby.ts`
- Modify: `backend/src/lobby/service.ts` (`onSessionPush`)
- Modify: `backend/src/app.ts` (`AppDeps.hub`, register the plugin)
- Modify: `backend/src/index.ts` (pass `hub`; game pushes update /ws/me)
- Modify: `backend/src/app.test.ts`, `backend/src/api/docs.test.ts`, `backend/src/api/spec.test.ts` (pass `hub: {} as any`)
- Test: `backend/src/browser-gw/lobby.test.ts`, `backend/src/lobby/service.test.ts`

**Interfaces:**
- Consumes: `LobbyHub` (Task 7); `LobbyService.lobbyAccess/refreshPresence/meMessage` (Task 7).
- Produces:
  ```ts
  export function lobbyGwPlugin(app: FastifyInstance, opts: { lobbies: LobbyService; hub: LobbyHub }, done): void
  // GET /ws/lobby?lobbyId=…  close codes: 4401 signed out, 4400 no lobbyId, 4404 unknown/closed, 4403 not a member
  // GET /ws/me               close code: 4401 signed out
  LobbyService.onSessionPush(sessionId: string): Promise<void>
  AppDeps.hub: LobbyHub
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/browser-gw/lobby.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import type { AddressInfo } from 'net'
import fastifyWebsocket from '@fastify/websocket'
import { WsCloseCode } from '../schema/game-ws.js'
import { LobbyHub } from '../lobby/hub.js'
import { lobbyGwPlugin } from './lobby.js'

vi.mock('../auth/session.js', () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }))
import { getAuthUser } from '../auth/session.js'

let app: FastifyInstance | null = null
afterEach(async () => { await app?.close(); app = null; vi.mocked(getAuthUser).mockReset().mockResolvedValue(null) })

async function serve(lobbies: unknown, hub: LobbyHub): Promise<number> {
  app = Fastify()
  await app.register(fastifyWebsocket)
  await app.register(lobbyGwPlugin, { lobbies: lobbies as any, hub })
  await app.listen({ port: 0, host: '127.0.0.1' })
  return (app.server.address() as AddressInfo).port
}

const closeCode = (url: string) => new Promise<number>((resolve, reject) => {
  const ws = new WebSocket(url)
  ws.addEventListener('close', e => { resolve((e as any).code) })
  setTimeout(() => reject(new Error('timeout')), 2000)
})
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise(r => setTimeout(r, 10))
}

describe('/ws/lobby', () => {
  it('closes for the signed out, without a lobby id, for an unknown lobby and for non-members', async () => {
    const lobbyAccess = vi.fn((lobbyId: string) => Promise.resolve(lobbyId === 'gone' ? 'not_found' : 'forbidden'))
    const port = await serve({ lobbyAccess, refreshPresence: vi.fn() }, new LobbyHub())
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)).toBe(WsCloseCode.Unauthorized)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'max' })
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby`)).toBe(WsCloseCode.MissingSession)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=gone`)).toBe(WsCloseCode.NotFound)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)).toBe(WsCloseCode.Forbidden)
  })

  it('a member gets the lobby and counts as online until the socket closes', async () => {
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'chris' })
    const hub = new LobbyHub()
    const refreshPresence = vi.fn((lobbyId: string) => {
      hub.sendLobby(lobbyId, { type: 'lobby_closed', lobbyId })   // any message: the service builds the real one
      return Promise.resolve()
    })
    const port = await serve({ lobbyAccess: vi.fn().mockResolvedValue('ok'), refreshPresence }, hub)
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/lobby?lobbyId=l1`)
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('message', () => { resolve() }, { once: true })
      setTimeout(() => reject(new Error('no message')), 2000)
    })
    expect(hub.online('l1')).toEqual(new Set(['chris']))
    ws.close()
    await until(() => refreshPresence.mock.calls.length >= 2)
    expect(hub.online('l1')).toEqual(new Set())
  })
})

describe('/ws/me', () => {
  it('closes for the signed out; sends the user\'s state when it opens', async () => {
    const hub = new LobbyHub()
    const me = { type: 'me', invites: [], lobby: null }
    const port = await serve({ meMessage: vi.fn().mockResolvedValue(me) }, hub)
    expect(await closeCode(`ws://127.0.0.1:${port}/ws/me`)).toBe(WsCloseCode.Unauthorized)
    vi.mocked(getAuthUser).mockResolvedValue({ userId: 'lena' })
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/me`)
    const first = await new Promise<unknown>((resolve, reject) => {
      ws.addEventListener('message', e => { resolve(JSON.parse(String(e.data))) }, { once: true })
      setTimeout(() => reject(new Error('no message')), 2000)
    })
    expect(first).toEqual(me)
    expect(hub.hasMe('lena')).toBe(true)
    ws.close()
    await until(() => !hub.hasMe('lena'))
    expect(hub.hasMe('lena')).toBe(false)
  })
})
```

`backend/src/lobby/service.test.ts`, add inside the outer `describe`:

```ts
  describe('the lobby indicator during a game', () => {
    it('tells members whose turn it is as the game goes on', async () => {
      const { id, code } = await lobbies.create('chris')
      await lobbies.join('lena', id, code)
      await lobbies.update('chris', id, { nextGame: { gameId: 'x01', config: {} } })
      const me = sock()
      hub.addMeSocket('lena', me, await lobbies.meMessage('lena'))
      const { sessionId } = await lobbies.start('chris', id, true)
      expect(lastMsg(me).lobby).toMatchObject({ sessionId, gameId: 'x01', youThrowNext: false, leg: 0 })
      // Christoph throws one dart by hand and takes out: Lena is up
      await engine.onUserAction(sessionId, 'chris', { type: 'add_dart', segment: { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } })
      await engine.onUserAction(sessionId, 'chris', { type: 'takeout' })
      await lobbies.onSessionPush(sessionId)
      expect(lastMsg(me).lobby.youThrowNext).toBe(true)
    })
  })
```

- [ ] **Step 2: Run them to verify they fail**

Run: `$T src/browser-gw/lobby.test.ts src/lobby/service.test.ts`
Expected: FAIL with "Cannot find module './lobby.js'" and "lobbies.onSessionPush is not a function".

- [ ] **Step 3: Write the socket plugin**

`backend/src/browser-gw/lobby.ts`:

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { SocketStream } from '@fastify/websocket'
import { z } from 'zod'
import { getAuthUser } from '../auth/session.js'
import { WsCloseCode } from '../schema/game-ws.js'
import type { LobbyHub } from '../lobby/hub.js'
import type { LobbyService } from '../lobby/service.js'

const LobbyQuerySchema = z.object({ lobbyId: z.string().min(1) })

type Opts = FastifyPluginOptions & { lobbies: LobbyService; hub: LobbyHub }

/**
 * The lobby socket (/ws/lobby?lobbyId=…) and the per-user socket (/ws/me). Both only push
 * (schema/lobby-ws-v1.json); changes go through the REST API. An open lobby socket is
 * what makes a member "online" in the lobby.
 */
export function lobbyGwPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { lobbies, hub } = opts

  app.get('/ws/lobby', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    getAuthUser(req).then(async user => {
      // Closed while sign-in was checked: no close event will come to remove it again
      if (socket.readyState !== socket.OPEN) return
      if (!user) { socket.close(WsCloseCode.Unauthorized, 'unauthorized'); return }
      const q = LobbyQuerySchema.safeParse(req.query)
      if (!q.success) { socket.close(WsCloseCode.MissingSession, 'missing lobbyId'); return }
      const { lobbyId } = q.data
      const access = await lobbies.lobbyAccess(lobbyId, user.userId)
      if (socket.readyState !== socket.OPEN) return
      if (access === 'not_found') { socket.close(WsCloseCode.NotFound, 'lobby not found'); return }
      if (access === 'forbidden') { socket.close(WsCloseCode.Forbidden, 'forbidden'); return }

      hub.addLobbySocket(lobbyId, socket, user.userId)
      // 'error' is followed by 'close': handle whichever comes first, once
      let gone = false
      const onGone = () => {
        if (gone) return
        gone = true
        hub.removeLobbySocket(lobbyId, socket)
        lobbies.refreshPresence(lobbyId).catch((err: unknown) => { app.log.warn({ lobbyId, err }, 'lobby presence push failed') })
      }
      socket.on('close', onGone)
      socket.on('error', onGone)
      // Everyone, this socket included, gets the lobby with this member online
      await lobbies.refreshPresence(lobbyId)
    }).catch(() => { socket.close(WsCloseCode.InternalError, 'internal error') })
  })

  app.get('/ws/me', { websocket: true }, (connection: SocketStream, req) => {
    const socket = connection.socket
    getAuthUser(req).then(async user => {
      if (socket.readyState !== socket.OPEN) return
      if (!user) { socket.close(WsCloseCode.Unauthorized, 'unauthorized'); return }
      const first = await lobbies.meMessage(user.userId)
      if (socket.readyState !== socket.OPEN) return
      hub.addMeSocket(user.userId, socket, first)
      let gone = false
      const onGone = () => {
        if (gone) return
        gone = true
        hub.removeMeSocket(user.userId, socket)
      }
      socket.on('close', onGone)
      socket.on('error', onGone)
    }).catch(() => { socket.close(WsCloseCode.InternalError, 'internal error') })
  })

  done()
}
```

- [ ] **Step 4: Follow the game on /ws/me**

`backend/src/lobby/service.ts`, add to the class:

```ts
  /**
   * A lobby game changed (every snapshot push): members' indicators follow whose turn it
   * is. Only lobbies loaded in this process are pushed; /ws/me loads its user's lobby when
   * it opens.
   */
  async onSessionPush(sessionId: string): Promise<void> {
    const lobbyId = this.deps.engine.getSession(sessionId)?.lobbyId ?? null
    if (lobbyId === null) return
    const lobby = this.cache.get(lobbyId)
    if (!lobby) return
    await Promise.all(memberIds(lobby).map(u => this.pushMe(u)))
  }
```

- [ ] **Step 5: Wire it**

`backend/src/app.ts`:
- `import { lobbyGwPlugin } from './browser-gw/lobby.js'` and `import type { LobbyHub } from './lobby/hub.js'`;
- add `hub: LobbyHub` to `AppDeps` with the comment `/** Open lobby and /ws/me sockets. */`;
- destructure it, and register after `browserGwPlugin`: `await app.register(lobbyGwPlugin, { lobbies, hub })`.

`backend/src/app.test.ts`, `backend/src/api/docs.test.ts`, `backend/src/api/spec.test.ts`: add `hub: {} as any` to every `buildApp({ ... })` call.

`backend/src/index.ts`:
- the engine's push callback becomes:

```ts
  sessionId => {
    pushSnapshot(sessionId, engine)
    lobbies.onSessionPush(sessionId).catch((err: unknown) => { console.warn('lobby indicator push failed', { sessionId, err }) })
  },
```

- `buildApp({ engine, db, lobbies, hub, frontendDist: ... })`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `$T src && cd backend && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src
git commit -m "feat(browser-gw): lobby socket with presence, and /ws/me with invites and the lobby summary"
```

---

### Task 14: Bring the spec and agent notes up to date

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the spec**

1. In "Data model", change "Migration `008_lobbies.sql`" to "Migration `009_lobbies.sql`".
2. In `lobbies`:
   - `code` is unique among open lobbies;
   - `host_user_id` is nullable (account deletion);
   - add a `last_game JSONB NULL` row: "`{ gameId, config, personIds }` of the last game started here; Rematch repeats it".
   - `next_game` is `{ gameId, config }`.
3. In "API":
   - `POST /api/lobbies/:id/join` takes `{ code }` only;
   - `PATCH …/people/:pid` also takes `ready`;
   - add `POST /api/lobbies/:id/rematch`;
   - replace `GET /api/users/search?q=` with the existing `GET /api/users?q=`;
   - add a line: "Live state: `GET /ws/lobby?lobbyId=` and `GET /ws/me`, messages in `schema/lobby-ws-v1.json`."
4. Append a section `## Decided while planning the lobby backend (2026-10-02)` that copies the "Rulings on the spec" list from the top of this plan.

- [ ] **Step 2: Update `AGENTS.md`**

Add to the "Where to look" table:

```
| Lobbies: rules, start and rematch, resets after games, pushes | `backend/src/lobby/` (`service.ts` is the entry point; pure rules in `rules.ts`, `startPlan.ts`, `view.ts`), queries in `backend/src/db/lobbies.ts` |
| Lobby socket and per-user socket (`/ws/lobby`, `/ws/me`) | `backend/src/browser-gw/lobby.ts`, messages in `schema/lobby-ws-v1.json` |
```

In the row for "Generated zod schemas", add `lobby-ws.ts` to the generated files mentioned.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-02-online-multiplayer-design.md AGENTS.md
git commit -m "docs: lobby backend as built"
```

---

## Self-review

**Spec coverage** (Work split item 2):

| Requirement | Task |
|---|---|
| Migration: lobbies, lobby_people (ready, plays, board_moved_by), lobby_invites, lobby_activity, game_sessions.lobby_id, aborted_by_user_id | 1 |
| Kysely types and queries | 1, 2 |
| REST endpoints (spec "API" + rematch) | 11 |
| One open lobby per user, join by code/link, host handover, close | 1 (index), 7 |
| Permissions (Lifecycle → Open) and the board rule | 4, 8 |
| Soft ready gate on start and rematch | 5, 10, 11 |
| Resets after each game (plays → true; ready → false members, true guests) | 2, 10 |
| Activity feed: opened, joined, left, removed, guest_added, board_moved, game_played, game_aborted, host_changed | 7, 8, 10 |
| Start: roster → seats (members control themselves, guests their adder; board per person; lobby/random/bull-off order), lobby_id, lobbyName | 3, 5, 10 |
| Engine hook when a lobby game ends (finished or aborted, also during rebuild) | 3, 10 |
| Aborted games keep their row with aborted_by_user_id (DELETE /api/sessions/:id) | 1, 3, 12 |
| Lobby members watch their lobby's game (socket and REST) | 12 |
| Lobby socket with full snapshots and presence | 6, 7, 13 |
| `/ws/me`: pending invites and lobby summary (name, people, next game, current session, you throw next, leg) | 6, 7, 13 |
| Invites (create, list, accept, decline, expire on close) | 9, 11 |
| Board busy at assignment and at start; board offline at start | 5, 8, 10 |
| Deleting a board a lobby uses → Manual | 2, 12 |
| Restart: lobbies from the DB, sessions with their lobby, presence fills as sockets reconnect | 3 (rebuild), 7 (cache loads on demand) |
| Account deletion cascades lobby rows; host handover | 1 (FKs), 7 |
| Tests per spec Testing (lifecycle, resets, soft gate, feed, code join and regenerate, invites, handover, one-lobby and one-game rules, board permissions, `board_busy`, start validation) | 5, 7, 8, 9, 10 |

**Out of scope here:** the frontend (plan 3), the match remote states (other plan), the leave and end-of-game UI and the abort standings/abandon preview (plan 4), and the e2e tests (they need the frontend).

**Type consistency, checked across tasks:**
- `LobbyState`, `LobbyPerson`, `LastGame`, `NextGame`, `InviteRow` come from `lobby/types.ts` everywhere.
- The view types `Lobby`, `LobbySummary`, `PendingInvite`, `LobbyServerMessage` and `MeMessage` are generated in `schema/lobby-ws.ts`.
- Errors are `LobbyError` (extends `ApiError`, read as `err.statusCode` / `err.body`).
- The engine has `GameEnded`/`EndedFn`, `createWithSeats({ lobbyId, lobbyName, shuffleSeats })`, `deleteSession(id, abortedByUserId)` and `getLobbySession(lobbyId)`.
- The service methods are named the same in the service tests, the route tests (`create`, `current`, `preview`, `join`, `leave`, `update`, `close`, `addGuest`, `updatePerson`, `removePerson`, `start`, `rematch`, `invite`, `listInvites`, `acceptInvite`, `declineInvite`) and the socket plugin (`lobbyAccess`, `refreshPresence`, `meMessage`).
