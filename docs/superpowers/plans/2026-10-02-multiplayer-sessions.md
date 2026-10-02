# Multiplayer sessions (engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running game can have seats that belong to different accounts and throw on different boards. Board darts only count from the board whose seat is up. Only a seat's controller can act for it. A member can forfeit, and the result stores placements with forfeited seats last.

**Architecture:** Seats become first-class in the engine (`Session.seats`). Each seat has a controller account and an input board. The engine indexes every seat's board and every controller. Routing and authorization happen inside the per-session queue, before an input is logged, so the log only holds accepted inputs and replays stay deterministic. Snapshots are built per socket, because each viewer needs their own `mySeats` and everyone needs presence.

This plan doesn't add lobbies. The local "New game" flow builds seats from today's inputs, so it behaves exactly as before. Lobbies come in plan 2 (`2026-10-02-lobbies-backend.md`), which calls `createWithSeats`.

**Tech Stack:** TypeScript, Fastify 4, @fastify/websocket, Kysely + Postgres, zod (generated), vitest.

**Spec:** `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`

## Global Constraints

- No casts in non-test code (strict type-aware ESLint). Run `cd backend && npm run lint`.
- Generated files aren't edited by hand.
  - Generated: `backend/src/schema/zod.ts`, `backend/src/schema/game-ws.ts`, `backend/frontend/src/lib/api/zod.ts`, `backend/frontend/src/lib/api/game-ws.ts`.
  - Edit `schema/game-ws-v1.json`, then run `npm run gen:api` at the repo root.
- Games stay pure reducers. Nothing in `backend/src/games/` learns about controllers or boards.
- The local flow must not change behaviour.
  - `POST /api/sessions` keeps its request and response shapes.
  - A local game's owner controls every seat.
  - All its seats use the session's board.
- Only accepted inputs are written to `game_session_events`.
- DB tests run only with `TEST_DATABASE_URL` set (see `DEVELOPMENT.md`).
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96
  ```

## Spec deviations (decided while planning, update the spec in Task 9)

- **No `standings` hook.** `summarize` already ranks seats by standing when `winner` is null: X01 by legs then score, ATC by hits then darts (see `rankSeats`). Forfeit reuses it.
- **No "everyone left belongs to one controller wins" rule.** The remaining seats are ranked by standing. A forfeit is rejected if the sender controls every seat that hasn't forfeited, because there would be nobody to lose to.
- **No `actionScope` hook.** No current game action is per-seat. Unknown and game-specific actions are host-only.
- **Abort is the existing `DELETE /api/sessions/:id`** (host only), not a WS action. It now pushes a final snapshot with `status: 'aborted'` before dropping the session.
- **Bull-off actions:**
  - `bulloff_skip` skips the current thrower, so it's per seat.
  - `bulloff_rethrow` and `bulloff_start` are host only.
- **`game_session_events.board_db_id`** is recorded but not read during replay.

## Review Focus

1. **Missing `visit.opened`.** A remote seat's first darts arrive without a `visit.opened`, because that board's `visit.opened` came while it wasn't its turn and was dropped. Scoring, including X01 busts, must still be right. Test in Task 4.
2. **Out-of-turn takeout.** A takeout on a board that isn't up must not end the current player's visit. Test in Task 4.
3. **Restart mid-game.** Rebuilding a multi-board game restores each seat's board and controller, and board darts route correctly after the restart. Test in Task 3.
4. **Forfeit with a visit open.** The open visit is dropped and nothing half-thrown is stored as a committed visit. Test in Task 6.
5. **The local flow.** The owner of a local game can still do everything, including bull-off start and rethrow, and darts from the session's board always count. Test in Task 5.

---

### Task 1: DB: seat controller, seat board, forfeited, event board

**Files:**
- Create: `backend/src/db/migrations/008_multiplayer_seats.sql`
- Modify: `backend/src/db/schema.ts` (`GamePlayersTable`, `GameSessionEventsTable`)
- Modify: `backend/src/db/queries.ts`:
  - `SeatRow`, `NewGameSession`, `StoredGameSession`, `NewSessionEvent`
  - `insertGameSession`, `getActiveGameSessions`, `finishGameSession`, `hasActiveSessionOnBoard`
- Test: `backend/src/db/queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type SeatRow = { name: string; user_id: string | null; controller_user_id: string; board_db_id: string | null }
  export type StoredSeatRow = { name: string; user_id: string | null; controller_user_id: string | null; board_db_id: string | null; board_name: string | null }
  export type StoredGameSession = {
    id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string
    game_version: number; rng_seed: number; config: unknown; created_at: Date; players: StoredSeatRow[]
  }
  export type NewSessionEvent = { session_id: string; seq: number; source: 'board' | 'user'; kind: string; data: unknown; bridge_event_id: string | null; board_db_id: string | null; created_at: Date }
  finishGameSession(db, id, finishedAt, results: { placement: number; stats: Record<string, number>; throwPosition: number; forfeited: boolean }[])
  ```

- [ ] **Step 1: Write the migration**

`backend/src/db/migrations/008_multiplayer_seats.sql`:

```sql
-- Online multiplayer: each seat has a controller account and its own input board.
-- Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md

ALTER TABLE game_players ADD COLUMN controller_user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL;
ALTER TABLE game_players ADD COLUMN board_db_id TEXT REFERENCES boards(id) ON DELETE SET NULL;
ALTER TABLE game_players ADD COLUMN forfeited BOOLEAN NOT NULL DEFAULT false;

-- Existing games: the owner controlled every seat, all on the game's board
UPDATE game_players gp SET controller_user_id = gs.owner_user_id, board_db_id = gs.board_db_id
FROM game_sessions gs WHERE gs.id = gp.session_id;

CREATE INDEX game_players_board ON game_players (board_db_id);

-- Which board a logged board event came from (audit; not read by replay)
ALTER TABLE game_session_events ADD COLUMN board_db_id TEXT;

-- One active game per *user* now spans every seat they control; the engine enforces it
DROP INDEX IF EXISTS game_sessions_one_active_per_owner;
```

- [ ] **Step 2: Update `schema.ts`**

Add to `GamePlayersTable`:

```ts
  /** Who may act for the seat (the owner in local games). */
  controller_user_id: string | null
  /** Where the seat's darts come from; null = entered by hand. */
  board_db_id: string | null
  forfeited: ColumnType<boolean, boolean | undefined, boolean>
```

Add to `GameSessionEventsTable`:

```ts
  /** The board a 'board' event came from. */
  board_db_id: string | null
```

- [ ] **Step 3: Write the failing DB tests**

In `backend/src/db/queries.test.ts`, inside the `DB integration` describe, add the tests below as their own `describe('multiplayer seats', …)` at the end, so the earlier tests' active-session counts aren't affected. The suite seeds the user `u-test-1` in `beforeAll`.

Also give every existing `insertGameSession(... players: [...])` call in this file (and in `history.test.ts`) the new seat fields: `controller_user_id: 'u-test-1', board_db_id: null` (or the test's board id).

```ts
  it('stores and reads back each seat\'s controller and board', async () => {
    await insertBoard(db, { id: 'mb-1', owner_user_id: 'u-test-1', name: 'Living room', token_hash: 'mb-1-hash' })
    await insertGameSession(db, {
      id: 'mp-1', owner_user_id: 'u-test-1', board_db_id: null, game_id: 'x01', game_version: 1, rng_seed: 1, config: {},
      players: [
        { name: 'Christoph', user_id: 'u-test-1', controller_user_id: 'u-test-1', board_db_id: 'mb-1' },
        { name: 'Guest', user_id: null, controller_user_id: 'u-test-1', board_db_id: null },
      ],
    })
    const row = (await getActiveGameSessions(db)).find(s => s.id === 'mp-1')
    expect(row?.players).toEqual([
      { name: 'Christoph', user_id: 'u-test-1', controller_user_id: 'u-test-1', board_db_id: 'mb-1', board_name: 'Living room' },
      { name: 'Guest', user_id: null, controller_user_id: 'u-test-1', board_db_id: null, board_name: null },
    ])
    expect(await hasActiveSessionOnBoard(db, 'mb-1')).toBe(true)
  })

  it('stores forfeited seats with the result', async () => {
    await finishGameSession(db, 'mp-1', new Date(), [
      { placement: 1, stats: {}, throwPosition: 0, forfeited: false },
      { placement: 2, stats: {}, throwPosition: 1, forfeited: true },
    ])
    const seats = (await getSeats(db, ['mp-1'])).get('mp-1') ?? []
    expect(seats.map(s => s.forfeited)).toEqual([false, true])
  })

  it('records the board of a logged board event', async () => {
    await appendSessionEvent(db, { session_id: 'mp-1', seq: 0, source: 'board', kind: 'takeout.finished', data: {}, bridge_event_id: null, board_db_id: 'mb-1', created_at: new Date() })
    const row = await db.selectFrom('game_session_events').select('board_db_id').where('session_id', '=', 'mp-1').executeTakeFirst()
    expect(row?.board_db_id).toBe('mb-1')
  })
