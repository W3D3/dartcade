# X01 live stats from the server

Issue: #23 (part of #15). Related: #119 (`checkoutHint` ignores `bullValue`).

## Problem

During an X01 match the player rows show a match average, a leg average, the last visit and
the Chalkboard (this leg's visits). All of it is rebuilt in the browser by diffing snapshots
(`backend/frontend/src/lib/visitHistory.ts`, `trackVisits`), which "only knows what happened
since the page loaded". A reload or reconnect mid-match empties it, though the match is intact
on the server. The visit-start score used for "score left: after the visit" and the score band
comes from the same place and resets the same way.

#23 also asks for a checkout rate, which doesn't exist yet.

## Decision

The X01 reducer keeps these numbers in its state and the view sends them with every snapshot.
The browser reads them instead of reconstructing them.

Considered and rejected: sending the session's committed visits once on connect and keeping
the computation in the browser. There is no endpoint for live sessions (`GET /api/games/:id`
serves finished games only), a live session keeps no visit list in memory, the client would
need merge logic for a visit that undo takes back, and the X01 scoring rules (bust, opening,
bull value) would be duplicated in the browser to classify checkout darts.

Keeping it in the reducer costs nothing extra for correctness: undo restores the whole
committed state (`reopen`), a correction refolds the open visit from the committed state
(`refoldVisit`), and a restart replays the log. Any field in `X01State` stays right under all
three.

## Checkout rate

The board reports where a dart landed, not what it was aimed at, so this is the usual "darts at
a double": every dart thrown while the player is on a one-dart finish.

- A dart is a **checkout attempt** when, before it, the thrower had opened and their score could
  be finished with that one dart (`checkoutHint(score, outMode, 1) !== null`: an even score up
  to 40 or 50 under double out; master out also allows a triple), wherever it lands.
- It is a **hit** when that dart finished the leg.
- Example: 40 left, the dart lands on S20 (attempt, miss: 20 left, still a one-dart finish), the
  next on D10 (attempt, hit) → 1/2.
- A dart thrown on a score that needs more than one dart is not an attempt: a T20 on 170, or
  the first dart on 41.
- A dart that busts on a one-dart finish is an attempt and a miss.
- Per seat, over the whole match (not reset per leg). Shown in every out mode (under straight
  out it reads as "darts at a finish").
- Known gap, not fixed here: `checkoutHint` ignores `bullValue` and never treats 25 as a bull
  finish (#119), so a dart thrown on exactly 25 isn't counted.

## Reducer state (`backend/src/games/x01.ts`)

New `X01State` fields, all per seat unless noted:

| Field                                                  | Purpose                                         | Reset       | Updated                                          |
| ------------------------------------------------------ | ----------------------------------------------- | ----------- | ------------------------------------------------ |
| `legVisits: { seat, scored, left, bust, darts }[]`     | this leg's committed visits, in throw order     | `freshLeg`  | appended on `takeout.finished` / `visit.cleared` |
| `lastVisit: ({ scored, left, bust, darts } \| null)[]` | the thrower's last visit; survives a leg change | `init` only | the thrower's entry, on commit                   |
| `checkoutAttempts: number[]`                           | see above                                       | `init` only | `dart.detected`                                  |
| `checkoutHits: number[]`                               | see above                                       | `init` only | `dart.detected`                                  |

`scored` is the visit's points (0 on a bust), `left` the team's score after it, `darts` the
darts thrown in it (the leg average divides by these). The reducer doesn't count a visit's
darts today (the engine does, in `totalDarts`), so a visit's dart count is kept in a scalar
`visitDarts` (not in the view), reset on `visit.opened` and on commit, incremented on every
`dart.detected` (including darts after a bust or before opening: they were thrown). Bull-off
darts never reach the X01 reducer, so they count for nothing.

## View and schema

`X01View` (and `X01Game` in `schema/game-ws-v1.json`) gain, all additive:

- `pointsScored: number[]` (exists in state, newly exposed)
- `legVisits`, `lastVisit`, `checkoutAttempts`, `checkoutHits`
- `visitStartScores: number[]`: each seat's team `visitOpenedScores`

Then `npm run gen:api`. The bridge doesn't use this schema, and the browser's zod schemas strip
unknown fields, so an open tab on the old frontend keeps working.

## Frontend

- `playerStats.ts` `x01Player()`: `avg` = `pointsScored[i] / totalDarts[i] × 3`; `legAvg` and
  the Chalkboard `visits` from `legVisits` for that seat; `last` from `lastVisit[i]`; the visit
  start from `visitStartScores[i]`; a new `checkout` value ("2/5 · 40%", "—" before any attempt).
  It no longer takes the visit history.
- `teams.ts` `x01Teams()`: the team Chalkboard is `legVisits` for the team's seats (already
  interleaved in throw order); team averages sum `pointsScored` and `totalDarts` over its seats.
- `GameDisplay.svelte`: the X01 paths and the score band's visit start read the snapshot.
  `visitHistory.ts` / `trackVisits` remain for Around the Clock only.
- The checkout rate shows next to Avg/Last in the X01 rows, panels, phone card and team panel.

## Tests

- `x01.test.ts`: `legVisits` resets per leg; `lastVisit` survives a leg; `pointsScored` in the
  view; checkout counting (the example above; T20 on 170 and the first dart on 41 not counting;
  a bust on 40 as a miss; darts before opening under double in; a finishing triple under master
  out); `legVisits[].darts` with fewer than three darts after a checkout; a corrected dart refolded
  through the open visit leaves the counters right.
- Frontend: `playerStats` and team tests built from the new fields, and a cold snapshot (as
  after a reload) showing full averages and the Chalkboard at once.

## Out of scope

- Around the Clock live stats (stays on `visitHistory.ts`).
- Persisting the checkout rate in game history / the stats page (`summarize()`); a follow-up
  can add it as a stat key.
- #119.
