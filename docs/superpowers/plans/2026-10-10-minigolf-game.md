# Minigolf game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Minigolf as a playable dartcade game: set it up on the Play page, play it in a lobby with
board or click input, see the scorecard between holes, and find the result in History.

**Architecture:** A pure `GameModule` (`backend/src/games/minigolf.ts`) on top of the shared core,
wired into the engine, snapshot schema and history like X01/ATC. The match screen is a separate
`MinigolfMatch` component that `GameDisplay` renders for a minigolf snapshot.

**Tech Stack:** TypeScript, nape-js (via the core), Fastify engine, JSON Schema + generated zod/TS,
Svelte 5, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-minigolf-game-design.md`

## Global Constraints

- The module is a pure reducer: `onBoardEvent`/`view` depend only on state and event; `view` never simulates.
- The engine refolds the whole open visit from `committedState` on every input (`session/apply.ts:60-64`), so `onBoardEvent` re-runs every try of the visit: putts go through a result cache keyed by their inputs.
- Holes and physics are copied into the state at `init`.
- Every view has `winner` (`number | null`) and `currentPlayer`; `visitLocked` locks further darts.
- `maxStrokes + 1` for a hole not finished within `maxStrokes`.
- Commits: conventional, lower case, < 72 chars, with the session's attribution lines; `npm run format` at the root before each commit; `npm run gen:api` after any schema change.

## Review Focus

- A takeout with no darts (the engine fills 3 Miss darts, `apply.ts:147-158`) must count as one missed stroke, not three. Test in Task 2.
- Ball contact with balls still on the tee: balls that haven't been played yet are not on the felt, so they can't be hit. Test in Task 2.
- A correction of an earlier try must re-simulate from the visit's starting balls, not from the last try's result. Test in Task 2.
- A snapshot for a third game must validate against the schema (`checkSnapshot` throws under test). Test in Task 4.
- Every frontend place keyed by `x01`/`atc` must not show X01 fields for a minigolf lobby or game (Play page config, lobby summary, history line). Test in Task 5.

---

### Task 1: core: other balls, ball bounce, mixed holes

**Files:**

- Modify (already prototyped in the working tree): `backend/src/shared/minigolf/types.ts` (`OtherBall`, `MovedBall`, `ShotResult.others`), `simulate.ts` (multi-ball loop, `BALL_BOUNCE = 0.9`, surfaces `2r - 0.9`)
- Modify: `backend/src/shared/minigolf/courses/index.ts` (`mixedHoles`)
- Test: `simulate.test.ts`, `courses/courses.test.ts`

**Interfaces:**

- `simulateShot(hole, physics, ball, shot, others: readonly OtherBall[] = []): ShotResult`; `ShotResult.others?: MovedBall[]` (only balls that moved > 0.5 mm or dropped; each path on the putt's 60 Hz timeline)
- `mixedHoles(rng: Rng): Hole[]`: up to 9 distinct holes from all `COURSES`, order from `rng` (`Rng` from `backend/src/session/rng.ts` is `() => number`; use a local Fisher–Yates so `shared/` doesn't import the session code)

- [ ] **Step 1: Tests**

```ts
  it('knocks a ball in the way and passes on most of its speed', () => {
    const r = simulateShot(lane, P, [200, 3000], up(0.4), [{ id: 2, at: [200, 2500] }, { id: 3, at: [50, 3500] }])
    expect(r.others?.map(o => o.id)).toEqual([2]) // the ball off to the side didn't move
    const knocked = r.others![0]
    expect(knocked.rest[1]).toBeLessThan(2500 - 300)
    expect(r.rest[1]).toBeGreaterThan(knocked.rest[1])
    expect(knocked.path.length).toBeLessThanOrEqual(r.path.length + 1)
  })
  it('knocks a ball into the cup', () => {
    const r = simulateShot(lane, P, [200, 900], up(700 / P.maxRoll), [{ id: 2, at: [200, 420] }])
    expect(r.others?.[0]).toMatchObject({ id: 2, holed: true, rest: lane.cup.at })
  })
  it('lists no others when none were passed', () => {
    expect(simulateShot(lane, P, lane.tee, up(0.3)).others).toBeUndefined()
  })
