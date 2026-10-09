# Minigolf game: design

Sub-project 3 of Minigolf (see `2026-10-09-minigolf-core-bench-design.md`): the playable game on top of
the core (holes, dart → putt, `simulateShot`). Designs: `project/Minigolf.dc.html` (aiming),
`Minigolf-Shot.dc.html` (a try played), `Minigolf-Scorecard.dc.html` (between holes),
`Minigolf-Courses.dc.html` (course picker), `Play-Minigolf.dc.html` (setup), `Minigolf-Rules.dc.html`.

## Rules

- **Everyone plays the same hole**, one stroke per turn, rotating through the players who aren't in
  the cup yet. A visit is one stroke.
- **Tries per stroke** (`tries`: 3 or 1). With 3, every dart of the visit is a try from where the
  balls lay when the visit opened, and replaces the previous try; takeout keeps the last one. With 1,
  the first dart is the stroke and later darts in the visit are ignored.
- **A miss** (no coords, or off the double wire) is a try that leaves the ball where it is; if it's the
  last try, the stroke counts and the ball stays.
- **Max strokes per hole** (`maxStrokes`, default 6). A player whose last allowed stroke doesn't drop
  scores `maxStrokes + 1` and is done with the hole.
- **The hole ends** when every player is in the cup or done. The next hole's order is the best score
  on the hole just played first; ties keep their previous order. The first hole goes in seat order
  (no bull off).
- **The game ends** after the last hole. Lowest total wins; placements tie on equal totals
  (`rankSeats`).
- **Ball contact** (`ballContact`, off by default). Off: only your ball is simulated; others are drawn
  faded. On: the resting balls of everyone still on the hole are in the simulation and can be knocked
  around; a ball knocked into the cup is holed with no extra stroke for its owner (and its strokes so
  far are its score).
- **Shot delay** (`shotDelay`, seconds, 0 = off, default 3): purely presentation; the match screen
  starts the ball rolling once no new dart has landed for that long. With 1 try it is ignored.
- **Positions only.** A dart without coords is a miss; manual entry is clicking a spot on the board.
  The keypad is not offered, and the server rejects `add_dart`/`correct_dart` without coords for this
  game.
- No bots, no teams in this sub-project.

## Config

```ts
type MinigolfConfig = {
  course: string          // a course id from COURSES, or 'mixed' (9 random holes of all courses)
  tries: 1 | 3
  maxStrokes: number      // 3..10
  ballContact: boolean
  shotDelay: number       // 0..5 s
}
```

Defaults: the first course, `tries: 3`, `maxStrokes: 6`, `ballContact: false`, `shotDelay: 3`. `configMeta`
labels them for the setup form; `validate` rejects an unknown course.

## Architecture

### Core (`backend/src/shared/minigolf/`)

- `simulateShot(hole, physics, ball, shot, others?)`: `others` are the other balls on the hole
  (`{ id, at }[]`), added as dynamic circles. The result gains `others: { id, path, rest, holed }[]` for
  each ball that moved. Without `others` it behaves exactly as today (golden shots unchanged).