```

Check `insertBoard`'s real parameter shape in `queries.ts:209` and match it. Add `'mp-1'` to the cleanup if the file deletes rows by id.

- [ ] **Step 4: Run them to verify they fail**

Run: `cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npx vitest run src/db/queries.test.ts`
Expected: FAIL. The TS errors or assertions show that `controller_user_id`, `board_name` and `forfeited` don't exist yet.

- [ ] **Step 5: Implement the query changes**

In `backend/src/db/queries.ts`:

```ts
export type SeatRow = { name: string; user_id: string | null; controller_user_id: string; board_db_id: string | null }
/** A seat as read back: the controller can be gone (account deleted), the board's name comes along. */
export type StoredSeatRow = { name: string; user_id: string | null; controller_user_id: string | null; board_db_id: string | null; board_name: string | null }
export type StoredGameSession = {
  id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; created_at: Date; players: StoredSeatRow[]
}
export type NewSessionEvent = {
  session_id: string; seq: number; source: 'board' | 'user'; kind: string; data: unknown
  bridge_event_id: string | null; board_db_id: string | null; created_at: Date
}
```

`insertGameSession`: change the `game_players` values to

```ts
      .values(s.players.map((p, seat) => ({
        session_id: s.id, seat, name: p.name, user_id: p.user_id,
        controller_user_id: p.controller_user_id, board_db_id: p.board_db_id,
      })))
```

`getActiveGameSessions`: read the seats with their board names.

```ts
export async function getActiveGameSessions(db: Kysely<Database>): Promise<StoredGameSession[]> {
  const rows = await db.selectFrom('game_sessions')
    .select(['id', 'owner_user_id', 'board_db_id', 'game_id', 'game_version', 'rng_seed', 'config', 'created_at'])
    .where('status', '=', 'active')
    .execute()
  if (rows.length === 0) return []
  const seats = await db.selectFrom('game_players as gp')
    .leftJoin('boards as b', 'b.id', 'gp.board_db_id')
    .select(['gp.session_id', 'gp.name', 'gp.user_id', 'gp.controller_user_id', 'gp.board_db_id', 'b.name as board_name'])
    .where('gp.session_id', 'in', rows.map(r => r.id))
    .orderBy('gp.session_id').orderBy('gp.seat')
    .execute()
  return rows.map(r => ({
    ...r,
    players: seats.filter(s => s.session_id === r.id).map(s => ({
      name: s.name, user_id: s.user_id, controller_user_id: s.controller_user_id,
      board_db_id: s.board_db_id, board_name: s.board_name,
    })),
  }))
}
```

`finishGameSession`: take `forfeited` and store it.

```ts
export async function finishGameSession(db: Kysely<Database>, id: string, finishedAt: Date, results: { placement: number; stats: Record<string, number>; throwPosition: number; forfeited: boolean }[]): Promise<void> {
  // ... unchanged, with the update set to:
        .set({ placement: r.placement, stats: JSON.stringify(r.stats), throw_position: r.throwPosition, forfeited: r.forfeited })
```

`hasActiveSessionOnBoard`: a board is busy if an active game uses it as its own board or as any seat's board.

```ts
export async function hasActiveSessionOnBoard(db: Kysely<Database>, boardDbId: string): Promise<boolean> {
  const row = await db.selectFrom('game_sessions as gs')
    .leftJoin('game_players as gp', 'gp.session_id', 'gs.id')
    .select('gs.id')
    .where('gs.status', '=', 'active')
    .where(eb => eb.or([eb('gs.board_db_id', '=', boardDbId), eb('gp.board_db_id', '=', boardDbId)]))
    .executeTakeFirst()
  return row !== undefined
}
```

- [ ] **Step 6: Fix the other compile errors from the type change**

Run: `cd backend && npm run typecheck`

Callers to update:
- `FinishedSeat` users: these are fixed in Task 6. For now, add `forfeited: false` in `results()` in `session/replay.ts`, so `{ ...r, throwPosition, forfeited: false }`.
- `engine.ts` `record()` passes `board_db_id: null` to `appendEvent`. Task 4 fills it in.
- `engine.ts` `create()` seat mapping: add `controller_user_id: ownerUserId, board_db_id: boardId`.
- `engine.ts` `rebuildOne`: it already only reads `p.name`, so it still compiles.

Expected: typecheck passes.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd backend && TEST_DATABASE_URL=… npx vitest run src/db/ && npm test`
Expected: PASS. Without the env var, the DB suites are skipped and the rest still pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/db backend/src/session
git commit -m "feat(db): seat controller, seat board and forfeited per game seat"
```

---

### Task 2: WS schema: seats, status, forfeit, notices, errors

**Files:**
- Modify: `schema/game-ws-v1.json`
- Regenerate: run `npm run gen:api` at the repo root. It writes `backend/src/schema/{game-ws,zod}.ts` and `backend/frontend/src/lib/api/{game-ws,zod}.ts`.
- Test: `backend/src/session/snapshot.contract.test.ts` gets extended in Task 5. This task is checked by gen and the typecheck.

**Interfaces:**
- Produces these generated types in `backend/src/schema/game-ws.ts`:
  - `SeatInfo`, `ForfeitAction`, `NoticeMessage`, `ErrorMessage`
  - `Snapshot` with the new required fields `status`, `ownerUserId`, `seats`, `mySeats`
  - the zod schemas `NoticeMessageSchema` and `ErrorMessageSchema`

- [ ] **Step 1: Add the defs**

In `schema/game-ws-v1.json` → `$defs`, add:

```json
"SeatInfo": {
  "title": "SeatInfo",
  "description": "Who acts for a seat and where its darts come from.",
  "type": "object",
  "required": ["controllerUserId", "userId", "boardId", "boardName", "boardOnline", "controllerConnected", "forfeited"],
  "additionalProperties": false,
  "properties": {
    "controllerUserId": { "type": "string" },
    "userId": { "type": ["string", "null"], "description": "The account the seat plays for; null for a guest." },
    "boardId": { "type": ["string", "null"], "description": "null: darts are entered by hand." },
    "boardName": { "type": ["string", "null"] },
    "boardOnline": { "type": "boolean", "description": "The board's bridge is connected." },
    "controllerConnected": { "type": "boolean", "description": "The controller has this game open." },
    "forfeited": { "type": "boolean" }
  }
},
"SessionStatus": { "title": "SessionStatus", "type": "string", "enum": ["active", "finished", "aborted"] },
"NoticeMessage": {
  "title": "NoticeMessage",
  "description": "A transient hint for this viewer, e.g. a dart thrown on a board that isn't up.",
  "type": "object",
  "required": ["type", "code", "boardId"],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "notice" },
    "code": { "type": "string", "enum": ["not_your_turn"] },
    "boardId": { "type": "string" }
  }
},
"ErrorMessage": {
  "title": "ErrorMessage",
  "description": "An action of this viewer was refused.",
  "type": "object",
  "required": ["type", "code", "action"],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "error" },
    "code": { "type": "string", "enum": ["forbidden"] },
    "action": { "type": "string", "description": "The refused action's type." }
  }
}
```

- [ ] **Step 2: Add `ForfeitAction` to `UserAction.oneOf`**

```json
{
  "title": "ForfeitAction",
  "description": "Give up every seat the sender controls. The client sends no seats; the server fills them in before logging.",
  "type": "object",
  "required": ["type"],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "forfeit" },
    "seats": { "type": "array", "items": { "type": "integer", "minimum": 0 } }
  }
}
```

- [ ] **Step 3: Add the new snapshot fields to both `X01Snapshot` and `AtcSnapshot`**

Append `"status", "ownerUserId", "seats", "mySeats"` to each `required` list, and add to `properties`:

```json
"status": { "$ref": "#/$defs/SessionStatus" },
"ownerUserId": { "type": "string", "description": "The host: starts the bull off, aborts the game." },
"seats": { "type": "array", "items": { "$ref": "#/$defs/SeatInfo" }, "description": "Same order as players." },
"mySeats": { "type": "array", "items": { "type": "integer", "minimum": 0 }, "description": "Seats the viewer controls." },
"bmStatus": { "...": "unchanged, but now the status of the current seat's board" }
```

Keep `bmStatus` as it is. Only change its `description` to "Status of the board of the seat that's up."

- [ ] **Step 4: Regenerate and typecheck**

Run: `npm run gen:api && cd backend && npm run typecheck`
Expected: generation succeeds. Typecheck fails in `engine.ts` `getSnapshot` because the new fields are missing. That's fixed in Task 5. Don't commit yet.

Also run: `cd backend/frontend && npm run typecheck && npm test`

If frontend test fixtures build snapshots that are parsed with the regenerated zod, add the new fields to them:

```ts
status: 'active', ownerUserId: 'u1', mySeats: [0, 1],
seats: players.map(() => ({ controllerUserId: 'u1', userId: null, boardId: 'b1', boardName: 'Board', boardOnline: true, controllerConnected: true, forfeited: false })),
```

To find the fixtures, run `grep -rn "bmStatus" backend/frontend/src --include=*.ts`.

Expected: frontend typecheck and tests pass.

- [ ] **Step 5: Commit together with Task 5**

The backend doesn't compile until Task 5 fills the fields in, so stage the files and leave the commit to Task 5:

```bash
git add schema/game-ws-v1.json backend/src/schema backend/frontend/src/lib/api backend/frontend/src
```

---

### Task 3: Seats in the engine (create, indexes, rebuild)

**Files:**
- Modify: `backend/src/session/types.ts` (`Seat`, `Session`)
- Modify: `backend/src/session/replay.ts` (`newSession`)
- Modify: `backend/src/session/engine.ts` (`create`, `createWithSeats`, indexes, `rebuildOne`, `release`, the errors)
- Test: `backend/src/session/engine.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type Seat = { name: string; userId: string | null; controllerUserId: string; boardId: string | null; boardName: string | null }
  export type BmStatus = { status: string; running: boolean; event: string }
  export interface Session {
    // existing fields, with these changes:
    seats: Seat[]                 // new; players stays as seats.map(s => ({ name: s.name }))
    forfeited: number[]           // new; seat indices, ascending
    boardStatus: Map<string, BmStatus> // replaces bmStatus
    status: 'active' | 'finished' | 'aborted'
  }
  // engine.ts
  export type NewSessionSpec = { ownerUserId: string; gameId: string; config: GameConfig; seats: Seat[] }
  class SessionEngine {
    create(ownerUserId: string, boardId: string | null, gameId: string, config: GameConfig, players: Player[]): Promise<{ sessionId: string }> // unchanged signature (local flow)
    createWithSeats(spec: NewSessionSpec): Promise<{ sessionId: string }>
    getSessionByUser(userId: string): Session | undefined   // replaces getSessionByOwner
    getSessionByBoard(boardId: string): Session | undefined
  }
  export class ActiveSessionError extends Error { constructor(message: string, readonly sessionId: string, readonly userId: string) }
  export class BoardBusyError extends Error { constructor(readonly boardId: string) }
  ```

- [ ] **Step 1: Write the failing tests**

In `backend/src/session/engine.test.ts`, add:

```ts
import { BoardBusyError } from './engine.js'
import type { Seat } from './types.js'