```

and in `courses.test.ts`:

```ts
  it('draws mixed holes from every course without repeats', () => {
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const holes = mixedHoles(rng)
    const all = COURSES.flatMap(c => c.holes)
    expect(holes.length).toBe(Math.min(9, all.length))
    expect(new Set(holes.map(h => h.id)).size).toBe(holes.length)
  })
```

- [ ] **Step 2: Run** `cd backend && npx vitest run src/shared/minigolf`; fix until green; the golden snapshot must be unchanged.

- [ ] **Step 3: Implement `mixedHoles`**

```ts
/** Up to 9 holes from all courses, in random order (the "Mixed course"). */
export function mixedHoles(rng: () => number): Hole[] {
  const all = COURSES.flatMap(c => c.holes)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[all[i], all[j]] = [all[j], all[i]]
  }
  return all.slice(0, 9)
}
```

Hole ids must be unique across courses: prefix them with the course id in `test.ts` (`test-straight`, …) and update the golden snapshot names accordingly (only the test names change).

- [ ] **Step 4: Commit** `feat(minigolf): let a putt knock other balls`.

---

### Task 2: the game module (rules)

**Files:**

- Create: `backend/src/games/minigolf.ts`, `backend/src/games/minigolfShots.ts` (cached putts)
- Test: `backend/src/games/minigolf.test.ts`

**Interfaces:**

- `export type MinigolfConfig = { course: string; tries: 1 | 3; maxStrokes: number; ballContact: boolean; shotDelay: number }`
- `export const minigolfModule: GameModule<MinigolfState, MinigolfConfig, MinigolfView, 'minigolf', MinigolfDetail>` (`MinigolfView`/`MinigolfDetail` types come from Tasks 3–4; until then type the view locally as `MinigolfViewData` and export it).
- `cachedShot(hole, physics, ball, shot, others): ShotResult` (Map of the last 256 results, key `JSON.stringify([hole, physics, ball, shot, others])`).

**State:**

```ts
type BallState = { at: Pt; strokes: number; status: 'waiting' | 'playing' | 'holed' | 'done'; paths: Pt[][] }
type Try = { dart: { label: string; coords: { x: number; y: number } | null }; result: ShotResult | null; power: number | null }
export type MinigolfState = {
  cfg: MinigolfConfig
  courseName: string
  holes: Hole[]
  physics: Physics
  holeIdx: number
  order: number[]          // seats in turn order for this hole
  current: number          // the seat whose turn it is
  balls: BallState[]       // per seat, this hole
  scores: (number | null)[][] // [hole][seat]
  visitStart: { balls: Pt[] } | null
  tries: Try[]             // the open visit's tries
  lastHole: { index: number; scores: number[]; paths: Pt[][][] } | null
  finished: boolean
  playerCount: number
}
```

`status`: `waiting` = not putted yet on this hole (ball in hand, not on the felt), `playing`, `holed`,
`done` (max strokes reached). The ball of a `waiting` seat is drawn on the tee only for the current
player.

**Rules in `onBoardEvent`:**

- `visit.opened`: `visitStart = { balls: balls.map(b => b.at) }`, `tries = []`.
- `dart.detected`: ignored if finished, or `tries.length >= cfg.tries`, or (with 1 try) a try exists.
  Otherwise from `visitStart` (or the current balls if missing): `shot = shotFromDart(dart.coords ?? null, ball, cup, physics)`;
  `others` = when `ballContact`, every other seat with status `playing` (`{ id: seat, at }`); result =
  `shot ? cachedShot(...) : null`. Append the try; balls don't change until takeout.
- `takeout.finished` / `visit.cleared`: commit the **last** try (the engine's empty takeout fills 3
  Miss darts: with 3 tries the last is a miss; with 1 try the first): current seat `strokes + 1`,
  `at = result.rest` (miss: unchanged), `paths.push(result?.path ?? [at])`; `holed` → `holed`, else
  `strokes >= maxStrokes` → `done`, else `playing`. Each moved other ball: `at = rest`; `holed` →
  `holed` (strokes unchanged). Clear `tries`/`visitStart`. Then next seat: the next in `order` after
  `current` (wrapping) whose status is `waiting` or `playing`; if none, end the hole.
- **End of hole:** `scores[holeIdx][s] = status === 'holed' ? strokes : maxStrokes + 1`; `lastHole`
  = this hole's scores and each seat's `paths`; if it was the last hole: `finished = true`; else
  `holeIdx + 1`, `order` = stable sort of `order` by this hole's score, every ball `{ at: tee, strokes: 0,
  status: 'waiting', paths: [] }`, `current = order[0]`.
- `view.visitLocked` = finished, or `tries.length >= cfg.tries` (1 try: after the first dart).
- `winner` (view) = `finished` ? the seat with the lowest total (lowest seat index on ties) : `null`.

**Totals:** `total(s)` = sum of written scores; `toPar(s)` = total − sum of par over holes with a
written score for `s` (all seats score together, so: holes before `holeIdx`, or all when finished).

- [ ] **Step 1: Write the reducer tests** (`minigolf.test.ts`), driving events directly:

```ts
import { describe, it, expect } from 'vitest'
import { minigolfModule as M, type MinigolfConfig, type MinigolfState } from './minigolf.js'
import type { BoardEvent, Player } from '../session/types.js'

