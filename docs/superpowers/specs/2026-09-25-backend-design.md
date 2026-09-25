# Dartcade Backend v1 — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A Node/TS backend that accepts `adbridge/v1` events from the bridge, runs a session engine over a Postgres event log, and serves a Svelte 5 SPA where players can create and play an Around the Clock game end-to-end.

**Architecture:** Single Node process — Fastify handles HTTP and both WebSocket endpoints (`/bridge` for bridges, `/ws` for browsers). The Svelte SPA is compiled to static files and served by the same process. A session engine holds active game state in memory and rebuilds from Postgres on startup. Game logic lives in pure, stateless modules; adding a new game is one new file registered in a central map.

**Tech Stack:** Node 22 LTS, TypeScript 5 (strict), Fastify v4, `@fastify/websocket`, Kysely + `pg`, Svelte 5 + Vite + Flowbite Svelte v2 + Tailwind v4, ULID (`ulid` npm), `json-schema-to-typescript` for TS types from `schema/adbridge-v1.json`.

**Spec:** `docs/superpowers/specs/2026-09-25-backend-design.md`

---

## Global Constraints

- Node 22 LTS; TypeScript 5 strict mode throughout.
- Fastify v4 with `@fastify/websocket` plugin (wraps `ws`).
- Kysely with `pg` driver; plain `.sql` migration files in `backend/src/db/migrations/`; migrations run on process startup.
- Svelte 5 with Vite; Flowbite Svelte v2; Tailwind CSS v4.
- `svelte-spa-router` for two-page client-side routing (no SvelteKit).
- Session IDs are ULIDs (via `ulid` npm package).
- TS event types are generated from `schema/adbridge-v1.json` via `json-schema-to-typescript` into `schema/types.ts`; never hand-edited.
- All game module reducers are pure functions — no I/O, no side effects, no `Date.now()`.
- `BRIDGE_SECRET` and `DATABASE_URL` are the only required environment variables.

## Review Focus

1. **Bridge replay deduplication on reconnect** — the bridge replays all unacked events on reconnect; `(bridge_id, boot_id, seq)` UNIQUE constraint plus `ON CONFLICT DO NOTHING` must silently swallow duplicates without double-scoring.
2. **`dart.corrected` refold** — refolding `openVisitEvents` from `committedState` with the corrected dart substituted must produce identical state to if the correct dart had been thrown originally; the game reducer must never be called with a `dart.corrected` event directly.
3. **Session rebuild on startup** — replaying `bridge_events` from Postgres through the game reducer must yield exactly the same state as the live in-memory fold; non-determinism in reducers breaks this.
4. **Concurrent browser WS clients** — a `user_action` from any one client must trigger a snapshot push to all connected clients for the same session, including the sender.
5. **`throwAgainOnAllHit` at win condition** — if a player wins their target during the extra throw, the session must end immediately; it must not grant a further extra throw.

---

## 1. Repository structure

```
dartcade/
  bridge/                    # Go module (existing)
  schema/
    adbridge-v1.json         # existing JSON Schema
    types.ts                 # generated — never hand-edit; run `npm run gen:types`
  backend/
    src/
      bridge-gw/
        handler.ts           # Fastify WS route /bridge, auth, hello, dispatch
        connections.ts       # active bridge connections keyed by board_id
      session/
        engine.ts            # SessionEngine: create, get, dispatch events + actions
        types.ts             # GameModule<S,Cfg>, Session, Player, Effect, UserAction
        refold.ts            # refoldVisit(module, committedState, events[]) → S
      games/
        index.ts             # games registry: Record<string, GameModule<unknown,unknown>>
        atc.ts               # ATCModule with ATCState + ATCConfig
      db/
        migrations/          # 001_init.sql, 002_*.sql …
        schema.ts            # Kysely Database interface (column types)
        queries.ts           # typed query helper functions
      browser-gw/
        handler.ts           # Fastify WS route /ws?sessionId=, snapshot push
        connections.ts       # active browser connections keyed by session_id
      api/
        sessions.ts          # POST /api/sessions, GET /api/sessions, GET /api/sessions/:id
      index.ts               # Fastify app wiring, startup (migrate → rebuild → listen)
    frontend/
      src/
        App.svelte            # top-level router (svelte-spa-router)
        routes/
          CreateSession.svelte  # /  — player names, game config, Start
          GameDisplay.svelte    # /session/:id — live game state, correction UI
        lib/
          components/
            DartBoard.svelte    # SVG dartboard with dart markers
            PlayerList.svelte   # per-player targets and score
            GameConfigForm.svelte  # renders config fields for the chosen game
            CorrectionPanel.svelte # segment picker + undo button
          ws.ts               # reactive WS store (connects, receives snapshots)
      vite.config.ts
      tailwind.config.ts
      package.json
    Dockerfile
    docker-compose.yaml
    package.json
    tsconfig.json
```