- `getCourse` gains `mixedHoles(rng)`: 9 holes drawn from all courses without repeats (fewer if there
  aren't 9).

### Game module (`backend/src/games/minigolf.ts`)

Pure reducer, registered in `games/index.ts`.

- **State:** the config; `holes` and `physics` **copied in at `init`** (so later course edits or physics
  tuning can't change how a played game replays); `holeIdx`; `order` (seats in turn order for this
  hole); `balls` per seat (`at`, `strokes`, `holed`, `done`); `scores[hole][seat]`; the open visit (the
  balls when it opened and the current try: its dart, result, and the moved balls); `winner`/`finished`.
- **`onBoardEvent`:** `visit.opened` remembers the balls. `dart.detected` runs `shotFromDart` + `simulateShot` from the remembered balls
  and stores it as the current try (with 1 try: only the first dart). The engine rebuilds the open
  visit from its events after a correction or undo, so those re-simulate from the same balls. `takeout.finished` commits the
  try: stroke + 1, balls moved, holed/done updated; then the next player not yet in, or the hole ends
  (scores written, next hole's order, balls on the tee) or the game ends.
- **`onUserAction`:** the engine's generic undo/takeout/add_dart paths, as for other games.
- **`view`:** what the match screen draws: the hole (geometry), par, hole number/count, course name,
  every seat's ball/strokes/total/to-par/status, `currentPlayer`, the open visit's tries (dart label,
  power, outcome text like "hit the wall", the path(s) to animate), `scores` with each hole's par, the
  last finished hole (its scores and each player's paths, for the scorecard's replay), the config.
  Paths are rounded to whole millimetres.
- **History:** `summarize` ranks by total strokes and gives `strokes`, `toPar`, `holesInOne` per seat;
  `detail` is the scorecard (`holes: { name, par }[]`, `scores[hole][seat]`); `matchStats` gives
  strokes, to par, holes in one, average strokes per hole. Unfinished games (forfeit) rank by total so
  far, holes not played counting `maxStrokes + 1`.
- **Engine:** a module flag `positionalDarts: true` makes the engine reject `add_dart` and `correct_dart`
  without coords for this game.

### Schemas

- `schema/game-ws-v1.json`: a `MinigolfGame` def and a `MinigolfSnapshot` branch of `Snapshot`; `npm run
  gen:api` at the root.
- `schema/api-v1.yaml`: `MinigolfDetail` in the `GameDetail.detail` union.

### Frontend

- **Play page:** a Minigolf tile (glyph "Par 3", "Your dart is the putter. Angle sets direction,
  distance sets power."); `GameSettings` gets a Minigolf section: course (cards with name, holes, par,
  difficulty, as in `Minigolf-Courses.dc.html`, plus "Mixed course"), darts per stroke (3 tries / 1
  dart), max strokes per hole, ball contact, shot delay.
- **Match screen:** `GameDisplay` keeps the socket, header, leave/abort, remote seats and toasts, and
  renders `MinigolfMatch` for a minigolf snapshot:
  - player rows (strokes this hole, total, to par, "Putting" / "In the cup" / "Done"), the hole in the
    centre (the bench's `HoleView`, other balls faded), a hole card (number, name, par), the dartboard
    for aiming with the legend ("angle = direction, distance = power"), "This hole N / max M";
  - try slots for the open visit ("S20 · hit the wall", "S1 · 78%", "Retry optional"); Undo and
    Next (takeout) as in other games;
  - the ball animates along the current try's path after the shot delay; knocked balls animate too.
  - 2 players: board centre, one panel per side; 3+: board to the side, stacked rows (AGENTS.md).
- **Scorecard between holes:** a client-side overlay when a snapshot shows the hole changed: the table
  of holes × players with par, totals, under/over par colours, each player's path on the finished hole,
  "Up next: hole N, name, par", "X tees off first", and an 8-second countdown or "Next hole now". The
  game itself is already on the next hole; darts thrown meanwhile count there and close the overlay.
- **Win screen** shows the final scorecard. **Match details** (History) show the scorecard and the match
  stats; the per-hole replay and the Minigolf stats page are sub-project 4.

## Performance

A putt simulates in about 7 ms. A long game (4 players, 9 holes, ~5 strokes, 3 tries) is ~540 putts,
about 4 s to rebuild on restart or for its history detail. Acceptable for now; since `simulateShot` is
pure, results can be cached by input later.

## Testing

- **Core:** `simulateShot` with `others`: a ball in the path gets knocked; a knocked ball can drop; no
  `others` gives the same results as before (golden shots unchanged).
- **Module** (reducer tests with fixture holes and scripted darts): tries replace each other and takeout
  keeps the last; 1 try ignores later darts; a miss counts and keeps the ball; turn rotation skips
  players in the cup; max strokes scores max + 1; hole end orders the next hole by score with ties
  keeping order; game end and placements with ties; ball contact knocks a ball in and it counts;
  corrections re-simulate; `init` copies holes and physics; `mixed` draws holes with the seeded rng;
  `summarize` on an unfinished game.
- **Engine:** `add_dart`/`correct_dart` without coords rejected for minigolf.
- **Frontend:** the try-slot labels, the scorecard overlay's show/hide logic, settings defaults.
- **e2e:** start a Minigolf game alone with manual entry, click the board, take out, see the stroke
  counted and the turn pass.

## Out of scope

Bots, teams, real courses and the Minigolf stats page (sub-project 4), the per-hole replay in match
details, moving obstacles, caching simulation results.
