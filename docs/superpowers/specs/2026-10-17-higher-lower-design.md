# Higher Lower

A lives-based pub game about controlling your score instead of maximising it (GitHub issue #109).
There are two bars, high and low. Every visit has to land above the high bar or below the low bar,
and whatever you score moves that bar for the next player. Land between them and you lose a life.
The last player with lives left wins.

Design: the **Game · Higher Lower** page of the design canvas. The match screen artboards are
`HiLo-Duel`, `HiLo-LifeLost`, `HiLo-Party` and `HiLo-Phone`; `HiLo-Result` shows the numbers the result should cover (the shared win screen shows them).

## Rules

- **Players.** Two or more. A solo start is refused (`validate`).
- **Setup.**
  - Start high bar: Stepper, default 41.
  - Start low bar: Stepper, default 21.
  - Lives: 1–7, default 3.
  - T1 counts as 0: off by default.
  - Matching the extremes: on by default.
  - Bull off: off / wdc / pdc, as in X01, default off.
  - `validate` checks that 0 ≤ low < high ≤ 180 and that lives are 1–7. Every option field must be
    one of its options.
- **A dart.** It scores what it hit, except that with "T1 counts as 0" a treble 1 scores 0. A dart
  that **misses the board** (multiplier 0) scores 0. What happens next depends on the running
  total:
  - **Already safe high:** the total is above the high bar, or 180 on a high bar of 180 with
    "matching the extremes" on. The miss is harmless and the visit goes on. A dart can only add
    points, so the visit stays safe.
  - **Otherwise:** the miss costs a life immediately and ends the visit. The bars stay, the visit
    locks, and the takeout passes the turn on. This includes a total already under the low bar,
    because a free 0 must not help anyone go under.
- **A visit** is judged on its total when it ends (takeout or visit cleared):
  - total > high, or total = 180 on a high bar of 180 with "matching the extremes" on: the total
    becomes the new high bar.
  - total < low, or total = 0 on a low bar of 0 with "matching the extremes" on: the total
    becomes the new low bar.
  - Anything else, including a total equal to a bar, costs a life. The bars stay.
  - Because low < high always holds, a visit can never beat both bars, and the bars can't cross.
- **Darts not thrown count as misses**, under the same rule.
  - A takeout before the third dart is fine when the total is already safe high: the visit sets
    the high bar.
  - Otherwise it costs a life, the same as an empty takeout, which the engine already turns into
    three misses.
  - Without this rule, one S1 and an early takeout would beat any low bar above 1.
- **Turns** rotate per visit. A player with no lives left is skipped. The round counter goes up
  each time play gets back to the first player still in the game.
- **End and placings.** The game ends when one player has lives left; that player wins and places
  1st. The others place by when they went out, the last one out highest. A forfeit uses the shared
  forfeit placements.

## Backend

- **`backend/src/games/hilo.ts`**, a `GameModule` (id `hilo`) wrapped with `withBullOff`, registered
  in `games/index.ts`. A dart's score comes from the shared `effectiveDartScore` in `outRules.ts`,
  plus the T1 rule.
  - State: cfg, the bars, per seat `lives`, `outAt` (the visit number the player went out in, or
    null) and their visits (total, outcome, the bars after), plus the open visit's total and darts,
    a miss flag, the turn index, the round, `winner` and `lastResult`.
  - The outcome of a visit is one of `'high' | 'low' | 'between' | 'miss'`. A pure
    `judge(total, high, low, cfg)` returns it, and its tests are a table.
  - `view()` always sets `winner` (number or null), and `visitLocked` (true after a miss).
  - `throwOrder: s => [...s.order]`, `validate` as above, and `summarize`, `detail`, `matchStats`
    as below. No `getLeg`, no `botTarget`.
- **History.**
  - `summarize`: placement per the rules, with these stats: `livesLeft`, `visits`, `highestSet`
    and `lowestSet` (only when the player set one), `livesLostBetween`, `livesLostMiss`,
    `outRound` (only for players who went out), and `dartsThrown` (from `ctx.totalDarts`). It also
    works on an unfinished game.
  - `detail()`, `HiloDetail` in `schema/api-v1.yaml`, branch of `GameDetail.detail`: the start bars,
    every visit in order (seat, round, total, outcome, high and low after it), and per seat the
    place, the round they went out and the lives left.
  - `matchStats()`: rows for visits survived, highest bar set, lowest bar set and lives lost.
- **Flag.** `gamemode.hilo.enabled`, admins only, like the other game-mode flags.

## Snapshot

`HiloGame` in `schema/game-ws-v1.json` (a branch of `Snapshot`), then `npm run gen:api`:

- `cfg`: the setup without the bull off.
- `high`, `low`, `round`, `phase`, `currentPlayer`, `nextPlayer`, `winner`, `visitLocked`.
- `visitTotal`: the open visit's running total.
- `seats[]`: `lives`, `out` (whether the player is out), `place` (once out, else null), `outRound`,
  and `visits[]` (round, total, outcome).
- `lastResult`: the visit that just ended (seat, total, outcome, the bars before it). It drives the
  life-lost banner. It clears on the next dart.
- `bullOff` and the engine fields (`currentVisitDarts`, `totalDarts`, `totalVisits`).

## Frontend

- **Play card:** the `hilo` entry in `lib/gameModes.ts`. The description becomes "Land above the high bar or
  below the low bar.", plus `available: true`, `glyph: 'HiLo'` and the flag. It stays a small card
  in Practice.
- **Header** (`lib/gameViews/`): the title "Higher Lower" and a meta line like "2 players · 3 lives ·
  Round 4".
- **View helpers** in `lib/hilo/view.ts`, all pure and tested:
  - the "Needs" line ("Over 60 · under 15")
  - the next-slot suggestion: the smallest score that beats the high bar with the darts left
    ("36+ · beats HIGH 60"), shown only when it can be reached
  - the outcome texts ("Set HIGH 60", "Lost a life · 45", "Missed the board")
  - the banner text ("−1 life · 45 is between 15 and 60")
  - the round of each visit for the visit lists
- **Components** in `lib/components/hilo/`:
  - `HiloScale`: the 0–180 scale, vertical on desktop and horizontal on phone. The safe zones are
    lit, the danger zone between the bars is dark red, both bars carry big numbers, and the visit
    total is a marker coloured lime when safe and red when in danger.
  - `HiloPanel`: the duel panel, with hearts, Needs, the last visit and the visit list.
  - `HiloRow`: the party row, with name, hearts, Needs or last visit, and "Out · 4th" for players
    who are out.
  - `HiloMatch`: the layouts (duel, party, phone), wired into `GameDisplay.svelte` like
    `P121Match`. The slots come from `DartSlots`, plus Undo and Next.
- **End of the game:** the shared `WinScreen`, like the other modes, through a `hiloWin` builder
  in `lib/winScreen.ts`.
  - Competitors are ordered by place, with forfeited seats last. The big number is lives left.
  - The sub line reads "2 lives left" for the winner and "Out in round 4" for the others.
  - Standings columns: Lives, Bars moved, Out in.
  - Duel stats: lives left, bars moved, lives lost to misses.
  - Party highlights: the highest and the lowest bar set.
  - Kicker "Last one standing".
  - The Match details page shows the generic result and match-stats table; there is no custom
    section. `HiLo-Result` is a reference for which numbers matter, not a screen to build.
- **Everything else a game mode touches** (from the 121 final review):
  - the `GameSettings` branch (Steppers for the bars and lives, toggles for the options)
  - `chosenGame` in `lib/lobby/play.ts` carries every config field
  - the lobby's next-game line in `lib/lobby/format.ts` and its glyph
  - `gameName` "Higher Lower"
  - `lib/history.ts`: `rulesLine`, plus `historyStat` (the place each player went out) and
    `statTiles`
  - the solo layout is never used
- **Tablet widths:** layouts must fit 1024 px wide (iPad landscape). Below `xl`, panels narrow as in 121.

## Not in scope

Bots, teams, caller lines specific to Higher Lower, and a solo survival mode.

## Testing

- `hilo.test.ts`:
  - `judge` as a table: above, below, equal to a bar, both extremes with the option on and off.
  - T1 as 0.
  - A miss below the high bar (in between, or already under the low bar) costs a life, ends the
    visit and leaves the bars.
  - A miss once the total is above the high bar is harmless, and the visit still sets the high
    bar.
  - An early takeout: harmless when safe high, a life otherwise.
  - Rotation skips players who are out; the round counter.
  - The last player standing wins; placings by when players went out.
  - `summarize` on a forfeit; `validate` (solo, low ≥ high, a bad option).
  - A corrected dart replays the visit (refold).
- Engine-level tests with board events:
  - A last-life loss on the third dart is held for Finish.
  - A miss that knocks out the second-to-last player ends the game.
- The `HiloDetail` contract test.
- Frontend unit tests: the view helpers and `hiloWin`.
- Checks at 1024 px wide.
- One e2e test: a 2-player game played with manual darts until one player is out, ending on the
  win screen.