---

## 2. Database schema

Migration `001_init.sql`:

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,            -- ULID
  board_id    TEXT NOT NULL,
  game_id     TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  players     JSONB NOT NULL,              -- [{name: string}]
  status      TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'finished'
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bridge_events (
  id          BIGSERIAL PRIMARY KEY,
  bridge_id   TEXT NOT NULL,
  boot_id     TEXT NOT NULL,
  seq         BIGINT NOT NULL,
  board_id    TEXT NOT NULL,
  recv_wall   TIMESTAMPTZ NOT NULL,
  kind        TEXT NOT NULL,
  data        JSONB NOT NULL,
  inserted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (bridge_id, boot_id, seq)
);

CREATE INDEX bridge_events_board_time ON bridge_events (board_id, inserted_at);
```

Kysely's `Database` interface mirrors these tables exactly. Queries are in `db/queries.ts`; nothing outside that file touches Kysely directly.

---

## 3. Bridge gateway (`bridge-gw/`)

### Auth

The bridge connects to `wss://<host>/bridge?secret=<BRIDGE_SECRET>`. On upgrade, the handler reads the `secret` query parameter and compares it to `process.env.BRIDGE_SECRET` using a constant-time comparison. Wrong or missing secret → close with 4401.

### Connection lifecycle

1. **`bridge.hello`** — first message after auth. Records `{ bridge_id, boot_id, board_id, bm_version }` for this connection. If another connection for the same `board_id` is already open, close it first.
2. **Envelopes** — for each subsequent message:
   - Parse as `Envelope` (validate `v === 1` and known `kind`; unknown kinds are stored but not dispatched to the session engine).
   - Insert into `bridge_events` with `ON CONFLICT (bridge_id, boot_id, seq) DO NOTHING`. If `rowCount === 0` the event is a duplicate — skip dispatch, still ack.
   - Dispatch to `SessionEngine.onBridgeEvent(boardId, kind, data, recvWall)`.
   - Reply `{ ack: env.seq }`.
3. **Commands** — the session engine calls `connection.send({ command_id, name })` when a `board.reset` effect fires. The bridge-gw holds a reference to the active WS connection for each `board_id` in `connections.ts`.
4. **Disconnect** — remove from `connections.ts`; the session stays active (bridge will reconnect).

---

## 4. Session engine (`session/`)

### Types (`session/types.ts`)

```ts
interface GameModule<S, Cfg = Record<string, never>> {
  id: string
  defaultConfig: Cfg
  init(cfg: Cfg, players: Player[]): S
  onBoardEvent(s: S, e: BoardEvent): { state: S; effects?: Effect[] }
  onUserAction(s: S, a: UserAction): { state: S; effects?: Effect[] }
  view(s: S, players: Player[]): PublicState
}

type Effect = { type: 'board.reset' }

type UserAction =
  | { type: 'correct_dart'; visitIndex: number; segment: Segment }
  | { type: 'undo_dart' }

type BoardEvent =
  | { kind: 'visit.opened';    data: VisitOpenedData }
  | { kind: 'dart.detected';   data: DartDetectedData }
  | { kind: 'dart.corrected';  data: DartCorrectedData }
  | { kind: 'takeout.finished'; data: TakeoutFinishedData }
  | { kind: 'visit.cleared';   data: VisitClearedData }
  | { kind: 'board.resync';    data: BoardResyncData }
  | { kind: 'board.status';    data: BoardStatusData }
// (generated types from schema/types.ts)

interface Session<S = unknown> {
  id: string
  boardId: string
  players: Player[]
  module: GameModule<S, unknown>
  committedState: S      // state after last completed visit
  openVisitEvents: BoardEvent[]
  currentState: S        // fold(committedState, openVisitEvents)
  status: 'active' | 'finished'
}
```

### Refold (`session/refold.ts`)

```ts
function refoldVisit<S>(
  module: GameModule<S, unknown>,
  committedState: S,
  events: BoardEvent[],
): S {
  return events.reduce(
    (s, e) => module.onBoardEvent(s, e).state,
    committedState,
  )
}
```

Used whenever `openVisitEvents` changes (dart.corrected, user correction, undo).

### Engine (`session/engine.ts`)

**`create(boardId, gameId, config, players)`**

- Validate `gameId` exists in the games registry.
- Reject if another `active` session already exists for `boardId`.
- Persist to `sessions` table.
- Add to in-memory map.
- Return `{ sessionId }`.

**`onBridgeEvent(boardId, kind, data, recvWall)`**

