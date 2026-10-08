# Match details

A page for one finished game: who won, the match stats, and how it went leg by leg (X01) or
target by target (Around the Clock). History rows open it.

Design canvas: `project/X01-Details.dc.html`, `X01-Details-Party`, `X01-Details-Teams`,
`Tablet-X01-Details`, `Mobile-X01-Details`, `ATC-Details`, `ATC-Details-Party`,
`Tablet-ATC-Details`, `Mobile-ATC-Details`.

## Scope

In:

- `GET /api/games/{id}` returns match stats in a mode-agnostic shape (breaking change; we're on 0.x).
- X01 and Around the Clock compute them.
- The details page for X01 (duel, party, teams) and Around the Clock (duel, party) on desktop,
  tablet and phone; History rows link to it.

Out (later):

- The profile popovers on player names (member since, favourite mode, head to head).
- Rematch from the details page.
- Persisting the new stats in `summarize()` for the History tiles or a Stats page.

## API

`GameDetail` gets a required `stats`. Everything in it is generic: the schema never names a
game mode's fields, so a mode adds stats without schema or frontend changes.

```yaml
GameDetail:
  required: [game, detail, stats]
  game: GameSummary
  detail: X01Detail | AtcDetail      # unchanged: the mode's visits, for charts and the chalkboard
  stats: MatchStats

MatchStats:
  required: [rows, seats]
  rows: StatRow[]                    # display order
  seats: [{ index: integer, values: { [key]: number } }]   # one per seat, seat order
  teams: [{ index: integer, values: { [key]: number } }]   # only in a team game

StatRow:
  required: [key, label, format, better, compact]
  key: string                        # names the row, e.g. first9Average; its value unless `value` says otherwise
  label: string                      # "First 9 average"
  format: decimal | integer | darts | target | ratio
  value: string                      # optional: the key holding the row's value (ratio: the numerator); default `key`
  of: string                         # ratio only: key of the denominator
  better: higher | lower | null      # null: no side is better (darts thrown)
  compact: boolean                   # shown where space is short: party table, phone card
```

- A value missing from `values` means the stat doesn't apply (no checkout yet: no
  `highestFinish`). It shows as "—" and never counts as better.
- `ratio`: `value` (or `key`) is the numerator, `of` the denominator, both in `values`. Shown
  as "50% · 3/6"; compared by the rate. A denominator of 0 shows "—".
- `target`: 1–20, 21 = 25, 22 = Bull, the same numbering as `AtcDetail`.
- `darts`: an integer shown as "15 darts".
- Team values aggregate the parts (summed points and darts, summed checkout hits and
  attempts), never an average of averages.

### Server

`GameModule` gets an optional `matchStats(visits, final): MatchStats`, run on the same replay
as `detail()` (`backend/src/history/detail.ts` builds both). A module without it returns
`{ rows: [], seats: [] }`; the page then shows the result only. A small helper in
`backend/src/games/` declares rows (`row(key, label, format, better, { compact, of })`) so each
mode's labels and formats sit in one list.

X01 rows, in order (compact marked \*):

| key                                                        | label           | format  | better |
| ---------------------------------------------------------- | --------------- | ------- | ------ |
| `average`                                                  | 3-dart average  | decimal | higher |
| `first9Average`\*                                          | First 9 average | decimal | higher |
| `checkout`\* (value `checkoutHits`, of `checkoutAttempts`) | Checkout        | ratio   | higher |
| `highestFinish`\*                                          | Highest finish  | integer | higher |
| `highestScore`\*                                           | Highest score   | integer | higher |
| `count180`                                                 | 180s            | integer | higher |
| `count140`                                                 | 140+            | integer | higher |
| `count100`                                                 | 100+            | integer | higher |
| `bestLegDarts`\*                                           | Best leg        | darts   | lower  |
| `dartsThrown`\*                                            | Darts thrown    | integer | null   |

