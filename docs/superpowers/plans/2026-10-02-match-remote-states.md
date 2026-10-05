# Match remote states Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The match screen shows what's going on in a game played from several places. Each seat shows its board. The header shows the lobby name. When someone else is up, the centre shows "Live from <board>". When the player who's up has the game closed, everyone sees "Waiting for X · disconnected m:ss" (and the host can abort). When the up seat's board is offline, its controller gets the keypad and the others see "<name>'s board is offline". A dart thrown on your board out of turn shows a "Not your turn" toast that names who is throwing where. All of this works on desktop and on the phone layout.

**Architecture:**

- **Backend (small):**
  - `BrowserConnections` remembers when each user's last socket of a game closed.
  - The engine puts that time in the snapshot as the seat's `disconnectedAt`, and adds a top-level `lobbyName` (a new `Session.lobbyName`, always `null` until the lobbies plan sets it).
  - The `not_your_turn` notice gains `throwerName` and `throwerBoard`.
  - The fields go into `schema/game-ws-v1.json`, then `npm run gen:api`.
- **Frontend:**
  - All decisions live in a pure, unit-tested `lib/remote.ts`: is this a remote game, each seat's board line, what the centre column shows (`centerState`), the texts.
  - `ws.ts` starts parsing notices. A small `lib/toast.ts` store shows a notice for 6 s.
  - New presentational components (`SeatBoardLine`, `BoardCaption`, `TurnStatusBar`, `OfflineNotice`, `WaitingCard`, `NotTurnToast`) render what `lib/remote.ts` decides.
  - `GameDisplay.svelte` wires them in for the phone, duel and party layouts.
  - Local games ("New game" without other accounts) don't count as remote, so they look and behave exactly as before.

**Tech Stack:** TypeScript, Fastify 4 + @fastify/websocket, vitest (backend and frontend, node only), JSON Schema → generated TS/zod (`npm run gen:api`), Svelte 5 (runes), Tailwind CSS v4 (tokens in `backend/frontend/src/app.css`), Lucide icons (`@lucide/svelte`).

**Spec:** `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`. Mostly the section "Update after the lobby designs (2026-10-02, 18:40)": waiting and manual entry, not your turn, lobby name in the match header, and "Work split" item 1. Designs: the **Dartcade Platform Design** canvas (https://claude.ai/artifact/2ZyCCfSMhs3PKZzNLzsw23), artboards `project/Match-Remote.dc.html`, `Match-Remote-Waiting`, `Match-Remote-Manual`, `Mobile-Match-Manual`, `Match-Toast`, `Mobile-Match-Toast`, `Mobile-Match`. Read them with the Artifact tool (`read_file`); they are reference markup, not code.

## Global Constraints

- **Scope is work-split item 1 only.** No lobbies, no `lobby_id`, no leave/abandon/end-of-game dialogs (plan 4). Another plan (backend lobbies) runs in parallel and will set `lobbyName` and add `lobby_id`. The only schema additions here are:
  - per seat: `disconnectedAt`
  - top level: `lobbyName`
  - on `NoticeMessage`: `throwerName`, `throwerBoard`
- **Generated files aren't edited by hand.**
  - Generated: `backend/src/schema/game-ws.ts`, `backend/src/schema/game-ws-v1.deref.json`, `backend/src/schema/zod.ts`, `backend/frontend/src/lib/api/game-ws.ts`, `backend/frontend/src/lib/api/zod.ts`.
  - Edit `schema/game-ws-v1.json`, then run `npm run gen:api` at the repo root.
- **No casts in non-test code** (strict type-aware ESLint, `assertionStyle: 'never'`; `as const` is fine). The frontend has no `noUncheckedIndexedAccess`, so use `.at(i)` / `.find()` where a missing element must be handled.
- **Local games don't change.** A game is remote when its seats have more than one controller or more than one board (`isRemoteGame`). For a local game:
  - the seat lines are `null`
  - the centre state is always `play`
  - the start view and the Next button follow the same rule as before
  - desktop and phone look exactly as on `main`
- **Copy, verbatim from the spec and designs:**
  - "Waiting for Lena"
  - "Disconnected 1:12" (m:ss, ticking from `disconnectedAt`)
  - "Abort game", "Only you see this, as host."
  - "Your board is offline. Enter your darts here."
  - "Lena's board is offline"
  - "Live from Lena's place", "Lena is throwing at Lena's place"
  - "Not your turn.", "That dart wasn't counted.", "Lena is throwing at Lena's place."
  - "PAUSED", "BOARD OFFLINE", "Living room · offline"
- **Who sees what** (spec):
  - Waiting: everyone sees it; only the host also gets Abort.
  - Board offline: only the up seat's controller gets the keypad; the others see "<name>'s board is offline".
  - Not your turn: the notice goes to the controllers of the seats on the board the dart came from (the engine already does this).
- **Layout** (`AGENTS.md`): 2 players get a board in the centre with one panel per side; 3 or more get the board to the side with stacked player rows; phones use the phone layout.
- **Frontend tests** are vitest in node for `lib/*.ts` only. There's no component testing: testable logic goes into `lib/*.ts`, and Svelte markup is checked by `svelte-check`, lint and the visual pass (Task 9).
- **Commands:**
  - Backend: `cd backend && TEST_DATABASE_URL=postgres://dartgames:dev@172.18.0.2:5432/dartcade_mp_test npm test`, `npm run typecheck`, `npm run lint`.
  - Frontend: `cd backend/frontend && npm test && npm run typecheck && npm run lint`.
  - All of the task's part must pass before every commit.
- **Commits:** conventional commits (`feat(frontend): …`, lowercase subject under 72 chars), ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96
  ```

## Rulings (spec ambiguities decided while planning; Task 8 writes them into the spec)

1. **`disconnectedAt` when the controller never connected.** It's `null` both while the controller has the game open and when they haven't opened it since the server started (a fresh game, or after a restart). `controllerConnected: false` still means waiting. The waiting card then says "Not connected yet" instead of the timer. There's no made-up start time.
2. **Waiting beats board offline.** If the up seat's controller is gone, the game waits, whatever their board's state.
3. **Remote vs local.** Seat board lines, the "Live from" centre, the offline fallback and the header board pill apply only to remote games (Global Constraints). In a local game whose board goes offline, nothing changes: the header's board status panel already shows it.
4. **Abort** in the waiting card opens the existing "End this game?" confirm, which calls `DELETE /api/sessions/:id` (host only). Plan 4 replaces that dialog.
5. **Gender-neutral copy.** The design's "Her score is kept. The game carries on as soon as Lena's place is back." becomes "Their score is kept. The game carries on as soon as Lena is back.", because the wait is for the player, not the board.
6. **Clock skew.** The timer counts from the server's `disconnectedAt` using the browser clock, clamped at 0:00. There's no server-time field (the schema additions are fixed).
7. **`lobbyName` plumbing.** This plan adds:
   - `Session.lobbyName: string | null`
   - an optional `lobbyName` argument to `newSession` (default `null`)
   - the snapshot field

   The lobbies plan passes it in, through its start path and on rebuild. `NewSessionSpec` isn't touched here, to avoid colliding with that plan.

8. **`throwerBoard`** is the up seat's board name, even when that board is offline. It's `null` for a seat that enters darts by hand. A seat whose board has no name left (board deleted) shows as "Board".
9. **Not your turn → the centre always shows the board** ("Live from …"), whatever the Board/Enter toggle says. The toggle is hidden then, and while your own offline board forces the keypad.
10. **Start view.** The match starts on the keypad when none of the viewer's seats has a board. This used to be "the session has no board", which is null for every multi-board game. For local games the two rules agree.
11. **Next button.** It's "manual" (prominent "Next player") when the up seat has no board, or, in a remote game, when its board is offline. This used to look at the session's board. For local games the two rules agree.
12. **Waiting card placement.** In the duel layout it covers the waiting seat's panel below its name, as in `Match-Remote-Waiting`. In the party layout and on phones it takes the board's place in the centre (no design; panels and rows have no room for an overlay). During the bull off only the header shows PAUSED; the bull-off panel is unchanged.
13. **Header board pill.** In remote games the header shows the viewer's own board (the first of their seats that has one) as a pill, yellow "· offline" when its bridge is gone, as in `Match-Remote` and `Match-Remote-Manual`. The Board Manager panel (`BoardStatusPanel`) stays for local games, which have a session board.
14. **Toast.** A notice shows for 6 s with a draining bar, as in `Match-Toast`. A newer notice replaces it and restarts the time. It has a Dismiss button, which the design lacks (keyboard and screen-reader users).
15. **Close times are kept per game in memory.** `BrowserConnections` keeps when each user's last socket closed per game. Like finished sessions in the engine's `byId`, these entries live until the process restarts (one `Date` per player and game).

## Review Focus

1. **A controller with the game open in two tabs closes one.** They are still connected: no waiting, no `disconnectedAt`. Test in Task 1 ("a user with another socket still open is not disconnected").
2. **A disconnected player comes back.** Reopening the game clears `disconnectedAt` and the game carries on, with no stale timer. Test in Task 1 ("opening the game again clears it") and Task 2 (connected controller → `null` even if a close time is around).
3. **The browser clock is behind the server** (`disconnectedAt` in the future) or the value is garbage. The timer shows 0:00, never a negative or NaN time. Test in Task 4 (`formatElapsed`).
4. **A local game whose board goes offline, or a boardless local game.** The screen must stay exactly as today:
   - no keypad forcing
   - no seat lines
   - same start view and Next button

   Test in Task 4 (`centerState`, `seatLines`, `startsOnKeypad`, `isManualTurn` on the local fixture).

5. **The up seat's controller is gone _and_ their board is offline.** Everyone sees "Waiting for …", not "board offline". Test in Task 4 ("waiting beats board offline").

---

### Task 1: Remember when each player's game closed

**Files:**

- Modify: `backend/src/browser-gw/connections.ts`
- Test: `backend/src/browser-gw/handler.test.ts`

**Interfaces:**

- Produces:

  ```ts
  class BrowserConnections {
    add(sessionId: string, ws: WebSocket, userId: string): void            // also clears the user's close time
    remove(sessionId: string, ws: WebSocket, at?: Date): void             // records `at` (default now) when it was the user's last socket
    /** When the user's last socket of the game closed; null while one is open, or if they never had one. */
    disconnectedAt(sessionId: string, userId: string): Date | null
    // unchanged: connectedUsers, pushEach, sendTo
  }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/browser-gw/handler.test.ts`, after the `describe('BrowserConnections', …)` block:

```ts
describe('BrowserConnections: when a player left', () => {
  const at = new Date('2026-10-02T18:00:00.000Z')
  const sock = () => ({ readyState: 1, send: vi.fn() }) as any

  it('records when a user\'s last socket of the game closed', () => {
    const bc = new BrowserConnections()
    const ws = sock()
    bc.add('s1', ws, 'lena')
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
    bc.remove('s1', ws, at)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(at)
  })

  it('a user with another socket still open is not disconnected', () => {
    const bc = new BrowserConnections()
    const a = sock(); const b = sock()
    bc.add('s1', a, 'lena'); bc.add('s1', b, 'lena')
    bc.remove('s1', a, at)
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
    expect(bc.connectedUsers('s1')).toEqual(new Set(['lena']))
    const later = new Date('2026-10-02T18:05:00.000Z')
    bc.remove('s1', b, later)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(later)
  })

  it('opening the game again clears it', () => {
    const bc = new BrowserConnections()
    const ws = sock()
    bc.add('s1', ws, 'lena')
    bc.remove('s1', ws, at)
    bc.add('s1', sock(), 'lena')
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
  })

  it('knows nothing of a user who never opened the game', () => {
    expect(new BrowserConnections().disconnectedAt('s1', 'max')).toBeNull()
  })

  it('keeps the time per game', () => {
    const bc = new BrowserConnections()
    const one = sock(); const two = sock()
    bc.add('s1', one, 'lena'); bc.add('s2', two, 'lena')
    bc.remove('s1', one, at)
    expect(bc.disconnectedAt('s1', 'lena')).toEqual(at)
    expect(bc.disconnectedAt('s2', 'lena')).toBeNull()
  })

  it('ignores a socket it doesn\'t know', () => {
    const bc = new BrowserConnections()
    bc.remove('s1', sock(), at)
    expect(bc.disconnectedAt('s1', 'lena')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && npx vitest run src/browser-gw/handler.test.ts`
Expected: FAIL. The new tests fail with `bc.disconnectedAt is not a function`; the existing `BrowserConnections` and `WS auth` tests still pass.

- [ ] **Step 3: Implement**

Replace `backend/src/browser-gw/connections.ts` with:

```ts
import type { WebSocket } from 'ws'

export class BrowserConnections {
  // Socket → the user it belongs to, per game
  private sessions: Map<string, Map<WebSocket, string>> = new Map()
  // When each user's last socket of a game closed, per game. Cleared when they open it
  // again; kept for the process's lifetime, like the engine's finished sessions.
  private closed: Map<string, Map<string, Date>> = new Map()

  add(sessionId: string, ws: WebSocket, userId: string): void {
    let m = this.sessions.get(sessionId)
    if (!m) { m = new Map(); this.sessions.set(sessionId, m) }
    m.set(ws, userId)
    this.closed.get(sessionId)?.delete(userId)
  }

  remove(sessionId: string, ws: WebSocket, at: Date = new Date()): void {
    const m = this.sessions.get(sessionId)
    const userId = m?.get(ws)
    if (!m || userId === undefined) return
    m.delete(ws)
    if (!hasUser(m, userId)) {
      let c = this.closed.get(sessionId)
      if (!c) { c = new Map(); this.closed.set(sessionId, c) }
      c.set(userId, at)
    }
    if (m.size === 0) this.sessions.delete(sessionId)
  }

  /** Users with the game open (on at least one socket). */
  connectedUsers(sessionId: string): Set<string> {
    return new Set(this.sessions.get(sessionId)?.values() ?? [])
  }

  /** When the user's last socket of the game closed; null while one is open, or if they never had one. */
  disconnectedAt(sessionId: string, userId: string): Date | null {
    const m = this.sessions.get(sessionId)
    if (m && hasUser(m, userId)) return null
    return this.closed.get(sessionId)?.get(userId) ?? null
  }

  /** Sends every open socket its own payload (null: nothing). */
  pushEach(sessionId: string, build: (userId: string) => unknown): void {
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      if (ws.readyState !== 1) continue
      const msg = build(userId)
      if (msg != null) ws.send(JSON.stringify(msg))
    }
  }

  sendTo(sessionId: string, userIds: string[], msg: unknown): void {
    const payload = JSON.stringify(msg)
    for (const [ws, userId] of this.sessions.get(sessionId) ?? []) {
      if (userIds.includes(userId) && ws.readyState === 1) ws.send(payload)
    }
  }
}

function hasUser(m: Map<WebSocket, string>, userId: string): boolean {
  for (const u of m.values()) if (u === userId) return true
  return false
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd backend && npx vitest run src/browser-gw/handler.test.ts && npm run typecheck && npm run lint`
Expected: PASS, typecheck and lint clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/browser-gw/connections.ts backend/src/browser-gw/handler.test.ts
git commit -m "feat(browser-gw): remember when each player's game closed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 2: Snapshot gets `disconnectedAt` and `lobbyName`; the notice names the thrower

**Files:**

- Modify: `schema/game-ws-v1.json` (`SeatInfo`, `NoticeMessage`, `X01Snapshot`, `AtcSnapshot`)
- Regenerate (via `npm run gen:api`): `backend/src/schema/{game-ws.ts,game-ws-v1.deref.json,zod.ts}`, `backend/frontend/src/lib/api/{game-ws.ts,zod.ts}`
- Modify: `backend/src/session/types.ts` (`Session.lobbyName`)
- Modify: `backend/src/session/replay.ts` (`newSession`)
- Modify: `backend/src/session/engine.ts` (`Notice`, `SnapshotView`, `NO_VIEWER`, `apply`, `getSnapshot`)
- Modify: `backend/src/browser-gw/handler.ts` (`viewFor`)
- Modify (tests): `backend/src/session/engine.test.ts`, `backend/src/session/snapshot.contract.test.ts`, `backend/src/session/apply.test.ts`, `backend/src/multiplayer.test.ts`
- Modify (frontend fixtures): `backend/frontend/src/lib/__tests__/fixtures/x01-snapshot.json`, `backend/frontend/src/lib/__tests__/gameState.test.ts`

**Interfaces:**

- Consumes: `BrowserConnections.disconnectedAt(sessionId, userId): Date | null` (Task 1).
- Produces:

  ```ts
  // engine.ts
  export type Notice = { type: 'notice'; code: 'not_your_turn'; boardId: string; throwerName: string; throwerBoard: string | null }
  export type SnapshotView = {
    viewerUserId: string | null
    connectedUserIds: ReadonlySet<string>
    disconnectedAt: (userId: string) => Date | null
    isBoardOnline: (boardId: string) => boolean
  }
  // types.ts: Session gains
  lobbyName: string | null
  // replay.ts: newSession(a: { …as before…; lobbyName?: string | null }): Session
  // Generated (frontend and backend) game-ws.ts:
  interface SeatInfo { …; disconnectedAt: string | null }      // ISO date-time
  interface X01Snapshot / AtcSnapshot { …; lobbyName: string | null }
  interface NoticeMessage { type: 'notice'; code: 'not_your_turn'; boardId: string; throwerName: string; throwerBoard: string | null }
  ```

- [ ] **Step 1: Write the failing engine tests**

In `backend/src/session/engine.test.ts`:

1. Add `type SnapshotView` to the import from `./engine.js`:
   ```ts
   import { ActiveSessionError, BoardBusyError, SessionEngine, type SnapshotView } from './engine.js'
   ```
2. In `describe('routing board events')`, change the expectation in "drops darts from another board, unlogged, and tells that board's players" to:
   ```ts
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], {
      type: 'notice', code: 'not_your_turn', boardId: 'board-b', throwerName: 'Host', throwerBoard: 'board-a',
    })
   ```
3. In `describe('getSnapshot per viewer')`, give the view in "describes each seat and the viewer's own seats" the new member:
   ```ts
    const snap = engine.getSnapshot(sessionId, { viewerUserId: 'lena', connectedUserIds: new Set(['host']), disconnectedAt: () => null, isBoardOnline: b => b === 'board-a' })
   ```
4. Append a new describe at the end of the file:

```ts
describe('remote states in the snapshot', () => {
  const view = (over: Partial<SnapshotView> = {}): SnapshotView =>
    ({ viewerUserId: 'host', connectedUserIds: new Set(['host']), disconnectedAt: () => null, isBoardOnline: () => true, ...over })
  const left = new Date('2026-10-02T18:00:00.000Z')

  it('says since when a seat\'s controller has the game closed', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view({ disconnectedAt: u => u === 'lena' ? left : null }))
    expect(snap?.seats.map(s => [s.controllerConnected, s.disconnectedAt])).toEqual([[true, null], [false, '2026-10-02T18:00:00.000Z']])
  })

  it('has no time for a connected controller, even if an old one is around', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view({ disconnectedAt: () => left }))
    expect(snap?.seats[0]?.disconnectedAt).toBeNull()
    expect(snap?.seats[1]?.disconnectedAt).toBe('2026-10-02T18:00:00.000Z')
  })

  it('has no time for a controller who never opened the game', async () => {
    const { engine, sessionId } = await twoBoardGame()
    const snap = engine.getSnapshot(sessionId, view())
    expect(snap?.seats[1]).toMatchObject({ controllerConnected: false, disconnectedAt: null })
  })

  it('carries the lobby name: null outside a lobby', async () => {
    const { engine, sessionId } = await twoBoardGame()
    expect(engine.getSnapshot(sessionId)?.lobbyName).toBeNull()
    const session = engine.getSession(sessionId)!
    session.lobbyName = 'Friday darts'
    expect(engine.getSnapshot(sessionId)?.lobbyName).toBe('Friday darts')
  })

  it('names who is up in the not-your-turn notice; no board for a seat entering by hand', async () => {
    const notify = vi.fn()
    const engine = new SessionEngine(makeStore(), push, undefined, notify)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host', gameId: 'x01', config: x01Module.defaultConfig,
      seats: [seat('Host', 'host', null), seat('Lena', 'lena', 'board-b')],
    })
    await engine.onBridgeEvent('board-b', 'dart.detected', dartData(0, 'T20', 20, 3, 'Triple'))
    expect(notify).toHaveBeenCalledWith(sessionId, ['lena'], {
      type: 'notice', code: 'not_your_turn', boardId: 'board-b', throwerName: 'Host', throwerBoard: null,
    })
  })
})
```

- [ ] **Step 2: Write the failing contract and push-path tests**

In `backend/src/session/snapshot.contract.test.ts`, in "a game with a board per seat, as a seat's controller sees it", replace the `getSnapshot` call:

```ts
    const snap = e.getSnapshot(sessionId, {
      viewerUserId: 'lena', connectedUserIds: new Set(['lena']),
      disconnectedAt: u => u === 'host' ? new Date('2026-10-02T18:00:00.000Z') : null, isBoardOnline: () => true,
    })
    expect(snap?.seats[0]?.disconnectedAt).toBe('2026-10-02T18:00:00.000Z')