- Look up the active session for `boardId`; no-op if none.
- Dispatch based on `kind`:
  - `visit.opened` → push to `openVisitEvents`, refold.
  - `dart.detected` → push to `openVisitEvents`, refold. If refold produces effects, execute them.
  - `dart.corrected` → **replace** the dart at the matching index in `openVisitEvents`, refold.
  - `takeout.finished` / `visit.cleared` → flush: `committedState = currentState`, `openVisitEvents = []`. If `kind === 'takeout.finished'` and the game signals it's finished (via `view`), set `session.status = 'finished'`, persist.
  - `board.resync` → clear `openVisitEvents = []` (current in-progress visit is lost — safe and honest); do NOT touch `committedState` (scored visits are preserved). Feed the `board.resync` event to `module.onBoardEvent(committedState, e)` so the module can clear its `currentVisitDarts` view. `currentState = committedState` after this.
  - `board.status`, `bm.link`, `motion`, `bm.frame` → update board presence info only; no reducer call.
- After any state change, call `BrowserGateway.pushSnapshot(sessionId)`.

**`onUserAction(sessionId, action)`**

- `correct_dart` → find the `dart.detected` event at `visitIndex` in `openVisitEvents`, replace its segment, refold.
- `undo_dart` → pop the last `dart.detected` (and its `visit.opened` if it was the first) from `openVisitEvents`, refold.
- After refold, push snapshot.

**Startup rebuild**

On process start, before accepting connections:
1. Load all `active` sessions from Postgres.
2. For each session, fetch its `bridge_events` ordered by `inserted_at` where `board_id = session.board_id AND inserted_at >= session.created_at`.
3. Replay through `onBridgeEvent` to rebuild in-memory state.

---

## 5. Games registry (`games/index.ts`)

```ts
import { atcModule } from './atc.js'

export const games: Record<string, GameModule<unknown, unknown>> = {
  atc: atcModule,
}
```

Adding a new game: create `src/games/<name>.ts`, implement `GameModule<S, Cfg>`, add one line to `games/index.ts`.

---

## 6. ATC game module (`games/atc.ts`)

### Config

```ts
type ATCConfig = {
  throwAgainOnAllHit: boolean
  // If true: if every dart in a visit hit the player's current (or advancing) target,
  // currentPlayer does not advance after takeout.finished.

  finishOn: 'twenty' | 'single_bull' | 'bull'
  // 'twenty'      → hit 20 to win
  // 'single_bull' → must hit 25 or 50 after 20
  // 'bull'        → must hit 50 after 20

  multiplierAdvances: boolean
  // If true: hitting a double on target N advances by 2, triple by 3.
  // The bull checkpoint (when finishOn !== 'twenty') can never be skipped;
  // advancement caps at 20 if bull is still required.
}

const defaultConfig: ATCConfig = {
  throwAgainOnAllHit: false,
  finishOn: 'twenty',
  multiplierAdvances: false,
}
```

### State

```ts
type ATCState = {
  targets: number[]         // one per player; 21 = done (won)
  currentPlayer: number
  allHitThisVisit: boolean  // tracks throwAgainOnAllHit; resets on visit.opened
  winner: number | null
}
```

### Target sequence

The sequence of required targets for a player is `[1, 2, …, 20, …finish]`.

- `finishOn: 'twenty'` → sequence ends at 20; winning target = 20.
- `finishOn: 'single_bull'` → after 20: need 25 (any bull, score 25 or 50). Represented as target = 21.
- `finishOn: 'bull'` → after 20: need 50. Represented as target = 22.

Internal helper `advance(target, dart, cfg) → number`: given the current target and a thrown dart, returns the new target. With `multiplierAdvances`, hitting the current target advances by `dart.segment.multiplier`, capped at `finishTarget(cfg)`. Single/double bull are both accepted for `single_bull`; only double bull for `bull`.

### `onBoardEvent`

- `visit.opened` → reset `allHitThisVisit = true`.
- `dart.detected` → if `e.data.index` belongs to `currentPlayer`'s turn (session engine guarantees ordering), call `advance`. If dart does not hit the current target, set `allHitThisVisit = false`. If `targets[currentPlayer] > finishTarget(cfg)`, set `winner = currentPlayer`.
- `board.resync` → no state change (session engine already reset state).
- `takeout.finished` → if `winner !== null`, emit no effects (session ends). Otherwise: if `throwAgainOnAllHit && allHitThisVisit` do not advance `currentPlayer`; else advance to `(currentPlayer + 1) % players.length`. Reset `allHitThisVisit = false`.
- `visit.cleared` → advance `currentPlayer` (wasted visit), no scoring change.

### `onUserAction`