Values beyond the rows: `legsWon` (the result headline), and in a team game per seat
`legsClosed` (legs that player checked out). Checkout attempts and hits come from the state's
`checkoutAttempts`/`checkoutHits` (the visit's end state minus its start state), so double
out, master out and double in follow the live counting. `count140` counts 140–179 and
`count100` 100–139, so each visit lands in one tier. First 9 is the average of each leg's
first three visits. Bust visits score 0.

Around the Clock rows:

| key                                            | label               | format  | better |
| ---------------------------------------------- | ------------------- | ------- | ------ |
| `dartsThrown`\*                                | Darts thrown        | integer | null   |
| `targetsHit`\*                                 | Targets hit         | integer | higher |
| `hitRate` (value `dartsHit`, of `dartsThrown`) | Hit rate            | ratio   | higher |
| `firstDartHits`\*                              | Hit with first dart | integer | higher |
| `longestStreak`\*                              | Longest hit streak  | integer | higher |
| `dartsPerTarget`                               | Darts per target    | decimal | lower  |
| `hardestTarget`\*                              | Hardest target      | target  | null   |

Values beyond the rows: `dartsHit` (darts that hit their target; `targetsHit` can be higher
when a multiplier skips targets), `reached` (target when the game ended) and `finished` (1 or 0) for the result headline.
`hardestTarget` is the target that took the most darts (the earliest on a tie); missing for a
seat that hit nothing.

### Around the Clock detail

The target grid and the race chart need to know which dart hit which target, and with
"multiplier advances" one dart can skip targets. The visits don't say which of their darts hit,
so `AtcDetail` gets the per-dart walk the server does anyway (breaking, we're on 0.x):

```yaml
AtcDetail:
  progress: [{ seat, steps: [{ target, darts, hit }] }]   # one per seat, seat order
```

`steps` lists every target the seat got to in order: `darts` thrown at it, `hit` whether it
was completed. A target skipped by a multiplier is a step with `darts: 0, hit: true`; the
target the game ended on is the last step with `hit: false` (none when the seat finished). The
same walk (the module's own `hitsTarget` and `advanceInSequence`) gives the match stats.

## Page

Route `#/history/:id` → `routes/GameDetails.svelte`. Loads `GET /api/games/{id}` once
(finished games don't change). History rows become links with a chevron.

Header: back to History, the mode name, a meta line ("501 · Double out · First to 3 legs ·
26 Sep 2026, 21:14 · Living room", from the game's config and summary) and, if you played, your
result pill ("Won 3–1", "Lost 1–3", "2nd").

Layout (the repo rule: two sides face each other, three or more stack as rows):

- **Duel** (2 seats): left, the result card (both sides, the headline, Winner tag) and the
  stats table (left value | label | right value; the better value in lime per `better`).
  Right, the mode section.
- **Teams** (X01 team game, 2 teams): the duel layout with Team A and Team B as the sides, the
  table from `stats.teams`, then "Each player's share" (player, team, average, legs closed).
- **Party** (3+ seats): left, standings (place, player, one column per compact row); right,
  the mode section with a "Highlight a player" picker (default: you, else the winner).
- Desktop two columns (left 520 px); tablet two columns (left ~420 px); phone one column
  (result card, compact stats, mode section).

Mode sections, from `detail`:

- **X01 · Leg by leg**: leg tabs (default: the last leg), a summary line ("Christoph won in
  15 darts, checking out T20 · S20 · D18 · Guest 1 threw first"; a leg cut short by the round
  limit says so), the points-remaining chart (one line per side, rings on 100+ and 180), and
  the chalkboard (per visit and side: score badge in its tier, the darts, points left crossed
  out once passed, "Out" on the checkout; in a team game, who threw). Party: the chalkboard
  sits beside the chart on desktop.
- **Around the Clock**: Target by target (darts needed per target per player, coloured
  1 / 2 / 3 / 4+, the target the game ended on, targets not reached; a sentence naming each
  player's hardest target) and Race to the Bull (targets hit against darts thrown; your line
  in lime).

The result headline per mode: X01 legs ("3–1", "Legs · first to 3"); Around the Clock
"Finished · 49 darts" or "Reached 15". A mode without a view on the page gets the header, the
result card with placements, and the stats table, without a mode section.

Code: pure helpers in `backend/frontend/src/lib/details/` (`stats.ts`: format a value, mark
the better side; `x01.ts`: leg series, chalkboard rows, summary line; `atc.ts`: target grid,
race series, hardest-target sentence). Components in `lib/components/details/`. Charts are
inline SVG as on the artboards.

## Errors and edge cases

- 404 (not yours, not public, or the mode is gone): "This game isn't available" with a link
  back to History. Network failure: the error and Try again.
- A forfeited game: the result card shows who gave up; stats cover what was thrown.
- A game won by forfeit before a leg finished: leg tabs list the legs played; an unfinished
  leg has no winner line.
- A solo game (one seat): the duel layout with one side; no better-value highlighting.
- Games recorded before `throwPosition` existed still render (it isn't used here).

## Testing

- Backend: unit tests for X01 `matchStats` (first 9 across legs, tiers, best leg, checkout
  ratio under double out / master out / double in, team aggregation, a bust) and Around the
  Clock (streaks, first-dart hits, hardest target, an unfinished seat); the detail contract
  test validates `stats` against the schema; the `GET /api/games/{id}` test checks it's there.
- Frontend: unit tests for `lib/details/*` (formats including "—", ratio by rate, better side
  with missing values; leg series and crossing out; target grid states); SSR render tests for
  the duel, party and teams layouts and the 404 state.
- e2e: open a finished game from History and see the details page.