const seat = (name: string, controllerUserId: string, boardId: string | null, userId: string | null = controllerUserId): Seat =>
  ({ name, userId, controllerUserId, boardId, boardName: boardId })

describe('createWithSeats', () => {
  it('indexes every seat board and every controller', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'x01', config: x01Module.defaultConfig,
      seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b'), seat('Guest', 'host', 'board-a', null)],
    })
    expect(engine.getSessionByBoard('board-a')?.id).toBe(sessionId)
    expect(engine.getSessionByBoard('board-b')?.id).toBe(sessionId)
    expect(engine.getSessionByUser('lena')?.id).toBe(sessionId)
    expect(engine.getSession(sessionId)?.players).toEqual([{ name: 'Host' }, { name: 'Lena' }, { name: 'Guest' }])
  })

  it('stores each seat\'s account, controller and board', async () => {
    const store = makeStore()
    const engine = new SessionEngine(store, push)
    await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'atc', config: {},
      seats: [seat('Host', 'host', 'board-a'), seat('Guest', 'host', null, null)],
    })
    expect(store.insertSession).toHaveBeenCalledWith(expect.objectContaining({
      owner_user_id: 'host', board_db_id: null,
      players: [
        { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'board-a' },
        { name: 'Guest', user_id: null, controller_user_id: 'host', board_db_id: null },
      ],
    }))
  })

  it('refuses a board another game uses', async () => {
    const engine = makeEngine()
    await engine.create('user-1', 'board-b', 'atc', {}, [{ name: 'Alice' }])
    const err = await engine.createWithSeats({ ownerUserId: 'host', gameId: 'atc', config: {}, seats: [seat('Host', 'host', 'board-b')] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(BoardBusyError)
  })

  it('refuses a controller who is already in a game', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('lena', null, 'atc', {}, [{ name: 'Lena' }])
    const err = await engine.createWithSeats({ ownerUserId: 'host', gameId: 'atc', config: {}, seats: [seat('Host', 'host', null), seat('Lena', 'lena', null)] }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ActiveSessionError)
    expect(err instanceof ActiveSessionError && [err.sessionId, err.userId]).toEqual([sessionId, 'lena'])
  })

  it('frees every board and controller once the game ends', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.createWithSeats({ ownerUserId: 'host', gameId: 'atc', config: {}, seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b')] })
    await engine.deleteSession(sessionId)
    expect(engine.getSessionByBoard('board-b')).toBeUndefined()
    expect(engine.getSessionByUser('lena')).toBeUndefined()
  })
})

describe('rebuild with seats', () => {
  it('restores each seat\'s controller and board', async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([{
      id: 's1', owner_user_id: 'host', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 1, config: {}, created_at: new Date(),
      players: [
        { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'board-a', board_name: 'Living room' },
        { name: 'Lena', user_id: 'lena', controller_user_id: null, board_db_id: 'board-b', board_name: "Lena's place" },
      ],
    } satisfies StoredGameSession])
    const engine = new SessionEngine(store, push)
    await engine.rebuild()
    const s = engine.getSession('s1')
    expect(s?.seats).toEqual([
      { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: 'board-a', boardName: 'Living room' },
      // A deleted controller falls back to the host, so the seat can still be played
      { name: 'Lena', userId: 'lena', controllerUserId: 'host', boardId: 'board-b', boardName: "Lena's place" },
    ])
    expect(engine.getSessionByBoard('board-b')?.id).toBe('s1')
  })
})
```

Also rename the existing `getSessionByOwner` uses in this file to `getSessionByUser`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/session/engine.test.ts`
Expected: FAIL. `createWithSeats`, `getSessionByUser` and `BoardBusyError` aren't defined.

- [ ] **Step 3: Implement the types**

In `types.ts`, add:

```ts
/** A seat: the player, who may act for them, and where their darts come from (null = by hand). */
export type Seat = { name: string; userId: string | null; controllerUserId: string; boardId: string | null; boardName: string | null }

export type BmStatus = { status: string; running: boolean; event: string }
```

In `Session`:
- Replace `bmStatus: … | null` with `boardStatus: Map<string, BmStatus>`.
- Add `seats: Seat[]` and `forfeited: number[]`.
- Change `status` to `'active' | 'finished' | 'aborted'`.
- Update the `ownerUserId` doc to "The host: started the game; may start the bull off and abort."

Keep `boardId` and document it as "The local game's board (null for lobby games: see seats)."

- [ ] **Step 4: Implement `newSession`**

In `replay.ts`, `newSession` takes `seats` instead of `players`:

```ts
export function newSession(a: {
  id: string; ownerUserId: string; boardId: string | null; module: AnyGameModule
  config: GameConfig; seats: Seat[]; seed: number; createdAt: Date
}): Session {
  const players = a.seats.map(s => ({ name: s.name }))
  const initial = a.module.init(a.config, players, seededRng(a.seed))
  return {
    id: a.id, ownerUserId: a.ownerUserId, boardId: a.boardId, seats: a.seats, players, module: a.module,
    committedState: initial, currentState: initial, openVisitEvents: [], openDarts: [],
    status: 'active', createdAt: a.createdAt, seed: a.seed, visitCount: 0, nextSeq: 0,
    totalDarts: Array<number>(players.length).fill(0),
    totalVisits: Array<number>(players.length).fill(0),
    boardStatus: new Map(), forfeited: [],
  }
}
```

Fix the test callers:
- `replay.test.ts:87`: pass `seats: PLAYERS.map((p, i) => ({ name: p.name, userId: i === 0 ? 'user-1' : null, controllerUserId: 'user-1', boardId: 'board-1', boardName: null }))` instead of `players: PLAYERS`.
- `apply.test.ts`'s `session()` helper, which builds a `Session` literal: replace `bmStatus: null` with `boardStatus: new Map(), forfeited: [], seats: players.map(p => ({ name: p.name, userId: null, controllerUserId: 'u1', boardId: 'b1', boardName: null }))`.
- Any other `Session` literal that `npm run typecheck` reports gets the same fields.

- [ ] **Step 5: Implement the engine**

In `engine.ts`:

```ts
/** Thrown when a player already has a game running; carries that game's id and who it is. */
export class ActiveSessionError extends Error {
  constructor(message: string, readonly sessionId: string, readonly userId: string) { super(message) }
}

/** Thrown when a board is in another running game. */
export class BoardBusyError extends Error {
  constructor(readonly boardId: string) { super(`active session already exists for board ${boardId}`) }
}

export type NewSessionSpec = { ownerUserId: string; gameId: string; config: GameConfig; seats: Seat[] }

const distinct = <T>(xs: (T | null)[]): T[] => [...new Set(xs.filter((x): x is T => x !== null))]
const seatBoards = (s: Session): string[] => distinct(s.seats.map(x => x.boardId))
const controllers = (s: Session): string[] => distinct(s.seats.map(x => x.controllerUserId))
```

Replace `byOwner` with `byUser`. The `create` (local) method builds seats and delegates:

```ts
  async create(ownerUserId: string, boardId: string | null, gameId: string, config: GameConfig, players: Player[]): Promise<{ sessionId: string }> {
    // A local game: the owner throws for everyone, on one board; only the owner's seat is an account
    const seats = players.map((p, i): Seat => ({ name: p.name, userId: i === 0 ? ownerUserId : null, controllerUserId: ownerUserId, boardId, boardName: null }))
    return this.start({ ownerUserId, gameId, config, seats }, boardId)
  }

  async createWithSeats(spec: NewSessionSpec): Promise<{ sessionId: string }> {
    return this.start(spec, null)
  }

  private async start(spec: NewSessionSpec, sessionBoardId: string | null): Promise<{ sessionId: string }> {
    const mod = games[spec.gameId]
    if (!mod) throw new Error(`unknown game: ${spec.gameId}`)
    for (const userId of distinct([spec.ownerUserId, ...spec.seats.map(s => s.controllerUserId)])) {
      const running = this.byUser.get(userId)
      if (running) throw new ActiveSessionError('active session already exists for user', running.id, userId)
    }
    for (const boardId of distinct(spec.seats.map(s => s.boardId))) {
      if (this.byBoard.has(boardId)) throw new BoardBusyError(boardId)
    }
    const players = spec.seats.map(s => ({ name: s.name }))
    const invalid = mod.validate?.(spec.config, players)
    if (invalid) throw new Error(`invalid config: ${invalid}`)

    const sessionId = ulid()
    const seed = newSeed()
    const session = newSession({ id: sessionId, ownerUserId: spec.ownerUserId, boardId: sessionBoardId, module: mod, config: spec.config, seats: spec.seats, seed, createdAt: new Date() })
    await this.store.insertSession({
      id: sessionId, owner_user_id: spec.ownerUserId, board_db_id: sessionBoardId, game_id: spec.gameId,
      game_version: mod.version, rng_seed: seed, config: spec.config,
      players: spec.seats.map(s => ({ name: s.name, user_id: s.userId, controller_user_id: s.controllerUserId, board_db_id: s.boardId })),
    })
    this.index(session)
    return { sessionId }
  }

  private index(session: Session): void {
    for (const b of seatBoards(session)) this.byBoard.set(b, session)
    for (const u of distinct([session.ownerUserId, ...controllers(session)])) this.byUser.set(u, session)
    this.byId.set(session.id, session)
  }

  // A finished session no longer holds its boards or its players' one active slot.
  // It stays in byId so its final snapshot can still be shown.
  private release(session: Session): void {
    for (const b of seatBoards(session)) if (this.byBoard.get(b) === session) this.byBoard.delete(b)
    for (const u of distinct([session.ownerUserId, ...controllers(session)])) if (this.byUser.get(u) === session) this.byUser.delete(u)
  }

  getSessionByUser(userId: string): Session | undefined {
    return this.byUser.get(userId)
  }
```

`rebuildOne`: build the seats from the stored rows. A missing controller falls back to the owner, and a local game's seats fall back to the session's board.

```ts
    const owner = row.owner_user_id
    const seats = row.players.map((p): Seat => ({
      name: p.name, userId: p.user_id,
      controllerUserId: p.controller_user_id ?? owner,
      boardId: p.board_db_id, boardName: p.board_name,
    }))
    const session = newSession({
      id: row.id, ownerUserId: owner, boardId: row.board_db_id, module: mod,
      config: config.data, seats, seed: row.rng_seed, createdAt: row.created_at,
    })
    // ... replay as before; replace the three index lines at the end with:
    this.index(session)
```

Here `owner` is `row.owner_user_id` after the existing null check, so TS narrows it to `string`. Bind it after that check.

In `onBridgeEvent`, change the `board.status` line to `session.boardStatus.set(boardId, readBoardStatus(event.data))`. Task 4 rewrites the rest.

In `getSnapshot`, set `bmStatus: null` for now. Task 5 rewrites it.

Update the 409 handling in `api/sessions.ts`. Its `ActiveSessionError` branch is unchanged. Add a branch before the `message?.includes('active session')` fallthrough:

```ts
      if (err instanceof BoardBusyError) return reply.code(409).send({ error: err.message })
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/session && npm run typecheck`
Expected: the engine and replay tests pass. Typecheck may still fail only in `getSnapshot` (the snapshot fields from Task 2), which Task 5 fixes. If Task 2 isn't applied yet, typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/session backend/src/api/sessions.ts
git commit -m "feat(engine): seats with controller and board; index every board and controller"
```

(If Task 2's staged schema changes break the typecheck, commit with `--no-verify` only if a hook runs typecheck. Otherwise commit normally. Task 5 makes it green again.)

---

### Task 4: Route board events to the seat that's up

**Files:**
- Modify: `backend/src/session/engine.ts` (`onBridgeEvent`, `record`, constructor, `onBoardPresence`)
- Modify: `backend/src/bridge-gw/handler.ts` (call `engine.onBoardPresence` on connect and disconnect)
- Test: `backend/src/session/engine.test.ts`

**Interfaces:**
- Consumes: `Session.seats`, `Session.boardStatus` (Task 3).
- Produces:
  ```ts
  export type Notice = { type: 'notice'; code: 'not_your_turn'; boardId: string }
  export type NotifyFn = (sessionId: string, userIds: string[], notice: Notice) => void
  constructor(store: EngineStore, push: PushFn, warn?: WarnFn, notify?: NotifyFn)
  onBoardPresence(boardId: string): void   // a bridge connected or dropped: re-push its game
  /** The seat whose turn it is. */
  export function currentSeat(session: Session): number   // in access.ts (Task 5); define here first if Task 5 isn't done
  ```

- [ ] **Step 1: Write the failing tests**

In `engine.test.ts`, add the tests below with these helpers. A detected dart must carry `score`, which the bridge schema requires.

```ts
const dartData = (index: number, name: string, number: number, multiplier: number, bed = 'SingleOuter') =>
  ({ visit_id: 'v', index, source_seq: index, dart: { segment: { name, number, bed, multiplier }, score: number * multiplier } })

async function twoBoardGame(store = makeStore(), notify = vi.fn()) {
  const engine = new SessionEngine(store, push, undefined, notify)
  const { sessionId } = await engine.createWithSeats({
    ownerUserId: 'host', gameId: 'x01', config: { ...x01Module.defaultConfig, startScore: 301 },
    seats: [seat('Host', 'host', 'board-a'), seat('Lena', 'lena', 'board-b')],
  })
  return { engine, sessionId, store, notify }
}

async function visit(engine: SessionEngine, boardId: string, darts: [string, number, number, string][]) {
  for (const [i, [name, number, multiplier, bed]] of darts.entries()) {
    await engine.onBridgeEvent(boardId, 'dart.detected', dartData(i, name, number, multiplier, bed))
  }
  await engine.onBridgeEvent(boardId, 'takeout.finished', {})
}
const T20: [string, number, number, string] = ['T20', 20, 3, 'Triple']
const S1: [string, number, number, string] = ['S1', 1, 1, 'SingleOuter']

describe('routing board events', () => {
  it('counts darts from the board of the seat that is up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.scores[0]).toBe(241)
  })

  it('drops darts from another board, unlogged, and tells that board\'s players', async () => {
    const { engine, sessionId, store, notify } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect(store.appendEvent).not.toHaveBeenCalled()
    expect((engine.getSnapshot(sessionId)?.game as X01Game).scores).toEqual([301, 301])
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], { type: 'notice', code: 'not_your_turn', boardId: 'board-b' })
  })

  it('ignores a takeout on a board that is not up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'S1', 1, 1))
    await engine.onBridgeEvent('board-b', 'takeout.finished', {})
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.currentPlayer).toBe(0)
    expect(game.currentVisitDarts).toHaveLength(1)
  })

  it('passes the turn to the next board on takeout; its darts count and bust without a visit.opened', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'visit.opened', { visit_id: 'early' }) // dropped: not Lena's turn yet
    await visit(engine, 'board-a', [S1])            // host 300
    await visit(engine, 'board-b', [T20, T20, T20]) // Lena 121
    expect((engine.getSnapshot(sessionId)?.game as X01Game).scores).toEqual([300, 121])
    await visit(engine, 'board-a', [S1])            // host 299
    await visit(engine, 'board-b', [T20, T20])      // Lena would leave 1 on double out: bust, back to 121
    const game = engine.getSnapshot(sessionId)?.game as X01Game
    expect(game.scores).toEqual([299, 121])
    expect(game.currentPlayer).toBe(0)
  })

  it('logs which board an accepted event came from', async () => {
    const { engine, store } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'S1', 1, 1))
    expect(store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ board_db_id: 'board-a', source: 'board' }))
  })

  it('keeps each board\'s status and re-pushes on bridge presence changes', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'board.status', { status: 'Throw', running: true, event: 'x' })
    expect(engine.getSession(sessionId)?.boardStatus.get('board-b')?.status).toBe('Throw')
    push.mockClear()
    engine.onBoardPresence('board-b')
    expect(push).toHaveBeenCalledWith(sessionId)
  })
})
```

`X01Game` has `scores`, `currentPlayer` and `currentVisitDarts` (see `schema/game-ws-v1.json`). `x01Module.defaultConfig` uses double out, so leaving 1 is a bust.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/session/engine.test.ts -t "routing board events"`
Expected: FAIL. Board B's dart is applied, and `notify` / `onBoardPresence` don't exist.