const players: Player[] = [{ name: 'A' }, { name: 'B' }]
const cfg = (over: Partial<MinigolfConfig> = {}): MinigolfConfig => ({ ...M.defaultConfig, course: 'test', ...over })
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
/** A dart at board coords (r = 1 at the double wire, y up); null = a bounce-out. */
const dart = (coords: { x: number; y: number } | null, i = 0): BoardEvent => ({
  kind: 'dart.detected',
  data: {
    visit_id: 'v', index: i, source_seq: 0,
    dart: coords ? { segment: { name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 }, score: 20, coords } : { segment: { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }, score: 0 },
  },
} as BoardEvent)
const play = (s: MinigolfState, events: BoardEvent[]) => events.reduce((st, e) => M.onBoardEvent(st, e).state, s)
const visit = (s: MinigolfState, darts: BoardEvent[]) => play(s, [opened, ...darts, takeout])
```

Test cases (each a separate `it`):

- `init` copies the test course's holes and `DEFAULT_PHYSICS`, seat order, everyone `waiting` on the tee; `course: 'mixed'` uses the rng (same seed → same holes).
- with 3 tries, three darts then takeout: one stroke, the ball where the **third** try left it; the view lists three tries before the takeout.
- with 1 try, a second dart is ignored and `visitLocked` is true after the first.
- a takeout with no darts (three Miss darts, as the engine sends): one stroke, ball stays.
- turns rotate A → B → A; a holed player is skipped (force a hole-in-one with a bull dart from right in front of the cup: `placeBall` via a state edit in the test is fine).
- max strokes: with `maxStrokes: 3`, three misses → `done`, score 4.
- hole end: scores written, `lastHole` set, next hole's order puts the better score first, ties keep order, balls back to `waiting` on the new tee.
- game end after the last hole: `finished`, `winner` = lowest total; `summarize` placements tie on equal totals (1, 1).
- ball contact on: B's ball (playing) in A's line gets knocked; a knocked ball that drops is `holed` with its strokes; `waiting` balls are never in the simulation.
- a correction (replace the first dart's coords and refold from `committedState`) re-simulates from `visitStart`.
- `summarize` on an unfinished game: unplayed holes count `maxStrokes + 1`.

- [ ] **Step 2: Run to see them fail.** `cd backend && npx vitest run src/games/minigolf.test.ts`

- [ ] **Step 3: Implement `minigolfShots.ts` and `minigolf.ts`** per the rules above. `configMeta`:
      `course` (options from `COURSES` plus `{ value: 'mixed', label: 'Mixed course' }`), `tries` (`3 tries` / `1 dart`), `maxStrokes`
      (label "Max strokes per hole"), `ballContact` (Off/On, tooltip "Balls can knock each other; one
      knocked into the cup counts"), `shotDelay` (label "Shot delay", tooltip from the design). `validate`:
      unknown course → `'Unknown course'`; `maxStrokes` outside 3..10 → reason. `version: 1`.
      `getCurrentPlayer = s.current`. `onUserAction` returns the state unchanged. Dart labels: the
      segment's `name` (`S20`, `D5`, `25`, `Bull`, `Miss`).

- [ ] **Step 4: Run until green; commit** `feat(minigolf): add the game rules`.

---

### Task 3: history: summary, detail, match stats

**Files:**

- Modify: `backend/src/games/minigolf.ts` (`summarize`, `detail`, `matchStats`), `schema/api-v1.yaml` (`MinigolfDetail`, `GameDetail.detail` oneOf + discriminator `minigolf`), `backend/src/session/types.ts` (`MinigolfDetail` alias), `backend/src/history/detail.ts:12` (union)
- Test: `minigolf.test.ts`, `backend/src/games/detail.contract.test.ts` (minigolf case)

**Interfaces:**

- `MinigolfDetail`: `{ mode: 'minigolf', course: string, holes: { name: string; par: number }[], scores: (integer | null)[][] /* [hole][seat] */ }`
- `summarize` stats per seat: `strokes` (total, unplayed holes at max + 1), `toPar`, `holesInOne`, `holesPlayed`.
- `matchStats` rows: `strokes` ("Strokes", integer, lower better), `toPar` ("To par", integer, lower), `holesInOne` ("Holes in one", integer, higher), `avgStrokes` ("Strokes per hole", decimal, lower). Use the helpers in `games/matchStats.ts`.

- [ ] **Step 1:** Add `MinigolfDetail` to `schema/api-v1.yaml` next to `AtcDetail`, add it to the `GameDetail.detail` oneOf and the discriminator mapping; `npm run gen:api` at the root.
- [ ] **Step 2:** Tests: `summarize` for a finished 2-seat game (placements, stats), the detail contract test validates `minigolfModule.detail(...)` and `matchStats` against their schemas.
- [ ] **Step 3:** Implement; run `npx vitest run src/games src/history`; commit `feat(minigolf): summarize games for the history`.

---

### Task 4: engine and snapshot wiring

**Files:**

- Modify: `schema/game-ws-v1.json` (`MinigolfGame`, `MinigolfSnapshot`, `Snapshot` oneOf), `backend/src/session/views.ts` (`MinigolfView`), `backend/src/session/types.ts` (`AnyGameModule` branch, `positionalDarts?: true` on `GameModule`), `backend/src/session/engine.ts:556-559` (explicit `atc`/`x01`/`minigolf` branches), `backend/src/session/apply.ts` (`add_dart`/`correct_dart`: return `NONE` when `module.positionalDarts` and the action has no coords), `backend/src/games/index.ts` (register, after X01), `backend/src/games/index.test.ts`
- Regenerate: `npm run gen:api`
- Test: `backend/src/session/snapshot.contract.test.ts` (play a minigolf game through the engine), an apply test for the coords rule

**`MinigolfGame` schema** (all required, `additionalProperties: false`; `Pt` = `[number, number]`):
`winner` (integer|null), `finished`, `currentPlayer`, `visitLocked`, `config` (`MinigolfConfig`), `courseName`,
`holeIdx`, `holeCount`, `hole` (`MinigolfHole`: id, name, par, outline, walls, bumpers, slopes, tee, cup —
mirror `types.ts`), `pars` (integer[]), `holeNames` (string[]), `order` (integer[]), `balls`
(`{ at: Pt, strokes, status: waiting|playing|holed|done }[]`), `scores` ((integer|null)[][]), `totals`
(integer[]), `toPar` (integer[]), `tries` (`{ label, coords: Coords|null, power: number|null, holed: boolean,
missed: boolean, path: Pt[], others: { seat, path: Pt[], holed }[] }[]`), `lastHole` (`{ index, scores:
integer[], paths: Pt[][][] }` | null), plus the engine fields `currentVisitDarts`, `totalDarts`,
`totalVisits` as in `AtcGame`. Paths are rounded to whole millimetres in `view`.

- [ ] **Step 1:** Schema + `npm run gen:api`; `MinigolfView = Omit<MinigolfGame, EngineViewField>` in `views.ts`; module typed with it.
- [ ] **Step 2:** Engine branch, `positionalDarts`, registration.
- [ ] **Step 3:** Tests: the snapshot contract test plays a short minigolf game (manual darts with coords, takeout) and every snapshot validates; `add_dart` without coords leaves a minigolf game unchanged; `GET /api/gamemodes` lists minigolf (games/index.test.ts).
- [ ] **Step 4:** `TEST_DATABASE_URL=… npm test` in `backend`, typecheck, lint; commit `feat(minigolf): play minigolf games in the engine`.

---

### Task 5: frontend plumbing (setup, lobby, history lines)

**Files:**

- Modify: `lib/gameModes.ts` (tile: id `minigolf`, glyph `Par 3`, name `Minigolf`, desc "Your dart is the putter. Angle sets direction, distance sets power."), `lib/gameState.ts` (`minigolf` field), `lib/ws.ts` if it maps games, `routes/CreateSession.svelte:47-56` (`gameDefaults`), `lib/lobby/play.ts:52-70` (`chosenGame`: keep minigolf's own config keys), `lib/components/GameSettings.svelte` (a minigolf section), `lib/gameViews/index.ts` + `meta.ts` (title "Minigolf", meta line "Canal Street · Hole 4 of 9 · 3 tries per stroke"), `lib/history.ts` (`rulesLine`, `historyStat`, `statTiles`), `lib/lobby/format.ts` (`rulesLine`), `lib/components/lobby/NextGameSummary.svelte`, `lib/details/page.ts` (`headline`), `lib/turn.ts`, `lib/components/SettingsDrawer.svelte` (no X01/ATC-only options for minigolf), `lib/winScreen.ts` (a `minigolf` mode: winner, totals, to par)
- Test: the existing tests of each touched helper get a minigolf case (`lib/__tests__/…`)

**GameSettings minigolf section** (`Play-Minigolf.dc.html`, `Minigolf-Courses.dc.html`): course as cards
(name; "N holes · par P"; "Mixed course: 9 random holes from all courses"), "Darts per stroke" segmented
(3 tries / 1 dart, help "A new dart replaces your last shot. Pull the darts to keep it."), "Max strokes per
hole" stepper (3–10), "Ball contact" segmented (Off / On), "Shot delay" stepper (Off, 1–5 s, help from the
design; hidden with 1 dart). Values from `configMeta`/`defaults`; changes through `onchange(key, value)`.
Course names/holes/par come from a small `GET`-free import of `$shared/minigolf/courses/index` (the
frontend already uses `$shared`).

- [ ] Steps: tests for each helper's minigolf case → implement → `npm test`, typecheck, lint → commit `feat(minigolf): set up minigolf games on the play page`.

---

### Task 6: the match screen

**Files:**

- Create: `lib/components/minigolf/MinigolfMatch.svelte`, `MinigolfPlayers.svelte` (rows), `TrySlots.svelte`, `lib/minigolf/match.ts` (pure helpers: row model, try slot labels, which balls to draw, animation plan)
- Modify: `routes/GameDisplay.svelte` (`minigolf` derived; `{:else if minigolf}<MinigolfMatch …/>` before the "Unsupported game" branch; `game` includes minigolf; skip x01/atc-only sounds/caller), `lib/components/minigolf/HoleView.svelte` (props `others: { at: Pt; label: string }[]` drawn faded with an initial, `animate: { own: Pt[]; others: { seat: number; path: Pt[] }[] } | null`)
- Test: `lib/__tests__/minigolfMatch.test.ts`

**`lib/minigolf/match.ts`:**

- `rows(view, players)`: per seat in `order`: name, strokes this hole, total, to par (`+1`, `−1`, `E`), status text ("Putting" for `currentPlayer`, "In the cup", "Done", "Waiting").
- `trySlots(view)`: `cfg.tries` slots; each try: `{ label: 'S20', note: holed ? 'In the cup' : missed ? 'Missed the board' : `${Math.round(power * 100)}%`, replaced: i < tries.length - 1 }`; empty slots "Retry optional" (3 tries) or "Throw" (1 dart).
- `ballsToDraw(view)`: every seat with status `playing`/`holed`-not-drawn… precisely: `playing` balls; the current player's ball even when `waiting` (on the tee); holed balls are not drawn.
- `animationFor(prev, next)`: when `next.tries` gained a try (or its last try changed), the new try's paths; when the visit was committed (tries emptied, a stroke counted) nothing (the ball is already at rest).

**`MinigolfMatch.svelte`:** props `view`, `players`, `canThrow`, `locked`, `onBoardClick`,
`onUndo`, `onNext`, `shotDelay`. Layout: 2 players: board centre with one panel per side; 3+: hole centre,
player rows stacked on the left, hole card + dartboard on the right (`Minigolf.dc.html`). The dartboard
(`DartBoard` with `onBoardClick` for manual entry when `canThrow && !locked`, darts drawn at their coords)
has the legend "Angle from the bull = direction · Distance from the bull = power". "This hole N / max M".
Animation: on a new try, wait `shotDelay` s (0 with 1 dart) with no newer try, then `playPath` the own path
and the knocked balls' paths together (reduced motion: jump).

- [ ] Steps: helper tests → implement helpers → components → GameDisplay branch → run the dev stack, play a 2-player game with clicks (and a board if available) → `npm test`, typecheck, lint → commit `feat(minigolf): add the minigolf match screen`.

---

### Task 7: scorecard, win screen, match details

**Files:**

- Create: `lib/components/minigolf/Scorecard.svelte` (table: holes × players, par row, totals, to par; under par lime, over par muted red; aces marked "ACE"), `lib/components/minigolf/ScorecardOverlay.svelte`, `lib/minigolf/scorecard.ts` (overlay state: when to show/hide)
- Modify: `MinigolfMatch.svelte` (overlay), `lib/components/WinScreen.svelte` / `lib/winScreen.ts` (minigolf: final scorecard), `routes/GameDetails.svelte` (minigolf block: `Scorecard` from `detail.scores`)
- Test: `lib/__tests__/minigolfScorecard.test.ts`

**Overlay rules (`scorecard.ts`):** show when a snapshot's `holeIdx` is greater than the previous one's
(and not on the first snapshot after load); content from `lastHole`: the table up to that hole, each
player's paths on it (faded colours per seat on the finished hole's `HoleView`), "Up next · Hole N · name ·
Par P", "`<name>` tees off first: best score on the last hole." (or "… first" without the reason when tied
with the previous order), "Starting in 0:08" counting down, "Next hole now" closes it; it also closes
when a try appears in the new hole. The game's finish shows the win screen instead.

- [ ] Steps: overlay-state tests → implement → components → win screen and details → verify in the dev
      stack (finish a 3-hole game) → tests, typecheck, lint → commit `feat(minigolf): show the scorecard between holes and at the end`.

---

### Task 8: e2e and finish

- Create: `e2e/tests/game-minigolf.spec.ts`: start Minigolf alone (manual entry), click the board in the
  20, click Next (takeout), see "1" stroke in the player row; finish is not needed.
- Run everything: backend tests (with DB), frontend tests, both typechecks and lints, `npm run format:check`, the new e2e.
- Push the branch and open a draft PR based on `feat/minigolf`.