`correct_dart` and `undo_dart` are structural corrections handled entirely by the session engine (it mutates `openVisitEvents` and refeeds through `onBoardEvent`). The engine does **not** call `module.onUserAction` for these. `module.onUserAction` is reserved for game-specific actions (e.g. "skip this number", "end visit early") that future games may need. For ATC v1 it is a no-op that returns `{ state }` unchanged.

### `view`

```ts
type ATCPublicState = {
  targets: number[]        // one per player
  currentPlayer: number
  winner: number | null
  currentVisitDarts: Dart[]
}
```

---

## 7. Browser WS gateway (`browser-gw/`)

Browsers connect to `/ws?sessionId=<id>`.

- On connect: look up session, send full snapshot immediately:
  ```ts
  { type: 'snapshot', sessionId, players, game: module.view(state, players) }
  ```
- On incoming message `{ type: 'user_action', action: UserAction }`: call `engine.onUserAction(sessionId, action)` (which pushes a new snapshot to all clients).
- On state change (called by engine): push snapshot to all connections for this `sessionId`.
- On disconnect: remove from `connections.ts`.

`connections.ts` maps `sessionId → Set<WebSocket>`.

---

## 8. HTTP API (`api/sessions.ts`)

```
POST /api/sessions
  Body: { boardId: string, gameId: string, config: unknown, players: { name: string }[] }
  → 201 { sessionId }
  Errors: 400 if gameId unknown, 409 if board already has an active session

GET /api/sessions
  → 200 { sessions: [{ id, boardId, gameId, status, players, createdAt }] }

GET /api/sessions/:id
  → 200 full session record with current view state

DELETE /api/sessions/:id
  → 204; sets status='finished' in Postgres, removes from in-memory map

GET /api/games
  → 200 { games: [{ id, defaultConfig }] }
  Used by the frontend to populate the game picker and config form defaults.

GET /health
  → 200 { ok: true }
```

---

## 9. Frontend (`frontend/`)

### Stack

Svelte 5 SPA built with Vite. `svelte-spa-router` for two routes. Flowbite Svelte v2 + Tailwind v4 for utility components. No SSR.

Vite dev proxy: `/api` and `/ws` requests in dev mode proxy to `localhost:3000` so `npm run dev` works against a locally running backend.

### Routes

**`/` — `CreateSession.svelte`**

- Select game (ATC for now; rendered from the `games` registry exposed via `GET /api/games`).
- Enter player names (add/remove rows).
- `GameConfigForm.svelte` renders config fields for the selected game. For ATC: three labelled toggles matching `ATCConfig`. Config fields are hardcoded per game in the component (not dynamic schema rendering).
- Submit → `POST /api/sessions` → navigate to `/session/:id`.

**`/session/:id` — `GameDisplay.svelte`**

- On mount: connect to `/ws?sessionId=<id>` via the `ws.ts` reactive store. Receive snapshots; store as reactive `$state`.
- `PlayerList.svelte`: shows each player, their current target, highlights whose turn it is. Winner banner when `game.winner !== null`.
- `DartBoard.svelte`: SVG dartboard (adapted from `spike/visualiser/board.html`) with markers for `game.currentVisitDarts`. Bull-centred coordinate system matches the bridge output directly.
- `CorrectionPanel.svelte`: visible while a visit is in progress. "Undo last dart" button sends `{ type: 'user_action', action: { type: 'undo_dart' } }` over WS. Segment picker (number + bed selector) sends `correct_dart`.

### `lib/ws.ts`

```ts
// Returns a Svelte 5 reactive store that:
// - Opens a WS to /ws?sessionId=<id>
// - Exposes current snapshot as $snapshot
// - Exposes send(action) to send user actions
// - Reconnects with exponential backoff on disconnect
export function createSessionStore(sessionId: string)
```

---

## 10. Deployment

`backend/Dockerfile` is a multi-stage build:
1. **Stage `frontend-build`**: `node:22-alpine`, install deps, `vite build` → `frontend/dist/`.
2. **Stage `backend-build`**: same base, install deps, `tsc`.
3. **Stage `runtime`**: copy `dist/` (backend JS), `frontend/dist/` (static files), `node_modules` (prod only). `CMD ["node", "dist/index.js"]`.

`backend/docker-compose.yaml`:
```yaml
services:
  backend:
    build: .
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://dartgames:${POSTGRES_PASSWORD}@postgres:5432/dartgames
      BRIDGE_SECRET: ${BRIDGE_SECRET}
    depends_on: [postgres]
  postgres:
    image: postgres:16-alpine
    volumes: [pg_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: dartgames
      POSTGRES_USER: dartgames
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
volumes:
  pg_data:
```

The bridge connects to the backend via `--backend-url wss://<host>/bridge?secret=<BRIDGE_SECRET>`.