- [ ] **Step 3: Implement routing**

In `engine.ts`:

```ts
export type Notice = { type: 'notice'; code: 'not_your_turn'; boardId: string }
export type NotifyFn = (sessionId: string, userIds: string[], notice: Notice) => void

/** The seat whose turn it is (during a bull off: the bull off's thrower). */
export function currentSeat(session: Session): number {
  return session.module.getCurrentPlayer(session.currentState)
}
```

The constructor gains `private readonly notify: NotifyFn = () => undefined` as its 4th parameter.

Then:

```ts
  async onBridgeEvent(boardId: string, kind: string, data: unknown, bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return
    const event = parseBoardEvent(kind, data)
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    // board.status only feeds the status pill: kept per board, not logged
    if (event?.kind === 'board.status') session.boardStatus.set(boardId, readBoardStatus(event.data))
    else if (event) await this.record(session, { source: 'board', event }, { kind, data }, { bridgeEventId, boardId })
    this.push(session.id)
  }

  /** A board's bridge connected or dropped: its game shows the new board state. */
  onBoardPresence(boardId: string): void {
    const session = this.byBoard.get(boardId)
    if (session) this.push(session.id)
  }

  // Log the input (raw, as received), then apply it and store what it committed.
  // A board event from a board whose seat isn't up is dropped before it's logged.
  private record(session: Session, input: GameInput, raw: { kind: string; data: unknown }, origin: { bridgeEventId: string | null; boardId: string | null }): Promise<void> {
    return this.enqueue(session.id, async () => {
      if (session.status !== 'active') return
      if (origin.boardId !== null && session.seats[currentSeat(session)]?.boardId !== origin.boardId) {
        if (input.source === 'board' && input.event.kind === 'dart.detected') {
          const boardId = origin.boardId
          const users = [...new Set(session.seats.filter(s => s.boardId === boardId).map(s => s.controllerUserId))]
          this.notify(session.id, users, { type: 'notice', code: 'not_your_turn', boardId })
        }
        return
      }
      const at = new Date()
      await this.store.appendEvent({
        session_id: session.id, seq: session.nextSeq, source: input.source,
        kind: raw.kind, data: raw.data, bridge_event_id: origin.bridgeEventId, board_db_id: origin.boardId, created_at: at,
      })
      session.nextSeq++
      const outcome = applyInput(session, input, at)
      if (outcome.committed) await this.store.insertDarts(dartRows(session.id, outcome.committed))
      if (outcome.won) await this.finish(session, at)
    })
  }
```

`session.seats[currentSeat(session)]?.boardId` needs the `?.` only if `noUncheckedIndexedAccess` is on. Match the repo's tsconfig and drop the `?.` if the linter flags it as unnecessary.

`onUserAction` calls `this.record(session, …, { bridgeEventId: null, boardId: null })` for now. Task 5 changes it.

- [ ] **Step 4: Wire up bridge presence**

In `backend/src/bridge-gw/handler.ts`:
- after `bridgeConnections.register(conn, board.id)`, call `engine.onBoardPresence(board.id)`
- in both `close` and `error` handlers, call `if (conn.boardDbId) engine.onBoardPresence(conn.boardDbId)` after `bridgeConnections.remove(conn)`

Read `conn.boardDbId` before `remove` if `remove` clears it. It doesn't today, because `remove` only deletes map entries.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && npx vitest run src/session src/bridge-gw`
Expected: PASS, including all existing engine tests. A local game's seats all share its board, so its darts always count.

- [ ] **Step 6: Commit**

```bash
git add backend/src/session/engine.ts backend/src/session/engine.test.ts backend/src/bridge-gw/handler.ts
git commit -m "feat(engine): only the board of the seat that's up feeds the game"
```

---

### Task 5: Who may act, who may watch, per-viewer snapshots

**Files:**
- Create: `backend/src/session/access.ts`
- Create: `backend/src/session/access.test.ts`
- Modify: `backend/src/session/engine.ts` (`onUserAction`, `getSnapshot`, `deleteSession`)
- Modify: `backend/src/api/sessions.ts` (`canAccessSession` moves out; DELETE is host only)
- Modify: `backend/src/browser-gw/connections.ts` (sockets carry their user; per-socket push)
- Modify: `backend/src/browser-gw/handler.ts` (pass the user; send errors and notices; push on connect and disconnect)
- Modify: `backend/src/index.ts` (wire `notify`)
- Test: `backend/src/browser-gw/handler.test.ts`, `backend/src/session/snapshot.contract.test.ts`, `backend/src/session/engine.test.ts`, `backend/src/api/sessions.test.ts`

**Interfaces:**
- Consumes: `currentSeat`, `Notice`, `NotifyFn` (Task 4); `Seat` (Task 3); the Task 2 generated types `Snapshot`, `ErrorMessage`, `NoticeMessage`.
- Produces:
  ```ts
  // access.ts
  export function canAccessSession(userId: string, session: Session): boolean
  export function isHost(userId: string, session: Session): boolean
  /** The action as it may be applied (forfeit gets its seats), or null when the user may not send it. */
  export function authorizeAction(session: Session, userId: string, action: UserAction): UserAction | null
  // engine.ts
  export type ActionResult = { ok: true } | { ok: false; code: 'forbidden' }
  onUserAction(sessionId: string, userId: string, action: UserAction): Promise<ActionResult>
  export type SnapshotView = { viewerUserId: string | null; connectedUserIds: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean }
  getSnapshot(sessionId: string, view?: SnapshotView): Snapshot | undefined
  // connections.ts
  class BrowserConnections {
    add(sessionId: string, ws: WebSocket, userId: string): void
    remove(sessionId: string, ws: WebSocket): void
    connectedUsers(sessionId: string): Set<string>
    pushEach(sessionId: string, build: (userId: string) => unknown): void
    sendTo(sessionId: string, userIds: string[], msg: unknown): void
  }
  ```

- [ ] **Step 1: Write the failing access tests**

`backend/src/session/access.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { authorizeAction, canAccessSession, isHost } from './access.js'
import { newSession } from './replay.js'
import { x01Module } from '../games/x01.js'
import type { Seat } from './types.js'

const seat = (name: string, controllerUserId: string, boardId: string | null): Seat =>
  ({ name, userId: controllerUserId, controllerUserId, boardId, boardName: null })

function game(seats: Seat[], owner = 'host') {
  return newSession({ id: 's1', ownerUserId: owner, boardId: null, module: x01Module, config: x01Module.defaultConfig, seats, seed: 1, createdAt: new Date() })
}

const seg = { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } as const

describe('authorizeAction', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b'), seat('Guest', 'host', 'a')])

  it('lets only the controller of the seat that is up throw, undo, correct or take out', () => {
    for (const action of [{ type: 'add_dart', segment: seg }, { type: 'undo_dart' }, { type: 'takeout' }, { type: 'correct_dart', visitIndex: 0, segment: seg }, { type: 'bulloff_skip' }] as const) {
      expect(authorizeAction(s, 'host', action)).toEqual(action)
      expect(authorizeAction(s, 'lena', action)).toBeNull()
    }
  })

  it('leaves bull off start/rethrow and unknown game actions to the host', () => {
    expect(authorizeAction(s, 'host', { type: 'bulloff_start' })).toEqual({ type: 'bulloff_start' })
    expect(authorizeAction(s, 'lena', { type: 'bulloff_start' })).toBeNull()
    expect(authorizeAction(s, 'lena', { type: 'bulloff_rethrow' })).toBeNull()
  })

  it('fills a forfeit in with every seat the sender controls', () => {
    expect(authorizeAction(s, 'host', { type: 'forfeit' })).toEqual({ type: 'forfeit', seats: [0, 2] })
    expect(authorizeAction(s, 'lena', { type: 'forfeit', seats: [0] })).toEqual({ type: 'forfeit', seats: [1] })
  })

  it('refuses a forfeit with nobody left to lose to, or from someone without seats', () => {
    expect(authorizeAction(game([seat('A', 'host', 'a'), seat('B', 'host', 'a')]), 'host', { type: 'forfeit' })).toBeNull()
    expect(authorizeAction(s, 'stranger', { type: 'forfeit' })).toBeNull()
  })
})

describe('canAccessSession / isHost', () => {
  const s = game([seat('Host', 'host', 'a'), seat('Lena', 'lena', 'b')])
  it('lets the host and every controller in, nobody else', () => {
    expect(canAccessSession('host', s)).toBe(true)
    expect(canAccessSession('lena', s)).toBe(true)
    expect(canAccessSession('max', s)).toBe(false)
  })
  it('knows the host', () => {
    expect(isHost('host', s)).toBe(true)
    expect(isHost('lena', s)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/session/access.test.ts`
Expected: FAIL, because `./access.js` can't be found.

- [ ] **Step 3: Implement `access.ts`**