```

(the existing `expectValid(snap)` and zod check after it stay; they now check the date-time format and `lobbyName`).

In `backend/src/multiplayer.test.ts`:

- In the existing test, after `expect(hostWs.send.mock.calls.map(…)).not.toContain('notice')`, add:
  ```ts
    const notice = lenaWs.send.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0]))).find((m: { type: string }) => m.type === 'notice')
    expect(notice).toEqual({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Host', throwerBoard: 'Living room' })
  ```
- Append a second test inside `describe('two players, two boards')`:

```ts
  it('everyone sees since when a player has the game closed', async () => {
    const engine: SessionEngine = new SessionEngine(store, id => { pushSnapshot(id, engine) }, undefined, pushNotice)
    const { sessionId } = await engine.createWithSeats({
      ownerUserId: 'host2', gameId: 'x01', config: x01Module.defaultConfig,
      seats: [
        { name: 'Host', userId: 'host2', controllerUserId: 'host2', boardId: 'c', boardName: 'Living room' },
        { name: 'Lena', userId: 'lena2', controllerUserId: 'lena2', boardId: 'd', boardName: "Lena's place" },
      ],
    })
    const hostWs = sock(); const lenaWs = sock()
    browserConnections.add(sessionId, hostWs, 'host2')
    browserConnections.add(sessionId, lenaWs, 'lena2')
    browserConnections.remove(sessionId, lenaWs, new Date('2026-10-02T18:00:00.000Z'))
    pushSnapshot(sessionId, engine)
    expect(last(hostWs)).toMatchObject({
      lobbyName: null,
      seats: [{ controllerConnected: true, disconnectedAt: null }, { controllerConnected: false, disconnectedAt: '2026-10-02T18:00:00.000Z' }],
    })
  })
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd backend && npx vitest run src/session/engine.test.ts src/session/snapshot.contract.test.ts src/multiplayer.test.ts`
Expected: FAIL. The notice expectations lack `throwerName`/`throwerBoard`, and `disconnectedAt`/`lobbyName` are `undefined`.

- [ ] **Step 4: Extend the schema**

In `schema/game-ws-v1.json`:

`SeatInfo`: add `"disconnectedAt"` to `required` (after `"controllerConnected"`) and this property after `controllerConnected`:

```json
        "disconnectedAt": {
          "anyOf": [{ "type": "string", "format": "date-time" }, { "type": "null" }],
          "description": "Server time the controller's last socket of this game closed; null while they have it open, or if they haven't opened it since the server started."
        },
```

`NoticeMessage`: `required` becomes `["type", "code", "boardId", "throwerName", "throwerBoard"]`; add after `boardId`:

```json
        "boardId": { "type": "string" },
        "throwerName": { "type": "string", "description": "The player who is up." },
        "throwerBoard": { "type": ["string", "null"], "description": "Name of the board they throw on; null when they enter darts by hand." }
```

`X01Snapshot` and `AtcSnapshot`: add `"lobbyName"` to each `required` (after `"mySeats"`) and this property after `mySeats`:

```json
        "lobbyName": { "type": ["string", "null"], "description": "The lobby the game was started from; null for a local game." }
```

Then regenerate:

Run: `npm run gen:api` (repo root)
Expected: exit 0. `git status` shows the five generated files changed (`backend/src/schema/game-ws.ts`, `game-ws-v1.deref.json`, `zod.ts`, `backend/frontend/src/lib/api/game-ws.ts`, `zod.ts`). `SeatInfo` has `disconnectedAt: string | null`; `X01Snapshot`/`AtcSnapshot` have `lobbyName: string | null`; `NoticeMessageSchema` has `throwerName: z.string()` and `throwerBoard: z.union([z.string(), z.null()])`.

- [ ] **Step 5: Implement in the engine, session and handler**

`backend/src/session/types.ts`, in `interface Session` after `ownerUserId`:

```ts
  /** The lobby the game was started from; null for a local game (the lobbies plan sets it). */
  lobbyName: string | null
```

`backend/src/session/replay.ts`, `newSession`:

```ts
export function newSession(a: {
  id: string; ownerUserId: string; boardId: string | null; module: AnyGameModule
  config: GameConfig; seats: Seat[]; seed: number; createdAt: Date; lobbyName?: string | null
}): Session {
  const players = a.seats.map(s => ({ name: s.name }))
  const initial = a.module.init(a.config, players, seededRng(a.seed))
  return {
    id: a.id, ownerUserId: a.ownerUserId, lobbyName: a.lobbyName ?? null, boardId: a.boardId, seats: a.seats, players, module: a.module,
    committedState: initial, currentState: initial, openVisitEvents: [], openDarts: [],
    status: 'active', createdAt: a.createdAt, seed: a.seed, visitCount: 0, nextSeq: 0,
    totalDarts: Array<number>(players.length).fill(0),
    totalVisits: Array<number>(players.length).fill(0),
    boardStatus: new Map(), forfeited: [],
  }
}
```

`backend/src/session/apply.test.ts`, in the `session()` helper's object literal, add `lobbyName: null,` after `ownerUserId: 'u1',`.

`backend/src/session/engine.ts`:

```ts
export type Notice = { type: 'notice'; code: 'not_your_turn'; boardId: string; throwerName: string; throwerBoard: string | null }
export type NotifyFn = (sessionId: string, userIds: string[], notice: Notice) => void

export type ActionResult = { ok: true } | { ok: false; code: 'forbidden' }

/**
 * Who is looking: the viewer's own seats, who has the game open (and since when not),
 * which boards are online.
 */
export type SnapshotView = {
  viewerUserId: string | null
  connectedUserIds: ReadonlySet<string>
  /** When the user's last socket of the game closed; null if open or never opened. */
  disconnectedAt: (userId: string) => Date | null
  isBoardOnline: (boardId: string) => boolean
}
const NO_VIEWER: SnapshotView = { viewerUserId: null, connectedUserIds: new Set(), disconnectedAt: () => null, isBoardOnline: () => false }
```

In `apply`, replace the `notify` block:

```ts
    if (origin.boardId !== null && session.seats[currentSeat(session)].boardId !== origin.boardId) {
      if (input.source === 'board' && input.event.kind === 'dart.detected') {
        const boardId = origin.boardId
        const up = session.seats[currentSeat(session)]
        const users = [...new Set(session.seats.filter(s => s.boardId === boardId).map(s => s.controllerUserId))]
        this.notify(session.id, users, { type: 'notice', code: 'not_your_turn', boardId, throwerName: up.name, throwerBoard: up.boardName })
      }
      return false
    }
```

In `getSnapshot`, replace the `seats:` and `mySeats:` entries of `common` and add `lobbyName`:

```ts
      seats: session.seats.map((s, i) => {
        const connected = view.connectedUserIds.has(s.controllerUserId)
        return {
          controllerUserId: s.controllerUserId, userId: s.userId, boardId: s.boardId, boardName: s.boardName,
          boardOnline: s.boardId !== null && view.isBoardOnline(s.boardId),
          controllerConnected: connected,
          // Only a controller without the game open has a time; it says how long the game waits
          disconnectedAt: connected ? null : view.disconnectedAt(s.controllerUserId)?.toISOString() ?? null,
          forfeited: session.forfeited.includes(i),
        }
      }),
      mySeats: session.seats.flatMap((s, i) => s.controllerUserId === view.viewerUserId ? [i] : []),
      lobbyName: session.lobbyName,
```

`backend/src/browser-gw/handler.ts`, `viewFor`:

```ts
function viewFor(sessionId: string, userId: string): SnapshotView {
  return {
    viewerUserId: userId,
    connectedUserIds: browserConnections.connectedUsers(sessionId),
    disconnectedAt: u => browserConnections.disconnectedAt(sessionId, u),
    isBoardOnline: b => bridgeConnections.isOnline(b),
  }
}
```

(`onGone` already calls `browserConnections.remove(sessionId, socket)` and then `pushSnapshot`, so everyone gets the new time right away.)

- [ ] **Step 6: Update the frontend fixtures to the new schema**

`backend/frontend/src/lib/__tests__/fixtures/x01-snapshot.json`: add `"disconnectedAt": null,` after `"controllerConnected": true,` in both seats, and `"lobbyName": null` as the last top-level field (after `mySeats`, with a comma after the `mySeats` array).

`backend/frontend/src/lib/__tests__/gameState.test.ts`, the `base` object:

```ts
const base = {
  type: 'snapshot' as const, sessionId: 's', boardId: null, players: [{ name: 'A' }], bmStatus: null,
  status: 'active' as const, ownerUserId: 'u1', mySeats: [0], lobbyName: null,
  seats: [{ controllerUserId: 'u1', userId: null, boardId: 'b1', boardName: 'Board', boardOnline: true, controllerConnected: true, disconnectedAt: null, forfeited: false }],
}
```

- [ ] **Step 7: Run everything**

Run: `cd backend && TEST_DATABASE_URL=postgres://dartgames:dev@172.18.0.2:5432/dartcade_mp_test npm test && npm run typecheck && npm run lint`
Expected: PASS (all suites), typecheck and lint clean.

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS. `ws.test.ts` still parses the fixture; `svelte-check` reports 0 errors.

- [ ] **Step 8: Commit**

```bash
git add schema/game-ws-v1.json backend/src/schema backend/frontend/src/lib/api \
  backend/src/session/types.ts backend/src/session/replay.ts backend/src/session/engine.ts backend/src/browser-gw/handler.ts \
  backend/src/session/engine.test.ts backend/src/session/snapshot.contract.test.ts backend/src/session/apply.test.ts backend/src/multiplayer.test.ts \
  backend/frontend/src/lib/__tests__/fixtures/x01-snapshot.json backend/frontend/src/lib/__tests__/gameState.test.ts
git commit -m "feat(session): snapshot says who is gone since when, the lobby name

The not-your-turn notice names who is up and their board.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 3: Frontend receives notices; a toast store

**Files:**

- Modify: `backend/frontend/src/lib/ws.ts`
- Create: `backend/frontend/src/lib/toast.ts`
- Test: `backend/frontend/src/lib/__tests__/ws.test.ts`, `backend/frontend/src/lib/__tests__/toast.test.ts`

**Interfaces:**

- Consumes: `NoticeMessageSchema` (generated zod, Task 2), `NoticeMessage` (generated type).
- Produces:

  ```ts
  // ws.ts
  export function parseNotice(m: unknown): NoticeMessage | null
  createSessionStore(sessionId): { snapshot: Writable<Snapshot | null>; notice: Readable<NoticeMessage | null>; send; destroy }
  // toast.ts
  export type Toast<T> = { value: T; id: number }
  export type ToastStore<T> = Readable<Toast<T> | null> & { show: (value: T) => void; dismiss: () => void }
  export function createToast<T>(durationMs: number): ToastStore<T>
  ```

- [ ] **Step 1: Write the failing tests**

Append to `backend/frontend/src/lib/__tests__/ws.test.ts` (and change its import to `import { parseNotice, parseSnapshot } from '../ws.js'`):

```ts
describe('parseNotice', () => {
  const notice = { type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: "Lena's place" }

  it('parses a not-your-turn notice', () => {
    expect(parseNotice(notice)).toEqual(notice)
  })

  it('takes a thrower who enters darts by hand', () => {
    expect(parseNotice({ ...notice, throwerBoard: null })?.throwerBoard).toBeNull()
  })

  it('ignores anything else, silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    for (const m of [null, 'x', { type: 'notice' }, { ...notice, code: 'other' }, { ...notice, throwerName: undefined }, fixture]) {
      expect(parseNotice(m)).toBeNull()
    }
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
```

Create `backend/frontend/src/lib/__tests__/toast.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { createToast } from '../toast.js'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('createToast', () => {
  it('shows a value for the given time', () => {
    const t = createToast<string>(6000)
    expect(get(t)).toBeNull()
    t.show('a')
    expect(get(t)?.value).toBe('a')
    vi.advanceTimersByTime(5999)
    expect(get(t)?.value).toBe('a')
    vi.advanceTimersByTime(1)
    expect(get(t)).toBeNull()
  })

  it('a newer value replaces it and starts the time again, with a new id', () => {
    const t = createToast<string>(6000)
    t.show('a')
    const first = get(t)?.id
    vi.advanceTimersByTime(4000)
    t.show('b')
    expect(get(t)?.value).toBe('b')
    expect(get(t)?.id).not.toBe(first)
    vi.advanceTimersByTime(4000)
    expect(get(t)?.value).toBe('b')
    vi.advanceTimersByTime(2000)
    expect(get(t)).toBeNull()
  })

  it('dismiss hides it at once', () => {
    const t = createToast<string>(6000)
    t.show('a')
    t.dismiss()
    expect(get(t)).toBeNull()
    vi.advanceTimersByTime(6000)
    expect(get(t)).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/ws.test.ts src/lib/__tests__/toast.test.ts`
Expected: FAIL. `parseNotice` isn't exported, and `../toast.js` can't be resolved.

- [ ] **Step 3: Implement**

Create `backend/frontend/src/lib/toast.ts`:

```ts
import { writable, type Readable } from 'svelte/store'

/** What a toast shows; `id` changes with every show, so a repeated message restarts its animation. */
export type Toast<T> = { value: T; id: number }
export type ToastStore<T> = Readable<Toast<T> | null> & { show: (value: T) => void; dismiss: () => void }

/** A message shown for a while. A newer one replaces it and starts the time again. */
export function createToast<T>(durationMs: number): ToastStore<T> {
  const { subscribe, set } = writable<Toast<T> | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  let id = 0

  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const show = (value: T) => {
    clear()
    id += 1
    set({ value, id })
    timer = setTimeout(() => { timer = null; set(null) }, durationMs)
  }
  const dismiss = () => {
    clear()
    set(null)
  }
  return { subscribe, show, dismiss }
}
```

In `backend/frontend/src/lib/ws.ts`:

```ts
import { writable, type Readable } from 'svelte/store'
import { WsCloseCode, type ClientMessage, type NoticeMessage, type Snapshot, type UserAction } from './api/game-ws'
import { NoticeMessageSchema, SnapshotSchema } from './api/zod'
```

Add after `parseSnapshot`:

```ts
/** A transient notice from the server (a dart on your board out of turn), or null. Never warns. */
export function parseNotice(m: unknown): NoticeMessage | null {
  const r = NoticeMessageSchema.safeParse(m)
  return r.success ? r.data : null
}
```

In `createSessionStore`, add `const notice = writable<NoticeMessage | null>(null)` next to `snapshot`, replace the `onmessage` handler:

```ts
    ws.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return
        const data: unknown = JSON.parse(e.data)
        const snap = parseSnapshot(data)
        if (snap) { snapshot.set(snap); backoff = 500; return }
        // Each notice is a new object, so subscribers hear the same notice twice in a row too
        const n = parseNotice(data)
        if (n) notice.set(n)
      } catch {}
    }
```

and return it read-only:

```ts
  const noticeStore: Readable<NoticeMessage | null> = { subscribe: notice.subscribe }
  return { snapshot, notice: noticeStore, send, destroy }
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS, 0 svelte-check errors, lint clean.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/ws.ts backend/frontend/src/lib/toast.ts backend/frontend/src/lib/__tests__/ws.test.ts backend/frontend/src/lib/__tests__/toast.test.ts
git commit -m "feat(frontend): receive not-your-turn notices, a toast store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 4: `lib/remote.ts`: what the match screen shows in a remote game

**Files:**

- Create: `backend/frontend/src/lib/remote.ts`
- Test: `backend/frontend/src/lib/__tests__/remote.test.ts`

**Interfaces:**

- Consumes: `upSeat(snap)` from `./turn`; `Snapshot`, `SeatInfo`, `NoticeMessage` from `./api/game-ws` (Task 2 shapes).
- Produces (all used by Tasks 5–7):

  ```ts
  export function isRemoteGame(snap: Snapshot): boolean
  export function boardLabel(seat: SeatInfo): string | null
  export type SeatLine = { board: string | null; byHand: boolean; offline: boolean; disconnected: boolean; you: boolean }
  export function seatLines(snap: Snapshot | null): (SeatLine | null)[]
  export function rowSub(sub: string, line: SeatLine | null): string
  export type MyBoard = { name: string; online: boolean }
  export function myBoard(snap: Snapshot | null): MyBoard | null
  export type CenterState =
    | { kind: 'play' }
    | { kind: 'play-offline'; board: string }
    | { kind: 'watch'; name: string; board: string | null }
    | { kind: 'watch-offline'; name: string; board: string }
    | { kind: 'waiting'; seat: number; name: string; board: string | null; disconnectedAt: string | null; canAbort: boolean }
  export function centerState(snap: Snapshot | null, viewerUserId: string | null): CenterState
  export type TurnStatus = { text: string; name: string; tone: 'watch' | 'warn' | 'paused' }
  export function turnStatus(c: CenterState): TurnStatus | null
  export type Caption = { text: string; tone: 'live' | 'warn' | 'paused' | 'muted' }
  export function boardCaption(c: CenterState): Caption | null
  export function formatElapsed(fromIso: string, nowMs: number): string
  export type NoticeLines = { title: string; body: string; detail: string }
  export function noticeLines(n: NoticeMessage): NoticeLines
  export function startsOnKeypad(snap: Snapshot): boolean
  export function isManualTurn(snap: Snapshot | null): boolean
  ```

- [ ] **Step 1: Write the failing tests**

Create `backend/frontend/src/lib/__tests__/remote.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { SeatInfo, Snapshot } from '$lib/api/game-ws'
import {
  boardCaption, centerState, formatElapsed, isManualTurn, isRemoteGame, myBoard, noticeLines,
  rowSub, seatLines, startsOnKeypad, turnStatus,
} from '../remote.js'
import fixture from './fixtures/x01-snapshot.json'

// The fixture is a local game: owner u1 controls both seats, both on board-1 ("Board")
const local = (patch: { boardId?: string | null; boardOnline?: boolean; currentPlayer?: number } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  const seats = base.seats.map(s => ({
    ...s,
    ...(patch.boardId !== undefined && { boardId: patch.boardId, boardName: patch.boardId === null ? null : s.boardName }),
    ...(patch.boardOnline !== undefined && { boardOnline: patch.boardOnline }),
  }))
  return { ...base, boardId: patch.boardId === undefined ? base.boardId : patch.boardId, seats,
    game: { ...base.game, currentPlayer: patch.currentPlayer ?? 0 } } as Snapshot
}

// A remote game: Christoph (host) on Living room, Lena on Lena's place; the viewer controls `mySeats`
const remote = (o: { mySeats?: number[]; currentPlayer?: number; seats?: Partial<SeatInfo>[]; status?: Snapshot['status'] } = {}): Snapshot => {
  const base = structuredClone(fixture) as unknown as Snapshot
  const seat = (s: SeatInfo, over: Partial<SeatInfo>): SeatInfo => ({ ...s, ...over })
  return {
    ...base, boardId: null, ownerUserId: 'host', status: o.status ?? 'active', mySeats: o.mySeats ?? [0],
    players: [{ name: 'Christoph' }, { name: 'Lena' }],
    seats: [
      seat(base.seats[0], { controllerUserId: 'host', userId: 'host', boardId: 'board-a', boardName: 'Living room', boardOnline: true, controllerConnected: true, ...o.seats?.[0] }),
      seat(base.seats[1], { controllerUserId: 'lena', userId: 'lena', boardId: 'board-b', boardName: "Lena's place", boardOnline: true, controllerConnected: true, ...o.seats?.[1] }),
    ],
    game: { ...base.game, currentPlayer: o.currentPlayer ?? 0 },
  } as Snapshot
}

describe('isRemoteGame', () => {
  it('a local game is not remote', () => {
    expect(isRemoteGame(local())).toBe(false)
    expect(isRemoteGame(local({ boardId: null }))).toBe(false)
  })
  it('two controllers, or one controller on two inputs, is remote', () => {
    expect(isRemoteGame(remote())).toBe(true)
    const oneController = remote({ seats: [{}, { controllerUserId: 'host', boardId: null, boardName: null }] })
    expect(isRemoteGame(oneController)).toBe(true)
  })
})

describe('seatLines', () => {
  it('none in a local game', () => {
    expect(seatLines(local())).toEqual([null, null])
    expect(seatLines(null)).toEqual([])
  })
  it('each seat\'s board, and which one is yours', () => {
    expect(seatLines(remote())).toEqual([
      { board: 'Living room', byHand: false, offline: false, disconnected: false, you: true },
      { board: "Lena's place", byHand: false, offline: false, disconnected: false, you: false },
    ])
  })
  it('an offline board means entering by hand; a manual seat has no board', () => {
    const lines = seatLines(remote({ seats: [{ boardOnline: false }, { boardId: null, boardName: null, boardOnline: false }] }))
    expect(lines[0]).toMatchObject({ board: 'Living room', byHand: true, offline: true })
    expect(lines[1]).toMatchObject({ board: null, byHand: true, offline: false })
  })
  it('a controller without the game open; a board without a name', () => {
    const lines = seatLines(remote({ seats: [{ boardName: null }, { controllerConnected: false }] }))
    expect(lines[0]?.board).toBe('Board')
    expect(lines[1]?.disconnected).toBe(true)
  })
})

describe('rowSub', () => {
  it('puts the seat\'s board in front of a phone row\'s line', () => {
    expect(rowSub('Up next · can finish T17 D18', null)).toBe('Up next · can finish T17 D18')
    expect(rowSub('Up next', { board: "Lena's place", byHand: false, offline: false, disconnected: false, you: false })).toBe("Lena's place · up next")
    expect(rowSub('Avg 45.0', { board: null, byHand: true, offline: false, disconnected: false, you: false })).toBe('By hand · avg 45.0')
  })
})

describe('myBoard', () => {
  it('the viewer\'s own board in a remote game', () => {
    expect(myBoard(remote())).toEqual({ name: 'Living room', online: true })
    expect(myBoard(remote({ seats: [{ boardOnline: false }] }))).toEqual({ name: 'Living room', online: false })
  })
  it('none in a local game, for a viewer entering by hand, or without a snapshot', () => {
    expect(myBoard(local())).toBeNull()
    expect(myBoard(remote({ seats: [{ boardId: null, boardName: null, boardOnline: false }] }))).toBeNull()
    expect(myBoard(null)).toBeNull()
  })
})

describe('centerState', () => {
  it('a local game always plays, even with its board offline', () => {
    expect(centerState(local({ boardOnline: false }), 'u1')).toEqual({ kind: 'play' })
    expect(centerState(null, null)).toEqual({ kind: 'play' })
  })
  it('your turn: play; on your offline board: enter by hand', () => {
    expect(centerState(remote(), 'host')).toEqual({ kind: 'play' })
    expect(centerState(remote({ seats: [{ boardOnline: false }] }), 'host')).toEqual({ kind: 'play-offline', board: 'Living room' })
    expect(centerState(remote({ seats: [{ boardId: null, boardName: null, boardOnline: false }] }), 'host')).toEqual({ kind: 'play' })
  })
  it('someone else\'s turn: watch their board, or their darts entered by hand', () => {
    expect(centerState(remote({ currentPlayer: 1 }), 'host')).toEqual({ kind: 'watch', name: 'Lena', board: "Lena's place" })
    expect(centerState(remote({ currentPlayer: 1, seats: [{}, { boardId: null, boardName: null, boardOnline: false }] }), 'host'))
      .toEqual({ kind: 'watch', name: 'Lena', board: null })
    expect(centerState(remote({ currentPlayer: 1, seats: [{}, { boardOnline: false }] }), 'host'))
      .toEqual({ kind: 'watch-offline', name: 'Lena', board: "Lena's place" })
  })
  it('the thrower has the game closed: everyone waits, only the host may abort', () => {
    const gone = remote({ currentPlayer: 1, seats: [{}, { controllerConnected: false, disconnectedAt: '2026-10-02T18:00:00.000Z' }] })
    expect(centerState(gone, 'host')).toEqual({
      kind: 'waiting', seat: 1, name: 'Lena', board: "Lena's place", disconnectedAt: '2026-10-02T18:00:00.000Z', canAbort: true,
    })
    expect(centerState({ ...gone, mySeats: [] }, 'max')).toMatchObject({ kind: 'waiting', canAbort: false })
    expect(centerState(gone, null)).toMatchObject({ kind: 'waiting', canAbort: false })
  })
  it('waiting beats board offline', () => {
    const both = remote({ currentPlayer: 1, seats: [{}, { controllerConnected: false, boardOnline: false }] })
    expect(centerState(both, 'host')).toMatchObject({ kind: 'waiting', disconnectedAt: null })
  })
  it('a game that is over shows nothing remote', () => {
    expect(centerState(remote({ currentPlayer: 1, status: 'finished' }), 'host')).toEqual({ kind: 'play' })
  })
})

describe('turnStatus and boardCaption', () => {
  it('nothing on your own turn', () => {
    expect(turnStatus({ kind: 'play' })).toBeNull()
    expect(boardCaption({ kind: 'play-offline', board: 'Living room' })).toBeNull()
  })
  it('watching a board', () => {
    const c = { kind: 'watch', name: 'Lena', board: "Lena's place" } as const
    expect(turnStatus(c)).toEqual({ text: "Lena is throwing at Lena's place", name: 'Lena', tone: 'watch' })
    expect(boardCaption(c)).toEqual({ text: "Live from Lena's place", tone: 'live' })
  })
  it('watching someone enter darts by hand', () => {
    const c = { kind: 'watch', name: 'Lena', board: null } as const
    expect(turnStatus(c)?.text).toBe('Lena is entering darts by hand')
    expect(boardCaption(c)).toEqual({ text: 'Lena · entering by hand', tone: 'muted' })
  })
  it('their board is offline', () => {
    const c = { kind: 'watch-offline', name: 'Lena', board: "Lena's place" } as const
    expect(turnStatus(c)).toEqual({ text: "Lena's board is offline", name: 'Lena', tone: 'warn' })
    expect(boardCaption(c)).toEqual({ text: "Lena's place · offline", tone: 'warn' })
  })
  it('waiting', () => {
    const c = { kind: 'waiting', seat: 1, name: 'Lena', board: "Lena's place", disconnectedAt: null, canAbort: false } as const
    expect(turnStatus(c)).toEqual({ text: 'Paused · waiting for Lena', name: 'Lena', tone: 'paused' })
    expect(boardCaption(c)).toEqual({ text: "Lena's place · no connection", tone: 'paused' })
    expect(boardCaption({ ...c, board: null })?.text).toBe('Lena · no connection')
  })
})

describe('formatElapsed', () => {
  const from = '2026-10-02T18:00:00.000Z'
  const at = (s: number) => Date.parse(from) + s * 1000
  it('minutes and seconds, hours once past one', () => {
    expect(formatElapsed(from, at(0))).toBe('0:00')
    expect(formatElapsed(from, at(72))).toBe('1:12')
    expect(formatElapsed(from, at(3723))).toBe('1:02:03')
  })
  it('never negative or broken (clock skew, bad input)', () => {
    expect(formatElapsed(from, at(-30))).toBe('0:00')
    expect(formatElapsed('not a date', at(10))).toBe('0:00')
  })
})

describe('noticeLines', () => {
  it('names who is throwing where', () => {
    expect(noticeLines({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: "Lena's place" })).toEqual({
      title: 'Not your turn.', body: "That dart wasn't counted.", detail: "Lena is throwing at Lena's place.",
    })
    expect(noticeLines({ type: 'notice', code: 'not_your_turn', boardId: 'b', throwerName: 'Lena', throwerBoard: null }).detail)
      .toBe('Lena is entering darts by hand.')
  })
})

describe('startsOnKeypad and isManualTurn', () => {
  it('a local game: as before (the session board decides)', () => {
    expect(startsOnKeypad(local())).toBe(false)
    expect(startsOnKeypad(local({ boardId: null }))).toBe(true)
    expect(isManualTurn(local())).toBe(false)
    expect(isManualTurn(local({ boardOnline: false }))).toBe(false)
    expect(isManualTurn(local({ boardId: null }))).toBe(true)
  })
  it('a remote game: your own seats decide the start view', () => {
    expect(startsOnKeypad(remote())).toBe(false)
    expect(startsOnKeypad(remote({ seats: [{ boardId: null, boardName: null }] }))).toBe(true)
  })
  it('a remote game: the up seat without a board, or with it offline, advances by hand', () => {
    expect(isManualTurn(remote())).toBe(false)
    expect(isManualTurn(remote({ seats: [{ boardOnline: false }] }))).toBe(true)
    expect(isManualTurn(remote({ currentPlayer: 1, seats: [{}, { boardId: null, boardName: null, boardOnline: false }] }))).toBe(true)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/remote.test.ts`
Expected: FAIL. `../remote.js` can't be resolved.

- [ ] **Step 3: Implement `lib/remote.ts`**

```ts
// The match screen in a game played from several places: whose board each seat throws on,
// what the centre column shows when it isn't your turn (live, board offline, waiting for a
// disconnected player), and the texts for it. Local games are never "remote", so nothing
// here changes them.
// Design: docs/superpowers/specs/2026-10-02-online-multiplayer-design.md ("Update after the lobby designs")
import type { NoticeMessage, SeatInfo, Snapshot } from './api/game-ws'
import { upSeat } from './turn'

/** Seats with more than one controller or input (board, or by hand): a lobby game, or `@` account players. */
export function isRemoteGame(snap: Snapshot): boolean {
  return new Set(snap.seats.map(s => s.controllerUserId)).size > 1 || new Set(snap.seats.map(s => s.boardId)).size > 1
}

/** The seat's board as people call it ("Board" once its name is gone); null for a seat entering by hand. */
export function boardLabel(seat: SeatInfo): string | null {
  return seat.boardId === null ? null : seat.boardName ?? 'Board'
}

/** What a seat shows under its name in a remote game. */
export type SeatLine = { board: string | null; byHand: boolean; offline: boolean; disconnected: boolean; you: boolean }

/** One line per seat; all null in a local game (the header already names its board). */
export function seatLines(snap: Snapshot | null): (SeatLine | null)[] {
  if (!snap) return []
  if (!isRemoteGame(snap)) return snap.seats.map(() => null)
  return snap.seats.map((s, i) => {
    const offline = s.boardId !== null && !s.boardOnline
    return { board: boardLabel(s), byHand: s.boardId === null || offline, offline, disconnected: !s.controllerConnected, you: snap.mySeats.includes(i) }
  })
}

/** A phone row's line with the seat's board in front: "Lena's place · up next". */
export function rowSub(sub: string, line: SeatLine | null): string {
  if (!line) return sub
  return `${line.board ?? 'By hand'} · ${sub.charAt(0).toLowerCase()}${sub.slice(1)}`
}

export type MyBoard = { name: string; online: boolean }

/** The viewer's own board (their first seat that has one) in a remote game, for the header. */
export function myBoard(snap: Snapshot | null): MyBoard | null {
  if (!snap || !isRemoteGame(snap)) return null
  const seat = snap.seats.find((s, i) => snap.mySeats.includes(i) && s.boardId !== null)
  return seat ? { name: seat.boardName ?? 'Board', online: seat.boardOnline } : null
}

/** What the centre column shows. */
export type CenterState =
  /** Your turn, or a local game: as always. */
  | { kind: 'play' }
  /** Your turn, but your board's bridge is gone: the keypad, with a notice. */
  | { kind: 'play-offline'; board: string }
  /** Someone else is up: their board live (board null: they enter darts by hand). */
  | { kind: 'watch'; name: string; board: string | null }
  /** Someone else is up and their board is offline: they enter by hand. */
  | { kind: 'watch-offline'; name: string; board: string }
  /** The up seat's controller has the game closed: everyone waits. */
  | { kind: 'waiting'; seat: number; name: string; board: string | null; disconnectedAt: string | null; canAbort: boolean }

const PLAY: CenterState = { kind: 'play' }

export function centerState(snap: Snapshot | null, viewerUserId: string | null): CenterState {
  if (!snap || snap.status !== 'active' || !isRemoteGame(snap)) return PLAY
  const i = upSeat(snap)
  const seat = snap.seats.at(i)
  if (!seat) return PLAY
  const name = snap.players.at(i)?.name ?? ''
  const board = boardLabel(seat)
  // A manual seat has no board, so it is never "offline"
  const offlineBoard = seat.boardOnline ? null : board
  if (snap.mySeats.includes(i)) return offlineBoard === null ? PLAY : { kind: 'play-offline', board: offlineBoard }
  // Waiting beats board offline: nobody is there to enter the darts either way
  if (!seat.controllerConnected) {
    return { kind: 'waiting', seat: i, name, board, disconnectedAt: seat.disconnectedAt, canAbort: viewerUserId !== null && viewerUserId === snap.ownerUserId }
  }
  return offlineBoard === null ? { kind: 'watch', name, board } : { kind: 'watch-offline', name, board: offlineBoard }
}

/** The bar in place of Undo / Next while someone else is up. */
export type TurnStatus = { text: string; name: string; tone: 'watch' | 'warn' | 'paused' }

export function turnStatus(c: CenterState): TurnStatus | null {
  switch (c.kind) {
    case 'watch':
      return { text: c.board ? `${c.name} is throwing at ${c.board}` : `${c.name} is entering darts by hand`, name: c.name, tone: 'watch' }
    case 'watch-offline':
      return { text: `${c.name}'s board is offline`, name: c.name, tone: 'warn' }
    case 'waiting':
      return { text: `Paused · waiting for ${c.name}`, name: c.name, tone: 'paused' }
    default:
      return null
  }
}

/** The line above the board while it shows someone else's turn. */
export type Caption = { text: string; tone: 'live' | 'warn' | 'paused' | 'muted' }

export function boardCaption(c: CenterState): Caption | null {
  switch (c.kind) {
    case 'watch':
      return c.board ? { text: `Live from ${c.board}`, tone: 'live' } : { text: `${c.name} · entering by hand`, tone: 'muted' }
    case 'watch-offline':
      return { text: `${c.board} · offline`, tone: 'warn' }
    case 'waiting':
      return { text: `${c.board ?? c.name} · no connection`, tone: 'paused' }
    default:
      return null
  }
}

/** Time since `fromIso` as m:ss (h:mm:ss past an hour); 0:00 for a time ahead of this clock or a bad value. */
export function formatElapsed(fromIso: string, nowMs: number): string {
  const from = Date.parse(fromIso)
  const total = Number.isNaN(from) ? 0 : Math.max(0, Math.floor((nowMs - from) / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export type NoticeLines = { title: string; body: string; detail: string }

/** The not-your-turn toast's three lines. */
export function noticeLines(n: NoticeMessage): NoticeLines {
  return {
    title: 'Not your turn.',
    body: "That dart wasn't counted.",
    detail: n.throwerBoard ? `${n.throwerName} is throwing at ${n.throwerBoard}.` : `${n.throwerName} is entering darts by hand.`,
  }
}

/** Start on the keypad when none of your seats (all seats, if you have none) has a board. */
export function startsOnKeypad(snap: Snapshot): boolean {
  const mine = snap.seats.filter((_, i) => snap.mySeats.includes(i))
  const seats = mine.length > 0 ? mine : snap.seats
  return seats.length > 0 && seats.every(s => s.boardId === null)
}

/** The visit ends by hand ("Next player"): the up seat has no board, or (remote) its board is offline. */
export function isManualTurn(snap: Snapshot | null): boolean {
  if (!snap) return false
  const seat = snap.seats.at(upSeat(snap))
  if (!seat) return snap.boardId === null
  return seat.boardId === null || (isRemoteGame(snap) && !seat.boardOnline)
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib/remote.ts backend/frontend/src/lib/__tests__/remote.test.ts
git commit -m "feat(frontend): decide the match screen's remote states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 5: Board names on every seat, lobby name and board pill in the header

**Files:**

- Modify: `backend/frontend/src/app.css` (warn, accent-line and paused tokens; drain animation)
- Create: `backend/frontend/src/lib/components/SeatBoardLine.svelte`
- Modify: `backend/frontend/src/lib/components/PanelShell.svelte`, `X01Panel.svelte`, `AtcPanel.svelte`, `X01Row.svelte`, `AtcRow.svelte`, `PhoneX01Card.svelte`, `PhoneAtcCard.svelte`, `PhonePlayerRow.svelte`, `GameHeader.svelte`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte`

**Interfaces:**

- Consumes: `seatLines`, `rowSub`, `myBoard`, `centerState`, `SeatLine`, `MyBoard` (Task 4); `snapshot.lobbyName` (Task 2); `authClient` from `$lib/auth`.
- Produces:
  - `SeatBoardLine` props: `{ line: SeatLine; size?: 'sm' | 'md' | 'lg' }`
  - `PanelShell`, `X01Panel`, `AtcPanel`, `X01Row`, `AtcRow` gain `seat?: SeatLine | null` (default `null`: unchanged markup)
  - `PhoneX01Card`, `PhoneAtcCard`: prop `boardName: string | null` is replaced by `seat: SeatLine | null`
  - `PhonePlayerRow` gains `you?: boolean`
  - `GameHeader` gains `lobbyName?: string | null`, `paused?: boolean`, `myBoard?: MyBoard | null`
  - `GameDisplay` gains `viewerId` (state), `remote` (= `centerState(snapshot, viewerId)`) and `lines` (= `seatLines(snapshot)`), used by Tasks 6 and 7
  - Tailwind tokens: `text-warn`/`bg-warn`/`border-warn`, `bg-warn-soft`, `border-warn-line`, `bg-warn-panel`, `border-warn-panel-line`, `bg-warn-icon`, `border-accent-line`, `bg-surface-paused`, `animate-drain`

There's no unit test for markup. The logic is covered by Task 4. This task's gate is `svelte-check` + lint, plus a quick look in the browser.

- [ ] **Step 1: Tokens**

In `backend/frontend/src/app.css`, inside `@theme`, after `--color-danger-line: #4a2e2b;` add (values from the `Match-Remote-*` and `*-Toast` artboards):

```css
  /* Remote match states (board offline, not your turn, paused) */
  --color-warn:            #e6cf7a;
  --color-warn-soft:       #24210f;
  --color-warn-line:       #8a7a3a;
  --color-warn-panel:      #1d1c12;
  --color-warn-panel-line: #5a5128;
  --color-warn-icon:       #2a2714;
  --color-accent-line:     #44521f;
  --color-surface-paused:  #22251f;

  /* The not-your-turn toast's bar runs out with it (6 s, lib/toast.ts) */
  --animate-drain: drain 6s linear forwards;
  @keyframes drain {
    from { transform: scaleX(1); }
    to { transform: scaleX(0); }
  }
```

- [ ] **Step 2: `SeatBoardLine.svelte`**

```svelte
<script lang="ts">
  // Under a player's name in a remote game: the board they throw on, or that they enter darts by hand
  // (yellow while their board is offline), and whether they have the game closed.
  import { Keyboard, Target } from '@lucide/svelte'
  import type { SeatLine } from '$lib/remote'

  let { line, size = 'md' }: { line: SeatLine; size?: 'sm' | 'md' | 'lg' } = $props()

  const text = $derived(size === 'sm' ? 'text-[12px]' : size === 'md' ? 'text-[13px]' : 'text-[15px]')
  const icon = $derived(size === 'lg' ? 15 : 13)
</script>

<span class="flex items-center gap-[5px] min-w-0 whitespace-nowrap {text} {line.offline ? 'text-warn' : 'text-text-muted'}">
  {#if line.byHand}<Keyboard size={icon} strokeWidth={1.8} class="shrink-0" />{:else}<Target size={icon} strokeWidth={1.8} class="shrink-0" />{/if}
  <span class="truncate">{line.board ?? 'Entering by hand'}{#if line.board && line.byHand}<span class="text-text-dim"> · entering by hand</span>{/if}{#if line.disconnected}<span class="text-text-dim"> · connection lost</span>{/if}</span>
</span>
```

- [ ] **Step 3: Panels (duel) and rows (party)**

`PanelShell.svelte`. Add the import and prop:

```ts
  import SeatBoardLine from './SeatBoardLine.svelte'
  import type { SeatLine } from '$lib/remote'

  let { name, active, solo = false, pill, pillInRow = false, seat = null, aside, children }: {
    name: string
    active: boolean
    solo?: boolean
    pill: PillKind | null
    /** Put the pill at the end of the name row (ATC and solo) instead of under it. */
    pillInRow?: boolean
    /** Remote games: the seat's board under the name, and "· you". */
    seat?: SeatLine | null
    aside?: Snippet
    children: Snippet
  } = $props()
```

Replace the name span `<span class="text-[22px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>` with:

```svelte
    {#if seat}
      <span class="flex flex-col gap-[3px] min-w-0">
        <span class="text-[22px] leading-[1.1] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if seat.you}<span class="text-[14px] font-medium text-accent"> · you</span>{/if}</span>
        <SeatBoardLine line={seat} size="lg" />
      </span>
    {:else}
      <span class="text-[22px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
    {/if}
```

`X01Panel.svelte`: add `seat = null` to the destructuring, `seat?: SeatLine | null` to the props type (import `type { SeatLine } from '$lib/remote'`), and pass it: `<PanelShell {name} {active} {solo} {pill} {seat} pillInRow={solo}>`.

`AtcPanel.svelte`: the same, `<PanelShell {name} {active} {solo} {pill} {seat} pillInRow>`.

`X01Row.svelte` and `AtcRow.svelte`: add the prop the same way (`let { name, p, active, pill, seat = null }: { …; seat?: SeatLine | null } = $props()`, import `SeatBoardLine` and `type { SeatLine }`), and replace the name span (`<span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>`) with:

```svelte
      {#if seat}
        <span class="flex flex-col gap-[2px] min-w-0">
          <span class="text-[21px] leading-[1.1] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if seat.you}<span class="text-[13px] font-medium text-accent"> · you</span>{/if}</span>
          <SeatBoardLine line={seat} />
        </span>
      {:else}
        <span class="text-[21px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}</span>
      {/if}
```

- [ ] **Step 4: Phone card and row**

`PhoneX01Card.svelte`:

- Replace `import { Target } from '@lucide/svelte'` with `import SeatBoardLine from './SeatBoardLine.svelte'` and `import type { SeatLine } from '$lib/remote'`.
- Props: `let { name, p, pill, seat, chalkboard }: { name: string; p: X01PlayerView; pill: PillKind | null; seat: SeatLine | null; chalkboard: boolean } = $props()`.
- Replace the two lines inside the name column (the `name` span and the `{#if boardName}…{/if}` line) with:

```svelte
      <span class="text-[16px] font-semibold leading-[1.1] truncate">{name}{#if seat?.you}<span class="text-[12px] font-medium text-accent"> · you</span>{/if}</span>
      {#if seat}<SeatBoardLine line={seat} size="sm" />{/if}
```

`PhoneAtcCard.svelte`: the same three changes. Its props become `{ name: string; p: AtcPlayerView; pill: PillKind | null; seat: SeatLine | null }`.

`PhonePlayerRow.svelte`: add `you = false` to the destructuring, `/** The viewer's own seat (remote games). */ you?: boolean` to the type, and change the name span to:

```svelte
    <span class="text-[15px] font-semibold truncate {active ? 'text-text' : 'text-ink-2'}">{name}{#if you}<span class="text-[12px] font-medium text-accent"> · you</span>{/if}</span>
```

- [ ] **Step 5: `GameHeader.svelte`**

Props: add after `compact = false,`:

```ts
    lobbyName = null, paused = false, myBoard = null,
```

and to the type:

```ts
    /** The lobby the game was started from (lobby games). */
    lobbyName?: string | null
    /** The game waits for a disconnected player: PAUSED instead of LIVE. */
    paused?: boolean
    /** Remote games: the viewer's own board, and whether its bridge is connected. */
    myBoard?: MyBoard | null
```

with `import type { MyBoard } from '$lib/remote'`. Update the top comment to: `// Top bar of a live game: leave, title, meta and lobby, board/entry toggle, end, live or paused, board, settings.`

Phone header. Replace the title row:

```svelte
    <span class="flex items-center gap-[6px]">
      <h1 class="m-0 font-display font-bold text-[20px] leading-none uppercase tracking-[0.04em] whitespace-nowrap">{title}</h1>
      <span class="h-[18px] px-[6px] inline-flex items-center gap-1 rounded-full bg-live-soft text-live-text text-[10px] font-bold tracking-[0.1em]">
        <span class="w-[6px] h-[6px] rounded-full bg-live"></span>LIVE
      </span>
    </span>
```

with:

```svelte
    <span class="flex items-center gap-[6px] min-w-0">
      <h1 class="m-0 font-display font-bold text-[20px] leading-none uppercase tracking-[0.04em] whitespace-nowrap">{title}</h1>
      {#if paused}
        <span class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full bg-surface-paused text-ink-2 text-[10px] font-bold tracking-[0.1em]">
          <span class="w-[6px] h-[6px] rounded-[1px] bg-text-muted"></span>PAUSED
        </span>
      {:else if myBoard && !myBoard.online}
        <span role="status" class="h-[18px] px-[6px] shrink-0 inline-flex items-center gap-1 rounded-full border border-warn-line bg-warn-soft text-warn text-[10px] font-bold tracking-[0.04em] whitespace-nowrap">
          <span class="w-[6px] h-[6px] box-border rounded-full border-[1.5px] border-warn"></span>BOARD OFFLINE
        </span>
      {:else}
        <span class="h-[18px] px-[6px] inline-flex items-center gap-1 rounded-full bg-live-soft text-live-text text-[10px] font-bold tracking-[0.1em]">
          <span class="w-[6px] h-[6px] rounded-full bg-live"></span>LIVE
        </span>
      {/if}
      {#if lobbyName}
        <span title="Lobby game" class="h-[18px] px-[6px] min-w-0 inline-flex items-center rounded-full border border-accent-line text-accent text-[10px] font-semibold"><span class="truncate">{lobbyName}</span></span>
      {/if}
    </span>
```

Desktop header. After the meta span inside `<div class="flex items-baseline gap-3 min-w-0">` add:

```svelte
    {#if lobbyName}
      <span title="Lobby game" class="self-center shrink-0 max-w-[240px] h-7 px-[10px] inline-flex items-center rounded-full bg-surface-active border border-accent-line text-accent text-[13px] font-semibold"><span class="truncate">{lobbyName}</span></span>
    {/if}
```

Replace the LIVE pill and the `BoardStatusPanel` block:

```svelte
    <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-[0.1em]">
      <span class="w-2 h-2 rounded-full bg-live"></span>LIVE
    </span>

    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}
```

with:

```svelte
    {#if paused}
      <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-surface-paused text-ink-2 text-[13px] font-bold tracking-[0.1em]">
        <span class="w-2 h-2 rounded-[2px] bg-text-muted"></span>PAUSED
      </span>
    {:else}
      <span class="h-[30px] px-3 inline-flex items-center gap-2 rounded-full bg-live-soft text-live-text text-[13px] font-bold tracking-[0.1em]">
        <span class="w-2 h-2 rounded-full bg-live"></span>LIVE
      </span>
    {/if}

    {#if myBoard}
      {#if myBoard.online}
        <span title="Board connected" class="h-[30px] px-3 inline-flex items-center gap-[7px] rounded-full border border-line-chip text-ink-2 text-[13px] font-medium whitespace-nowrap">
          <span class="w-2 h-2 rounded-full bg-accent"></span>{myBoard.name}
        </span>
      {:else}
        <span role="status" class="h-[30px] px-3 inline-flex items-center gap-[7px] rounded-full border border-warn-line bg-warn-soft text-warn text-[13px] font-semibold whitespace-nowrap">
          <span class="w-2 h-2 box-border rounded-full border-[1.5px] border-warn"></span>{myBoard.name} · offline
        </span>
      {/if}
    {/if}

    {#if boardId !== null}
      <BoardStatusPanel {sessionId} {bmStatus} />
    {/if}
```

- [ ] **Step 6: Wire into `GameDisplay.svelte`**

Imports, after `import DartKeypad from '../lib/components/DartKeypad.svelte'`:

```ts
  import { authClient } from '$lib/auth'
  import { centerState, myBoard, rowSub, seatLines } from '$lib/remote'
```

After `let unsubSnap: (() => void) | null = null`:

```ts
  // The signed-in user: the host gets Abort while the game waits for someone
  let viewerId = $state<string | null>(null)
```

At the end of `onMount` (after the `subscribe(…)` call, still inside `onMount`):

```ts
    authClient.getSession().then(r => { viewerId = r.data?.user.id ?? null }).catch(() => undefined)
```

After `const throwerName = …`:

```ts
  // Remote games: what the centre shows when it isn't your turn, and where each seat throws
  const remote = $derived(centerState(snapshot, viewerId))
  const lines = $derived(seatLines(snapshot))
```

`GameHeader` call: add after `compact={$isPhone}`:

```svelte
      lobbyName={snapshot.lobbyName} paused={remote.kind === 'waiting'} myBoard={myBoard(snapshot)}
```

`panel` snippet: pass `seat={lines[i] ?? null}` to both `X01Panel` and `AtcPanel`.

Party rows: pass `seat={lines[i] ?? null}` to both `X01Row` and `AtcRow`.

Phone players list: inside `{#each players as player, i (i)}`, after `{@const up = i === currentPlayer}` add `{@const line = lines[i] ?? null}`. Then:

- Replace `boardName={null}` with `seat={line}` on `PhoneX01Card` and `PhoneAtcCard`.
- On both `PhonePlayerRow`s, add `you={line?.you ?? false}` and wrap the existing `sub` expression in `rowSub(…, line)`. The X01 one becomes:

```svelte
                <PhonePlayerRow active={up} name={player.name} you={line?.you ?? false} pill={up ? null : pillFor(i, true)}
                  sub={rowSub(up ? (x01Players[i]?.canFinish ? `Throwing · can finish ${x01Players[i]?.canFinish}` : 'Throwing')
                    : i === nextPlayer ? (x01Players[i]?.canFinish ? `Up next · can finish ${x01Players[i]?.canFinish}` : 'Up next') : `Avg ${x01Players[i]?.avg ?? '0.0'}`, line)}
                  valueLabel="Left" value={String(x01Players[i]?.remaining ?? '')}
                  legs={{ total: x01Players[i]?.firstTo ?? 1, won: x01Players[i]?.legsWon ?? 0 }} />
```

and the ATC one:

```svelte
                <PhonePlayerRow active={up} name={player.name} you={line?.you ?? false} pill={up ? null : pillFor(i, true)}
                  sub={rowSub(up ? `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done` : i === nextPlayer ? 'Up next' : `${atcPlayers[i]?.done ?? 0} of ${atcPlayers[i]?.total ?? 0} done`, line)}
                  valueLabel="Target" value={atcPlayers[i]?.target ?? ''} />
```

- [ ] **Step 7: Check**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS, 0 svelte-check errors, lint clean. If svelte-check flags `lines[i] ?? null` as unnecessary, keep it: array index access counts as possibly undefined for `no-unnecessary-condition`.

Quick look (dev stack running, `scripts/dev.sh`): open a local X01 game at 1440 × 900 and at 390 × 844. It must look exactly as before: no board lines under names, LIVE pill, no lobby pill.

- [ ] **Step 8: Commit**

```bash
git add backend/frontend/src/app.css backend/frontend/src/lib/components/SeatBoardLine.svelte \
  backend/frontend/src/lib/components/{PanelShell,X01Panel,AtcPanel,X01Row,AtcRow,PhoneX01Card,PhoneAtcCard,PhonePlayerRow,GameHeader}.svelte \
  backend/frontend/src/routes/GameDisplay.svelte
git commit -m "feat(frontend): board per seat, lobby name and own board in the header

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 6: The centre column's remote states (live, board offline, waiting)

**Files:**

- Create: `backend/frontend/src/lib/components/BoardCaption.svelte`
- Create: `backend/frontend/src/lib/components/TurnStatusBar.svelte`
- Create: `backend/frontend/src/lib/components/OfflineNotice.svelte`
- Create: `backend/frontend/src/lib/components/WaitingCard.svelte`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte`

**Interfaces:**

- Consumes: `remote`, `lines`, `viewerId` in `GameDisplay` (Task 5); `turnStatus`, `boardCaption`, `formatElapsed`, `startsOnKeypad`, `isManualTurn`, `TurnStatus`, `Caption` (Task 4); tokens (Task 5).
- Produces:
  - `BoardCaption` props: `{ caption: Caption; compact?: boolean }`
  - `TurnStatusBar` props: `{ status: TurnStatus; compact?: boolean }`
  - `OfflineNotice` props: `{ board: string; compact?: boolean }`
  - `WaitingCard` props: `{ name: string; disconnectedAt: string | null; canAbort: boolean; onabort: () => void; compact?: boolean }`
  - `GameDisplay`: `keypad` (derived boolean) replaces the `viewMode === 'entry'` checks in the centre and the phone list

- [ ] **Step 1: `BoardCaption.svelte`** (`Match-Remote`: "● Live from Lena's place" above the board)

```svelte
<script lang="ts">
  // The line above the board while it shows someone else's turn: live, offline, or no connection.
  import type { Caption } from '$lib/remote'

  let { caption, compact = false }: { caption: Caption; compact?: boolean } = $props()

  const DOT: Record<Caption['tone'], string> = {
    live: 'rounded-full bg-live animate-pulse motion-reduce:animate-none',
    warn: 'box-border rounded-full border-[1.5px] border-warn',
    paused: 'rounded-[2px] bg-line-strong',
    muted: 'rounded-full bg-text-muted',
  }
</script>

<span class="self-center shrink-0 flex items-center font-semibold uppercase tracking-[0.1em] whitespace-nowrap
             {compact ? 'h-[14px] gap-[6px] text-[11px]' : 'h-5 gap-2 text-[13px]'} {caption.tone === 'warn' ? 'text-warn' : 'text-text-muted'}">
  <span class="{compact ? 'w-[7px] h-[7px]' : 'w-2 h-2'} {DOT[caption.tone]}" aria-hidden="true"></span>{caption.text}
</span>
```

- [ ] **Step 2: `TurnStatusBar.svelte`** (`Match-Remote` and `Mobile-Match-Toast`: in place of Undo / Skip)

```svelte
<script lang="ts">
  // In place of Undo / Next while someone else is up: who is throwing (or why the game waits).
  // Undo and Skip stay visible but off: only that seat's controller may use them.
  import { ChevronRight, MonitorSmartphone, Pause, Undo2, WifiOff } from '@lucide/svelte'
  import type { TurnStatus } from '$lib/remote'

  let { status, compact = false }: { status: TurnStatus; compact?: boolean } = $props()
</script>

<div role="status"
  class="shrink-0 box-border flex items-center rounded-[12px] bg-surface-panel border border-line-2 {compact ? 'h-[52px] pl-[14px] pr-[2px] gap-[10px]' : 'h-14 pl-4 pr-[6px] gap-3'}">
  <span class="flex {status.tone === 'warn' ? 'text-warn' : 'text-text-muted'}" aria-hidden="true">
    {#if status.tone === 'paused'}<Pause size={18} />{:else if status.tone === 'warn'}<WifiOff size={18} />{:else}<MonitorSmartphone size={18} />{/if}
  </span>
  <span class="flex-1 min-w-0 font-semibold text-text {compact ? 'text-[14px] leading-[1.25] line-clamp-2' : 'text-[18px] truncate'}">{status.text}</span>
  {#if compact}
    <button type="button" disabled aria-label="Undo (only {status.name} can undo)"
      class="w-10 h-11 flex items-center justify-center border-0 bg-transparent text-line-strong"><Undo2 size={18} /></button>
    <button type="button" disabled aria-label="Skip to next (only {status.name} can skip)"
      class="w-10 h-11 flex items-center justify-center border-0 bg-transparent text-line-strong"><ChevronRight size={18} /></button>
  {:else}
    <button type="button" disabled title="Only {status.name} can undo {status.name}'s darts"
      class="h-11 px-3 flex items-center gap-[6px] rounded-[10px] border border-line-2 bg-transparent text-line-strong text-[14px]"><Undo2 size={16} />Undo</button>
    <button type="button" disabled title="Only {status.name} can skip"
      class="h-11 px-[10px] flex items-center gap-1 border-0 bg-transparent text-line-strong text-[14px]">Skip to next<ChevronRight size={16} /></button>
  {/if}
</div>
```

- [ ] **Step 3: `OfflineNotice.svelte`** (`Match-Remote-Manual`, `Mobile-Match-Manual`)

```svelte
<script lang="ts">
  // Your seat is up and your board's bridge is gone: enter the darts by hand until it's back.
  import { CircleOff } from '@lucide/svelte'

  let { board, compact = false }: { board: string; compact?: boolean } = $props()
</script>

<div role="status" class="shrink-0 flex items-center rounded-[12px] bg-warn-panel border border-warn-panel-line {compact ? 'gap-[10px] px-3 py-[9px]' : 'gap-3 px-4 py-3'}">
  <span class="flex text-warn" aria-hidden="true"><CircleOff size={22} strokeWidth={1.8} /></span>
  <span class="flex flex-col gap-[1px] min-w-0">
    <span class="font-semibold leading-[1.3] text-text {compact ? 'text-[14px]' : 'text-[16px]'}">Your board is offline. Enter your darts here.</span>
    <span class="text-ink-2 {compact ? 'text-[12px]' : 'text-[13px]'}">Switches back to {board} by itself when it reconnects.</span>
  </span>
</div>
```

- [ ] **Step 4: `WaitingCard.svelte`** (`Match-Remote-Waiting`)

```svelte
<script lang="ts">
  // The game waits for the seat that's up: its controller has the game closed. Everyone sees for
  // how long (from the server's disconnectedAt); only the host gets Abort.
  import { Unplug, X } from '@lucide/svelte'
  import { formatElapsed } from '$lib/remote'

  let { name, disconnectedAt, canAbort, onabort, compact = false }: {
    name: string
    /** Server time their game closed; null if they haven't opened it since the server started. */
    disconnectedAt: string | null
    canAbort: boolean
    onabort: () => void
    compact?: boolean
  } = $props()

  let now = $state(Date.now())
  $effect(() => {
    const t = setInterval(() => { now = Date.now() }, 1000)
    return () => { clearInterval(t) }
  })
  const elapsed = $derived(disconnectedAt === null ? null : formatElapsed(disconnectedAt, now))
</script>

<div class="flex-1 min-h-0 flex flex-col items-center justify-center text-center overflow-hidden {compact ? 'gap-2 p-4' : 'gap-4 p-7'}">
  <span class="shrink-0 rounded-full bg-surface-paused text-ink-2 flex items-center justify-center {compact ? 'w-12 h-12' : 'w-[72px] h-[72px]'}" aria-hidden="true">
    <Unplug size={compact ? 22 : 32} strokeWidth={1.8} />
  </span>
  <span role="status" class="font-display font-bold uppercase leading-[0.95] tracking-[0.01em] {compact ? 'text-[28px]' : 'text-[46px]'}">Waiting for {name}</span>
  <!-- Outside the status region, so screen readers aren't told every second -->
  <span class="inline-flex items-baseline gap-[10px] text-ink-2 {compact ? 'text-[14px]' : 'text-[18px]'}">
    {#if elapsed !== null}
      Disconnected<span class="font-mono font-medium text-text tabular-nums {compact ? 'text-[18px]' : 'text-[24px]'}">{elapsed}</span>
    {:else}
      Not connected yet
    {/if}
  </span>
  <p class="m-0 max-w-[300px] text-text-muted leading-[1.5] {compact ? 'text-[13px]' : 'text-[15px]'}">Their score is kept. The game carries on as soon as {name} is back.</p>
  {#if canAbort}
    <div class="mt-2 flex flex-col items-center gap-2">
      <button type="button" onclick={onabort}
        class="h-12 px-5 inline-flex items-center gap-2 rounded-[10px] border border-danger-line bg-transparent text-live-text text-[15px] font-semibold cursor-pointer">
        <X size={16} />Abort game
      </button>
      <span class="text-[13px] text-text-dim">Only you see this, as host.</span>
    </div>
  {/if}
</div>
```

- [ ] **Step 5: Script changes in `GameDisplay.svelte`**

Imports. Extend the `$lib/remote` import and add the components:

```ts
  import { boardCaption, centerState, isManualTurn, myBoard, rowSub, seatLines, startsOnKeypad, turnStatus } from '$lib/remote'
  import BoardCaption from '../lib/components/BoardCaption.svelte'
  import TurnStatusBar from '../lib/components/TurnStatusBar.svelte'
  import OfflineNotice from '../lib/components/OfflineNotice.svelte'
  import WaitingCard from '../lib/components/WaitingCard.svelte'
```

In `onMount`, replace

```ts
      // Boardless sessions start on the keypad (once)
      if (!viewModeSetByUser && snap.boardId === null) { viewMode = 'entry'; viewModeSetByUser = true }
```

with

```ts
      // Without a board of your own you start on the keypad (once)
      if (!viewModeSetByUser && startsOnKeypad(snap)) { viewMode = 'entry'; viewModeSetByUser = true }
```

Delete `const throwerName = $derived(…)` (only the old `waiting` snippet used it). After `const lines = $derived(seatLines(snapshot))` add:

```ts
  const turn = $derived(turnStatus(remote))
  const caption = $derived(boardCaption(remote))
  // The keypad: picked with Enter on your turn, or forced while your board is offline.
  // Someone else's turn always shows the board, live.
  const keypad = $derived(remote.kind === 'play-offline' || (remote.kind === 'play' && viewMode === 'entry'))
```

Replace the `upKey` line:

```ts
  // Changes when the turn passes or the view switches; the thrower's entry carries it
  const upKey = $derived(`${currentPlayer}-${keypad ? 'entry' : 'board'}`)
```

Replace the `next` line:

```ts
  const next = $derived(nextButton({ manual: isManualTurn(snapshot), dartCount: darts.length, locked, active: canThrow }))
```

- [ ] **Step 6: Snippets in `GameDisplay.svelte`**

Replace everything from `{#snippet waiting()}` up to and including the closing `{/snippet}` of `{#snippet center(variant: 'solo' | 'duel' | 'party')}` with:

```svelte
{#snippet waitingCard(compact: boolean)}
  {#if remote.kind === 'waiting'}
    <WaitingCard name={remote.name} disconnectedAt={remote.disconnectedAt} canAbort={remote.canAbort}
      onabort={() => showEndConfirm = true} {compact} />
  {/if}
{/snippet}

{#snippet phoneCenter()}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} compact />{/if}
  <!-- Phones: everything fits without scrolling; the board, keypad or waiting card takes what's left -->
  {#if remote.kind === 'waiting'}
    <div class="flex-1 min-h-[160px] flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(true)}</div>
  {:else if !keypad}
    {#if caption}<BoardCaption {caption} compact />{/if}
    <div class="flex-1 min-h-[160px] w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={canThrow && !locked ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={canThrow ? moveDart : undefined} />
      </div>
    </div>
  {/if}
  <!-- relative: the board view's correction picker opens above this row, over the board, full width -->
  <div class="relative shrink-0 grid gap-2 items-start {settings.visitSum ? 'grid-cols-[minmax(0,3fr)_minmax(0,1fr)]' : 'grid-cols-1'}">
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} showPopover={!keypad} popoverAbove />
    {#if settings.visitSum}<VisitBand {band} compact />{/if}
  </div>
  {#if keypad}
    <div class="flex-1 min-h-[220px]">
      <DartKeypad onDart={canThrow ? keypadDart : () => {}} dartCount={darts.length} {locked} replacing={correcting} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else if turn}
    <TurnStatusBar status={turn} compact />
  {:else}
    <ControlBar compact canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
      onUndo={undo} onNext={advance} />
  {/if}
{/snippet}

{#snippet center(variant: 'solo' | 'duel' | 'party')}
  {#if remote.kind === 'play-offline'}<OfflineNotice board={remote.board} />{/if}
  {#if keypad}
    <div class="flex-1 min-h-0">
      <DartKeypad onDart={canThrow ? addManualDart : () => {}} dartCount={darts.length} {locked} disabled={!canThrow}
        canUndo={canThrow && darts.length > 0} onUndo={undo}
        nextLabel={next.label} nextEnabled={next.enabled} nextProminent={next.prominent} onNext={advance} />
    </div>
  {:else if remote.kind === 'waiting' && variant === 'party'}
    <!-- Rows have no room for an overlay: the waiting card takes the board's place -->
    <div class="flex-1 min-h-0 flex rounded-[16px] bg-surface-panel border border-line-2">{@render waitingCard(false)}</div>
  {:else}
    {#if caption}<BoardCaption {caption} />{/if}
    <!-- The board takes the height the column has left (capped by its width) -->
    <div class="flex-1 min-h-0 w-full [container-type:size] flex items-center justify-center">
      <div class="aspect-square" style="width: min(100cqw, 100cqh)">
        <DartBoard {darts} dim={!isX01} target={boardTarget} nextTarget={boardNext} playerMarkers={markers}
          checkoutTargets={isActive ? checkoutTargets : []}
          onBoardClick={canThrow && !locked ? addBoardDart : undefined}
          selectedDart={correcting} onDartMove={canThrow ? moveDart : undefined} />
      </div>
    </div>
    {#if legend.length}<BoardLegend items={legend} />{/if}
  {/if}

  {#if variant === 'solo'}
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-[10px] items-start">
      <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
      {#if settings.visitSum}<VisitBand {band} compact />{/if}
    </div>
  {:else}
    {#if settings.visitSum}<VisitBand {band} />{/if}
    <DartSlots {slots} {popIndex} onCorrect={correct} bind:openDart={correcting} />
  {/if}

  {#if !keypad}
    {#if turn}
      <TurnStatusBar status={turn} />
    {:else}
      <ControlBar canUndo={canThrow && darts.length > 0} label={next.label} prominent={next.prominent} enabled={next.enabled}
        onUndo={undo} onNext={advance} />
    {/if}
  {/if}
{/snippet}
```

After the `{#snippet panel(i: number)} … {/snippet}` block add:

```svelte
{#snippet duelPanel(i: number)}
  <!-- A disconnected thrower's panel is covered by the waiting card, below the name row -->
  <div class="relative flex-1 min-w-0 min-h-0 flex">
    {@render panel(i)}
    {#if remote.kind === 'waiting' && remote.seat === i}
      <div class="absolute left-0 right-0 bottom-0 top-[104px] rounded-b-[18px] bg-surface-panel/90 flex">{@render waitingCard(false)}</div>
    {/if}
  </div>
{/snippet}
```

- [ ] **Step 7: Markup in `GameDisplay.svelte`**

`GameHeader`: change `showViewToggle={!bullOff}` to `showViewToggle={!bullOff && remote.kind === 'play'}`.

Phone players list:

- Change the wrapper's class to `class={!up && keypad ? '[@media(max-height:599px)]:hidden' : ''}`.
- Change `{#if up && viewMode === 'board'}` to `{#if up && !keypad}`.

Duel layout:

```svelte
    {:else if layout === 'duel'}
      <main class="flex-grow min-h-0 box-border px-7 py-6 flex gap-6">
        {@render duelPanel(0)}
        <div class="w-[560px] shrink-0 min-h-0 flex flex-col gap-3">{@render center('duel')}</div>
        {@render duelPanel(1)}
      </main>
```

- [ ] **Step 8: Check**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS, 0 svelte-check errors, lint clean. svelte-check must narrow `remote` inside `{#if remote.kind === …}`. It does for a `$derived` read in the template. If it doesn't, read the field through a `{@const w = remote}` inside the block.

Quick look in the browser: a local X01 game (board and Enter toggle, Undo, Next) behaves exactly as before at 1440 × 900 and 390 × 844. The full remote pass is Task 9.

- [ ] **Step 9: Commit**

```bash
git add backend/frontend/src/lib/components/{BoardCaption,TurnStatusBar,OfflineNotice,WaitingCard}.svelte backend/frontend/src/routes/GameDisplay.svelte
git commit -m "feat(frontend): live, board-offline and waiting states on the match screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 7: The not-your-turn toast

**Files:**

- Create: `backend/frontend/src/lib/components/NotTurnToast.svelte`
- Modify: `backend/frontend/src/routes/GameDisplay.svelte`

**Interfaces:**

- Consumes: `createSessionStore(…).notice` (Task 3), `createToast` (Task 3), `noticeLines`, `NoticeLines` (Task 4), `animate-drain`, `bg-warn-icon` (Task 5).
- Produces: `NotTurnToast` props: `{ lines: NoticeLines; compact?: boolean; ondismiss: () => void }`.

- [ ] **Step 1: `NotTurnToast.svelte`** (`Match-Toast`, `Mobile-Match-Toast`)

```svelte
<script lang="ts">
  // A dart landed on your board while someone else is up: it wasn't counted. Shows for 6 s
  // (lib/toast.ts); the bar along the bottom runs out with it.
  import { Ban, X } from '@lucide/svelte'
  import type { NoticeLines } from '$lib/remote'

  let { lines, compact = false, ondismiss }: { lines: NoticeLines; compact?: boolean; ondismiss: () => void } = $props()
</script>

<div role="status" aria-live="polite"
  class="fixed z-50 box-border overflow-hidden flex items-center bg-surface-inset border border-line-popover [box-shadow:0_24px_60px_rgba(0,0,0,0.6)]
         {compact ? 'top-16 left-3 right-3 gap-3 rounded-[14px] px-4 pt-[14px] pb-4'
                  : 'top-[84px] left-1/2 -translate-x-1/2 w-[min(608px,calc(100vw-32px))] gap-4 rounded-[16px] px-[22px] pt-[18px] pb-5'}">
  <span class="shrink-0 rounded-full bg-warn-icon text-warn flex items-center justify-center {compact ? 'w-11 h-11' : 'w-14 h-14'}" aria-hidden="true">
    <Ban size={compact ? 20 : 26} />
  </span>
  <span class="flex flex-col min-w-0 {compact ? 'gap-[2px]' : 'gap-1'}">
    <span class="font-display font-bold uppercase leading-none {compact ? 'text-[24px]' : 'text-[36px] tracking-[0.02em]'}">{lines.title}</span>
    <span class="font-medium text-text {compact ? 'text-[15px]' : 'text-[20px]'}">{lines.body}</span>
    <span class="text-text-muted {compact ? 'text-[12px]' : 'text-[14px]'}">{lines.detail}</span>
  </span>
  <button type="button" onclick={ondismiss} aria-label="Dismiss"
    class="ml-auto self-start -mr-2 -mt-2 w-11 h-11 shrink-0 flex items-center justify-center bg-transparent border-0 text-text-muted cursor-pointer">
    <X size={18} />
  </button>
  <span class="absolute left-0 bottom-0 w-full origin-left bg-warn animate-drain motion-reduce:hidden {compact ? 'h-[3px]' : 'h-1'}" aria-hidden="true"></span>
</div>
```

- [ ] **Step 2: Wire it into `GameDisplay.svelte`**

Imports:

```ts
  import NotTurnToast from '../lib/components/NotTurnToast.svelte'
  import { createToast } from '$lib/toast'
```

Extend the `$lib/remote` import with `noticeLines`, and change `import type { AtcGame, X01Game } from '$lib/api/game-ws'` to `import type { AtcGame, NoticeMessage, X01Game } from '$lib/api/game-ws'`.

After `let viewerId = …`:

```ts
  let unsubNotice: (() => void) | null = null
  // "Not your turn": a dart on your board while someone else is up (6 s, the newest wins)
  const toast = createToast<NoticeMessage>(6000)
```

In `onMount`, right after the `sessionStore.snapshot.subscribe(…)` call:

```ts
    unsubNotice = sessionStore.notice.subscribe(n => { if (n) toast.show(n) })
```

Replace `onDestroy`:

```ts
  onDestroy(() => { unsubSnap?.(); unsubNotice?.(); toast.dismiss(); sessionStore?.destroy() })
```

At the very end of the markup (after the `{#if showEndConfirm}…{/if}` block):

```svelte
{#if $toast}
  <!-- Keyed by the toast's id: a new notice restarts the bar -->
  {#key $toast.id}
    <NotTurnToast lines={noticeLines($toast.value)} compact={$isPhone} ondismiss={toast.dismiss} />
  {/key}
{/if}
```

- [ ] **Step 3: Check**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS, 0 svelte-check errors, lint clean. `ondismiss={toast.dismiss}` doesn't trip `unbound-method`, because `dismiss` is a function-typed property of `ToastStore`, not a method.

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/lib/components/NotTurnToast.svelte backend/frontend/src/routes/GameDisplay.svelte
git commit -m "feat(frontend): not-your-turn toast names who is throwing where

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 8: Spec and agent notes as built

**Files:**

- Modify: `docs/superpowers/specs/2026-10-02-online-multiplayer-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the spec**

In "Snapshots":

- Under **Per seat**, after `controllerConnected` add:
  ```
  - `disconnectedAt`: server time the controller's last socket of the game closed; null while
    they have it open, or if they haven't opened it since the server started
  ```
- Under **Top level**, after `ownerUserId` add:
  ```
  - `lobbyName` (null for a local game; set by the lobbies plan)
  ```
- Under **New server messages**, change the `notice` bullet to:
  ```
  - `notice` (`not_your_turn`, with `throwerName` and `throwerBoard`, the up seat's board
    name or null when they enter by hand; `board_offline` comes with lobbies and the
    frontend, plans 2/3)
  ```

At the end of "Update after the lobby designs", add a subsection:

```markdown
### Match remote states, as built

- A game is **remote** when its seats have more than one controller or more than one board.
  Seat board lines, "Live from", the offline fallback and the header board pill apply only
  there; local games look as before.
- Waiting: `disconnectedAt` is null when the controller never opened the game since the
  server started; the card then says "Not connected yet". Waiting beats board offline.
- The timer counts from `disconnectedAt` with the browser clock, clamped at 0:00.
- Abort in the waiting card uses the existing end-game confirm (`DELETE /api/sessions/:id`)
  until plan 4's dialogs.
- Copy is gender-neutral: "Their score is kept. The game carries on as soon as Lena is back."
- Not your turn: the centre always shows the board; the toast lasts 6 s, the newest replaces
  it, and it can be dismissed.
- Placement of the waiting card: over the seat's panel in the duel layout, in the board's
  place in the party layout and on phones.
- The match starts on the keypad when none of the viewer's seats has a board; the Next
  button is "manual" when the up seat has no board or (remote) its board is offline.
```

- [ ] **Step 2: Update `AGENTS.md`**

Add to the "Where to look" table, after the "Per-game UI" row:

```
| Match screen in remote games (seat boards, live/offline/waiting centre, not-your-turn toast) | `backend/frontend/src/lib/remote.ts`, `lib/toast.ts`; components `SeatBoardLine`, `BoardCaption`, `TurnStatusBar`, `OfflineNotice`, `WaitingCard`, `NotTurnToast` |
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-10-02-online-multiplayer-design.md AGENTS.md
git commit -m "docs: match remote states as built

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017DTbMKdwEpojREDdyywo96"
```

---

### Task 9: Visual pass with two accounts, desktop and phone (controller)

This task is done by the controller, not an implementer subagent.

**Setup:**

- Full dev stack: `scripts/dev.sh` (Postgres, backend on :3000, Vite on :5173, bridge).
- Two accounts in two browser profiles (or one normal and one private window):
  - **A** owns the paired board ("Living room").
  - **B** is a second account without a board.
- A starts X01 from Play with "@B" as the second player (commit 8d28882). This makes a remote game: A on Living room, B entering by hand. Bull off off.
- For the lobby pill only: temporarily change `lobbyName: a.lobbyName ?? null` to `?? 'Friday darts'` in `backend/src/session/replay.ts` and restart the backend. **Revert it before anything is committed.**

- [ ] **Step 1: Desktop (1440 × 900), A's window**
  - **Header** (`Match-Remote`): "X01 · meta · [Friday darts]", LIVE, the "● Living room" pill, settings.
  - **Panels:**
    - A's panel: "Christoph · you" and "Living room".
    - B's panel: "Entering by hand".
  - **A's turn:** the board and Undo/Next as usual. Board darts count.
  - **B's turn** (in A's window):
    - caption "B · entering by hand"
    - read-only board, B's darts appearing as B enters them
    - "B is entering darts by hand" with Undo and Skip greyed out, and their tooltips
    - no Board/Enter toggle
- [ ] **Step 2: Desktop, B's window**
  - B starts on the keypad.
  - On A's turn B sees "● Live from Living room" (pulsing dot) above the board, and "Christoph is throwing at Living room".
- [ ] **Step 3: Waiting** (`Match-Remote-Waiting`). On B's turn, close B's tab. In A's window:
  - header PAUSED
  - the caption above the board is "B · no connection" (B has no board)
  - B's panel covered below the name row by "Waiting for B", "Disconnected 0:01…" ticking each second, the Their-score copy, and "Abort game" with "Only you see this, as host."
  - B's panel line says "· connection lost"
  - Reopen B's game: the card goes away and play carries on.
  - Abort opens "End this game?". Cancel it.
- [ ] **Step 4: Board offline** (`Match-Remote-Manual`). On A's turn, stop the bridge (`docker compose -f docker-compose.dev.yaml stop bridge`).
  - **A's window:**
    - the yellow "Living room · offline" pill
    - the notice "Your board is offline. Enter your darts here." with "Switches back to Living room by itself when it reconnects."
    - the keypad, even with Board selected
    - A's line yellow "Living room · entering by hand"
    - entering darts works, and "Next player" is prominent
  - **B's window:** "Christoph's board is offline" in the status bar, and the caption "Living room · offline".
  - Start the bridge again: both screens go back to the live board.
- [ ] **Step 5: Not your turn** (`Match-Toast`). On B's turn, throw (or replay) a dart on A's board.
  - A's window shows the toast "NOT YOUR TURN." / "That dart wasn't counted." / "B is entering darts by hand." with a draining bar, gone after 6 s.
  - A second dart restarts it.
  - Dismiss closes it.
  - B's window shows no toast, and the dart doesn't count.
- [ ] **Step 6: Phone (390 × 844)**, both windows (`Mobile-Match`, `Mobile-Match-Manual`, `Mobile-Match-Toast`), repeating steps 1–5:
  - **Header:** the LIVE, PAUSED and BOARD OFFLINE badge and the lobby pill fit, truncating the lobby name.
  - **Rows:** "Living room · up next …" and "By hand · …".
  - **The thrower's card:** its board line.
  - **Watching:** the "Live from" caption with the board, slots, and the compact status bar with icon-only, disabled Undo and Skip.
  - **Waiting:** the card replaces the board.
  - **Offline:** the notice, keypad and slots fit without scrolling.
  - **Toast:** below the header, full width.
- [ ] **Step 7: Party layout.** Start a 3-player game (A, "@B", and a guest name). Check the rows' board lines, and that on B's turn with B's tab closed the waiting card takes the board's place in the side column.
- [ ] **Step 8: Local games unchanged.** A local 2-player X01 game and a boardless ATC game at both sizes look and behave exactly as on `main`. Check:
  - no board lines, no lobby pill, LIVE
  - the `BoardStatusPanel` button
  - the boardless game starts on the keypad
  - stopping the bridge changes nothing but the board status dot

  Compare with a `main` checkout if in doubt.

- [ ] **Step 9:** Revert the temporary `lobbyName` default (`git diff backend/src/session/replay.ts` shows nothing). Send anything found back to the task that owns it, as a fix round.

---

## Self-review

**Spec coverage** (work-split item 1 and "Update after the lobby designs"):

| Requirement                                                                                                                       | Where                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Per-seat `disconnectedAt` from server time of the last socket close                                                               | Task 1 (tracking), Task 2 (snapshot, schema)             |
| `lobbyName` (null until lobbies), `Session.lobbyName` default null                                                                | Task 2                                                   |
| Notice with `throwerName`, `throwerBoard`, to the controllers on the dart's board                                                 | Task 2 (engine already routes to those controllers)      |
| Each seat's board name on rows, cards and panels                                                                                  | Tasks 4 (`seatLines`, `rowSub`), 5                       |
| Lobby name in the header                                                                                                          | Task 5                                                   |
| "Live from <board>" panel                                                                                                         | Tasks 4 (`centerState`, `boardCaption`, `turnStatus`), 6 |
| Waiting "Waiting for X · disconnected m:ss" for everyone, Abort only for the host                                                 | Tasks 4, 6 (`WaitingCard`, `centerState.canAbort`)       |
| Manual entry when the up seat's board is offline (keypad + notice for its controller, "<name>'s board is offline" for the others) | Tasks 4, 6                                               |
| Not-your-turn toast                                                                                                               | Tasks 3, 4 (`noticeLines`), 7                            |
| Desktop and phone                                                                                                                 | Tasks 5–7 markup for both, Task 9                        |

Lobbies, `lobby_id` and the leave and end-of-game dialogs are out of scope (plans 2–4).

**Placeholder scan:** every code step has full code. The only "temporary" change is Task 9's lobby-name default for the visual check, which is reverted in Step 9 by design.

**Type consistency:**

- `SnapshotView.disconnectedAt` is used in Task 2's tests, engine and handler.
- `CenterState` kinds (`play`, `play-offline`, `watch`, `watch-offline`, `waiting` with `seat`) are the same in Tasks 4, 5 and 6.
- `SeatLine` and `MyBoard` are the same in Tasks 4 and 5.
- `TurnStatus` and `Caption` are the same in Tasks 4 and 6.
- `NoticeLines` is the same in Tasks 4 and 7.
- `ToastStore.show` and `dismiss` are the same in Tasks 3 and 7.
- `createSessionStore().notice` is the same in Tasks 3 and 7.
- The phone cards' `boardName` prop is replaced by `seat` in Task 5, and the one call site is updated in the same task.

**Review Focus:** each of the five items has its test:

1. Task 1, "a user with another socket still open is not disconnected"
2. Task 1, "opening the game again clears it", and Task 2, "has no time for a connected controller"
3. Task 4, `formatElapsed` "never negative or broken"
4. Task 4, `centerState`, `seatLines`, `startsOnKeypad` and `isManualTurn` on the local fixture
5. Task 4, "waiting beats board offline"
