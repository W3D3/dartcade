# Adding a game mode

A game mode is a pure reducer on the server plus a handful of entries on the client. Most of the
work is the game's own rules and its look. Everything around them is shared:

- turn order and up next
- config checks
- bull off, teams and out rules
- placements, the snapshot and the history path
- the caller's and the lights' reading of a visit
- the match screen's layouts and its board or keypad
- names and rules lines

This guide covers what to write and what to reuse. The compiler and the contract tests catch most
steps you forget; the [checklist](#checklist) at the end says which ones they don't.

Read [ARCHITECTURE.md](../ARCHITECTURE.md) first for how a game runs: the bridge's events go into an
event log, the engine folds them through the game's reducer, and the browser gets a snapshot after
every change.

## 1. The game module

Write `backend/src/games/<id>.ts`, a `GameModule` (`backend/src/session/types.ts`).

- **Keep it a pure reducer.** Games are rebuilt by replaying their input log after a restart and
  after a corrected dart, so the same inputs must give the same state. Use the `rng` that `init`
  gets for anything random, never `Math.random`. A change that would alter a replay needs a new
  `version`.
- **Required:**
  - `init`, `getCurrentPlayer`, `onBoardEvent`, `onUserAction` and `view`
  - `defaultConfig` and `configMeta`, which build the setup form
  - `version`, `summarize`, `detail` and `matchStats`, for history and the details page
- **`summarize` without a winner.** It must also work on a game nobody won: a forfeit ends a game
  early and ranks the seats by it. Placements reach the win screen from the server (the snapshot's
  `results`), so no ranking rule is written twice.

Reuse these instead of writing your own:

| Need                                                          | Use                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Check the config against `configMeta`                         | `validateOptions` in `games/configMeta.ts`, from your `validate`. Add only the checks it can't express, such as bounds.                                                                                                                                                       |
| Next seat in throwing order, skipping seats that are done     | `nextTurn` in `games/turns.ts`                                                                                                                                                                                                                                                |
| Who throws after the current visit (`nextPlayer` in the view) | `upNext` in `games/turns.ts`. Every turn-based view sends `nextPlayer`; the screen doesn't guess it.                                                                                                                                                                          |
| A throwing order decided by a bull off                        | Wrap the module with `withBullOff` (`session/withBullOff.ts`). It adds `bullOff` to the config, the setup form and the view, and checks the value.                                                                                                                            |
| Double/master/straight in or out                              | `games/outRules.ts`, shared by X01 and 121                                                                                                                                                                                                                                    |
| Teams (Team A vs Team B sharing one score)                    | Set `teams: true` and add `teamsOf(s)`, then read `cfg.format`/`cfg.teams` through `games/teams.ts` (`teamOfSeats`, `seatsByTeam`, `turnOrder`, `seatPlacements`, `teamForfeitPlacements`). Singles and teams stay one code path, and nothing outside the game decides teams. |
| Placements from a sort key                                    | `games/ranking.ts`                                                                                                                                                                                                                                                            |
| Rows and values for the details page                          | The helpers in `games/matchStats.ts`. `games/x01Stats.ts` and `games/atcProgress.ts` are worked examples.                                                                                                                                                                     |
| Legs                                                          | `getLeg`, if the game has them                                                                                                                                                                                                                                                |

Then:

1. Register the module in `backend/src/games/index.ts` (`gameList`).
2. Add its name to `backend/src/shared/gameNames.ts`. The server (challenges) and the SPA (titles,
   lobby, Play page) read names only from there, and a test checks it lists every game in `gameList`.
3. Add its view type to `backend/src/session/views.ts` and its module to the `AnyGameModule` union
   in `session/types.ts`. The engine's snapshot and history paths are generic over that union, so
   no per-game branch is needed there.
4. Add the flag `gamemode.<id>.enabled` to `backend/src/flags/definitions.ts`, in **both** places:
   `FLAG_META` and the provider config further down. To show the mode in the docs screenshots, also
   add it to `FLAGS_ON` in `e2e/docker-compose.screenshots.yaml`.
5. Bots (optional): `botTarget`, and a view that `bots/scheduler.ts` can read.

## 2. The schema

The browser parses every snapshot against `schema/game-ws-v1.json` and drops the ones it doesn't
recognise. A game the schema doesn't describe never reaches the screen.

1. In `schema/game-ws-v1.json`:
   - a `<Id>Game` def for your view, including the engine fields `currentVisitDarts`, `totalDarts`
     and `totalVisits`, plus `bullOff` if you used `withBullOff`
   - a `<Id>Snapshot` def, copied from another game's: the five copies differ only in `gameId.const`
     and `game.$ref`
   - an entry in `Snapshot.oneOf`
   - a `UserAction` branch for each action of your own, for example `p121_give_up`
2. In `schema/api-v1.yaml`: a `<Id>Detail` schema with `mode: enum [<id>]`. Add it to the
   `GameDetail.detail` `oneOf` **and** to its discriminator `mapping`.
3. Run `npm run gen:api` at the repo root. It regenerates the TypeScript types, the zod schemas
   (server and SPA) and the bridge's Go types. Commit the generated files; CI fails if they're
   stale.

## 3. The client

### Tables the compiler keeps complete

Each of these is a `satisfies Record<GameId, …>` table or an exhaustive `switch`. A new game id
doesn't compile until it has an entry:

| What                                                                               | Where                                                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Rules line (match header, win screen, history, lobby), parsed once from the config | `lib/gameViews/rules.ts`: a zod config schema and a `rules` entry                                 |
| Header meta                                                                        | `lib/gameViews/index.ts`                                                                          |
| In-game settings drawer rows                                                       | `lib/gameViews/settings.ts`                                                                       |
| History: the row's stat and the stat tiles                                         | `lib/history.ts`                                                                                  |
| Details page headline                                                              | `lib/details/page.ts`                                                                             |
| Win screen view                                                                    | `lib/winScreen.ts` (`winView`): return `null` to show the game's own summary instead, as 121 does |
| Which dart events the sounds hear                                                  | `lib/dartEvents.ts`                                                                               |
| The caller (score-based games only)                                                | `lib/caller/calls.ts` (`callGame`): return `null` if the caller doesn't speak for this game       |

`lib/gameState.ts` derives its type from the snapshot union, so there's nothing to add there.

### Not caught by the compiler

- **Play page:** an entry in `GAME_MODES` (`lib/gameModes.ts`) with its glyph, description,
  category, image (`lib/assets/games/<id>.svg`) and `flag`. A test checks that the playable ids
  match `GAME_NAMES`.
- **Setup form:** a block in `lib/components/GameSettings.svelte`, built from `SegmentedControl`
  and `Stepper` over your `configMeta` options. Without one, the form shows a placeholder.
- **Details page:** sections for the game's detail in `routes/GameDetails.svelte`. Without them,
  the page shows only the standings and the stats table.
- **Dart slots:** a `<id>Slots` in `lib/dartSlots.ts`, if the three slots under the board show
  something other than X01's or Around the Clock's.

### The match screen

Write `lib/components/<id>/<Id>Match.svelte` and add an `{:else if <id>}` branch for it in
`routes/GameDisplay.svelte`. Build it from the shared pieces:

- **`MatchFrame`** (`lib/components/match/`): the `<main>` for every layout that `matchLayout`
  chooses (phone, portrait, solo, duel, party, teams). You pass one snippet per layout; solo and
  teams fall back to party. Follow the layout rule inside the snippets:
  - two players: the board in the centre, one panel either side
  - three or more: stacked rows beside the board
  - portrait: the players on top
  - phones: the thrower's card, the board, then the slots
- **`BoardOrKeypad`** (`lib/components/match/`): the dartboard in the largest square that fits,
  or the keypad when the header's Enter view is on, and the key that replaces a selected dart.
  Pass what your game draws on the board (targets, markers, camera).
- **Player cards:** `PanelShell` (one or two players), `RowShell` (stacked rows) and
  `PhoneCardShell` (the thrower's card on a phone), in `lib/components/`. Every game uses them for
  the header: avatar, name, the board in remote games, and the pill. The game's own content goes in
  `children`, and a value beside the name, such as 121's target, goes in `aside`. A state beyond
  throwing or waiting is a `tone` (`lost`, `out`, from `lib/playerCard.ts`). The pill is a
  `PlayerPill` kind; pass `pillLabel` when its text differs ("Out · 2nd", "Done"). Pass `label`
  when the card's accessible name should say more than "throwing" or "waiting". A layout's own
  width goes in `class`.
- **Around the board:** `DartSlots`, `ControlBar` and the `TurnStatusBar`, `WaitingCard`,
  `BoardCaption` and `OfflineNotice` that remote games need.

## 4. Tests

- **Free:** `src/games/detail.contract.test.ts` and `src/session/snapshot.contract.test.ts` run
  every module in `gameList` with its `defaultConfig`. They check that its detail, match stats and
  snapshot parse against the schemas.
- **The rules:** `backend/src/games/<id>.test.ts` covers config checks, a whole game, a forfeit,
  undo and corrections, and a replay giving the same state.
- **The client:** tests for your `lib/<id>/` view helpers, and your rows in the table tests.
- **e2e:** `e2e/tests/game-<id>.spec.ts`, which plays a game to its end with manual darts
  (`startGame` in `e2e/fixtures/lobby.ts`).
- **Screenshots:** a scene in `e2e/screenshots/`, and the images in `docs/<id>/`, which the README
  and the release notes show.

## Checklist

| Step                                  | File                                                                                                                                                                                     | Caught if forgotten     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Module                                | `backend/src/games/<id>.ts`                                                                                                                                                              | —                       |
| Register                              | `backend/src/games/index.ts`                                                                                                                                                             | contract tests          |
| Name                                  | `backend/src/shared/gameNames.ts`                                                                                                                                                        | test, compiler          |
| View type and union                   | `backend/src/session/views.ts`, `session/types.ts`                                                                                                                                       | compiler                |
| Flag (two places)                     | `backend/src/flags/definitions.ts`                                                                                                                                                       | no                      |
| Lights                                | `backend/src/lights/triggers/index.ts`, `backend/src/lights/service.ts` (their `GameId` comes from `gameNames.ts`)                                                                       | compiler (the switches) |
| Snapshot schema                       | `schema/game-ws-v1.json`                                                                                                                                                                 | contract tests          |
| Detail schema (`oneOf` and `mapping`) | `schema/api-v1.yaml`                                                                                                                                                                     | contract tests          |
| Generated files                       | `npm run gen:api`                                                                                                                                                                        | CI (`check-generated`)  |
| Client tables                         | `lib/gameViews/rules.ts`, `lib/gameViews/index.ts`, `lib/gameViews/settings.ts`, `lib/history.ts`, `lib/details/page.ts`, `lib/winScreen.ts`, `lib/dartEvents.ts`, `lib/caller/calls.ts` | compiler                |
| Play page card                        | `lib/gameModes.ts`, `lib/assets/games/`                                                                                                                                                  | test                    |
| Setup form                            | `lib/components/GameSettings.svelte`                                                                                                                                                     | no (placeholder)        |
| Match screen                          | `lib/components/<id>/<Id>Match.svelte`, `routes/GameDisplay.svelte`                                                                                                                      | no                      |
| Details sections                      | `routes/GameDetails.svelte`                                                                                                                                                              | no                      |
| Tests, e2e, screenshot                | see above                                                                                                                                                                                | —                       |

## Still per game

These parts are not shared yet. Moving them would change how a game looks or behaves, so it needs a
design decision first:

- **Remote-game cues:** only X01 and Around the Clock show the remote-game cues (`TurnStatusBar`,
  `WaitingCard`, `BoardCaption`, `OfflineNotice`). GameDisplay places them per layout inside its
  centre column.
- **Lights:** only X01 sends visit, bust and checkout lights. The caller and the X01 lights read a
  visit through one shared module (`backend/src/shared/visitOutcome.ts`), so another game's lights
  are an adapter plus a choice of looks.
- **Win screen stats:** the duel rows are built per game. They show different stats from the
  game's `matchStats` on purpose.
- **Snapshot schema defs:** the five per-game `*Snapshot` defs in the schema are copies, because
  `additionalProperties: false` rules out a shared `allOf` base.
- **Minigolf:** it has its own full-screen match layout.