```ts
import type { Session, UserAction } from './types.js'

/** The seat whose turn it is (during a bull off: the bull off's thrower). */
export function currentSeat(session: Session): number {
  return session.module.getCurrentPlayer(session.currentState)
}

/** The host and everyone who controls a seat can see the game. */
export function canAccessSession(userId: string, session: Session): boolean {
  return isHost(userId, session) || session.seats.some(s => s.controllerUserId === userId)
}

/** The host started the game: starts the bull off, aborts. */
export function isHost(userId: string, session: Session): boolean {
  return session.ownerUserId === userId
}

// Actions on the turn in progress: only whoever controls the seat that's up
const SEAT_ACTIONS = new Set(['add_dart', 'undo_dart', 'takeout', 'correct_dart', 'bulloff_skip'])

/** The action as it may be applied (forfeit gets its seats), or null when the user may not send it. */
export function authorizeAction(session: Session, userId: string, action: UserAction): UserAction | null {
  if (SEAT_ACTIONS.has(action.type)) {
    return session.seats[currentSeat(session)].controllerUserId === userId ? action : null
  }
  if (action.type === 'forfeit') {
    const live = session.seats.flatMap((s, i) => session.forfeited.includes(i) ? [] : [{ s, i }])
    const mine = live.filter(x => x.s.controllerUserId === userId).map(x => x.i)
    // Nothing to give up, or nobody left to lose to
    if (mine.length === 0 || mine.length === live.length) return null
    return { type: 'forfeit', seats: mine }
  }
  // The bull off's start/rethrow and any game action decide for everyone: the host
  return isHost(userId, session) ? action : null
}
```

Move `currentSeat` here from `engine.ts`. `engine.ts` then imports it from `./access.js`.

Remove `canAccessSession` from `api/sessions.ts` and import it from `../session/access.js` there and in `browser-gw/handler.ts`.

- [ ] **Step 4: Run the access tests to verify they pass**

Run: `cd backend && npx vitest run src/session/access.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing engine and API tests**

In `engine.test.ts`:

```ts
describe('onUserAction authorization', () => {
  it('refuses another player\'s action without logging it', async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    const res = await engine.onUserAction(sessionId, 'lena', { type: 'add_dart', segment: { name: 'S1', number: 1, bed: 'SingleOuter', multiplier: 1 } })
    expect(res).toEqual({ ok: false, code: 'forbidden' })
    expect(store.appendEvent).not.toHaveBeenCalled()
  })

  it('logs a forfeit with the seats it covers', async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    await engine.onUserAction(sessionId, 'lena', { type: 'forfeit' })
    expect(store.appendEvent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'forfeit', data: { type: 'forfeit', seats: [1] } }))
  })

  it('still lets a local game\'s owner do everything', async () => {
    const engine = makeEngine()
    const { sessionId } = await engine.create('user-1', 'board-1', 'x01', { ...x01Module.defaultConfig, bullOff: 'wdc' }, [{ name: 'A' }, { name: 'B' }])
    await engine.onBridgeEvent('board-1', 'dart.detected', dartData(0, 'Bull', 25, 2, 'Double'))
    expect(await engine.onUserAction(sessionId, 'user-1', { type: 'bulloff_skip' })).toEqual({ ok: true })
  })
})

describe('getSnapshot per viewer', () => {
  it('describes each seat and the viewer\'s own seats', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, { viewerUserId: 'lena', connectedUserIds: new Set(['host']), isBoardOnline: b => b === 'board-a' })
    expect(snap).toMatchObject({
      status: 'active', ownerUserId: 'host', mySeats: [1],
      seats: [
        { controllerUserId: 'host', userId: 'host', boardId: 'board-a', boardName: 'board-a', boardOnline: true, controllerConnected: true, forfeited: false },
        { controllerUserId: 'lena', userId: 'lena', boardId: 'board-b', boardName: 'board-b', boardOnline: false, controllerConnected: false, forfeited: false },
      ],
    })
  })

  it('shows the status of the board whose seat is up', async () => {
    const { engine, sessionId } = await twoBoardGame()
    await engine.onBridgeEvent('board-b', 'board.status', { status: 'Takeout', running: true, event: 'x' })
    await engine.onBridgeEvent('board-a', 'board.status', { status: 'Throw', running: true, event: 'y' })
    expect(engine.getSnapshot(sessionId)?.bmStatus?.status).toBe('Throw')
  })

  it('pushes an aborted snapshot before dropping the game', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const seen: (string | undefined)[] = []
    push.mockImplementation((id: string) => { seen.push(engine.getSnapshot(id)?.status) })
    await engine.deleteSession(sessionId)
    expect(seen).toEqual(['aborted'])
    push.mockReset()
  })
})
```

Also update every existing `engine.onUserAction(sessionId, ` call in `engine.test.ts` and `replay.test.ts` to `engine.onUserAction(sessionId, 'user-1', `, using the owner id each test created the session with. Run `grep -n "onUserAction(" src/session/*.test.ts` and fix each one.

In `api/sessions.test.ts`, add a test that `DELETE /api/sessions/:id` by a controller who isn't the host gets 403. The engine mock's `getSession` returns
`{ id: 's1', ownerUserId: 'user-2', seats: [{ controllerUserId: 'user-1' }], status: 'active', module: { id: 'x01' }, players: [], boardId: null, createdAt: new Date() }`.
Also add one for `GET` by that controller getting 200. Mock `getSnapshot` to return `undefined` so `game` is `null`.

In `browser-gw/handler.test.ts`:
- Update the `BrowserConnections` tests to the new `add(sessionId, ws, userId)` / `pushEach` API.
- Add:

```ts
  it('sends each socket its own payload', () => {
    const bc = new BrowserConnections()
    const a = { readyState: 1, send: vi.fn() } as any
    const b = { readyState: 1, send: vi.fn() } as any
    bc.add('s1', a, 'host'); bc.add('s1', b, 'lena')
    bc.pushEach('s1', userId => ({ for: userId }))
    expect(a.send).toHaveBeenCalledWith(JSON.stringify({ for: 'host' }))
    expect(b.send).toHaveBeenCalledWith(JSON.stringify({ for: 'lena' }))
    expect(bc.connectedUsers('s1')).toEqual(new Set(['host', 'lena']))
  })

  it('sends a message only to the named users', () => {
    const bc = new BrowserConnections()
    const a = { readyState: 1, send: vi.fn() } as any
    const b = { readyState: 1, send: vi.fn() } as any
    bc.add('s1', a, 'host'); bc.add('s1', b, 'lena')
    bc.sendTo('s1', ['lena'], { type: 'notice' })
    expect(a.send).not.toHaveBeenCalled()
    expect(b.send).toHaveBeenCalledOnce()
  })
```

Add a WS test: a refused action gets an `error` message back. Follow the existing `WS auth` test's setup. Use `getAuthUser` resolving `{ userId: 'lena' }`. The engine mock has:
- `getSession` returning `{ id: 's1', ownerUserId: 'host', seats: [{ controllerUserId: 'lena' }] }`
- `getSnapshot` returning `{ type: 'snapshot' }`
- `onUserAction` resolving `{ ok: false, code: 'forbidden' }`

Send `{ type: 'user_action', action: { type: 'takeout' } }` and expect a message `{ type: 'error', code: 'forbidden', action: 'takeout' }`. `checkSnapshot` may log for the fake snapshot, which is fine.

- [ ] **Step 6: Run them to verify they fail**

Run: `cd backend && npx vitest run src/session src/browser-gw src/api/sessions.test.ts`
Expected: FAIL, because the new signatures and fields are missing.

- [ ] **Step 7: Implement the engine**

In `engine.ts`:

```ts
export type ActionResult = { ok: true } | { ok: false; code: 'forbidden' }
export type SnapshotView = { viewerUserId: string | null; connectedUserIds: ReadonlySet<string>; isBoardOnline: (boardId: string) => boolean }
const NO_VIEWER: SnapshotView = { viewerUserId: null, connectedUserIds: new Set(), isBoardOnline: () => false }

  async onUserAction(sessionId: string, userId: string, action: UserAction): Promise<ActionResult> {
    const session = this.byId.get(sessionId)
    if (!session) return { ok: true }
    let refused = false
    await this.enqueue(session.id, async () => {
      // Decided inside the queue: whose turn it is can change with every input
      const allowed = session.status === 'active' ? authorizeAction(session, userId, action) : action
      if (!allowed) { refused = true; return }
      await this.apply(session, { source: 'user', action: allowed }, { kind: allowed.type, data: allowed }, { bridgeEventId: null, boardId: null })
    })
    this.push(session.id)
    return refused ? { ok: false, code: 'forbidden' } : { ok: true }
  }
```

Split `record` into an enqueueing wrapper and a non-enqueueing `apply`, so `onUserAction` can authorize and apply in one queue slot:

```ts
  private record(session: Session, input: GameInput, raw: { kind: string; data: unknown }, origin: Origin): Promise<void> {
    return this.enqueue(session.id, () => this.apply(session, input, raw, origin))
  }

  // Runs inside the session's queue
  private async apply(session: Session, input: GameInput, raw: { kind: string; data: unknown }, origin: Origin): Promise<void> {
    // body of Task 4's enqueued function, unchanged
  }
```

Here `type Origin = { bridgeEventId: string | null; boardId: string | null }`.

`getSnapshot`:

```ts
  getSnapshot(sessionId: string, view: SnapshotView = NO_VIEWER): Snapshot | undefined {
    const session = this.byId.get(sessionId)
    if (!session) return undefined
    const currentVisitDarts = session.openVisitEvents.flatMap(e => e.kind === 'dart.detected' ? [e.data.dart] : [])
    const engineFields = { currentVisitDarts, totalDarts: session.totalDarts, totalVisits: session.totalVisits }
    const upBoard = session.seats[currentSeat(session)]?.boardId ?? null
    const common = {
      type: 'snapshot' as const,
      sessionId: session.id,
      boardId: session.boardId,
      players: session.players,
      status: session.status,
      ownerUserId: session.ownerUserId,
      seats: session.seats.map((s, i) => ({
        controllerUserId: s.controllerUserId, userId: s.userId, boardId: s.boardId, boardName: s.boardName,
        boardOnline: s.boardId !== null && view.isBoardOnline(s.boardId),
        controllerConnected: view.connectedUserIds.has(s.controllerUserId),
        forfeited: session.forfeited.includes(i),
      })),
      mySeats: session.seats.flatMap((s, i) => s.controllerUserId === view.viewerUserId ? [i] : []),
      bmStatus: upBoard === null ? null : session.boardStatus.get(upBoard) ?? null,
    }
    const mod = session.module
    if (mod.id === 'x01') {
      return { ...common, gameId: mod.id, game: { ...mod.view(session.currentState, session.players), ...engineFields } }
    }
    return { ...common, gameId: mod.id, game: { ...mod.view(session.currentState, session.players), ...engineFields } }
  }
```

`deleteSession` (the host abort) marks the session aborted and pushes before dropping it:

```ts
  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    await this.enqueue(sessionId, async () => {
      if (session.status === 'active') {
        await this.store.abortSession(sessionId, new Date())
        session.status = 'aborted'
      }
      this.release(session)
      // Everyone still watching sees the game end before it goes away
      this.push(sessionId)
      this.byId.delete(sessionId)
    })
    return true
  }
```

- [ ] **Step 8: Implement the connections and the gateway**

`connections.ts`:

```ts
import type { WebSocket } from 'ws'

export class BrowserConnections {
  // Socket → the user it belongs to, per game
  private sessions: Map<string, Map<WebSocket, string>> = new Map()

  add(sessionId: string, ws: WebSocket, userId: string): void {
    let m = this.sessions.get(sessionId)
    if (!m) { m = new Map(); this.sessions.set(sessionId, m) }
    m.set(ws, userId)
  }

  remove(sessionId: string, ws: WebSocket): void {
    this.sessions.get(sessionId)?.delete(ws)
  }

  connectedUsers(sessionId: string): Set<string> {
    return new Set(this.sessions.get(sessionId)?.values() ?? [])
  }

  /** Sends every open socket its own payload (null: nothing). */
  pushEach(sessionId: string, build: (userId: string) => unknown): void {
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      const msg = build(userId)
      if (msg != null && ws.readyState === 1) ws.send(JSON.stringify(msg))
    }
  }

  sendTo(sessionId: string, userIds: string[], msg: unknown): void {
    const payload = JSON.stringify(msg)
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      if (userIds.includes(userId) && ws.readyState === 1) ws.send(payload)
    }
  }
}
```

`handler.ts`:
- `browserConnections.add(sessionId, socket, user.userId)`
- send the first snapshot via `engine.getSnapshot(sessionId, viewFor(sessionId, user.userId))`
- after `add`, call `pushSnapshot(sessionId, engine)` so the others see this controller connect
- the message handler:

```ts
        try {
          const res = await engine.onUserAction(sessionId, user.userId, parsed.data.action)
          if (!res.ok) socket.send(JSON.stringify({ type: 'error', code: res.code, action: parsed.data.action.type }))
        } catch (err: unknown) { /* unchanged */ }
