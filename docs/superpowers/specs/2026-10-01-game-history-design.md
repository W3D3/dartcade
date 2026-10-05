# Game history: design

Date: 2026-10-01
Follow-up: [#41 Multiplayer: invite other accounts into a game](https://github.com/W3D3/dartcade/issues/41)

## Goal

Games that end with a result are kept and shown on a History page. Aborted games are
kept too, but never shown. The backend keeps the most detailed record it can: every
input the engine applied, in order. Any stat or view can be derived from that record
later; nothing is locked into aggregates.

The data model allows a game's seats to belong to different user accounts. In this
feature only the creator's seat is linked to an account; filling other seats with
accounts is #41.

## Scope

In:

- Persisting every game's inputs (the session input log), normalized darts, and the
  per-seat result.
- `finished` vs `aborted` status.
- Restoring running games from the input log after a restart (this also covers manual
  darts and boardless games, which can't be restored today).
- API: `GET /api/gamemodes` (moved from `/api/games`), `GET /api/games`,
  `GET /api/games/stats`, `GET /api/games/:id` (detail per game mode).
- A `visibility` column (`private | public`, always `private` for now) and the read rule
  that honours it.
- The History page (list, mode filter, stat tiles), following the design canvas
  (`project/History.dc.html`, `Tablet-History`, `Mobile-History`).

Out (later specs):

- The X01/ATC Details pages (`project/X01-Details*.dc.html`, `ATC-Details*`). The
  backend endpoint they need ships here.
- Changing visibility (no endpoint, no UI), listing public games, tournaments.
- Linking other accounts to seats, invites, consent (#41).
- Recomputing stored stats of old games by replay (the log keeps it possible).
- Exposing the raw input log over the API.

## Data model

Migration `006_game_history.sql`.

### `game_sessions` (changed)

- `status`: `active | finished | aborted`. `finished` means the game has a winner;
  `aborted` means it was ended with `DELETE /api/sessions/:id` (or by the migration, see
  below).
- `finished_at TIMESTAMPTZ NULL`: set on finish and on abort.
- `game_version INT NOT NULL DEFAULT 1`: the module's `version` when the game was created.
- `rng_seed INT NOT NULL DEFAULT 0`: seed for the game's random setup (ATC's random order).
  `init` gets a seeded generator, so a replay rebuilds the same game. Today a restart
  reshuffles a random-order ATC game; this fixes that too.
- `board_db_id` foreign key becomes `ON DELETE SET NULL`: kept games must not block
  deleting a board. Deleting a board with a running game is still refused (409).
- `visibility TEXT NOT NULL DEFAULT 'private'`, `CHECK (visibility IN ('private','public'))`.
- `players JSONB` is dropped; seats live in `game_players`.

### `game_players` (new)

One row per seat, written when the game is created.

| column       | type                                       | notes                                                                   |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| `session_id` | TEXT, FK `game_sessions` ON DELETE CASCADE |                                                                         |
| `seat`       | INT                                        | 0-based, throw order as set up                                          |
| `name`       | TEXT                                       | display name at the time of the game                                    |
| `user_id`    | TEXT NULL, FK `user` ON DELETE SET NULL    | null for guests; deleting an account keeps the game for the other seats |
| `placement`  | INT NULL                                   | 1-based, ties share a placement; null until finished                    |
| `stats`      | JSONB NULL                                 | `Record<string, number>` from `summarize()`; null until finished        |

PK `(session_id, seat)`, index on `user_id`.

### `game_session_events` (new): the input log, the source of truth

| column            | type                                               | notes                                                        |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------------ |
| `session_id`      | TEXT, FK `game_sessions` ON DELETE CASCADE         |                                                              |
| `seq`             | INT                                                | per-session order, from 0                                    |
| `source`          | TEXT                                               | `board` or `user`                                            |
| `kind`            | TEXT                                               | board event kind, or user action type                        |
| `data`            | JSONB                                              | the board event's data, or the full user action, as received |
| `bridge_event_id` | BIGINT NULL, FK `bridge_events` ON DELETE SET NULL | provenance for board events                                  |
| `created_at`      | TIMESTAMPTZ DEFAULT now()                          |                                                              |

PK `(session_id, seq)`.

Logged: every input the engine applies. Board events `visit.opened`, `dart.detected`,
`dart.corrected`, `takeout.finished`, `visit.cleared`, `board.resync`; every user action
(`add_dart`, `correct_dart`, `undo_dart`, `takeout`, bull off actions). Corrections are
new entries, so the original detection is never overwritten.

Not logged: `board.status` (board telemetry for the status pill, already kept in
`bridge_events`), and board events for a board with no running session (they are ignored
as today).

### `game_darts` (new): normalized, derived from the log at each visit commit

| column       | type                                       | notes                                                                                                                                                            |
| ------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_id` | TEXT, FK `game_sessions` ON DELETE CASCADE |                                                                                                                                                                  |
| `visit`      | INT                                        | per-session visit number, from 0                                                                                                                                 |
| `dart_index` | INT                                        | 0–2                                                                                                                                                              |
| `seat`       | INT                                        |                                                                                                                                                                  |
| `leg`        | INT                                        | from `getLeg()`, 0 for single-leg games                                                                                                                          |
| `phase`      | TEXT                                       | `game` or `bulloff`                                                                                                                                              |
| `segment`    | JSONB                                      | `BoardManagerSegment` (name, number, bed, multiplier)                                                                                                            |
| `coords`     | JSONB NULL                                 | absent for manual darts without a position                                                                                                                       |
| `source`     | TEXT                                       | `camera` (added by a board `dart.detected`) or `manual` (added by `add_dart`, or one of the three misses of an empty `takeout`); `apply` tracks it per open dart |
| `corrected`  | BOOL                                       | a `dart.corrected` or `correct_dart` touched this dart                                                                                                           |
| `thrown_at`  | TIMESTAMPTZ                                | `created_at` of the log entry that added the dart                                                                                                                |

PK `(session_id, visit, dart_index)`. Bust is a game rule and is not stored here; it is
derived from the log. Busted visits keep their darts.

### Migrating existing data

- `game_players` is filled from `game_sessions.players`: seat order as stored, seat 0
  linked to `owner_user_id`, `placement`/`stats` null. Then `players` is dropped.
- Existing `finished` rows stay `finished`. They have no placement, so history (which only
  lists placed games) never shows them. Nothing is deleted.
- Existing `active` rows have no input log and can't be restored: they become `aborted`
  with `finished_at = now()`. A game in progress during this deploy is lost once.

## Engine

### One path for every input: append, then apply

```
input (board event or user action)
  → append to game_session_events   (awaited; a failed insert rejects the input, state untouched)
  → apply(session, input)            (no I/O)
  → if a visit was committed: insert its game_darts
  → if the game was won: write placements/stats, status=finished, finished_at (one transaction), release
  → push snapshot
```

- The logic now in `onBridgeEvent` and `onUserAction` moves into one
  `apply(session, input)` without I/O. It reports what happened (visit committed with
  which darts, game won) so the caller does the writes. Live play and replay both go
  through `apply`, so they can't drift apart.
- Inputs for one session are processed one after another (as today: the engine awaits
  each), so `seq` is assigned in memory per session.
- Abort (`deleteSession`): `status = 'aborted'`, `finished_at = now()`. The log and darts
  stay; `placement` stays null.

### Restore after restart

`rebuild()` replays each active session's own `game_session_events` through `apply`,
reading no `bridge_events`. Logged data is JSONB and is parsed with zod before use (board
events through `parseBoardEvent`, user actions through the generated user action schema);
an entry that doesn't parse is skipped with a warning. The old rule "only board sessions
can be restored" goes away: manual darts, corrections and boardless games all come back.

During a replay nothing is appended to the log. `rebuild()` re-inserts the replayed
visits' darts with `ON CONFLICT DO NOTHING`, which fills any gap left by a crash between
the append and the dart insert. If the replayed log ends in a win that was never saved,
`rebuild()` finishes the game instead of restoring it.

Inputs to a session that is no longer active (e.g. `undo_dart` after the winning visit)
are ignored and not logged.

### Versions

`game_version` stores the module's `version` at creation. Every module starts at 1. A
change that would replay old logs differently bumps it; a later replay can branch on it.

## Game module hooks

Added to `GameModule` (typed per module through `AnyGameModule`, no casts):

```ts
/** Bumped when a rule change would replay old logs differently. */
version: number

/** The leg the current visit belongs to (0-based). Single-leg games leave it out (0). */
getLeg?(s: S): number

/** The result once the game is won: one entry per seat, in seat order. */
summarize(s: S, ctx: { totalDarts: number[]; totalVisits: number[] }): Array<{
  placement: number              // 1-based; ties share a placement
  stats: Record<string, number>
}>

/** The game's detail for GET /api/games/:id, built from the replayed visits. */
detail(visits: CommittedVisit<S>[], final: S): D   // D: the module's own detail type
```

`CommittedVisit<S>` is `{ visit, seat, leg, phase, committedAt, darts: HistoryDart[],
start: S, end: S, after: S }` (`start`: after the visit's `visit.opened`; `end`: after its
last dart; `after`: once committed), collected while replaying the log. `HistoryDart` matches the
`game_darts` row (`index, segment, coords | null, source, corrected, thrownAt`).

`ctx` passes the engine's existing per-seat dart and visit counts (bull off excluded).

### X01

- `getLeg`: the number of legs played so far.
- `summarize` placement: the winner is always 1st (X01's round limit can pick a winner
  with fewer legs). The rest by legs won (descending), then remaining score in the
  current leg (ascending), from 2nd on; equal on both share a placement.
- `summarize` stats: `average` (3-dart average: points scored / darts × 3, busts count as
  0 points), `dartsThrown`, `legsWon`, `pointsScored`. This needs a running per-player
  `pointsScored` in the X01 state (the state only keeps remaining scores today).
- `detail`: `{ mode: 'x01', legs: [{ leg, starter, winner, visits: [{ visit, seat,
committedAt, darts, scored, remaining, bust }] }] }`. Bull off visits are left out of
  the detail (their darts stay in `game_darts`).

### Around the Clock

- `summarize` placement: the winner 1st, the rest by targets completed (descending), then
  darts thrown (ascending).
- `summarize` stats: `dartsThrown`, `targetsHit`.
- `detail`: `{ mode: 'atc', visits: [{ visit, seat, committedAt, darts, hits, targetBefore,
targetAfter }] }`.

Solo games get placement 1.

## API

Contract first in `schema/api-v1.yaml`, then `npm run gen:api` (TS types, zod, clients).

### `GET /api/gamemodes` (`listGameModes`, tag `gamemodes`, public)

Replaces `GET /api/games`, same content, field renamed:
`{ modes: [{ id, defaultConfig, configMeta }] }`. The old path now serves finished games.
The bridge doesn't call it; `CreateSession.svelte` moves over in the same change.

### `GET /api/games` (`listGames`, tag `games`, auth)

Finished games where the signed-in user holds a seat (`game_players.user_id = me`),
`placement` set, newest `finished_at` first.

Query: `mode` (optional game mode id), `limit` (default 25, max 100), `cursor` (opaque,
keyset on `(finished_at, id)`).

```
200 { games: GameSummary[], nextCursor: string | null }

GameSummary {
  id, mode, config, createdAt, finishedAt,
  board: { id, name } | null,          // null when boardless or the board is gone
  mySeat: number | null,               // null when viewing a public game you're not in
  players: [{ seat, name, userId: string | null, placement, stats }]
}
```

### `GET /api/games/stats` (`getGameStats`, auth)

Query: `days` (default 30, 1–365). Over the user's finished games in the last `days`:

```
200 {
  days, matches, wins, contested,   // contested: games with ≥2 seats; win = placement 1 there
  modes: { [mode]: {
    matches, wins, contested,
    stats: { [key]: { avg, min, max, previousAvg } }   // over my seat's stats;
  } }                                                  // previousAvg: the `days` before that, or null
}
```

Generic SQL aggregates over each numeric key in `stats`; no per-mode code. Solo games
count towards `matches`, not towards the win rate.

### `GET /api/games/:id` (`getGame`, auth)

Allowed when the user holds a seat, or the game is `public`. Otherwise **404** (not 403,
so the game's existence isn't revealed). Only `finished` games; anything else is 404.

```
200 { game: GameSummary, detail: X01Detail | AtcDetail }   // oneOf, discriminator `detail.mode`
```

For a viewer without a seat, `userId` is null on every player and `mySeat` is null. A game
whose mode no longer exists is 404 too.

Built by replaying the game's input log through `apply` and the module's `detail()`. A
contract test checks each module's `detail()` output against its schema; a new game mode
adds its detail schema to the union.

### Visibility

`visibility` is always `private` for now: no endpoint or UI changes it. The read rule
above already honours `public`, so a later feature (tournaments) only needs a way to set it.

## Frontend: History page

Route `/history` → `routes/History.svelte`, registered in `App.svelte` (the `SideNav`
entry exists).

- **Header**: title, subtitle, mode filter. The modes come from `/api/gamemodes` ("All"
  plus one per mode); the filter sets `mode` on `/api/games`.
- **Tiles** from `/api/games/stats?days=30`:
  - Matches · 30 days: `matches`.
  - Won: `wins` and `wins / contested` as a percentage; "–" when `contested` is 0.
  - X01 3-dart average: `modes.x01.stats.average.avg`, ▲/▼ against `previousAvg` (hidden
    when null).
  - Around the Clock best: `modes.atc.stats.dartsThrown.min` darts.
  - A tile with no data shows "–".
- **List** columns as in the design:
  - When: "Today" / "Yesterday" / "24 Sep", plus the time.
  - Game: mode title, plus a rules line from a new `GameView.rules(config, playerCount)`
    (e.g. "501 · Double out · First to 3 legs"). The config-only parts of `x01Meta` /
    `atcMeta` move into these functions and the live meta reuses them.
  - Players: the opponents' names, or "Solo".
  - Result: "Won 3–1" / "Lost 1–3" with 2 seats (X01 with legs), "1st of 4" with 3+,
    "Finished" when solo.
  - Key stat: from a new `GameView.historyStat(stats)`; X01 `average` "3-dart avg", ATC
    `dartsThrown` "darts to finish".
  - Board: the board name, or "–".
  - "Load more" at the bottom while `nextCursor` is set.
  - Empty: "No matches in this mode yet."
- Rows aren't links yet (no chevron) until the Details page exists.
- Loading and error states as on `Boards.svelte`.
- `CreateSession.svelte` switches to `/api/gamemodes` and `modes`.

## Testing

Vitest in `backend` (DB tests against Postgres, see `DEVELOPMENT.md`) and in
`backend/frontend`.

- **Engine** (in-memory `EngineStore`):
  - Every logged input type is appended before it is applied; a failed append rejects
    the input and leaves the state untouched.
  - Replay equals live: a scripted game played live, then rebuilt in a fresh engine
    from the captured log, gives identical snapshots and identical `game_darts`. The
    script covers camera darts, a manual dart, `dart.corrected`, `correct_dart`,
    `undo_dart`, an empty `takeout`, a resync mid-visit, a bull off with rethrow, and a
    boardless game.
  - A commit writes the right seat, leg, visit, phase, source and `corrected`.
  - Finishing writes placements and stats. Aborting sets `aborted`, keeps the log and
    writes no placements.
- **Modules**:
  - `summarize` ranking for X01 and ATC, including ties and solo games.
  - X01 `pointsScored` with busts.
  - `detail()` grouping: X01 legs and starters.
- **Contract**: each module's `detail()` and the list and stats responses are validated
  against `api-v1.yaml`.
- **DB and API** (Postgres):
  - Migration on a seeded database: seats moved to `game_players`, old finished rows
    hidden, active rows aborted.
  - `/api/games`: only my seats, `mode` filter, cursor paging, newest first, no aborted
    or unplaced games.
  - `/api/games/stats`: the period cut-off, `previousAvg`, solo games left out of the
    win rate.
  - `/api/games/:id`: a seat holder gets 200; another user gets 404 while the game is
    private and 200 once it's set public in the DB; signed out gets 401; a
    non-participant sees no `userId`.
  - Deleting a user nulls their seat and keeps the game for the others.
  - `/api/gamemodes` works, and the old `/api/games` payload is gone.
- **Frontend**: row formatting (result label, dates, `rules`, `historyStat`) and tile edge
  cases ("–" with no contested games or no previous period).
- **Manual**: on the dev stack (`scripts/dev.sh`), play a short X01 and an ATC game with
  a restart in the middle of one. Both appear in `/history`, and `GET /api/games/:id`
  returns their detail.