```

- on `close` / `error`: `browserConnections.remove(sessionId, socket); pushSnapshot(sessionId, engine)`
- the helpers:

```ts
import { bridgeConnections } from '../bridge-gw/connections.js'

function viewFor(sessionId: string, userId: string): SnapshotView {
  return { viewerUserId: userId, connectedUserIds: browserConnections.connectedUsers(sessionId), isBoardOnline: b => bridgeConnections.isOnline(b) }
}

export function pushSnapshot(sessionId: string, engine: SessionEngine): void {
  browserConnections.pushEach(sessionId, userId => {
    const snap = engine.getSnapshot(sessionId, viewFor(sessionId, userId))
    if (snap) checkSnapshot(snap, msg => console.error(msg))
    return snap ?? null
  })
}

export function pushNotice(sessionId: string, userIds: string[], notice: Notice): void {
  browserConnections.sendTo(sessionId, userIds, notice)
}
```

Check that `bridge-gw/connections.ts` doesn't import anything from `browser-gw`, so there's no import cycle. It only imports schema types.

`api/sessions.ts`:
- `DELETE` checks `isHost(req.userId, session)` (403 otherwise). `GET`/list keep `canAccessSession`.
- `GET /api/sessions/:id`: `engine.getSnapshot(session.id)` still works with the default view.

`index.ts`: pass `(sessionId, userIds, notice) => { pushNotice(sessionId, userIds, notice) }` as the engine's 4th constructor argument.

`snapshot.contract.test.ts`: the existing contract tests now also validate the new fields through `checkSnapshot`/zod. Add one case that builds a lobby-style game with `createWithSeats` (two boards) and asserts its snapshot parses with `SnapshotSchema` from `../schema/zod.js`, the same way the existing cases check theirs.

- [ ] **Step 9: Run everything**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit (includes Task 2's staged schema changes)**

```bash
git add schema backend/src backend/frontend/src
git commit -m "feat: per-seat control, per-viewer snapshots, notices and refused-action errors"
```

---

### Task 6: Forfeit ends the game with forfeited seats last

**Files:**
- Modify: `backend/src/games/ranking.ts` (`forfeitPlacements`)
- Modify: `backend/src/session/apply.ts` (`forfeit` case)
- Modify: `backend/src/session/replay.ts` (`results`)
- Modify: `backend/src/session/types.ts` (`FinishedSeat` gets `forfeited`)
- Test: `backend/src/games/ranking.test.ts`, `backend/src/session/apply.test.ts`, `backend/src/session/engine.test.ts`

**Interfaces:**
- Consumes: `Session.forfeited` (Task 3); `ForfeitAction` with `seats` filled in by `authorizeAction` (Task 5).
- Produces:
  ```ts
  export function forfeitPlacements(placements: number[], forfeited: ReadonlySet<number>): number[]
  export type FinishedSeat = SeatResult & { throwPosition: number; forfeited: boolean }
  ```

- [ ] **Step 1: Write the failing tests**

`ranking.test.ts`:

```ts
import { forfeitPlacements } from './ranking.js'

describe('forfeitPlacements', () => {
  it('puts forfeited seats last, tied, and closes the gaps above them', () => {
    // standings 1,2,3,4; seat 0 (leading) and seat 2 forfeit
    expect(forfeitPlacements([1, 2, 3, 4], new Set([0, 2]))).toEqual([3, 1, 3, 2])
  })
  it('keeps ties among the others', () => {
    expect(forfeitPlacements([1, 1, 3], new Set([2]))).toEqual([1, 1, 3])
    expect(forfeitPlacements([1, 2, 2], new Set([0]))).toEqual([3, 1, 1])
  })
})
```

`apply.test.ts` (its `session()` helper already has the Task 3 fields):

```ts
  it('a forfeit drops the open visit and decides the game', () => {
    const s = session(x01Module, x01Module.defaultConfig, 2)
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } } }, new Date())
    const out = applyInput(s, { source: 'user', action: { type: 'forfeit', seats: [0] } }, new Date())
    expect(out).toEqual({ committed: null, won: true })
    expect(s.forfeited).toEqual([0])
    expect(s.openVisitEvents).toEqual([])
  })

  it('a forfeit without seats changes nothing', () => {
    const s = session(x01Module, x01Module.defaultConfig, 2)
    expect(applyInput(s, { source: 'user', action: { type: 'forfeit' } }, new Date())).toEqual({ committed: null, won: false })
  })
```

`engine.test.ts`:

```ts
describe('forfeit', () => {
  it('finishes the game with the forfeiting seats last', async () => {
    const { engine, sessionId, store } = await twoBoardGame()
    await engine.onBridgeEvent('board-a', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    await engine.onBridgeEvent('board-a', 'takeout.finished', {})
    await engine.onUserAction(sessionId, 'host', { type: 'forfeit' })
    expect(store.finishSession).toHaveBeenCalledWith(sessionId, expect.any(Date), [
      expect.objectContaining({ placement: 2, forfeited: true }),
      expect.objectContaining({ placement: 1, forfeited: false }),
    ])
    expect(engine.getSnapshot(sessionId)?.status).toBe('finished')
    expect(engine.getSessionByUser('lena')).toBeUndefined()
  })

  it('a forfeit logged before a crash finishes the game on rebuild', async () => {
    const store = makeStore()
    store.getActiveSessions.mockResolvedValue([{
      id: 's1', owner_user_id: 'host', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 1, config: {}, created_at: new Date(),
      players: [
        { name: 'Host', user_id: 'host', controller_user_id: 'host', board_db_id: 'a', board_name: null },
        { name: 'Lena', user_id: 'lena', controller_user_id: 'lena', board_db_id: 'b', board_name: null },
      ],
    }])
    store.getSessionEvents.mockResolvedValue([{ seq: 0, source: 'user', kind: 'forfeit', data: { type: 'forfeit', seats: [1] }, created_at: new Date() }])
    await new SessionEngine(store, push).rebuild()
    expect(store.finishSession).toHaveBeenCalledWith('s1', expect.any(Date), [
      expect.objectContaining({ placement: 1, forfeited: false }),
      expect.objectContaining({ placement: 2, forfeited: true }),
    ])
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && npx vitest run src/games/ranking.test.ts src/session`
Expected: FAIL.

- [ ] **Step 3: Implement**

`ranking.ts`:

```ts
/**
 * Placements once some seats forfeited: they share last place; the others keep their
 * order from `placements` (ties too), counted only among themselves.
 */
export function forfeitPlacements(placements: number[], forfeited: ReadonlySet<number>): number[] {
  const live = placements.flatMap((_, i) => forfeited.has(i) ? [] : [i])
  return placements.map((p, i) => forfeited.has(i)
    ? live.length + 1
    : 1 + live.filter(j => placements[j] < p).length)
}
```

`apply.ts`, `applyUserAction`, before `default`:

```ts
    case 'forfeit': {
      // The engine fills in the seats (see authorizeAction); a forfeit without any changes nothing
      const seats = action.seats ?? []
      if (seats.length === 0) return NONE
      session.forfeited = [...new Set([...session.forfeited, ...seats])].sort((a, b) => a - b)
      // The visit in progress doesn't count
      session.openVisitEvents = []
      session.openDarts = []
      return { committed: null, won: true }
    }
```

`types.ts`: `export type FinishedSeat = SeatResult & { throwPosition: number; forfeited: boolean }`

`replay.ts` `results`:

```ts
/** Each seat's placement and stats once the game is decided (won, or ended by a forfeit). */
export function results(session: Session): FinishedSeat[] {
  const state = session.committedState
  const seats = session.module.summarize(state, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
  const forfeited = new Set(session.forfeited)
  // Without a winner, summarize ranks by standing; a forfeit puts its seats last
  const placements = forfeited.size > 0 ? forfeitPlacements(seats.map(r => r.placement), forfeited) : seats.map(r => r.placement)
  const order = session.module.throwOrder?.(state) ?? []
  const valid = order.length === seats.length && seats.every((_, seat) => order.includes(seat))
  return seats.map((r, seat) => ({ ...r, placement: placements[seat], throwPosition: valid ? order.indexOf(seat) : seat, forfeited: forfeited.has(seat) }))
}
```

Import `forfeitPlacements` from `../games/ranking.js`. Check that `replay.ts` is allowed to import from `games/` (it imports `games` already via the engine). If lint forbids it, move `forfeitPlacements` to `session/`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat(engine): forfeit ends the game, forfeited seats placed last"
```

---

### Task 7: History shows forfeits

**Files:**
- Modify: `backend/src/db/history.ts` (`HistorySeat` gets `forfeited`)
- Modify: `schema/api-v1.yaml` (`HistorySeat`, or the name `GET /api/games` uses for a seat, gets `forfeited: boolean`)
- Regenerate: `npm run gen:api`
- Test: `backend/src/db/history.test.ts`, `backend/src/api/games.test.ts`

**Interfaces:**
- Consumes: `game_players.forfeited` (Task 1).
- Produces: `HistorySeat.forfeited: boolean` in the API.

- [ ] **Step 1: Write the failing test**

In `history.test.ts`, extend an existing finished-game fixture: set `forfeited: true` on one seat through `finishGameSession`. Assert that `listFinishedGames(...)` returns that seat with `forfeited: true` and the others with `false`.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && TEST_DATABASE_URL=… npx vitest run src/db/history.test.ts`
Expected: FAIL, because `forfeited` is undefined.

- [ ] **Step 3: Implement**

- Add `forfeited: boolean` to `HistorySeat`.
- Select `gp.forfeited` wherever `history.ts` selects seat columns. Find them with `grep -n "throw_position" src/db/history.ts`; every select that has it gets `forfeited` too.
- Map it through to the API mapping in `api/games.ts`.
- In `schema/api-v1.yaml`, add to the seat schema:

```yaml
        forfeited:
          type: boolean
          description: The seat gave up (abandoned) the game; placed last.
```

and add `forfeited` to that schema's `required`. Run `npm run gen:api`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npm test && npm run typecheck`, and `cd backend/frontend && npm run typecheck && npm test`.

If frontend history fixtures need the field, add `forfeited: false` to them.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add schema backend/src backend/frontend/src
git commit -m "feat(history): mark forfeited seats"
```

---

### Task 8: Two-board end-to-end check through the real gateways

**Files:**
- Create: `backend/src/multiplayer.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the test**

This uses the engine plus the real `BrowserConnections` and `pushSnapshot` with fake sockets, with no HTTP. It checks the whole push path:
- per-viewer `mySeats`
- presence
- notices to the right user
- refused actions

```ts
import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './session/engine.js'
import { browserConnections, pushSnapshot, pushNotice } from './browser-gw/handler.js'
import { x01Module } from './games/x01.js'

vi.mock('./auth/session.js', () => ({ getAuthUser: vi.fn() }))

const store: EngineStore = {
  insertSession: vi.fn().mockResolvedValue(undefined), getActiveSessions: vi.fn().mockResolvedValue([]),
  getSessionEvents: vi.fn().mockResolvedValue([]), appendEvent: vi.fn().mockResolvedValue(undefined),
  insertDarts: vi.fn().mockResolvedValue(undefined), finishSession: vi.fn().mockResolvedValue(undefined),
  abortSession: vi.fn().mockResolvedValue(undefined),
}
const sock = () => ({ readyState: 1, send: vi.fn() }) as any
const last = (ws: { send: { mock: { calls: unknown[][] } } }) => JSON.parse(String(ws.send.mock.calls.at(-1)?.[0]))

describe('two players, two boards', () => {
  it('each sees their own seats, the other\'s darts, and only their own notices', async () => {
    const engine: SessionEngine = new SessionEngine(store, id => { pushSnapshot(id, engine) }, undefined, pushNotice)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'x01', config: x01Module.defaultConfig,
      seats: [
        { name: 'Host', userId: 'host', controllerUserId: 'host', boardId: 'a', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena', controllerUserId: 'lena', boardId: 'b', boardName: "Lena's place" },
      ],
    })
    const hostWs = sock(); const lenaWs = sock()
    browserConnections.add(sessionId, hostWs, 'host')
    browserConnections.add(sessionId, lenaWs, 'lena')

    await engine.onBridgeEvent('a', 'dart.detected', { visit_id: 'v', index: 0, source_seq: 0, dart: { segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, score: 60 } })
    expect(last(lenaWs)).toMatchObject({ mySeats: [1], seats: [{ controllerConnected: true }, { controllerConnected: true }] })
    expect(last(lenaWs).game.currentVisitDarts).toHaveLength(1)
    expect(last(hostWs).mySeats).toEqual([0])

    lenaWs.send.mockClear(); hostWs.send.mockClear()
    await engine.onBridgeEvent('b', 'dart.detected', { visit_id: 'v', index: 0, source_seq: 0, dart: { segment: { name: 'S5', number: 5, bed: 'SingleOuter', multiplier: 1 }, score: 5 } })
    expect(lenaWs.send.mock.calls.map(c => JSON.parse(String(c[0])).type)).toContain('notice')
    expect(hostWs.send.mock.calls.map(c => JSON.parse(String(c[0])).type)).not.toContain('notice')

    expect(await engine.onUserAction(sessionId, 'lena', { type: 'takeout' })).toEqual({ ok: false, code: 'forbidden' })
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd backend && npx vitest run src/multiplayer.test.ts`
Expected: PASS. If it fails, the bug is in Tasks 3–6. Fix it there, not in this test.

- [ ] **Step 3: Commit**

```bash
git add backend/src/multiplayer.test.ts
git commit -m "test: two players on two boards through the push path"
```

---

### Task 9: Bring the spec and agent notes up to date

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the spec**

Apply the "Spec deviations" listed at the top of this plan to the spec:
- In "Ending early → Forfeit", remove the `standings` hook and the "last player / one controller wins" rule. Say that `summarize` ranks by standing when there's no winner.
- In "Access → Actions", remove `actionScope`. Make `bulloff_skip` per seat and `bulloff_rethrow` host-only. Abort is `DELETE /api/sessions/:id`.
- In "Testing", remove `standings` from the module tests.

- [ ] **Step 2: Update `AGENTS.md`**

Add to the "Where to look" table:

```
| Who may act for a seat, who may watch a game | `backend/src/session/access.ts` |
```

And under "Adding a game", step 1, append: "`summarize` must also work on a game that isn't won (no winner): a forfeit ends games early and ranks seats by it."

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-02-online-multiplayer-design.md AGENTS.md
git commit -m "docs: multiplayer sessions as built"
```
