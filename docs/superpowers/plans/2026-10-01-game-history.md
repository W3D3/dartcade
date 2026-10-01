# Game History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every game's full input log, normalized darts and per-seat results, restore running games from that log, and show finished games on a History page backed by `/api/games`.

**Architecture:** Every input the engine applies (board event or user action) is appended to `game_session_events` before a pure `applyInput()` applies it; committed visits produce `game_darts` rows and a win writes placements/stats from a new `summarize()` module hook. Restarts and the game detail endpoint both replay the log through the same `applyInput()`. A new `games` API plugin serves game modes (`/api/gamemodes`), the history list, stats and per-mode detail; the frontend adds a History page.

**Tech Stack:** TypeScript, Fastify 4, Kysely + Postgres, zod 4, Vitest, OpenAPI 3.0 (`schema/api-v1.yaml` → `npm run gen:api`), Svelte 5 + Tailwind, openapi-fetch.

**Spec:** `docs/superpowers/specs/2026-10-01-game-history-design.md`

## Global Constraints

- Backend and frontend lint is strict and type-aware: **no type assertions (`as`), no `any`, no non-null `!`** outside `*.test.ts`. Parse untyped data (JSONB, JSON imports) with zod instead of casting.
- Generated files are never edited by hand: `backend/src/schema/{api.ts,api-v1.bundled.json,api-v1.deref.json,zod.ts,game-ws.ts}`, `backend/frontend/src/lib/api/{schema.ts,zod.ts,game-ws.ts}`, `bridge/internal/api/*`. Change `schema/api-v1.yaml`, then run `npm run gen:api` at the repo root.
- The API is contract-first: every route is in `schema/api-v1.yaml` (`src/api/spec.test.ts` checks both ways), handlers use `Route<'operationId'>` and `fromSpec('operationId')`, and responses are validated against the spec outside production.
- Migrations are plain SQL files run by `runMigrations()`: it drops lines starting with `--` and splits on `;`, so **no `;` inside a statement and no `DO $$` blocks**.
- `finished_at` is always written from a JS `Date` (millisecond precision); the history cursor compares it for equality.
- Seats: `game_players.user_id` is set for seat 0 (the creator) only; other seats are guests (`null`). #41 covers linking others.
- `visibility` is always `private`: no endpoint or UI changes it.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Commands: backend tests `cd backend && npm test` (DB tests need `TEST_DATABASE_URL`, see `DEVELOPMENT.md`); `cd backend && npm run typecheck && npm run lint`; frontend `cd backend/frontend && npm test && npm run typecheck && npm run lint`.

## Review Focus

1. **Two inputs for one session at once** (a camera dart arrives while the browser sends `undo_dart`): the log order must equal the order they were applied, or a replay differs from what was played. Task 5 serializes inputs per session and tests it.
2. **A random-order ATC game survives a restart with the same sequence**: today `init()` reshuffles with `Math.random()`. Task 1 seeds the shuffle; Task 3 stores the seed; Task 5 tests a rebuild.
3. **Deleting a board that has finished games** must succeed (games keep `board: null`), while a board with a running game still gets 409. Task 3 tests both.
4. **An X01 match ended by the round limit** can name a winner with fewer legs than someone else: the winner must still be 1st. Task 2 tests it.
5. **Deleting the account that created a game** must keep the game (and every other seat's history); only the creator's seat loses its `user_id`. Task 3 changes the owner FK to `SET NULL` and tests it.

---

## File Structure

Backend (`backend/src/`):

| File | Responsibility |
|---|---|
| `session/rng.ts` (new) | Seeded PRNG for a game's random setup |
| `session/types.ts` | `GameModule` hooks (`version`, `getLeg`, `summarize`, `detail`), history types, `Session` fields |
| `games/ranking.ts` (new) | `rankSeats()` placement helper |
| `games/x01.ts`, `games/atc.ts`, `session/withBullOff.ts` | Hook implementations, `pointsScored`, seeded shuffle |
| `session/apply.ts` (new) | `applyInput()`: pure state transition per input, reports committed visits and wins |
| `session/replay.ts` (new) | `newSession()`, `parseLoggedInput()`, `replay()`, `dartRows()`, `results()` |
| `session/engine.ts` | Append-then-apply, per-session queue, persistence, rebuild from the log |
| `db/migrations/006_game_history.sql` (new) | Schema changes |
| `db/schema.ts`, `db/queries.ts` | Tables, engine store queries, board guard |
| `db/history.ts` (new) | History list, stats rows, viewable game |
| `history/cursor.ts`, `history/stats.ts`, `history/detail.ts` (new) | Cursor codec, stats aggregation, detail by replay |
| `api/games.ts` (new) | `/api/gamemodes`, `/api/games`, `/api/games/stats`, `/api/games/:id` |
| `api/sessions.ts` | Loses `/api/games` |

Frontend (`backend/frontend/src/`):

| File | Responsibility |
|---|---|
| `lib/gameViews/meta.ts` | Config-only `x01Rules` / `atcRules`, reused by the live meta line |
| `lib/history.ts` (new) | Row and tile formatting for the History page |
| `routes/History.svelte` (new) | The page |
| `routes/CreateSession.svelte`, `App.svelte`, `lib/api/index.ts` | `/api/gamemodes`, route, type exports |

---

### Task 1: Seeded random setup

ATC's random order is shuffled with `Math.random()` inside `init()`, so replaying a game (and today's restart) gets a different sequence. `init()` gets an optional generator; the engine passes a seeded one and keeps the seed on the session.

**Files:**
- Create: `backend/src/session/rng.ts`, `backend/src/session/rng.test.ts`
- Modify: `backend/src/session/types.ts` (GameModule.init, Session), `backend/src/games/atc.ts`, `backend/src/session/withBullOff.ts`, `backend/src/session/engine.ts`
- Test: `backend/src/games/atc.test.ts`

**Interfaces:**
- Produces: `type Rng = () => number`, `seededRng(seed: number): Rng`, `newSeed(): number` (in `session/rng.ts`); `GameModule.init(cfg, players, rng?: Rng)`; `buildSequence(cfg, rng?: Rng)`; `Session.seed: number`.

- [ ] **Step 1: Write the failing tests**

`backend/src/session/rng.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { seededRng, newSeed } from './rng.js'

describe('seededRng', () => {
  it('gives the same numbers for the same seed', () => {
    const a = seededRng(42), b = seededRng(42)
    const xs = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(xs)
  })

  it('stays in [0, 1) and differs between seeds', () => {
    const r = seededRng(7)
    for (let i = 0; i < 1000; i++) {
      const x = r()
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(seededRng(1)()).not.toBe(seededRng(2)())
  })

  it('newSeed is a non-negative 31-bit integer', () => {
    const s = newSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 31)
  })
})
```

Append to `backend/src/games/atc.test.ts` (add `import { seededRng } from '../session/rng.js'` at the top):

```ts
describe('random order', () => {
  const cfg = { throwAgainOnAllHit: false, finishOn: 'single_bull', multiplierAdvances: false, order: 'random' } as const

  it('shuffles the same way for the same seed', () => {
    const a = atcModule.init(cfg, [{ name: 'A' }], seededRng(42))
    const b = atcModule.init(cfg, [{ name: 'A' }], seededRng(42))
    expect(a.sequence).toEqual(b.sequence)
    expect(a.sequence).not.toEqual(buildSequence({ ...cfg, order: 'asc' }))
    expect([...a.sequence].sort((x, y) => x - y)).toEqual(buildSequence({ ...cfg, order: 'asc' }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/session/rng.test.ts src/games/atc.test.ts`
Expected: FAIL: cannot find module `./rng.js`.

- [ ] **Step 3: Implement**

`backend/src/session/rng.ts`:

```ts
/** A random number generator: each call gives a number in [0, 1). */
export type Rng = () => number

/**
 * mulberry32: a small deterministic PRNG. A game's random setup (ATC's random order)
 * uses one seeded per game, so replaying the game's log rebuilds the same game.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A fresh seed for a new game. */
export function newSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}
```

In `backend/src/session/types.ts` add `import type { Rng } from './rng.js'` and change `init` in `GameModule`:

```ts
  /** `rng` drives any random setup; the engine passes one seeded per game. */
  init(cfg: Cfg, players: Player[], rng?: Rng): S
```

Add to `Session` (after `createdAt`):

```ts
  /** Seed of the generator passed to init(); stored so a replay sets the game up the same way. */
  seed: number
```

In `backend/src/games/atc.ts`, import `Rng` and thread it through:

```ts
import type { Rng } from '../session/rng.js'

function shuffle(arr: number[], rng: Rng): number[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildSequence(cfg: ATCConfig, rng: Rng = Math.random): number[] {
  // ... unchanged, except:  ordered = shuffle(nums, rng)
}
```

and in `atcModule.init(cfg, players, rng)`: `const sequence = buildSequence(cfg, rng)`.

In `backend/src/session/withBullOff.ts`, `init(cfg, players, rng)` passes it on: `game: game.init(cfg, players, rng)`.

In `backend/src/session/engine.ts` import `{ newSeed, seededRng } from './rng.js'`. In `create()`:

```ts
    const seed = newSeed()
    const initialState = mod.init(config, players, seededRng(seed))
```

and add `seed,` to the `Session` literal. In `rebuild()` (until Task 3 stores the seed) use `const seed = newSeed()` the same way and add `seed` to its `Session` literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/session src/games && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors. Fix any test helper that builds a `Session` literal by adding `seed: 0`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/session/rng.ts backend/src/session/rng.test.ts backend/src/session/types.ts backend/src/games/atc.ts backend/src/games/atc.test.ts backend/src/session/withBullOff.ts backend/src/session/engine.ts
git commit -m "feat(engine): seed a game's random setup so it can be replayed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Game module history hooks (contract types, X01, ATC, bull off)

Adds the detail schemas to the API contract (components only; the paths come in Task 6), the new `GameModule` hooks, `rankSeats()`, X01's running `pointsScored`, and the hook implementations for X01, ATC and the bull off wrapper.

**Files:**
- Modify: `schema/api-v1.yaml` (components), then regenerate
- Modify: `backend/src/session/types.ts`, `backend/src/session/withBullOff.ts`, `backend/src/games/x01.ts`, `backend/src/games/atc.ts`
- Create: `backend/src/games/ranking.ts`, `backend/src/games/ranking.test.ts`, `backend/src/games/history.test.ts`, `backend/src/games/detail.contract.test.ts`
- Modify tests that define fake `GameModule`s (search: `grep -rln "getCurrentPlayer" backend/src --include=*.test.ts`)

**Interfaces:**
- Consumes: `Rng` (Task 1).
- Produces (all in `session/types.ts`):
  ```ts
  export type HistoryDart = components['schemas']['HistoryDart']   // { index, segment, coords: {x,y}|null, source: 'camera'|'manual', corrected, thrownAt: string }
  export type X01Detail = components['schemas']['X01Detail']
  export type AtcDetail = components['schemas']['AtcDetail']
  export type DartSource = HistoryDart['source']
  export type VisitPhase = 'game' | 'bulloff'
  export interface CommittedVisit<S> { visit: number; seat: number; leg: number; phase: VisitPhase; committedAt: string; darts: HistoryDart[]; start: S; end: S; after: S }
  export type SeatResult = { placement: number; stats: Record<string, number> }
  export type SummaryContext = { totalDarts: number[]; totalVisits: number[] }
  // GameModule<S, Cfg, V, Id, D = unknown> gains: version: number; getLeg?(s): number; summarize(s, ctx): SeatResult[]; detail(visits: CommittedVisit<S>[], final: S): D
  // AnyGameModule = GameModule<unknown, GameConfig, X01ModuleView, 'x01', X01Detail> | GameModule<unknown, GameConfig, AtcView, 'atc', AtcDetail>
  ```
  `rankSeats(n: number, winner: number | null, compare: (a: number, b: number) => number): number[]` in `games/ranking.ts`. `X01State.pointsScored: number[]`. `hitCounts(s: ATCState): number[]` exported from `games/atc.ts`.

- [ ] **Step 1: Add the detail schemas to the contract**

In `schema/api-v1.yaml`, under `components.schemas` after `ErrorResponse`, add:

```yaml
    Segment: { $ref: 'common-v1.json#/$defs/Segment' }

    HistoryDart:
      type: object
      required: [index, segment, coords, source, corrected, thrownAt]
      additionalProperties: false
      properties:
        index: { type: integer, minimum: 0, maximum: 2, description: Position in the visit }
        segment: { $ref: '#/components/schemas/Segment' }
        coords:
          type: object
          nullable: true
          required: [x, y]
          additionalProperties: false
          description: Normalised board position (r = 1 at the outer double wire); null for a manual dart without one
          properties:
            x: { type: number }
            y: { type: number }
        source: { type: string, enum: [camera, manual] }
        corrected: { type: boolean, description: A correction (camera or by hand) changed this dart }
        thrownAt: { type: string, format: date-time }
    X01Detail:
      type: object
      required: [mode, legs]
      additionalProperties: false
      properties:
        mode: { type: string, enum: [x01] }
        legs:
          type: array
          items:
            type: object
            required: [leg, starter, winner, visits]
            additionalProperties: false
            properties:
              leg: { type: integer, minimum: 0 }
              starter: { type: integer, minimum: 0, description: Seat that threw first in this leg }
              winner: { type: integer, minimum: 0, nullable: true, description: 'null: the leg was cut short by the round limit' }
              visits:
                type: array
                items:
                  type: object
                  required: [visit, seat, committedAt, darts, scored, remaining, bust]
                  additionalProperties: false
                  properties:
                    visit: { type: integer, minimum: 0 }
                    seat: { type: integer, minimum: 0 }
                    committedAt: { type: string, format: date-time }
                    darts: { type: array, items: { $ref: '#/components/schemas/HistoryDart' } }
                    scored: { type: integer, minimum: 0 }
                    remaining: { type: integer, minimum: 0 }
                    bust: { type: boolean }
    AtcDetail:
      type: object
      required: [mode, visits]
      additionalProperties: false
      properties:
        mode: { type: string, enum: [atc] }
        visits:
          type: array
          items:
            type: object
            required: [visit, seat, committedAt, darts, hits, targetBefore, targetAfter]
            additionalProperties: false
            properties:
              visit: { type: integer, minimum: 0 }
              seat: { type: integer, minimum: 0 }
              committedAt: { type: string, format: date-time }
              darts: { type: array, items: { $ref: '#/components/schemas/HistoryDart' } }
              hits: { type: integer, minimum: 0, maximum: 3 }
              targetBefore: { type: integer, description: 'Target at the start of the visit (1–20, 21 = 25, 22 = bull)' }
              targetAfter: { type: integer, description: Target after the visit; past the last target means finished }
```

Run: `npm run gen:api && npm run lint:api` (repo root). Expected: regenerates, lint reports no errors. If `redocly` warns that these components are unused, that is fine until Task 6.

- [ ] **Step 2: Write the failing tests**

`backend/src/games/ranking.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { rankSeats } from './ranking.js'

const byScoreAsc = (scores: number[]) => (a: number, b: number) => scores[a] - scores[b]

describe('rankSeats', () => {
  it('puts the winner first and ranks the rest from 2nd', () => {
    expect(rankSeats(3, 1, byScoreAsc([40, 0, 100]))).toEqual([2, 1, 3])
  })
  it('lets equal seats share a placement', () => {
    expect(rankSeats(4, 1, byScoreAsc([50, 0, 50, 70]))).toEqual([2, 1, 2, 4])
  })
  it('keeps the winner first even when the order would rank someone above them', () => {
    expect(rankSeats(2, 1, byScoreAsc([0, 100]))).toEqual([2, 1])
  })
  it('a solo game is 1st', () => {
    expect(rankSeats(1, 0, () => 0)).toEqual([1])
  })
  it('without a winner ranks everyone from 1st', () => {
    expect(rankSeats(2, null, byScoreAsc([10, 5]))).toEqual([2, 1])
  })
})
```

`backend/src/games/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { x01Game, x01Module, type X01Config, type X01State } from './x01.js'
import { atcModule, type ATCState } from './atc.js'
import type { CommittedVisit, HistoryDart, BoardEvent, Segment } from '../session/types.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name, number, multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const T20 = seg('T20', 20, 3), S20 = seg('S20', 20, 1), S1 = seg('S1', 1, 1)
const dartEvent = (s: Segment, index: number): BoardEvent =>
  ({ kind: 'dart.detected', data: { visit_id: 'v', index, source_seq: 0, dart: { segment: s, score: s.number * s.multiplier } } })

const cfg: X01Config = { startScore: 301, inMode: 'straight', outMode: 'straight', bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 1 }
const players = [{ name: 'A' }, { name: 'B' }]

function visit(s: X01State, darts: Segment[], closing: 'takeout.finished' | 'visit.cleared' = 'takeout.finished'): X01State {
  let st = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
  darts.forEach((d, i) => { st = x01Game.onBoardEvent(st, dartEvent(d, i)).state })
  return x01Game.onBoardEvent(st, { kind: closing, data: {} }).state
}

describe('X01 pointsScored', () => {
  it('adds what a visit scored and nothing for a bust', () => {
    let s = x01Game.init(cfg, players)
    s = visit(s, [T20, T20, T20])          // A: 180, 121 left
    s = visit(s, [S20])                    // B: 20
    s = visit(s, [T20, T20, T20])          // A: 180 > 121, bust
    expect(s.pointsScored).toEqual([180, 20])
  })
  it('counts a visit closed by visit.cleared and the checkout visit', () => {
    let s = x01Game.init(cfg, players)
    s = visit(s, [T20, T20, T20])          // A 121 left
    s = visit(s, [S1], 'visit.cleared')    // B: 1
    s = visit(s, [T20, T20, S1])           // A checks out 121
    expect(s.pointsScored).toEqual([301, 1])
    expect(s.winner).toBe(0)
  })
})

describe('X01 summarize', () => {
  const base = x01Game.init({ ...cfg, firstTo: 3 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])
  it('ranks by legs, then remaining score, winner first', () => {
    const s = { ...base, legs: [1, 3, 0], scores: [40, 0, 100], winner: 1, pointsScored: [300, 900, 150] }
    const r = x01Game.summarize(s, { totalDarts: [12, 30, 9], totalVisits: [4, 10, 3] })
    expect(r.map(x => x.placement)).toEqual([2, 1, 3])
    expect(r[1].stats).toEqual({ average: 90, dartsThrown: 30, legsWon: 3, pointsScored: 900 })
    expect(r[2].stats.average).toBeCloseTo(50)
  })
  it('keeps a round-limit winner with fewer legs first', () => {
    const s = { ...base, playerCount: 2, legs: [2, 0], scores: [200, 20], winner: 1, pointsScored: [0, 0] }
    expect(x01Game.summarize(s, { totalDarts: [0, 0], totalVisits: [0, 0] }).map(x => x.placement)).toEqual([2, 1])
  })
  it('an average without darts is 0', () => {
    const s = { ...base, playerCount: 1, legs: [1], scores: [0], winner: 0, pointsScored: [0] }
    expect(x01Game.summarize(s, { totalDarts: [0], totalVisits: [0] })[0].stats.average).toBe(0)
  })
})

const hd = (s: Segment, index: number): HistoryDart =>
  ({ index, segment: s, coords: null, source: 'camera', corrected: false, thrownAt: '2026-10-01T10:00:00.000Z' })

describe('X01 detail', () => {
  const c2 = { ...cfg, firstTo: 2 }
  const s0 = x01Game.init(c2, players)
  const cv = (visit: number, seat: number, leg: number, start: X01State, end: X01State, after: X01State, darts: HistoryDart[], phase: 'game' | 'bulloff' = 'game'): CommittedVisit<X01State> =>
    ({ visit, seat, leg, phase, committedAt: '2026-10-01T10:00:00.000Z', darts, start, end, after })

  it('groups visits by leg with starter, winner, scored, remaining and bust', () => {
    const v0end = { ...s0, scores: [121, 301] }
    const v0after = { ...v0end, currentPlayer: 1 }
    const v1end = { ...v0after, scores: [121, 301], bustThisVisit: true }
    const v1after = { ...v1end, currentPlayer: 0, bustThisVisit: false }
    const v2end = { ...v1after, scores: [0, 301] }
    const v2after = { ...v2end, legs: [1, 0], scores: [301, 301] }
    const d = x01Game.detail([
      cv(0, 0, 0, s0, v0end, v0after, [hd(T20, 0), hd(T20, 1), hd(T20, 2)]),
      cv(1, 1, 0, v0after, v1end, v1after, [hd(T20, 0)]),
      cv(2, 0, 0, v1after, v2end, v2after, [hd(T20, 0), hd(T20, 1), hd(S1, 2)]),
      cv(3, 1, 1, v2after, v2after, v2after, []),
    ], v2after)
    expect(d.mode).toBe('x01')
    expect(d.legs).toHaveLength(2)
    expect(d.legs[0]).toMatchObject({ leg: 0, starter: 0, winner: 0 })
    expect(d.legs[0].visits.map(v => [v.seat, v.scored, v.remaining, v.bust])).toEqual([[0, 180, 121, false], [1, 0, 301, true], [0, 121, 0, false]])
    expect(d.legs[1]).toMatchObject({ leg: 1, starter: 1, winner: null })
  })

  it('leaves bull off visits out', () => {
    const d = x01Game.detail([cv(0, 1, 0, s0, s0, s0, [hd(S20, 0)], 'bulloff')], s0)
    expect(d.legs).toEqual([])
  })
})

describe('withBullOff passes the hooks to the game', () => {
  it('summarize, getLeg, detail and version', () => {
    const wrapped = x01Module.init({ ...cfg, bullOff: 'off' }, players)
    const inner = { ...wrapped.game, legs: [1, 0], winner: 0 }
    const s = { ...wrapped, game: inner }
    expect(x01Module.version).toBe(x01Game.version)
    expect(x01Module.getLeg?.(s)).toBe(1)
    expect(x01Module.summarize(s, { totalDarts: [3, 3], totalVisits: [1, 1] }).map(r => r.placement)).toEqual([1, 2])
    const d = x01Module.detail([{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [], start: wrapped, end: wrapped, after: wrapped }], wrapped)
    expect(d.legs[0].visits[0]).toMatchObject({ seat: 0, scored: 0, remaining: 301 })
  })
})

describe('ATC summarize and detail', () => {
  const cfgAtc = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' } as const
  const s0 = atcModule.init(cfgAtc, [{ name: 'A' }, { name: 'B' }, { name: 'C' }])

  it('ranks by targets completed, then fewer darts, winner first', () => {
    const s: ATCState = { ...s0, targets: [21, 5, 5], winner: 0 }
    const r = atcModule.summarize(s, { totalDarts: [40, 30, 33], totalVisits: [14, 10, 11] })
    expect(r.map(x => x.placement)).toEqual([1, 2, 3])
    expect(r[0].stats).toEqual({ dartsThrown: 40, targetsHit: 20 })
    expect(r[1].stats).toEqual({ dartsThrown: 30, targetsHit: 4 })
  })

  it('describes each visit: hits and targets before/after', () => {
    const start: ATCState = { ...s0, currentVisitHits: [] }
    const end: ATCState = { ...s0, targets: [3, 1, 1], currentVisitHits: [true, false, true] }
    const d = atcModule.detail([{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [hd(S1, 0)], start, end, after: end }], end)
    expect(d).toEqual({ mode: 'atc', visits: [{ visit: 0, seat: 0, committedAt: '2026-10-01T10:00:00.000Z', darts: [hd(S1, 0)], hits: 2, targetBefore: 1, targetAfter: 3 }] })
  })
})
```

`backend/src/games/detail.contract.test.ts` (checks module output against the contract, like `snapshot.contract.test.ts` does for snapshots):

```ts
import { describe, it, expect } from 'vitest'
import { Ajv } from 'ajv'
import addFormatsModule from 'ajv-formats'
import spec from '../schema/api-v1.deref.json' with { type: 'json' }
import { x01Game } from './x01.js'
import { atcModule } from './atc.js'

const addFormats = addFormatsModule.default
const ajv = new Ajv({ strict: false, allErrors: true })
addFormats(ajv)
const schemas: Record<string, object> = spec.components.schemas
const dart = { index: 0, segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, coords: { x: 0.1, y: 0.2 }, source: 'camera', corrected: true, thrownAt: '2026-10-01T10:00:00.000Z' } as const

describe('module detail() matches schema/api-v1.yaml', () => {
  it('X01Detail', () => {
    const s = x01Game.init({ startScore: 301, inMode: 'straight', outMode: 'double', bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 1 }, [{ name: 'A' }])
    const end = { ...s, scores: [241] }
    const d = x01Game.detail([{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end, after: end }], end)
    const validate = ajv.compile(schemas.X01Detail)
    expect(validate(d), JSON.stringify(validate.errors)).toBe(true)
  })
  it('AtcDetail', () => {
    const s = atcModule.init({ throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' }, [{ name: 'A' }])
    const d = atcModule.detail([{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end: s, after: s }], s)
    const validate = ajv.compile(schemas.AtcDetail)
    expect(validate(d), JSON.stringify(validate.errors)).toBe(true)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/games`
Expected: FAIL: `./ranking.js` missing, `summarize`/`detail`/`pointsScored` undefined.

- [ ] **Step 4: Implement**

`backend/src/games/ranking.ts`:

```ts
/**
 * 1-based placements per seat. The winner is always 1st (a game can name a winner the
 * order alone wouldn't, e.g. X01's round limit); the others are ranked by `compare`
 * (negative: `a` ahead of `b`) from 2nd on, and seats `compare` finds equal share a
 * placement (1, 2, 2, 4).
 */
export function rankSeats(n: number, winner: number | null, compare: (a: number, b: number) => number): number[] {
  const placements = Array<number>(n).fill(0)
  if (winner !== null) placements[winner] = 1
  const first = winner === null ? 1 : 2
  const rest = Array.from({ length: n }, (_, i) => i).filter(i => i !== winner).sort(compare)
  rest.forEach((seat, k) => {
    const prev = rest[k - 1]
    placements[seat] = k > 0 && compare(prev, seat) === 0 ? placements[prev] : first + k
  })
  return placements
}
```

In `backend/src/session/types.ts` add the history types and hooks:

```ts
import type { components } from '../schema/api.js'

/** A dart of a committed visit, as the history keeps it. */
export type HistoryDart = components['schemas']['HistoryDart']
export type DartSource = HistoryDart['source']
export type X01Detail = components['schemas']['X01Detail']
export type AtcDetail = components['schemas']['AtcDetail']
export type VisitPhase = 'game' | 'bulloff'

/** A visit as it was committed, with the game state around it (see applyInput). */
export interface CommittedVisit<S> {
  /** Per-session visit number, from 0. */
  visit: number
  seat: number
  leg: number
  phase: VisitPhase
  committedAt: string
  darts: HistoryDart[]
  /** State after the visit's visit.opened. */
  start: S
  /** State after its last dart, before it was committed. */
  end: S
  /** State once committed. */
  after: S
}

/** One seat's result once a game is won. */
export type SeatResult = { placement: number; stats: Record<string, number> }

/** Counts the engine keeps per seat (bull off excluded). */
export type SummaryContext = { totalDarts: number[]; totalVisits: number[] }
```

Extend `GameModule` with a fifth type parameter and the hooks:

```ts
export interface GameModule<S, Cfg = Record<string, never>, V extends object = Record<string, unknown>, Id extends string = string, D = unknown> {
  id: Id
  /** Bumped when a rule change would replay old games' logs differently. */
  version: number
  // ... existing members unchanged ...
  /** The leg the current visit belongs to (0-based); single-leg games leave it out. */
  getLeg?(s: S): number
  /** The result once the game is won: one entry per seat, in seat order. */
  summarize(s: S, ctx: SummaryContext): SeatResult[]
  /** The game's detail for GET /api/games/:id, built from its replayed visits. */
  detail(visits: CommittedVisit<S>[], final: S): D
}

export type AnyGameModule =
  | GameModule<unknown, GameConfig, X01ModuleView, 'x01', X01Detail>
  | GameModule<unknown, GameConfig, AtcView, 'atc', AtcDetail>
```

In `backend/src/session/withBullOff.ts`, add the `D` parameter (`withBullOff<S, Cfg extends BullOffGameConfig, V extends object, Id extends string, D>(game: GameModule<S, Cfg, V, Id, D>, ...): GameModule<WithBullOffState<S>, Cfg, V & BullOffViewField, Id, D>`) and pass the hooks to the inner game:

```ts
    version: game.version,
    getLeg: s => game.getLeg?.(s.game) ?? 0,
    summarize: (s, ctx) => game.summarize(s.game, ctx),
    // Bull off visits stay in the list (phase 'bulloff'); the game decides what to show
    detail: (visits, final) => game.detail(
      visits.map(v => ({ ...v, start: v.start.game, end: v.end.game, after: v.after.game })),
      final.game,
    ),
```

In `backend/src/games/x01.ts`:
- Add `pointsScored: number[]` to `X01State` (comment: `/** Points each player scored, busts counting 0; for the 3-dart average. */`), and `pointsScored: Array<number>(n).fill(0),` in `init`.
- Add a helper above `x01Game`:

```ts
// What the current player's visit scored: a bust resets the score and an unopened
// player doesn't score, so the difference from the visit's start is exact
function withVisitScored(s: X01State): number[] {
  const cp = s.currentPlayer
  return s.pointsScored.map((p, i) => i === cp ? p + s.visitOpenedScores[cp] - s.scores[cp] : p)
}
```

- In `case 'takeout.finished'` and `case 'visit.cleared'`, start with `const pointsScored = withVisitScored(s)` and add `pointsScored` to **every** state returned from those cases (the leg win, the match win, the round limit, the normal turn).
- Add the hooks to `x01Game` (import `rankSeats` from `./ranking.js` and `X01Detail`, `SeatResult` types):

```ts
  version: 1,

  getLeg(s: X01State): number {
    return s.legs.reduce((a, b) => a + b, 0)
  },

  summarize(s: X01State, { totalDarts }): SeatResult[] {
    const placements = rankSeats(s.playerCount, s.winner, (a, b) => (s.legs[b] - s.legs[a]) || (s.scores[a] - s.scores[b]))
    return placements.map((placement, i) => {
      const darts = totalDarts[i] ?? 0
      return {
        placement,
        stats: {
          average: darts > 0 ? s.pointsScored[i] / darts * 3 : 0,
          dartsThrown: darts,
          legsWon: s.legs[i],
          pointsScored: s.pointsScored[i],
        },
      }
    })
  },

  detail(visits): X01Detail {
    const legs: X01Detail['legs'] = []
    for (const v of visits) {
      if (v.phase !== 'game') continue
      let leg = legs.find(l => l.leg === v.leg)
      if (!leg) {
        leg = { leg: v.leg, starter: v.seat, winner: null, visits: [] }
        legs.push(leg)
      }
      const bust = v.end.bustThisVisit
      const remaining = v.end.scores[v.seat]
      if (v.after.legs[v.seat] > v.start.legs[v.seat]) leg.winner = v.seat
      leg.visits.push({
        visit: v.visit, seat: v.seat, committedAt: v.committedAt, darts: v.darts,
        scored: bust ? 0 : v.start.scores[v.seat] - remaining,
        remaining, bust,
      })
    }
    return { mode: 'x01', legs }
  },
```

Type the `x01Game` constant as `GameModule<X01State, X01Config, X01View, 'x01', X01Detail>`.

In `backend/src/games/atc.ts`:
- Extract the hit count from `view()` into an exported function and use it in `view()`:

```ts
/** Targets each player has completed (the winner: all of them). */
export function hitCounts(s: ATCState): number[] {
  return s.targets.map(t => {
    const idx = s.sequence.indexOf(t)
    return idx === -1 ? s.sequence.length : idx
  })
}
```

- Type `atcModule` as `GameModule<ATCState, ATCConfig, AtcView, 'atc', AtcDetail>` and add:

```ts
  version: 1,

  summarize(s: ATCState, { totalDarts }): SeatResult[] {
    const hits = hitCounts(s)
    const placements = rankSeats(s.playerCount, s.winner,
      (a, b) => (hits[b] - hits[a]) || ((totalDarts[a] ?? 0) - (totalDarts[b] ?? 0)))
    return placements.map((placement, i) => ({ placement, stats: { dartsThrown: totalDarts[i] ?? 0, targetsHit: hits[i] } }))
  },

  detail(visits): AtcDetail {
    return {
      mode: 'atc',
      visits: visits.map(v => ({
        visit: v.visit, seat: v.seat, committedAt: v.committedAt, darts: v.darts,
        hits: v.end.currentVisitHits.filter(Boolean).length,
        targetBefore: v.start.targets[v.seat],
        targetAfter: v.end.targets[v.seat],
      })),
    }
  },
```

For fake `GameModule`s in existing tests (find them with the grep above), add `version: 1, summarize: () => [], detail: () => ({})`.

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd backend && npx vitest run src/games src/session && npm run typecheck && npm run lint`
Expected: PASS. If the snapshot contract test fails because `pointsScored` leaked into a view: it must not; `view()` lists its fields explicitly, leave it out.

- [ ] **Step 6: Commit**

```bash
git add schema/api-v1.yaml backend/src/schema backend/frontend/src/lib/api bridge/internal/api backend/src/session backend/src/games
git commit -m "feat(games): history hooks (version, getLeg, summarize, detail) for X01 and ATC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database: migration, engine store queries, board guard

**Files:**
- Create: `backend/src/db/migrations/006_game_history.sql`, `backend/src/db/migrations.test.ts`
- Modify: `backend/src/db/schema.ts`, `backend/src/db/queries.ts`, `backend/src/db/queries.test.ts`, `backend/src/session/engine.ts` (create/rebuild only), `backend/src/api/boards.ts`, `backend/src/api/boards.test.ts`, `backend/src/bridge-gw/handler.ts`

**Interfaces:**
- Consumes: `SeatResult` (Task 2), `Session.seed` (Task 1).
- Produces (in `db/queries.ts`):
  ```ts
  export type SeatRow = { name: string; user_id: string | null }
  export type NewGameSession = { id: string; owner_user_id: string; board_db_id: string | null; game_id: string; game_version: number; rng_seed: number; config: unknown; players: SeatRow[] }
  export type StoredGameSession = { id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string; game_version: number; rng_seed: number; config: unknown; created_at: Date; players: SeatRow[] }
  export type NewSessionEvent = { session_id: string; seq: number; source: 'board' | 'user'; kind: string; data: unknown; bridge_event_id: string | null; created_at: Date }
  export type StoredSessionEvent = { seq: number; source: string; kind: string; data: unknown; created_at: Date }
  export type NewGameDart = { session_id: string; visit: number; dart_index: number; seat: number; leg: number; phase: 'game' | 'bulloff'; segment: unknown; coords: { x: number; y: number } | null; source: 'camera' | 'manual'; corrected: boolean; thrown_at: Date }
  insertGameSession(db, s: NewGameSession): Promise<void>
  getActiveGameSessions(db): Promise<StoredGameSession[]>
  getSeats(db, sessionIds: string[]): Promise<Map<string, GamePlayerRow[]>>
  appendSessionEvent(db, e: NewSessionEvent): Promise<void>
  getSessionEvents(db, sessionId: string): Promise<StoredSessionEvent[]>
  insertGameDarts(db, rows: NewGameDart[]): Promise<void>     // ON CONFLICT DO NOTHING
  finishGameSession(db, id: string, finishedAt: Date, results: SeatResult[]): Promise<void>
  abortGameSession(db, id: string, finishedAt: Date): Promise<void>
  hasActiveSessionOnBoard(db, boardDbId: string): Promise<boolean>
  insertBridgeEvent(...) → Promise<{ inserted: boolean; id: string | null }>
  runMigrations(db, opts?: { until?: string })
  ```

- [ ] **Step 1: Write the migration**

`backend/src/db/migrations/006_game_history.sql`:

```sql
-- Game history: finished vs aborted, seats as rows, the input log and normalized darts.
-- Design: docs/superpowers/specs/2026-10-01-game-history-design.md

ALTER TABLE game_sessions ADD COLUMN finished_at TIMESTAMPTZ;
ALTER TABLE game_sessions ADD COLUMN game_version INT NOT NULL DEFAULT 1;
ALTER TABLE game_sessions ADD COLUMN rng_seed INT NOT NULL DEFAULT 0;
ALTER TABLE game_sessions ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public'));

-- Kept games must not block deleting a board or an account
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_board_db_id_fkey;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_board_db_id_fkey FOREIGN KEY (board_db_id) REFERENCES boards(id) ON DELETE SET NULL;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_owner_user_id_fkey;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES "user"(id) ON DELETE SET NULL;

CREATE TABLE game_players (
  session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seat       INT  NOT NULL,
  name       TEXT NOT NULL,
  user_id    TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  placement  INT,
  stats      JSONB,
  PRIMARY KEY (session_id, seat)
);
CREATE INDEX game_players_user ON game_players (user_id);

-- Seats of existing games, in stored order; the creator holds seat 0
INSERT INTO game_players (session_id, seat, name, user_id)
SELECT gs.id, p.ord - 1, COALESCE(p.player->>'name', 'Player ' || p.ord), CASE WHEN p.ord = 1 THEN gs.owner_user_id END
FROM game_sessions gs, jsonb_array_elements(gs.players) WITH ORDINALITY AS p(player, ord);

ALTER TABLE game_sessions DROP COLUMN players;

-- Games running during this upgrade have no input log to restore them from
UPDATE game_sessions SET status = 'aborted', finished_at = now() WHERE status = 'active';

CREATE TABLE game_session_events (
  session_id      TEXT   NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  seq             INT    NOT NULL,
  source          TEXT   NOT NULL CHECK (source IN ('board', 'user')),
  kind            TEXT   NOT NULL,
  data            JSONB  NOT NULL,
  bridge_event_id BIGINT REFERENCES bridge_events(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, seq)
);

CREATE TABLE game_darts (
  session_id TEXT  NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  visit      INT   NOT NULL,
  dart_index INT   NOT NULL,
  seat       INT   NOT NULL,
  leg        INT   NOT NULL,
  phase      TEXT  NOT NULL CHECK (phase IN ('game', 'bulloff')),
  segment    JSONB NOT NULL,
  coords     JSONB,
  source     TEXT  NOT NULL CHECK (source IN ('camera', 'manual')),
  corrected  BOOLEAN NOT NULL,
  thrown_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (session_id, visit, dart_index)
);
```

Check the two constraint names first against a dev database (`\d game_sessions` in psql). They are Postgres' default `<table>_<column>_fkey`; if they differ, use the real names.

- [ ] **Step 2: Write the failing tests**

Change `runMigrations` in `backend/src/db/queries.ts` to take `opts: { until?: string } = {}` and stop after running (or skipping) the file named `opts.until`:

```ts
export async function runMigrations(db: Kysely<Database>, opts: { until?: string } = {}): Promise<void> {
  // ... unchanged up to the loop ...
  for (const file of files) {
    // ... unchanged body ...
    if (file === opts.until) break
  }
}
```

(Put the `break` check at the end of the loop body and also right after the `continue` for already-run files, i.e. as `if (already.rows.length > 0) { if (file === opts.until) break; continue }`.)

`backend/src/db/migrations.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations } from './queries.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
const SCHEMA = 'mig_006_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('006_game_history migration', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db, { until: '005_session_owner.sql' })
    await sql`INSERT INTO "user" (id, name, email) VALUES ('u1', 'Christoph', 'c@example.com')`.execute(db)
    await sql`INSERT INTO game_sessions (id, game_id, config, players, status, owner_user_id)
      VALUES ('old-finished', 'x01', '{}', '[{"name":"Christoph"},{"name":"Guest"}]', 'finished', 'u1'),
             ('old-active', 'atc', '{}', '[{"name":"Christoph"}]', 'active', 'u1')`.execute(db)
    await runMigrations(db)
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('moves players into seats, the creator holding seat 0', async () => {
    const seats = await db.selectFrom('game_players').selectAll().where('session_id', '=', 'old-finished').orderBy('seat').execute()
    expect(seats.map(s => [s.seat, s.name, s.user_id, s.placement])).toEqual([[0, 'Christoph', 'u1', null], [1, 'Guest', null, null]])
  })

  it('aborts games that were running', async () => {
    const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'old-active').executeTakeFirstOrThrow()
    expect(row.status).toBe('aborted')
    expect(row.finished_at).toBeInstanceOf(Date)
  })

  it('keeps finished games finished, without placements', async () => {
    const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'old-finished').executeTakeFirstOrThrow()
    expect(row.status).toBe('finished')
    expect(row.visibility).toBe('private')
  })
})
```

Update the existing session tests in `backend/src/db/queries.test.ts` to the new shapes and add (inside the existing `describe.skipIf(...)('DB integration')`; extend `beforeAll`'s cleanup with `game_darts`, `game_session_events`, `game_players` before `game_sessions`, and seed a second user `u-test-2`):

```ts
  describe('game history store', () => {
    const newGame = (id: string, board: string | null = null) => insertGameSession(db, {
      id, owner_user_id: 'u-test-1', board_db_id: board, game_id: 'x01', game_version: 1, rng_seed: 7,
      config: { startScore: 301 }, players: [{ name: 'Test', user_id: 'u-test-1' }, { name: 'Guest', user_id: null }],
    })

    it('stores seats and reads active games with them', async () => {
      await newGame('g-active')
      const active = (await getActiveGameSessions(db)).find(s => s.id === 'g-active')
      expect(active).toMatchObject({ rng_seed: 7, game_version: 1, players: [{ name: 'Test', user_id: 'u-test-1' }, { name: 'Guest', user_id: null }] })
    })

    it('appends and reads the input log in order', async () => {
      await newGame('g-log')
      const at = new Date('2026-10-01T10:00:00.123Z')
      await appendSessionEvent(db, { session_id: 'g-log', seq: 1, source: 'user', kind: 'takeout', data: { type: 'takeout' }, bridge_event_id: null, created_at: at })
      await appendSessionEvent(db, { session_id: 'g-log', seq: 0, source: 'board', kind: 'visit.opened', data: { visit_id: 'v1' }, bridge_event_id: null, created_at: at })
      const events = await getSessionEvents(db, 'g-log')
      expect(events.map(e => [e.seq, e.kind])).toEqual([[0, 'visit.opened'], [1, 'takeout']])
      expect(events[1].data).toEqual({ type: 'takeout' })
      expect(events[0].created_at.toISOString()).toBe('2026-10-01T10:00:00.123Z')
    })

    it('inserts darts once', async () => {
      await newGame('g-darts')
      const row = { session_id: 'g-darts', visit: 0, dart_index: 0, seat: 0, leg: 0, phase: 'game' as const, segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 }, coords: null, source: 'camera' as const, corrected: false, thrown_at: new Date() }
      await insertGameDarts(db, [row])
      await insertGameDarts(db, [row])
      const n = await db.selectFrom('game_darts').select(db.fn.countAll<string>().as('n')).where('session_id', '=', 'g-darts').executeTakeFirstOrThrow()
      expect(Number(n.n)).toBe(1)
    })

    it('finishes with placements and stats, aborts without', async () => {
      await newGame('g-fin')
      await newGame('g-abort')
      const at = new Date('2026-10-01T11:00:00.000Z')
      await finishGameSession(db, 'g-fin', at, [{ placement: 1, stats: { average: 60 } }, { placement: 2, stats: { average: 40 } }])
      await abortGameSession(db, 'g-abort', at)
      const fin = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-fin').executeTakeFirstOrThrow()
      expect([fin.status, fin.finished_at?.toISOString()]).toEqual(['finished', at.toISOString()])
      const seats = (await getSeats(db, ['g-fin'])).get('g-fin') ?? []
      expect(seats.map(s => [s.placement, s.stats])).toEqual([[1, { average: 60 }], [2, { average: 40 }]])
      const ab = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-abort').executeTakeFirstOrThrow()
      expect(ab.status).toBe('aborted')
      expect(((await getSeats(db, ['g-abort'])).get('g-abort') ?? []).every(s => s.placement === null)).toBe(true)
    })

    it('deleting a board keeps its finished games; a running game blocks it', async () => {
      await insertBoard(db, { id: 'board-hist', owner_user_id: 'u-test-1', name: 'B', token_hash: 'th-hist' })
      await newGame('g-on-board', 'board-hist')
      expect(await hasActiveSessionOnBoard(db, 'board-hist')).toBe(true)
      await finishGameSession(db, 'g-on-board', new Date(), [{ placement: 1, stats: {} }, { placement: 2, stats: {} }])
      expect(await hasActiveSessionOnBoard(db, 'board-hist')).toBe(false)
      await deleteBoard(db, 'board-hist')
      const row = await db.selectFrom('game_sessions').select('board_db_id').where('id', '=', 'g-on-board').executeTakeFirstOrThrow()
      expect(row.board_db_id).toBeNull()
    })

    it('deleting the creator keeps the game and nulls their seat', async () => {
      await db.insertInto('user').values({ id: 'u-gone', name: 'Gone', email: 'gone@example.com', emailVerified: false, image: null }).execute()
      await insertGameSession(db, { id: 'g-gone', owner_user_id: 'u-gone', board_db_id: null, game_id: 'atc', game_version: 1, rng_seed: 0, config: {}, players: [{ name: 'Gone', user_id: 'u-gone' }, { name: 'Other', user_id: 'u-test-2' }] })
      await db.deleteFrom('user').where('id', '=', 'u-gone').execute()
      const row = await db.selectFrom('game_sessions').selectAll().where('id', '=', 'g-gone').executeTakeFirstOrThrow()
      expect(row.owner_user_id).toBeNull()
      const seats = (await getSeats(db, ['g-gone'])).get('g-gone') ?? []
      expect(seats.map(s => s.user_id)).toEqual([null, 'u-test-2'])
    })
  })
```

Add the new functions (`getActiveGameSessions`, `getSeats`, `appendSessionEvent`, `getSessionEvents`, `insertGameDarts`, `finishGameSession`, `abortGameSession`, `hasActiveSessionOnBoard`, `deleteBoard`) to the test file's import from `./queries.js`.

Also update the existing `insertBridgeEvent` test to expect `{ inserted: true, id: expect.any(String) }` on first insert and `{ inserted: false, id: null }` on the duplicate.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npx vitest run src/db`
Expected: FAIL on the new query functions (not exported) and the column changes.

- [ ] **Step 4: Implement**

`backend/src/db/schema.ts`: replace `GameSessionsTable` and add the new tables to `Database`:

```ts
export interface GameSessionsTable {
  id: string
  owner_user_id: string | null
  board_db_id: string | null
  game_id: string
  config: unknown
  status: string
  created_at: ColumnType<Date, never, never>
  finished_at: ColumnType<Date | null, Date | null | undefined, Date | null>
  game_version: ColumnType<number, number | undefined, number>
  rng_seed: ColumnType<number, number | undefined, number>
  visibility: ColumnType<string, string | undefined, string>
}

export interface GamePlayersTable {
  session_id: string
  seat: number
  name: string
  user_id: string | null
  placement: number | null
  stats: unknown
}

export interface GameSessionEventsTable {
  session_id: string
  seq: number
  source: string
  kind: string
  data: unknown
  /** BIGINT; node-postgres returns it as a string */
  bridge_event_id: string | null
  created_at: Date
}

export interface GameDartsTable {
  session_id: string
  visit: number
  dart_index: number
  seat: number
  leg: number
  phase: string
  segment: unknown
  coords: unknown
  source: string
  corrected: boolean
  thrown_at: Date
}
```

and in `Database`: `game_players: GamePlayersTable; game_session_events: GameSessionEventsTable; game_darts: GameDartsTable`.

`backend/src/db/queries.ts`: replace the game session section with:

```ts
// ---------------------------------------------------------------------------
// Game sessions and their history
// ---------------------------------------------------------------------------

export type SeatRow = { name: string; user_id: string | null }
export type NewGameSession = {
  id: string; owner_user_id: string; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; players: SeatRow[]
}
export type StoredGameSession = {
  id: string; owner_user_id: string | null; board_db_id: string | null; game_id: string
  game_version: number; rng_seed: number; config: unknown; created_at: Date; players: SeatRow[]
}
export type GamePlayerRow = Selectable<GamePlayersTable>
export type NewSessionEvent = {
  session_id: string; seq: number; source: 'board' | 'user'; kind: string; data: unknown
  bridge_event_id: string | null; created_at: Date
}
export type StoredSessionEvent = { seq: number; source: string; kind: string; data: unknown; created_at: Date }
export type NewGameDart = {
  session_id: string; visit: number; dart_index: number; seat: number; leg: number
  phase: 'game' | 'bulloff'; segment: unknown; coords: { x: number; y: number } | null
  source: 'camera' | 'manual'; corrected: boolean; thrown_at: Date
}

/** A new running game and its seats (seat = index in `players`). */
export async function insertGameSession(db: Kysely<Database>, s: NewGameSession): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.insertInto('game_sessions')
      .values({
        id: s.id, owner_user_id: s.owner_user_id, board_db_id: s.board_db_id, game_id: s.game_id,
        game_version: s.game_version, rng_seed: s.rng_seed, config: JSON.stringify(s.config), status: 'active',
      })
      .execute()
    await trx.insertInto('game_players')
      .values(s.players.map((p, seat) => ({ session_id: s.id, seat, name: p.name, user_id: p.user_id })))
      .execute()
  })
}

/** Seats of these games in seat order, by game id. */
export async function getSeats(db: Kysely<Database>, sessionIds: string[]): Promise<Map<string, GamePlayerRow[]>> {
  const bySession = new Map<string, GamePlayerRow[]>()
  if (sessionIds.length === 0) return bySession
  const rows = await db.selectFrom('game_players').selectAll()
    .where('session_id', 'in', sessionIds)
    .orderBy('session_id').orderBy('seat')
    .execute()
  for (const r of rows) bySession.set(r.session_id, [...(bySession.get(r.session_id) ?? []), r])
  return bySession
}

export async function getActiveGameSessions(db: Kysely<Database>): Promise<StoredGameSession[]> {
  const rows = await db.selectFrom('game_sessions')
    .select(['id', 'owner_user_id', 'board_db_id', 'game_id', 'game_version', 'rng_seed', 'config', 'created_at'])
    .where('status', '=', 'active')
    .execute()
  const seats = await getSeats(db, rows.map(r => r.id))
  return rows.map(r => ({ ...r, players: (seats.get(r.id) ?? []).map(p => ({ name: p.name, user_id: p.user_id })) }))
}

export async function getGameSessionById(db: Kysely<Database>, id: string) {
  return db.selectFrom('game_sessions').selectAll().where('id', '=', id).executeTakeFirst()
}

export async function appendSessionEvent(db: Kysely<Database>, e: NewSessionEvent): Promise<void> {
  await db.insertInto('game_session_events').values({ ...e, data: JSON.stringify(e.data) }).execute()
}

/** A game's input log in order. */
export async function getSessionEvents(db: Kysely<Database>, sessionId: string): Promise<StoredSessionEvent[]> {
  return db.selectFrom('game_session_events')
    .select(['seq', 'source', 'kind', 'data', 'created_at'])
    .where('session_id', '=', sessionId)
    .orderBy('seq')
    .execute()
}

/** Darts of committed visits; ones already stored are skipped (a rebuild re-inserts them all). */
export async function insertGameDarts(db: Kysely<Database>, rows: NewGameDart[]): Promise<void> {
  if (rows.length === 0) return
  await db.insertInto('game_darts')
    .values(rows.map(r => ({ ...r, segment: JSON.stringify(r.segment), coords: r.coords === null ? null : JSON.stringify(r.coords) })))
    .onConflict(oc => oc.columns(['session_id', 'visit', 'dart_index']).doNothing())
    .execute()
}

/** The game was won: placements and stats per seat (in seat order). */
export async function finishGameSession(db: Kysely<Database>, id: string, finishedAt: Date, results: { placement: number; stats: Record<string, number> }[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.updateTable('game_sessions').set({ status: 'finished', finished_at: finishedAt }).where('id', '=', id).execute()
    for (const [seat, r] of results.entries()) {
      await trx.updateTable('game_players')
        .set({ placement: r.placement, stats: JSON.stringify(r.stats) })
        .where('session_id', '=', id).where('seat', '=', seat)
        .execute()
    }
  })
}

/** The game was ended without a result; its log and darts stay. */
export async function abortGameSession(db: Kysely<Database>, id: string, finishedAt: Date): Promise<void> {
  await db.updateTable('game_sessions').set({ status: 'aborted', finished_at: finishedAt }).where('id', '=', id).execute()
}

export async function hasActiveSessionOnBoard(db: Kysely<Database>, boardDbId: string): Promise<boolean> {
  const row = await db.selectFrom('game_sessions').select('id')
    .where('board_db_id', '=', boardDbId).where('status', '=', 'active')
    .executeTakeFirst()
  return row !== undefined
}
```

(Import `Selectable` from `kysely` and `GamePlayersTable` from `./schema.js`.) Keep `setGameSessionFinished` and `getBridgeEventsForBoardDbId` for now; Task 5 removes them.

Change `insertBridgeEvent` to return the id:

```ts
): Promise<{ inserted: boolean; id: string | null }> {
  const row = await db.insertInto('bridge_events')
    .values({ /* unchanged */ })
    .onConflict(oc => oc.columns(['bridge_id', 'boot_id', 'seq']).doNothing())
    .returning('id')
    .executeTakeFirst()
  return { inserted: row !== undefined, id: row === undefined ? null : String(row.id) }
}
```

In `backend/src/bridge-gw/handler.ts` take `{ inserted, id }` and call `engine.onBridgeEvent(boardDbId, kind, data, id)`. In `engine.ts` add the parameter now: `async onBridgeEvent(boardId: string, kind: string, data: unknown, _bridgeEventId: string | null = null)` (used in Task 5).

In `backend/src/session/engine.ts`:
- `EngineStore.insertSession(data: NewGameSession)` and `getActiveSessions(): Promise<StoredGameSession[]>` (import the types from `../db/queries.js`).
- In `create()`:

```ts
    await this.store.insertSession({
      id: sessionId, owner_user_id: ownerUserId, board_db_id: boardId, game_id: gameId,
      game_version: mod.version, rng_seed: seed, config,
      // Only the creator's seat is an account for now (#41 adds others)
      players: players.map((p, seat) => ({ name: p.name, user_id: seat === 0 ? ownerUserId : null })),
    })
```

- In `rebuild()`: `const seed = row.rng_seed`, players from `row.players.map(p => ({ name: p.name }))` (drop `StoredPlayersSchema`; keep the empty check: `if (players.length === 0) { finish/continue }`).
- Update the `makeStore` mock rows in `engine.test.ts` `rebuild` tests to the new row shape (`game_version: 1, rng_seed: 0, players: [{ name: 'Alice', user_id: 'user-1' }]`).

In `backend/src/api/boards.ts`, before deleting:

```ts
    if (await hasActiveSessionOnBoard(db, id)) return reply.code(409).send({ error: 'board has a game running' })
    await deleteBoard(db, id)
```

and drop the `23503` catch (games no longer block the delete). In `boards.test.ts` add `hasActiveSessionOnBoard: vi.fn().mockResolvedValue(false)` to the queries mock, and a test:

```ts
  it('refuses to delete a board with a game running', async () => {
    vi.mocked(queries.hasActiveSessionOnBoard).mockResolvedValueOnce(true)
    const res = await app.inject({ method: 'DELETE', url: '/api/boards/b1' })
    expect(res.statusCode).toBe(409)
    expect(queries.deleteBoard).not.toHaveBeenCalled()
  })
```

(adapt `app` / mock names to the file's existing helpers).

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npm test && npm run typecheck && npm run lint`
Expected: PASS. If the test database already ran an older 006 while you iterated, drop and recreate it.

- [ ] **Step 6: Commit**

```bash
git add backend/src/db backend/src/session/engine.ts backend/src/session/engine.test.ts backend/src/api/boards.ts backend/src/api/boards.test.ts backend/src/bridge-gw/handler.ts
git commit -m "feat(db): game history tables, seats as rows, finished vs aborted

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Extract `applyInput()` from the engine

A pure refactor plus bookkeeping: the state-changing part of `onBridgeEvent`/`onUserAction` moves into `applyInput()`, which also tracks each open dart's source/correction/time and reports committed visits and wins. The engine keeps its I/O. Existing engine tests must pass unchanged.

**Files:**
- Create: `backend/src/session/apply.ts`, `backend/src/session/apply.test.ts`
- Modify: `backend/src/session/types.ts` (Session fields), `backend/src/session/engine.ts`

**Interfaces:**
- Consumes: `CommittedVisit`, `HistoryDart`, `DartSource` (Task 2).
- Produces:
  ```ts
  // session/types.ts
  export type DartMeta = { source: DartSource; corrected: boolean; thrownAt: Date }
  // Session gains: openDarts: DartMeta[]; visitCount: number; nextSeq: number
  // session/apply.ts
  export type GameInput = { source: 'board'; event: BoardEvent } | { source: 'user'; action: UserAction }
  export type ApplyOutcome = { committed: CommittedVisit<unknown> | null; won: boolean }
  export function applyInput(session: Session, input: GameInput, at: Date): ApplyOutcome
  export function inBullOff(session: Session, state: unknown): boolean
  export function hasWinner(session: Session, state: unknown): boolean
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/session/apply.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { applyInput, type GameInput } from './apply.js'
import { atcModule } from '../games/atc.js'
import { x01Module } from '../games/x01.js'
import type { AnyGameModule, Session, Segment } from './types.js'

function session(module: AnyGameModule, config: Record<string, unknown>, n = 1): Session {
  const players = Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))
  const s = module.init(config, players)
  return {
    id: 's1', ownerUserId: 'u1', boardId: 'b1', players, module,
    committedState: s, currentState: s, openVisitEvents: [], openDarts: [],
    status: 'active', createdAt: new Date(0), seed: 0, visitCount: 0, nextSeq: 0,
    totalDarts: Array<number>(n).fill(0), totalVisits: Array<number>(n).fill(0), bmStatus: null,
  }
}
const S1: Segment = { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }
const S2: Segment = { name: 'S2', number: 2, bed: 'Single', multiplier: 1 }
const board = (kind: string, data: unknown = {}): GameInput => ({ source: 'board', event: { kind, data } as never })
const dart = (s: Segment, index: number, coords?: { x: number; y: number }): GameInput =>
  ({ source: 'board', event: { kind: 'dart.detected', data: { visit_id: 'v', index, source_seq: 1, dart: { segment: s, score: s.number, ...(coords && { coords }) } } } })
const t = (ms: number) => new Date(Date.UTC(2026, 9, 1, 10, 0, 0, ms))

describe('applyInput', () => {
  it('commits a camera visit with its darts, seat, leg and phase', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0, { x: 0.1, y: 0.2 }), t(1))
    const out = applyInput(s, board('takeout.finished'), t(2))
    expect(out.won).toBe(false)
    expect(out.committed).toMatchObject({ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: t(2).toISOString() })
    expect(out.committed?.darts).toEqual([{ index: 0, segment: S1, coords: { x: 0.1, y: 0.2 }, source: 'camera', corrected: false, thrownAt: t(1).toISOString() }])
    expect(s.visitCount).toBe(1)
    expect(s.openDarts).toEqual([])
  })

  it('marks manual and corrected darts, and undo drops the last one', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    applyInput(s, { source: 'board', event: { kind: 'dart.corrected', data: { visit_id: 'v', index: 0, source_seq: 2, dart: { segment: S2, score: 2 }, previous: { segment: S1, score: 1 } } } }, t(2))
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S1 } }, t(3))
    applyInput(s, { source: 'user', action: { type: 'add_dart', segment: S2 } }, t(4))
    applyInput(s, { source: 'user', action: { type: 'undo_dart' } }, t(5))
    const out = applyInput(s, { source: 'user', action: { type: 'takeout' } }, t(6))
    expect(out.committed?.darts.map(d => [d.segment.name, d.source, d.corrected])).toEqual([['S2', 'camera', true], ['S1', 'manual', false]])
  })

  it('an empty takeout commits three manual misses', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    const out = applyInput(s, { source: 'user', action: { type: 'takeout' } }, t(0))
    expect(out.committed?.darts.map(d => [d.segment.name, d.source])).toEqual([['Miss', 'manual'], ['Miss', 'manual'], ['Miss', 'manual']])
  })

  it('a resync drops the open darts', () => {
    const s = session(atcModule, atcModule.defaultConfig)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    applyInput(s, board('board.resync'), t(2))
    expect(s.openDarts).toEqual([])
    expect(s.totalDarts).toEqual([0])
  })

  it('reports the win', () => {
    const s = session(x01Module, { ...x01Module.defaultConfig, startScore: 301, outMode: 'straight', firstTo: 1 })
    s.committedState = { ...s.committedState as object, game: { ...(s.committedState as any).game, scores: [1] } }
    s.currentState = s.committedState
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    expect(applyInput(s, board('takeout.finished'), t(2)).won).toBe(true)
  })

  it('tags bull off visits', () => {
    const s = session(x01Module, { ...x01Module.defaultConfig, bullOff: 'wdc' }, 2)
    applyInput(s, board('visit.opened'), t(0))
    applyInput(s, dart(S1, 0), t(1))
    const out = applyInput(s, board('takeout.finished'), t(2))
    expect(out.committed).toMatchObject({ seat: 0, phase: 'bulloff' })
    expect(s.totalVisits).toEqual([0, 0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/session/apply.test.ts`
Expected: FAIL: cannot find module `./apply.js`.

- [ ] **Step 3: Implement**

In `backend/src/session/types.ts` add `DartMeta` and the `Session` fields:

```ts
/** What the engine knows about a dart of the open visit (in dart order). */
export type DartMeta = { source: DartSource; corrected: boolean; thrownAt: Date }
```

```ts
  /** One entry per dart.detected in openVisitEvents, same order. */
  openDarts: DartMeta[]
  /** Visits committed so far; numbers the next one. */
  visitCount: number
  /** seq of the next input log entry. */
  nextSeq: number
```

`backend/src/session/apply.ts`:

```ts
import { refoldVisit } from './refold.js'
import { manualDart } from './manualDart.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Session, UserAction } from './types.js'

/** One input to a game: a board event or a user action. */
export type GameInput =
  | { source: 'board'; event: BoardEvent }
  | { source: 'user'; action: UserAction }

export type ApplyOutcome = {
  /** The visit this input committed, if any. */
  committed: CommittedVisit<unknown> | null
  /** The input decided the game. */
  won: boolean
}

const NONE: ApplyOutcome = { committed: null, won: false }

type DartEvent = Extract<BoardEvent, { kind: 'dart.detected' }>
const isDart = (e: BoardEvent): e is DartEvent => e.kind === 'dart.detected'
const dartEvents = (session: Session): DartEvent[] => session.openVisitEvents.filter(isDart)

/** Darts and visits of a bull off (see withBullOff) don't count towards game stats. */
export function inBullOff(session: Session, state: unknown): boolean {
  const view = session.module.view(state, session.players)
  return 'phase' in view && view.phase === 'bulloff'
}

export function hasWinner(session: Session, state: unknown): boolean {
  return session.module.view(state, session.players).winner !== null
}

// Adds `delta` darts to the thrower in `state`, unless that's the bull off
function countDarts(session: Session, state: unknown, delta: number): void {
  if (inBullOff(session, state)) return
  const thrower = session.module.getCurrentPlayer(state)
  session.totalDarts[thrower] = Math.max(0, (session.totalDarts[thrower] ?? 0) + delta)
}

function markCorrected(session: Session, dartPos: number): void {
  session.openDarts = session.openDarts.map((m, i) => i === dartPos ? { ...m, corrected: true } : m)
}

/**
 * Applies one input to a session: the only place a game's state changes. Live play and
 * replays of the input log both go through here, so they can't drift apart. `at` is when
 * the input happened (now, or the log entry's time). No I/O.
 */
export function applyInput(session: Session, input: GameInput, at: Date): ApplyOutcome {
  const outcome = input.source === 'board'
    ? applyBoardEvent(session, input.event, at)
    : applyUserAction(session, input.action, at)
  session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
  return outcome
}

function applyBoardEvent(session: Session, event: BoardEvent, at: Date): ApplyOutcome {
  switch (event.kind) {
    case 'visit.opened':
      session.openVisitEvents.push(event)
      return NONE

    case 'dart.detected': {
      const view = session.module.view(session.currentState, session.players)
      if ('visitLocked' in view && view.visitLocked) return NONE
      countDarts(session, session.currentState, 1)
      session.openVisitEvents.push(event)
      session.openDarts.push({ source: 'camera', corrected: false, thrownAt: at })
      return NONE
    }

    case 'dart.corrected': {
      const darts = dartEvents(session)
      const pos = darts.findIndex(e => e.data.index === event.data.index)
      if (pos !== -1) {
        const target = darts[pos]
        session.openVisitEvents[session.openVisitEvents.indexOf(target)] = {
          kind: 'dart.detected',
          data: { ...target.data, dart: event.data.dart },
        }
        markCorrected(session, pos)
      }
      return NONE
    }

    case 'takeout.finished':
    case 'visit.cleared':
      return commit(session, event, at)

    case 'board.resync':
      countDarts(session, session.currentState, -dartEvents(session).length)
      session.openVisitEvents = []
      session.openDarts = []
      return NONE

    case 'board.status':
      return NONE
  }
}

function applyUserAction(session: Session, action: UserAction, at: Date): ApplyOutcome {
  switch (action.type) {
    case 'undo_dart': {
      const events = session.openVisitEvents
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].kind !== 'dart.detected') continue
        events.splice(i, 1)
        // A visit.opened left without darts goes too
        if (i > 0 && events[i - 1].kind === 'visit.opened' && !events.slice(i).some(isDart)) events.splice(i - 1, 1)
        session.openDarts = session.openDarts.slice(0, -1)
        countDarts(session, session.currentState, -1)
        break
      }
      return NONE
    }

    case 'correct_dart': {
      const target = dartEvents(session).find((_, i) => i === action.visitIndex)
      if (target) {
        // The camera position no longer matches the corrected segment, so drop it,
        // unless the dart was moved to a new spot on the board
        const rest = { ...target.data.dart }
        delete rest.coords
        delete rest.polar
        session.openVisitEvents[session.openVisitEvents.indexOf(target)] = {
          kind: 'dart.detected',
          data: { ...target.data, dart: { ...rest, ...manualDart(action.segment, action.coords) } },
        }
        markCorrected(session, action.visitIndex)
      }
      return NONE
    }

    case 'takeout': {
      // An empty turn (nothing thrown or nothing detected) counts as three misses
      if (session.openVisitEvents.length === 0 && !inBullOff(session, session.currentState)
          && !hasWinner(session, session.currentState)) {
        const miss = { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 } as const
        session.openVisitEvents = [
          { kind: 'visit.opened', data: { visit_id: 'manual' } },
          ...[0, 1, 2].map(index => ({
            kind: 'dart.detected' as const,
            data: { visit_id: 'manual', index, dart: manualDart({ ...miss }), source_seq: 0 },
          })),
        ]
        session.openDarts = [0, 1, 2].map(() => ({ source: 'manual' as const, corrected: false, thrownAt: at }))
        countDarts(session, session.currentState, 3)
        session.currentState = refoldVisit(session.module, session.committedState, session.openVisitEvents)
      }
      if (session.openVisitEvents.length === 0) return NONE
      return commit(session, { kind: 'takeout.finished', data: {} }, at)
    }

    case 'add_dart': {
      const dartCount = dartEvents(session).length
      if (dartCount >= 3) return NONE
      // A finished visit (bust, checkout, win) takes no more darts
      const now = session.module.view(session.currentState, session.players)
      if (('visitLocked' in now && now.visitLocked) || now.winner !== null) return NONE
      if (session.openVisitEvents.length === 0) {
        session.openVisitEvents.push({ kind: 'visit.opened', data: { visit_id: 'manual' } })
      }
      // Use the state after the (possibly new) visit.opened to find the thrower
      countDarts(session, refoldVisit(session.module, session.committedState, session.openVisitEvents), 1)
      session.openVisitEvents.push({
        kind: 'dart.detected',
        data: { visit_id: 'manual', index: dartCount, dart: manualDart(action.segment, action.coords), source_seq: 0 },
      })
      session.openDarts.push({ source: 'manual', corrected: false, thrownAt: at })
      return NONE
    }

    default: {
      // The game module's own actions (e.g. the bull off's skip/rethrow/start) end the
      // open visit and become committed state
      const next = session.module.onUserAction(session.currentState, action).state
      if (next === session.currentState) return NONE
      session.committedState = next
      session.openVisitEvents = []
      session.openDarts = []
      return { committed: null, won: hasWinner(session, next) }
    }
  }
}

// Ends the open visit with `closing` (takeout.finished or visit.cleared) and describes it
function commit(session: Session, closing: BoardEvent, at: Date): ApplyOutcome {
  const mod = session.module
  const events = session.openVisitEvents
  const lead = events.slice(0, events[0]?.kind === 'visit.opened' ? 1 : 0)
  const start = refoldVisit(mod, session.committedState, lead)
  const end = refoldVisit(mod, session.committedState, events)
  const after = mod.onBoardEvent(end, closing).state

  if (!inBullOff(session, end)) {
    const owner = mod.getCurrentPlayer(end)
    session.totalVisits[owner] = (session.totalVisits[owner] ?? 0) + 1
  }

  const darts = dartEvents(session).map((e, index): HistoryDart => {
    const meta = session.openDarts[index]
    return {
      index,
      segment: e.data.dart.segment,
      coords: e.data.dart.coords ?? null,
      source: meta?.source ?? 'camera',
      corrected: meta?.corrected ?? false,
      thrownAt: (meta?.thrownAt ?? at).toISOString(),
    }
  })
  const visit: CommittedVisit<unknown> = {
    visit: session.visitCount,
    seat: mod.getCurrentPlayer(start),
    leg: mod.getLeg?.(start) ?? 0,
    phase: inBullOff(session, start) ? 'bulloff' : 'game',
    committedAt: at.toISOString(),
    darts, start, end, after,
  }

  session.visitCount++
  session.committedState = after
  session.openVisitEvents = []
  session.openDarts = []
  return { committed: visit, won: hasWinner(session, after) }
}
```

Notes for the implementer:
- `refoldVisit` is typed `GameModule<S, unknown>`; `AnyGameModule` already passes to it today (see engine). If TypeScript complains about the union, pass `session.module` exactly as the engine does now.
- If the lint rule `no-unnecessary-condition` flags `meta?.` / `?? 0` on array elements, it should not (index access is exempt); if it does, keep the guard and add `// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- openDarts can be shorter after an old log is replayed`.

Rewrite `SessionEngine.onBridgeEvent` and `onUserAction` on top of it (persistence comes in Task 5):

```ts
  async onBridgeEvent(boardId: string, kind: string, data: unknown, _bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return

    // Kinds the games don't use (and malformed dart data) change nothing but still push
    const event = parseBoardEvent(kind, data)
    // A dart the games can't read would otherwise just not count, with no trace
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    if (event?.kind === 'board.status') session.bmStatus = readBoardStatus(event.data)
    else if (event) await this.settle(session, applyInput(session, { source: 'board', event }, new Date()))
    this.push(session.id)
  }

  async onUserAction(sessionId: string, action: UserAction): Promise<void> {
    const session = this.byId.get(sessionId)
    if (!session) return
    await this.settle(session, applyInput(session, { source: 'user', action }, new Date()))
    this.push(session.id)
  }

  private async settle(session: Session, outcome: ApplyOutcome): Promise<void> {
    if (!outcome.won) return
    session.status = 'finished'
    await this.store.setSessionFinished(session.id)
    this.release(session)
  }
```

Remove the now-unused `inBullOff`/`hasWinner`/`manualDart`/`refoldVisit` imports from `engine.ts` (import `applyInput`, `ApplyOutcome` from `./apply.js`). Initialize `openDarts: [], visitCount: 0, nextSeq: 0` in both `Session` literals in `engine.ts`.

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `cd backend && npx vitest run src/session && npm run typecheck && npm run lint`
Expected: PASS, including every existing `engine.test.ts` test unchanged.

- [ ] **Step 5: Commit**

```bash
git add backend/src/session
git commit -m "refactor(engine): one pure applyInput() for board events and user actions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Engine persistence and restore from the log

**Files:**
- Create: `backend/src/session/replay.ts`, `backend/src/session/replay.test.ts`
- Modify: `backend/src/session/engine.ts`, `backend/src/session/engine.test.ts`, `backend/src/db/queries.ts` (remove `setGameSessionFinished`, `getBridgeEventsForBoardDbId`), `backend/src/db/queries.test.ts`, `backend/src/index.ts` if it references removed functions

**Interfaces:**
- Consumes: `applyInput`, `GameInput` (Task 4); store row types (Task 3); `seededRng` (Task 1).
- Produces:
  ```ts
  // session/replay.ts
  export const StoredConfigSchema: z.ZodType<GameConfig>
  export type LoggedInput = { seq: number; source: string; kind: string; data: unknown; created_at: Date }
  export function parseLoggedInput(row: LoggedInput): GameInput | null
  export function newSession(a: { id: string; ownerUserId: string; boardId: string | null; module: AnyGameModule; config: GameConfig; players: Player[]; seed: number; createdAt: Date }): Session
  export function replay(session: Session, rows: LoggedInput[], warn: WarnFn): { visits: CommittedVisit<unknown>[]; won: boolean }
  export function dartRows(sessionId: string, v: CommittedVisit<unknown>): NewGameDart[]
  export function results(session: Session): SeatResult[]
  export type WarnFn = (message: string, details: unknown) => void
  // session/engine.ts
  export interface EngineStore {
    insertSession(data: NewGameSession): Promise<void>
    getActiveSessions(): Promise<StoredGameSession[]>
    getSessionEvents(sessionId: string): Promise<StoredSessionEvent[]>
    appendEvent(event: NewSessionEvent): Promise<void>
    insertDarts(rows: NewGameDart[]): Promise<void>
    finishSession(id: string, finishedAt: Date, results: SeatResult[]): Promise<void>
    abortSession(id: string, finishedAt: Date): Promise<void>
  }
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/session/replay.test.ts`, with an in-memory store, a scripted X01 game and the engine:

```ts
import { describe, it, expect, vi } from 'vitest'
import { SessionEngine, type EngineStore } from './engine.js'
import { newSession, replay, dartRows } from './replay.js'
import { games } from '../games/index.js'
import type { NewGameDart, NewGameSession, NewSessionEvent, StoredSessionEvent } from '../db/queries.js'
import type { SeatResult, Segment, UserAction } from './types.js'

function memoryStore() {
  const sessions = new Map<string, NewGameSession & { status: string; created_at: Date }>()
  const events: (NewSessionEvent)[] = []
  const darts: NewGameDart[] = []
  const finished = new Map<string, SeatResult[]>()
  const aborted: string[] = []
  const store: EngineStore = {
    insertSession: async (s) => { sessions.set(s.id, { ...s, status: 'active', created_at: new Date() }) },
    getActiveSessions: async () => [...sessions.values()].filter(s => s.status === 'active')
      .map(s => ({ id: s.id, owner_user_id: s.owner_user_id, board_db_id: s.board_db_id, game_id: s.game_id, game_version: s.game_version, rng_seed: s.rng_seed, config: s.config, created_at: s.created_at, players: s.players })),
    getSessionEvents: async (id): Promise<StoredSessionEvent[]> => events.filter(e => e.session_id === id).sort((a, b) => a.seq - b.seq)
      .map(e => ({ seq: e.seq, source: e.source, kind: e.kind, data: JSON.parse(JSON.stringify(e.data)), created_at: e.created_at })),
    appendEvent: async (e) => { events.push(e) },
    insertDarts: async (rows) => {
      for (const r of rows) if (!darts.some(d => d.session_id === r.session_id && d.visit === r.visit && d.dart_index === r.dart_index)) darts.push(r)
    },
    finishSession: async (id, _at, r) => { finished.set(id, r); const s = sessions.get(id); if (s) s.status = 'finished' },
    abortSession: async (id) => { aborted.push(id); const s = sessions.get(id); if (s) s.status = 'aborted' },
  }
  return { store, sessions, events, darts, finished, aborted }
}

const seg = (name: string, number: number, bed: Segment['bed'], multiplier: 0 | 1 | 2 | 3): Segment => ({ name, number, bed, multiplier })
const MISS = seg('Miss', 0, 'Outside', 0), B25 = seg('25', 25, 'SingleOuter', 1), S20 = seg('S20', 20, 'Single', 1)
const S5 = seg('S5', 5, 'Single', 1), S1 = seg('S1', 1, 'Single', 1), T20 = seg('T20', 20, 'Triple', 3)

type Step = ['board', string, unknown] | ['user', UserAction]
const opened = (v: string): Step => ['board', 'visit.opened', { visit_id: v }]
const camera = (v: string, index: number, s: Segment): Step => ['board', 'dart.detected', { visit_id: v, index, source_seq: index + 1, dart: { segment: s, score: s.number * s.multiplier } }]
const takeout = (v: string): Step => ['board', 'takeout.finished', { visit_id: v, trigger: 'numThrows.zero', duration_ms: 900 }]

// X01 301 straight out, first to 1, WDC bull off between A and B
const CONFIG = { ...games.x01!.defaultConfig, startScore: 301, outMode: 'straight', firstTo: 1, bullOff: 'wdc' }
const PLAYERS = [{ name: 'A' }, { name: 'B' }]
const SCRIPT: Step[] = [
  // bull off: both miss → rethrow (B first now), B hits the 25, A a single 20 → B starts
  opened('b1'), camera('b1', 0, MISS), takeout('b1'),
  opened('b2'), camera('b2', 0, MISS), takeout('b2'),
  opened('b3'), camera('b3', 0, B25), takeout('b3'),
  opened('b4'), camera('b4', 0, S20), takeout('b4'),
  // B: 180 → 121
  opened('g1'), camera('g1', 0, T20), camera('g1', 1, T20), camera('g1', 2, T20), takeout('g1'),
  // A: camera S5 corrected to S20, manual T20 undone, manual S1 → 21 (280)
  opened('g2'), camera('g2', 0, S5),
  ['board', 'dart.corrected', { visit_id: 'g2', index: 0, source_seq: 9, dart: { segment: S20, score: 20 }, previous: { segment: S5, score: 5 } }],
  ['user', { type: 'add_dart', segment: T20 }], ['user', { type: 'undo_dart' }], ['user', { type: 'add_dart', segment: S1 }],
  ['user', { type: 'takeout' }],
  // B: T20 lost to a resync, then T20 S1 → 61 (60 left)
  opened('g3'), camera('g3', 0, T20), ['board', 'board.resync', { throws: [] }],
  camera('g3', 0, T20), camera('g3', 1, S1), takeout('g3'),
]
const ENDING: Step[] = [
  // A: empty turn → three misses; B: T20 checks out 60
  ['user', { type: 'takeout' }],
  opened('g5'), camera('g5', 0, T20), takeout('g5'),
]

async function play(engine: SessionEngine, sessionId: string, steps: Step[]) {
  for (const s of steps) {
    if (s[0] === 'board') await engine.onBridgeEvent('board-1', s[1], s[2])
    else await engine.onUserAction(sessionId, s[1])
  }
}

describe('the input log', () => {
  it('replays to exactly the game that was played', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    await play(live, sessionId, [...SCRIPT, ...ENDING])

    const played = live.getSession(sessionId)!
    expect(played.status).toBe('finished')
    expect(mem.finished.get(sessionId)?.map(r => r.placement)).toEqual([2, 1])

    const row = mem.sessions.get(sessionId)!
    const again = newSession({ id: sessionId, ownerUserId: 'user-1', boardId: 'board-1', module: games.x01!, config: CONFIG, players: PLAYERS, seed: row.rng_seed, createdAt: row.created_at })
    const { visits, won } = replay(again, await mem.store.getSessionEvents(sessionId), vi.fn())

    expect(won).toBe(true)
    expect(again.committedState).toEqual(played.committedState)
    expect(again.totalDarts).toEqual(played.totalDarts)
    expect(again.totalVisits).toEqual(played.totalVisits)
    expect(visits.flatMap(v => dartRows(sessionId, v))).toEqual(mem.darts)
    // camera / manual / corrected made it into the darts
    const a = mem.darts.filter(d => d.visit === 5)
    expect(a.map(d => [d.source, d.corrected])).toEqual([['camera', true], ['manual', false]])
    expect(mem.darts.filter(d => d.visit === 7).map(d => d.source)).toEqual(['manual', 'manual', 'manual'])
    expect(mem.darts.filter(d => d.phase === 'bulloff')).toHaveLength(4)
  })

  it('restores a running game after a restart, boardless and manual darts included', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    await play(live, sessionId, SCRIPT)
    const solo = await live.create('user-2', null, 'atc', { ...games.atc!.defaultConfig, order: 'random' }, [{ name: 'Solo' }])
    await live.onUserAction(solo.sessionId, { type: 'add_dart', segment: S1 })

    const restarted = new SessionEngine(mem.store, vi.fn())
    await restarted.rebuild()

    expect(restarted.getSnapshot(sessionId)).toEqual(live.getSnapshot(sessionId))
    expect(restarted.getSnapshot(solo.sessionId)).toEqual(live.getSnapshot(solo.sessionId))
    expect(restarted.getSessionByBoard('board-1')?.id).toBe(sessionId)
    expect(restarted.getSessionByOwner('user-2')?.id).toBe(solo.sessionId)
    // carries on numbering the log
    await play(restarted, sessionId, ENDING)
    expect(mem.events.filter(e => e.session_id === sessionId).map(e => e.seq)).toEqual(mem.events.filter(e => e.session_id === sessionId).map((_, i) => i))
    expect(mem.finished.has(sessionId)).toBe(true)
  })

  it('finishes on restart a game whose win was logged but not saved', async () => {
    const mem = memoryStore()
    const live = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await live.create('user-1', 'board-1', 'x01', CONFIG, PLAYERS)
    mem.store.finishSession = async () => { throw new Error('db down') }
    await play(live, sessionId, SCRIPT)
    await play(live, sessionId, ENDING).catch(() => undefined)
    const fresh = memoryStore()
    Object.assign(fresh.store, { ...mem.store, finishSession: async (id: string, _at: Date, r: SeatResult[]) => { fresh.finished.set(id, r) } })
    const restarted = new SessionEngine(fresh.store, vi.fn())
    await restarted.rebuild()
    expect(fresh.finished.get(sessionId)?.map(r => r.placement)).toEqual([2, 1])
    expect(restarted.getSession(sessionId)).toBeUndefined()
  })
})

describe('engine persistence', () => {
  it('logs each input before applying it; a failed append changes nothing', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onBridgeEvent('board-1', 'visit.opened', { visit_id: 'v1', extra: 'kept' })
    expect(mem.events.map(e => [e.seq, e.source, e.kind, e.data])).toEqual([[0, 'board', 'visit.opened', { visit_id: 'v1', extra: 'kept' }]])
    mem.store.appendEvent = async () => { throw new Error('db down') }
    await expect(engine.onUserAction(sessionId, { type: 'add_dart', segment: S1 })).rejects.toThrow('db down')
    expect(engine.getSession(sessionId)!.openDarts).toEqual([])
  })

  it('does not log board.status or unreadable events', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onBridgeEvent('board-1', 'board.status', { status: 'Throw', running: true, event: 'x' })
    await engine.onBridgeEvent('board-1', 'takeout.started', {})
    expect(mem.events).toEqual([])
  })

  it('applies inputs in the order they are logged, even when they arrive together', async () => {
    const mem = memoryStore()
    let release: () => void = () => undefined
    const gate = new Promise<void>(r => { release = r })
    const append = mem.store.appendEvent
    let first = true
    mem.store.appendEvent = async (e) => { if (first) { first = false; await gate } await append(e) }
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', 'board-1', 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    const a = engine.onUserAction(sessionId, { type: 'add_dart', segment: S1 })
    const b = engine.onUserAction(sessionId, { type: 'undo_dart' })
    release()
    await Promise.all([a, b])
    expect(mem.events.map(e => e.kind)).toEqual(['add_dart', 'undo_dart'])
    expect(engine.getSession(sessionId)!.openDarts).toEqual([])
  })

  it('ignores input after the game is won', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'x01', { ...CONFIG, bullOff: 'off', startScore: 301 }, [{ name: 'A' }])
    for (let i = 0; i < 5; i++) {   // 5 × 60 = 300, then 1
      for (const s of [S20, S20, S20]) await engine.onUserAction(sessionId, { type: 'add_dart', segment: s })
      await engine.onUserAction(sessionId, { type: 'takeout' })
    }
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S1 })
    await engine.onUserAction(sessionId, { type: 'takeout' })
    expect(mem.finished.has(sessionId)).toBe(true)
    const logged = mem.events.length
    await engine.onUserAction(sessionId, { type: 'undo_dart' })
    expect(mem.events.length).toBe(logged)
  })

  it('aborting keeps the log and writes no result', async () => {
    const mem = memoryStore()
    const engine = new SessionEngine(mem.store, vi.fn())
    const { sessionId } = await engine.create('user-1', null, 'atc', games.atc!.defaultConfig, [{ name: 'A' }])
    await engine.onUserAction(sessionId, { type: 'add_dart', segment: S1 })
    await engine.deleteSession(sessionId)
    expect(mem.aborted).toEqual([sessionId])
    expect(mem.events).toHaveLength(1)
    expect(mem.finished.has(sessionId)).toBe(false)
  })

  it('rebuild aborts games it cannot restore', async () => {
    const mem = memoryStore()
    mem.sessions.set('gone', { id: 'gone', owner_user_id: 'user-1', board_db_id: null, game_id: 'no-such-game', game_version: 1, rng_seed: 0, config: {}, players: [{ name: 'A', user_id: 'user-1' }], status: 'active', created_at: new Date() })
    await new SessionEngine(mem.store, vi.fn()).rebuild()
    expect(mem.aborted).toEqual(['gone'])
  })
})
```

In `backend/src/session/engine.test.ts`: replace `makeStore()` with the new `EngineStore` shape (all methods `vi.fn().mockResolvedValue(...)`, `getActiveSessions`/`getSessionEvents` resolving `[]`), replace `setSessionFinished` expectations with `finishSession` (won) or `abortSession` (deleted), and delete the old `describe('rebuild', ...)` tests that fed `getBridgeEventsForBoard` (the new replay tests cover rebuild).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/session`
Expected: FAIL: `./replay.js` missing; `EngineStore` has no `appendEvent`.

- [ ] **Step 3: Implement `replay.ts`**

```ts
import { z } from 'zod'
import { ClientMessageSchema } from '../schema/zod.js'
import { parseBoardEvent } from './boardEvent.js'
import { applyInput, type GameInput } from './apply.js'
import { seededRng } from './rng.js'
import type { NewGameDart } from '../db/queries.js'
import type { AnyGameModule, CommittedVisit, GameConfig, Player, SeatResult, Session } from './types.js'

/** Reports data the engine had to skip (message, details). */
export type WarnFn = (message: string, details: unknown) => void

// A game's config as stored (JSONB), validated before a game is set up from it
export const StoredConfigSchema = z.record(z.string(), z.unknown())

const UserActionSchema = ClientMessageSchema.shape.action

/** A logged input as read back from game_session_events. */
export type LoggedInput = { seq: number; source: string; kind: string; data: unknown; created_at: Date }

/** The input a log entry recorded, or null when it can't be read back. */
export function parseLoggedInput(row: LoggedInput): GameInput | null {
  if (row.source === 'board') {
    const event = parseBoardEvent(row.kind, row.data)
    return event ? { source: 'board', event } : null
  }
  const action = UserActionSchema.safeParse(row.data)
  return action.success ? { source: 'user', action: action.data } : null
}

/** A session at its start, set up exactly like create() set it up. */
export function newSession(a: {
  id: string; ownerUserId: string; boardId: string | null; module: AnyGameModule
  config: GameConfig; players: Player[]; seed: number; createdAt: Date
}): Session {
  const initial = a.module.init(a.config, a.players, seededRng(a.seed))
  return {
    id: a.id, ownerUserId: a.ownerUserId, boardId: a.boardId, players: a.players, module: a.module,
    committedState: initial, currentState: initial, openVisitEvents: [], openDarts: [],
    status: 'active', createdAt: a.createdAt, seed: a.seed, visitCount: 0, nextSeq: 0,
    totalDarts: Array<number>(a.players.length).fill(0),
    totalVisits: Array<number>(a.players.length).fill(0),
    bmStatus: null,
  }
}

/** Re-applies a game's logged inputs in order; returns the visits they committed. */
export function replay(session: Session, rows: LoggedInput[], warn: WarnFn): { visits: CommittedVisit<unknown>[]; won: boolean } {
  const visits: CommittedVisit<unknown>[] = []
  let won = false
  for (const row of rows) {
    const input = parseLoggedInput(row)
    if (!input) {
      warn('skipped a log entry that does not parse', { sessionId: session.id, seq: row.seq, kind: row.kind })
      continue
    }
    const outcome = applyInput(session, input, row.created_at)
    if (outcome.committed) visits.push(outcome.committed)
    if (outcome.won) won = true
  }
  session.nextSeq = (rows.at(-1)?.seq ?? -1) + 1
  return { visits, won }
}

/** game_darts rows for a committed visit. */
export function dartRows(sessionId: string, v: CommittedVisit<unknown>): NewGameDart[] {
  return v.darts.map(d => ({
    session_id: sessionId, visit: v.visit, dart_index: d.index, seat: v.seat, leg: v.leg, phase: v.phase,
    segment: d.segment, coords: d.coords, source: d.source, corrected: d.corrected, thrown_at: new Date(d.thrownAt),
  }))
}

/** Each seat's placement and stats for a won game. */
export function results(session: Session): SeatResult[] {
  return session.module.summarize(session.committedState, { totalDarts: session.totalDarts, totalVisits: session.totalVisits })
}
```

- [ ] **Step 4: Rework the engine**

In `backend/src/session/engine.ts`:

```ts
export interface EngineStore {
  insertSession(data: NewGameSession): Promise<void>
  getActiveSessions(): Promise<StoredGameSession[]>
  getSessionEvents(sessionId: string): Promise<StoredSessionEvent[]>
  appendEvent(event: NewSessionEvent): Promise<void>
  insertDarts(rows: NewGameDart[]): Promise<void>
  finishSession(id: string, finishedAt: Date, results: SeatResult[]): Promise<void>
  abortSession(id: string, finishedAt: Date): Promise<void>
}

export function createEngineStore(db: Kysely<Database>): EngineStore {
  return {
    insertSession: (d) => queries.insertGameSession(db, d),
    getActiveSessions: () => queries.getActiveGameSessions(db),
    getSessionEvents: (id) => queries.getSessionEvents(db, id),
    appendEvent: (e) => queries.appendSessionEvent(db, e),
    insertDarts: (rows) => queries.insertGameDarts(db, rows),
    finishSession: (id, at, r) => queries.finishGameSession(db, id, at, r),
    abortSession: (id, at) => queries.abortGameSession(db, id, at),
  }
}
```

In the class:

```ts
  // Inputs of one session are logged and applied strictly one after another, so the
  // log's order is the order they were applied in
  private queues = new Map<string, Promise<unknown>>()

  private enqueue<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(sessionId) ?? Promise.resolve()).then(task)
    this.queues.set(sessionId, run.catch(() => undefined))
    return run
  }
```

`create()`: build the session with `newSession({ id: sessionId, ownerUserId, boardId, module: mod, config, players, seed, createdAt: new Date() })` (keep the insert from Task 3).

```ts
  async onBridgeEvent(boardId: string, kind: string, data: unknown, bridgeEventId: string | null = null): Promise<void> {
    const session = this.byBoard.get(boardId)
    if (!session) return
    const event = parseBoardEvent(kind, data)
    if (!event && (kind === 'dart.detected' || kind === 'dart.corrected')) {
      this.warn(`ignored ${kind} event: data does not match the bridge schema`, { boardId, data })
    }
    // board.status only feeds the status pill: kept on the session, not logged
    if (event?.kind === 'board.status') session.bmStatus = readBoardStatus(event.data)
    else if (event) await this.record(session, { source: 'board', event }, { kind, data }, bridgeEventId)
    this.push(session.id)
  }

  async onUserAction(sessionId: string, action: UserAction): Promise<void> {
    const session = this.byId.get(sessionId)
    if (!session) return
    await this.record(session, { source: 'user', action }, { kind: action.type, data: action }, null)
    this.push(session.id)
  }

  // Log the input (raw, as received), then apply it and store what it committed
  private record(session: Session, input: GameInput, raw: { kind: string; data: unknown }, bridgeEventId: string | null): Promise<void> {
    return this.enqueue(session.id, async () => {
      // A won or aborted game takes no more input
      if (session.status !== 'active') return
      const at = new Date()
      await this.store.appendEvent({
        session_id: session.id, seq: session.nextSeq, source: input.source,
        kind: raw.kind, data: raw.data, bridge_event_id: bridgeEventId, created_at: at,
      })
      session.nextSeq++
      const outcome = applyInput(session, input, at)
      if (outcome.committed) await this.store.insertDarts(dartRows(session.id, outcome.committed))
      if (outcome.won) await this.finish(session, at)
    })
  }

  private async finish(session: Session, at: Date): Promise<void> {
    session.status = 'finished'
    await this.store.finishSession(session.id, at, results(session))
    this.release(session)
  }

  async rebuild(): Promise<void> {
    for (const row of await this.store.getActiveSessions()) {
      const mod = games[row.game_id]
      const config = StoredConfigSchema.safeParse(row.config)
      // Unknown game, no owner (account deleted) or unreadable setup: it can't be played on
      if (!mod || !row.owner_user_id || !config.success || row.players.length === 0) {
        await this.store.abortSession(row.id, new Date())
        continue
      }
      const session = newSession({
        id: row.id, ownerUserId: row.owner_user_id, boardId: row.board_db_id, module: mod,
        config: config.data, players: row.players.map(p => ({ name: p.name })),
        seed: row.rng_seed, createdAt: row.created_at,
      })
      const events = await this.store.getSessionEvents(row.id)
      const { visits, won } = replay(session, events, this.warn)
      // Darts a crash kept from being stored; the ones already there are skipped
      await this.store.insertDarts(visits.flatMap(v => dartRows(row.id, v)))
      // The log ends in a win that wasn't saved: save it instead of resuming
      if (won) {
        session.status = 'finished'
        await this.store.finishSession(row.id, events.at(-1)?.created_at ?? new Date(), results(session))
        continue
      }
      if (session.boardId) this.byBoard.set(session.boardId, session)
      this.byOwner.set(session.ownerUserId, session)
      this.byId.set(session.id, session)
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const session = this.byId.get(sessionId)
    if (!session) return false
    await this.enqueue(sessionId, async () => {
      if (session.status === 'active') await this.store.abortSession(sessionId, new Date())
      session.status = 'finished'
      this.release(session)
      this.byId.delete(sessionId)
    })
    return true
  }
```

Remove `settle()`, `StoredPlayersSchema`, the local `StoredConfigSchema` (now in `replay.ts`) and the old `rebuild` body. Note: `deleteSession` on an already finished session (still in `byId` for its final snapshot) only drops it from memory; it must not abort a finished game.

In `backend/src/db/queries.ts` delete `setGameSessionFinished` and `getBridgeEventsForBoardDbId` and their tests in `queries.test.ts`. Check `grep -rn "setGameSessionFinished\|getBridgeEventsForBoardDbId" backend/src` is empty.

- [ ] **Step 5: Run tests, typecheck and lint**

Run: `cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npm test && npm run typecheck && npm run lint`
Expected: PASS. If "replays to exactly the game that was played" fails on `committedState`, diff the two states: a mismatch means some branch of `applyInput` depends on something not in the log (time, randomness, `bmStatus`); fix that branch, not the test.

- [ ] **Step 6: Commit**

```bash
git add backend/src/session backend/src/db
git commit -m "feat(engine): log every input, store darts and results, restore games from the log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Games API: game modes, history list, stats, detail

**Files:**
- Modify: `schema/api-v1.yaml` (paths, tags, components), regenerate
- Create: `backend/src/history/cursor.ts`, `backend/src/history/stats.ts`, `backend/src/history/detail.ts`, `backend/src/history/history.test.ts`, `backend/src/db/history.ts`, `backend/src/db/history.test.ts`, `backend/src/api/games.ts`, `backend/src/api/games.test.ts`
- Modify: `backend/src/api/sessions.ts` (remove `/api/games`), `backend/src/api/sessions.test.ts` (move the `/api/games` test), `backend/src/app.ts` (register), `backend/frontend/src/routes/CreateSession.svelte`, `backend/frontend/src/lib/api/index.ts`

**Interfaces:**
- Consumes: `newSession`, `replay`, `StoredConfigSchema` (Task 5); `getSeats`, `getSessionEvents` (Task 3); `games` registry.
- Produces:
  ```ts
  // history/cursor.ts
  export type Cursor = { finishedAt: Date; id: string }
  export function encodeCursor(c: Cursor): string
  export function decodeCursor(s: string): Cursor | null
  // history/stats.ts
  export type StatRow = { mode: string; finishedAt: Date; placement: number; seats: number; stats: Record<string, number> }
  export function aggregateStats(rows: StatRow[], days: number, now: Date): GameStats   // GameStats = components['schemas']['GameStats']
  // db/history.ts
  export type HistorySeat = { seat: number; name: string; user_id: string | null; placement: number; stats: Record<string, number> }
  export type HistoryGame = { id: string; game_id: string; config: Record<string, unknown>; rng_seed: number; created_at: Date; finished_at: Date; board: { id: string; name: string } | null; mySeat: number | null; seats: HistorySeat[] }
  export function listFinishedGames(db, userId: string, opts: { mode?: string; limit: number; after: Cursor | null }): Promise<{ games: HistoryGame[]; next: Cursor | null }>
  export function getStatRows(db, userId: string, since: Date): Promise<StatRow[]>
  export function getViewableGame(db, id: string, userId: string): Promise<HistoryGame | undefined>
  // history/detail.ts
  export function buildDetail(game: HistoryGame, events: StoredSessionEvent[], warn: WarnFn): X01Detail | AtcDetail | null
  // api/games.ts
  export function gamesApiPlugin(app, opts: { db: Kysely<Database> }, done): void
  export function toSummary(g: HistoryGame): GameSummary
  ```

- [ ] **Step 1: Extend the contract**

In `schema/api-v1.yaml`:

1. Tags: change `games` to `description: Finished games (history)` and add `- name: gamemodes` / `description: Available game modes`.
2. Replace the `/api/games` path with:

```yaml
  /api/gamemodes:
    get:
      operationId: listGameModes
      summary: List game modes with their default config and config metadata
      tags: [gamemodes]
      security: []
      responses:
        '200':
          description: Available game modes
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GameModeList' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/games:
    get:
      operationId: listGames
      summary: Finished games the signed-in user played in, newest first
      tags: [games]
      parameters:
        - { name: mode, in: query, required: false, schema: { type: string, minLength: 1 }, description: Only this game mode }
        - { name: limit, in: query, required: false, schema: { type: integer, minimum: 1, maximum: 100, default: 25 } }
        - { name: cursor, in: query, required: false, schema: { type: string, minLength: 1 }, description: nextCursor of the previous page }
      responses:
        '200':
          description: A page of games
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GameList' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/games/stats:
    get:
      operationId: getGameStats
      summary: The signed-in user's results over the last days, per game mode
      tags: [games]
      parameters:
        - { name: days, in: query, required: false, schema: { type: integer, minimum: 1, maximum: 365, default: 30 } }
      responses:
        '200':
          description: Totals and per-mode stat aggregates
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GameStats' }
        '400': { $ref: '#/components/responses/BadRequest' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '429': { $ref: '#/components/responses/TooManyRequests' }

  /api/games/{id}:
    parameters:
      - $ref: '#/components/parameters/GameId'
    get:
      operationId: getGame
      summary: A finished game with its per-mode detail
      description: Visible to the players holding a seat, or to anyone signed in if the game is public. Anything else is 404.
      tags: [games]
      responses:
        '200':
          description: The game
          content:
            application/json:
              schema: { $ref: '#/components/schemas/GameDetail' }
        '401': { $ref: '#/components/responses/Unauthorized' }
        '404': { $ref: '#/components/responses/NotFound' }
        '429': { $ref: '#/components/responses/TooManyRequests' }
```

3. `components.parameters`: add `GameId` (same as `SessionId`).
4. `components.schemas`: delete the old `GameList` (`{ games: GameInfo[] }`) and add:

```yaml
    GameModeList:
      type: object
      required: [modes]
      additionalProperties: false
      properties:
        modes:
          type: array
          items: { $ref: '#/components/schemas/GameInfo' }

    GameSeat:
      type: object
      required: [seat, name, userId, placement, stats]
      additionalProperties: false
      properties:
        seat: { type: integer, minimum: 0 }
        name: { type: string }
        userId: { type: string, nullable: true, description: "The seat's account; null for guests, and for everyone when viewing a public game you didn't play in" }
        placement: { type: integer, minimum: 1 }
        stats:
          type: object
          additionalProperties: { type: number }
          description: Per game mode, e.g. X01 average, dartsThrown, legsWon, pointsScored; ATC dartsThrown, targetsHit
    GameSummary:
      type: object
      required: [id, mode, config, createdAt, finishedAt, board, mySeat, players]
      additionalProperties: false
      properties:
        id: { type: string }
        mode: { type: string }
        config: { type: object, additionalProperties: true }
        createdAt: { type: string, format: date-time }
        finishedAt: { type: string, format: date-time }
        board:
          type: object
          nullable: true
          required: [id, name]
          additionalProperties: false
          properties:
            id: { type: string }
            name: { type: string }
        mySeat: { type: integer, minimum: 0, nullable: true }
        players:
          type: array
          items: { $ref: '#/components/schemas/GameSeat' }
    GameList:
      type: object
      required: [games, nextCursor]
      additionalProperties: false
      properties:
        games:
          type: array
          items: { $ref: '#/components/schemas/GameSummary' }
        nextCursor: { type: string, nullable: true }
    StatAggregate:
      type: object
      required: [avg, min, max, previousAvg]
      additionalProperties: false
      properties:
        avg: { type: number }
        min: { type: number }
        max: { type: number }
        previousAvg: { type: number, nullable: true, description: Average over the period before; null without games then }
    ModeStats:
      type: object
      required: [matches, wins, contested, stats]
      additionalProperties: false
      properties:
        matches: { type: integer, minimum: 0 }
        wins: { type: integer, minimum: 0 }
        contested: { type: integer, minimum: 0, description: Games with two or more seats }
        stats:
          type: object
          additionalProperties: { $ref: '#/components/schemas/StatAggregate' }
    GameStats:
      type: object
      required: [days, matches, wins, contested, modes]
      additionalProperties: false
      properties:
        days: { type: integer, minimum: 1 }
        matches: { type: integer, minimum: 0 }
        wins: { type: integer, minimum: 0, description: 1st place in a contested game }
        contested: { type: integer, minimum: 0, description: Games with two or more seats; win rate = wins / contested }
        modes:
          type: object
          additionalProperties: { $ref: '#/components/schemas/ModeStats' }
    GameDetail:
      type: object
      required: [game, detail]
      additionalProperties: false
      properties:
        game: { $ref: '#/components/schemas/GameSummary' }
        detail:
          oneOf:
            - $ref: '#/components/schemas/X01Detail'
            - $ref: '#/components/schemas/AtcDetail'
          discriminator:
            propertyName: mode
            mapping:
              x01: '#/components/schemas/X01Detail'
              atc: '#/components/schemas/AtcDetail'
```

Run: `npm run gen:api && npm run lint:api` (repo root), then `cd bridge && go build ./...`.
Expected: generation succeeds, lint clean, bridge builds (it only uses bridge-tagged operations).

- [ ] **Step 2: Write the failing tests**

`backend/src/history/history.test.ts` (pure, no DB):

```ts
import { describe, it, expect, vi } from 'vitest'
import { encodeCursor, decodeCursor } from './cursor.js'
import { aggregateStats, type StatRow } from './stats.js'
import { buildDetail } from './detail.js'
import type { HistoryGame } from '../db/history.js'

describe('cursor', () => {
  it('round-trips', () => {
    const c = { finishedAt: new Date('2026-10-01T10:00:00.123Z'), id: '01J9X' }
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })
  it('rejects junk', () => {
    expect(decodeCursor('nope')).toBeNull()
    expect(decodeCursor(Buffer.from('["x", 1]').toString('base64url'))).toBeNull()
  })
})

const now = new Date('2026-10-01T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)
const row = (o: Partial<StatRow>): StatRow => ({ mode: 'x01', finishedAt: daysAgo(1), placement: 1, seats: 2, stats: {}, ...o })

describe('aggregateStats', () => {
  it('counts matches, contested games and wins in the period', () => {
    const s = aggregateStats([
      row({ placement: 1 }), row({ placement: 2 }), row({ seats: 1, placement: 1, mode: 'atc' }),
      row({ finishedAt: daysAgo(40) }),
    ], 30, now)
    expect([s.days, s.matches, s.contested, s.wins]).toEqual([30, 3, 2, 1])
    expect(s.modes.atc).toMatchObject({ matches: 1, contested: 0, wins: 0 })
  })

  it('aggregates each stat with the previous period average', () => {
    const s = aggregateStats([
      row({ stats: { average: 60 } }), row({ stats: { average: 80 } }),
      row({ finishedAt: daysAgo(45), stats: { average: 50 } }),
      row({ finishedAt: daysAgo(70), stats: { average: 10 } }),
    ], 30, now)
    expect(s.modes.x01.stats.average).toEqual({ avg: 70, min: 60, max: 80, previousAvg: 50 })
  })

  it('previousAvg is null without earlier games', () => {
    expect(aggregateStats([row({ stats: { dartsThrown: 52 } })], 30, now).modes.x01.stats.dartsThrown.previousAvg).toBeNull()
  })

  it('no games: zeros and no modes', () => {
    expect(aggregateStats([], 30, now)).toEqual({ days: 30, matches: 0, wins: 0, contested: 0, modes: {} })
  })
})

describe('buildDetail', () => {
  const game: HistoryGame = {
    id: 'g1', game_id: 'atc', config: { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' },
    rng_seed: 0, created_at: new Date(0), finished_at: new Date(1), board: null, mySeat: 0,
    seats: [{ seat: 0, name: 'A', user_id: 'u1', placement: 1, stats: {} }],
  }
  const at = new Date('2026-10-01T10:00:00.000Z')
  it('replays the log into the mode detail', () => {
    const d = buildDetail(game, [
      { seq: 0, source: 'user', kind: 'add_dart', data: { type: 'add_dart', segment: { name: 'S1', number: 1, bed: 'Single', multiplier: 1 } }, created_at: at },
      { seq: 1, source: 'user', kind: 'takeout', data: { type: 'takeout' }, created_at: at },
    ], vi.fn())
    expect(d).toMatchObject({ mode: 'atc', visits: [{ visit: 0, seat: 0, hits: 1, targetBefore: 1, targetAfter: 2 }] })
  })
  it('null for a mode that no longer exists', () => {
    expect(buildDetail({ ...game, game_id: 'gone' }, [], vi.fn())).toBeNull()
  })
})
```

`backend/src/api/games.test.ts` (routes with mocked data access, response validation on):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFastify } from './fastify.js'
import { gamesApiPlugin } from './games.js'
import type { HistoryGame } from '../db/history.js'

vi.mock('../auth/middleware.js', () => ({
  requireAuth: vi.fn((req: any, _reply: any, done: () => void) => { req.userId = 'user-1'; done() }),
}))
vi.mock('../db/history.js', () => ({
  listFinishedGames: vi.fn(),
  getStatRows: vi.fn().mockResolvedValue([]),
  getViewableGame: vi.fn(),
}))
vi.mock('../db/queries.js', () => ({ getSessionEvents: vi.fn().mockResolvedValue([]) }))

import * as history from '../db/history.js'
import * as queries from '../db/queries.js'

const game = (o: Partial<HistoryGame> = {}): HistoryGame => ({
  id: 'g1', game_id: 'x01', config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3, bullOff: 'off', bullValue: '25_50', maxRounds: 50 },
  rng_seed: 0, created_at: new Date('2026-10-01T09:00:00Z'), finished_at: new Date('2026-10-01T09:30:00Z'),
  board: { id: 'b1', name: 'Living room' }, mySeat: 0,
  seats: [
    { seat: 0, name: 'Christoph', user_id: 'user-1', placement: 1, stats: { average: 83.9, legsWon: 3 } },
    { seat: 1, name: 'Guest', user_id: null, placement: 2, stats: { average: 71.6, legsWon: 1 } },
  ],
  ...o,
})

function makeApp() {
  const app = createFastify()
  app.register(gamesApiPlugin, { db: {} as any })
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/gamemodes', () => {
  it('lists the game modes', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/gamemodes' })
    expect(res.statusCode).toBe(200)
    expect(res.json().modes.map((m: any) => m.id)).toEqual(['atc', 'x01'])
  })
})

describe('GET /api/games', () => {
  it('returns a page of summaries and the next cursor', async () => {
    vi.mocked(history.listFinishedGames).mockResolvedValue({ games: [game()], next: { finishedAt: new Date('2026-10-01T09:30:00Z'), id: 'g1' } })
    const res = await makeApp().inject({ method: 'GET', url: '/api/games?mode=x01&limit=10' })
    expect(res.statusCode).toBe(200)
    expect(history.listFinishedGames).toHaveBeenCalledWith(expect.anything(), 'user-1', { mode: 'x01', limit: 10, after: null })
    const body = res.json()
    expect(body.games[0]).toMatchObject({ id: 'g1', mode: 'x01', mySeat: 0, board: { name: 'Living room' }, finishedAt: '2026-10-01T09:30:00.000Z' })
    expect(body.games[0].players[1]).toEqual({ seat: 1, name: 'Guest', userId: null, placement: 2, stats: { average: 71.6, legsWon: 1 } })
    expect(typeof body.nextCursor).toBe('string')
  })

  it('passes the cursor back in and defaults the limit', async () => {
    vi.mocked(history.listFinishedGames).mockResolvedValue({ games: [], next: null })
    const first = { games: [game()], next: { finishedAt: new Date('2026-10-01T09:30:00Z'), id: 'g1' } }
    vi.mocked(history.listFinishedGames).mockResolvedValueOnce(first)
    const app = makeApp()
    const cursor = (await app.inject({ method: 'GET', url: '/api/games' })).json().nextCursor
    const res = await app.inject({ method: 'GET', url: `/api/games?cursor=${cursor}` })
    expect(res.json()).toEqual({ games: [], nextCursor: null })
    expect(vi.mocked(history.listFinishedGames).mock.calls[1][2]).toEqual({ mode: undefined, limit: 25, after: first.next })
  })

  it('400 for a cursor it did not issue', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/games?cursor=bogus' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /api/games/stats', () => {
  it('aggregates the last 30 days by default', async () => {
    const res = await makeApp().inject({ method: 'GET', url: '/api/games/stats' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ days: 30, matches: 0, wins: 0, contested: 0, modes: {} })
    const since = vi.mocked(history.getStatRows).mock.calls[0][2]
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(60 * 86_400_000 - 1000)
  })
})

describe('GET /api/games/:id', () => {
  it('404 when the game is not viewable', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(undefined)
    expect((await makeApp().inject({ method: 'GET', url: '/api/games/g1' })).statusCode).toBe(404)
  })

  it('returns the game and its detail', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(game())
    const res = await makeApp().inject({ method: 'GET', url: '/api/games/g1' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ game: { id: 'g1', mySeat: 0 }, detail: { mode: 'x01', legs: [] } })
    expect(queries.getSessionEvents).toHaveBeenCalledWith(expect.anything(), 'g1')
  })

  it('hides account ids from someone without a seat', async () => {
    vi.mocked(history.getViewableGame).mockResolvedValue(game({ mySeat: null }))
    const body = (await makeApp().inject({ method: 'GET', url: '/api/games/g1' })).json()
    expect(body.game.mySeat).toBeNull()
    expect(body.game.players.map((p: any) => p.userId)).toEqual([null, null])
  })
})
```

`backend/src/db/history.test.ts` (Postgres; same setup style as `queries.test.ts`):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, type Kysely } from 'kysely'
import { createDb } from './index.js'
import { runMigrations, insertGameSession, finishGameSession, abortGameSession, insertBoard } from './queries.js'
import { listFinishedGames, getStatRows, getViewableGame } from './history.js'
import type { Database } from './schema.js'

const url = process.env.TEST_DATABASE_URL ?? ''
// Own schema: Vitest runs test files in parallel, and queries.test.ts wipes the shared tables
const SCHEMA = 'history_test'

describe.skipIf(!process.env.TEST_DATABASE_URL)('history queries', () => {
  let admin: Kysely<Database>
  let db: Kysely<Database>
  const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 10, min))

  async function game(id: string, mode: string, owner: string, seats: { name: string; user_id: string | null }[], finishedAt: Date | 'abort' | 'active', board: string | null = null) {
    await insertGameSession(db, { id, owner_user_id: owner, board_db_id: board, game_id: mode, game_version: 1, rng_seed: 0, config: {}, players: seats })
    if (finishedAt === 'abort') await abortGameSession(db, id, t(0))
    else if (finishedAt !== 'active') await finishGameSession(db, id, finishedAt, seats.map((_, i) => ({ placement: i + 1, stats: { dartsThrown: 10 + i } })))
  }

  beforeAll(async () => {
    admin = createDb(url)
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await sql.raw(`CREATE SCHEMA ${SCHEMA}`).execute(admin)
    db = createDb(`${url}${url.includes('?') ? '&' : '?'}options=-c%20search_path%3D${SCHEMA}`)
    await runMigrations(db)
    await db.insertInto('user').values([
      { id: 'u1', name: 'One', email: 'one@example.com', emailVerified: false, image: null },
      { id: 'u2', name: 'Two', email: 'two@example.com', emailVerified: false, image: null },
    ]).execute()
    await insertBoard(db, { id: 'b1', owner_user_id: 'u1', name: 'Living room', token_hash: 'h-b1' })
    await game('x-1', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }, { name: 'Guest', user_id: null }], t(1), 'b1')
    await game('a-1', 'atc', 'u1', [{ name: 'One', user_id: 'u1' }], t(2))
    await game('x-2', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }, { name: 'Guest', user_id: null }], t(3))
    await game('x-aborted', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }], 'abort')
    await game('x-running', 'x01', 'u1', [{ name: 'One', user_id: 'u1' }], 'active')
    await game('x-other', 'x01', 'u2', [{ name: 'Two', user_id: 'u2' }], t(4))
  })

  afterAll(async () => {
    await db.destroy()
    await sql.raw(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).execute(admin)
    await admin.destroy()
  })

  it('lists my finished games newest first, with seats and board', async () => {
    const { games, next } = await listFinishedGames(db, 'u1', { limit: 10, after: null })
    expect(games.map(g => g.id)).toEqual(['x-2', 'a-1', 'x-1'])
    expect(next).toBeNull()
    expect(games[2]).toMatchObject({ board: { id: 'b1', name: 'Living room' }, mySeat: 0, finished_at: t(1) })
    expect(games[2].seats.map(s => [s.name, s.placement, s.stats])).toEqual([['One', 1, { dartsThrown: 10 }], ['Guest', 2, { dartsThrown: 11 }]])
  })

  it('filters by mode and pages with the cursor', async () => {
    const p1 = await listFinishedGames(db, 'u1', { mode: 'x01', limit: 1, after: null })
    expect(p1.games.map(g => g.id)).toEqual(['x-2'])
    const p2 = await listFinishedGames(db, 'u1', { mode: 'x01', limit: 1, after: p1.next })
    expect(p2.games.map(g => g.id)).toEqual(['x-1'])
    expect(p2.next).toBeNull()
  })

  it('stat rows: my seat, placed games since the date, seat count', async () => {
    const rows = await getStatRows(db, 'u1', t(2))
    expect(rows.map(r => [r.mode, r.placement, r.seats, r.stats])).toEqual(expect.arrayContaining([['atc', 1, 1, { dartsThrown: 10 }], ['x01', 1, 2, { dartsThrown: 10 }]]))
    expect(rows).toHaveLength(2)
  })

  it('a game is viewable by its seats; private games are 404 for others until public', async () => {
    expect((await getViewableGame(db, 'x-1', 'u1'))?.mySeat).toBe(0)
    expect(await getViewableGame(db, 'x-1', 'u2')).toBeUndefined()
    await db.updateTable('game_sessions').set({ visibility: 'public' }).where('id', '=', 'x-1').execute()
    expect((await getViewableGame(db, 'x-1', 'u2'))?.mySeat).toBeNull()
    expect(await getViewableGame(db, 'x-aborted', 'u1')).toBeUndefined()
    expect(await getViewableGame(db, 'x-running', 'u1')).toBeUndefined()
  })
})
```

Move the `GET /api/games` test out of `sessions.test.ts` (it now lives in `games.test.ts`).

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/history src/api/games.test.ts`
Expected: FAIL: modules missing.

- [ ] **Step 4: Implement**

`backend/src/history/cursor.ts`:

```ts
import { z } from 'zod'

/** Where a page of the history ends: keyset on (finished_at, id), newest first. */
export type Cursor = { finishedAt: Date; id: string }

const CursorSchema = z.tuple([z.iso.datetime(), z.string().min(1)])

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify([c.finishedAt.toISOString(), c.id])).toString('base64url')
}

/** The cursor, or null when the string isn't one encodeCursor made. */
export function decodeCursor(s: string): Cursor | null {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(s, 'base64url').toString('utf8')))
    return parsed.success ? { finishedAt: new Date(parsed.data[0]), id: parsed.data[1] } : null
  } catch {
    return null
  }
}
```

(`z.iso.datetime()` is zod 4; if it isn't available in the installed version use `z.string().datetime()`.)

`backend/src/history/stats.ts`:

```ts
import type { components } from '../schema/api.js'

type GameStats = components['schemas']['GameStats']
type ModeStats = components['schemas']['ModeStats']
type StatAggregate = components['schemas']['StatAggregate']

/** My seat in one finished game. */
export type StatRow = { mode: string; finishedAt: Date; placement: number; seats: number; stats: Record<string, number> }

const DAY_MS = 86_400_000
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

function counts(rows: StatRow[]) {
  const contested = rows.filter(r => r.seats >= 2)
  return { matches: rows.length, contested: contested.length, wins: contested.filter(r => r.placement === 1).length }
}

const valuesOf = (rows: StatRow[], key: string) => rows.flatMap(r => key in r.stats ? [r.stats[key]] : [])

/**
 * Totals and per-mode aggregates over the last `days` before `now`; `previousAvg`
 * compares with the `days` before that. `rows` may reach further back (needs 2 × days).
 * Solo games count as matches but not towards the win rate (wins / contested).
 */
export function aggregateStats(rows: StatRow[], days: number, now: Date): GameStats {
  const start = now.getTime() - days * DAY_MS
  const current = rows.filter(r => r.finishedAt.getTime() >= start)
  const previous = rows.filter(r => r.finishedAt.getTime() < start && r.finishedAt.getTime() >= start - days * DAY_MS)

  const modes: Record<string, ModeStats> = {}
  for (const mode of new Set(current.map(r => r.mode))) {
    const mine = current.filter(r => r.mode === mode)
    const before = previous.filter(r => r.mode === mode)
    const stats: Record<string, StatAggregate> = {}
    for (const key of new Set(mine.flatMap(r => Object.keys(r.stats)))) {
      const values = valuesOf(mine, key)
      const prev = valuesOf(before, key)
      stats[key] = { avg: mean(values), min: Math.min(...values), max: Math.max(...values), previousAvg: prev.length > 0 ? mean(prev) : null }
    }
    modes[mode] = { ...counts(mine), stats }
  }
  return { days, ...counts(current), modes }
}
```

`backend/src/db/history.ts`:

```ts
import { sql, type Kysely, type NotNull } from 'kysely'
import { z } from 'zod'
import type { Database } from './schema.js'
import type { Cursor } from '../history/cursor.js'
import type { StatRow } from '../history/stats.js'

export type HistorySeat = { seat: number; name: string; user_id: string | null; placement: number; stats: Record<string, number> }
export type HistoryGame = {
  id: string; game_id: string; config: Record<string, unknown>; rng_seed: number
  created_at: Date; finished_at: Date; board: { id: string; name: string } | null
  /** The viewer's seat; null when they don't hold one (a public game). */
  mySeat: number | null
  seats: HistorySeat[]
}

// JSONB written by this backend; read defensively
const StatsSchema = z.record(z.string(), z.number()).catch({})
const ConfigSchema = z.record(z.string(), z.unknown()).catch({})

/** Placed seats (finished games only have those) of these games, in seat order. */
async function placedSeats(db: Kysely<Database>, ids: string[]): Promise<Map<string, HistorySeat[]>> {
  const by = new Map<string, HistorySeat[]>()
  if (ids.length === 0) return by
  const rows = await db.selectFrom('game_players')
    .select(['session_id', 'seat', 'name', 'user_id', 'placement', 'stats'])
    .where('session_id', 'in', ids)
    .where('placement', 'is not', null)
    .$narrowType<{ placement: NotNull }>()
    .orderBy('session_id').orderBy('seat')
    .execute()
  for (const r of rows) {
    const seat = { seat: r.seat, name: r.name, user_id: r.user_id, placement: r.placement, stats: StatsSchema.parse(r.stats) }
    by.set(r.session_id, [...(by.get(r.session_id) ?? []), seat])
  }
  return by
}

function finishedGames(db: Kysely<Database>) {
  return db.selectFrom('game_sessions as gs')
    .leftJoin('boards as b', 'b.id', 'gs.board_db_id')
    .select(['gs.id', 'gs.game_id', 'gs.config', 'gs.rng_seed', 'gs.created_at', 'gs.finished_at', 'gs.visibility', 'b.id as board_id', 'b.name as board_name'])
    .where('gs.status', '=', 'finished')
    .where('gs.finished_at', 'is not', null)
    .$narrowType<{ finished_at: NotNull }>()
}

type GameRow = { id: string; game_id: string; config: unknown; rng_seed: number; created_at: Date; finished_at: Date; board_id: string | null; board_name: string | null }

function toGame(r: GameRow, seats: HistorySeat[], mySeat: number | null): HistoryGame {
  return {
    id: r.id, game_id: r.game_id, config: ConfigSchema.parse(r.config), rng_seed: r.rng_seed,
    created_at: r.created_at, finished_at: r.finished_at,
    board: r.board_id !== null && r.board_name !== null ? { id: r.board_id, name: r.board_name } : null,
    mySeat, seats,
  }
}

/** The user's finished, placed games, newest first, one page after `after`. */
export async function listFinishedGames(db: Kysely<Database>, userId: string, opts: { mode?: string; limit: number; after: Cursor | null }): Promise<{ games: HistoryGame[]; next: Cursor | null }> {
  let q = finishedGames(db)
    .innerJoin('game_players as me', 'me.session_id', 'gs.id')
    .select('me.seat as my_seat')
    .where('me.user_id', '=', userId)
    .where('me.placement', 'is not', null)
    .orderBy('gs.finished_at', 'desc').orderBy('gs.id', 'desc')
    .limit(opts.limit + 1)
  if (opts.mode) q = q.where('gs.game_id', '=', opts.mode)
  const after = opts.after
  if (after) {
    q = q.where(eb => eb.or([
      eb('gs.finished_at', '<', after.finishedAt),
      eb.and([eb('gs.finished_at', '=', after.finishedAt), eb('gs.id', '<', after.id)]),
    ]))
  }
  const rows = await q.execute()
  const page = rows.slice(0, opts.limit)
  const seats = await placedSeats(db, page.map(r => r.id))
  const last = page.at(-1)
  return {
    games: page.map(r => toGame(r, seats.get(r.id) ?? [], r.my_seat)),
    next: rows.length > opts.limit && last ? { finishedAt: last.finished_at, id: last.id } : null,
  }
}

/** The user's seat in each finished, placed game since `since`. */
export async function getStatRows(db: Kysely<Database>, userId: string, since: Date): Promise<StatRow[]> {
  const rows = await finishedGames(db)
    .innerJoin('game_players as me', 'me.session_id', 'gs.id')
    .select(['me.placement', 'me.stats', sql<number>`(SELECT count(*)::int FROM game_players p WHERE p.session_id = gs.id)`.as('seats')])
    .where('me.user_id', '=', userId)
    .where('me.placement', 'is not', null)
    .$narrowType<{ placement: NotNull }>()
    .where('gs.finished_at', '>=', since)
    .execute()
  return rows.map(r => ({ mode: r.game_id, finishedAt: r.finished_at, placement: r.placement, seats: r.seats, stats: StatsSchema.parse(r.stats) }))
}

/** A finished game the user may see: they hold a seat, or it is public. */
export async function getViewableGame(db: Kysely<Database>, id: string, userId: string): Promise<HistoryGame | undefined> {
  const row = await finishedGames(db)
    .leftJoin('game_players as me', join => join.onRef('me.session_id', '=', 'gs.id').on('me.user_id', '=', userId))
    .select('me.seat as my_seat')
    .where('gs.id', '=', id)
    .executeTakeFirst()
  if (!row) return undefined
  if (row.my_seat === null && row.visibility !== 'public') return undefined
  const seats = (await placedSeats(db, [id])).get(id) ?? []
  // Finished before game history existed: no result, nothing to show
  if (seats.length === 0) return undefined
  return toGame(row, seats, row.my_seat)
}
```

`backend/src/history/detail.ts`:

```ts
import { games } from '../games/index.js'
import { newSession, replay, StoredConfigSchema, type LoggedInput, type WarnFn } from '../session/replay.js'
import type { AtcDetail, X01Detail } from '../session/types.js'
import type { HistoryGame } from '../db/history.js'

/** The game's per-mode detail, from replaying its input log; null if its mode is gone. */
export function buildDetail(game: HistoryGame, events: LoggedInput[], warn: WarnFn): X01Detail | AtcDetail | null {
  const mod = games[game.game_id]
  const config = StoredConfigSchema.safeParse(game.config)
  if (!mod || !config.success) return null
  const session = newSession({
    id: game.id, ownerUserId: '', boardId: null, module: mod, config: config.data,
    players: game.seats.map(s => ({ name: s.name })), seed: game.rng_seed, createdAt: game.created_at,
  })
  const { visits } = replay(session, events, warn)
  return mod.detail(visits, session.committedState)
}
```

`backend/src/api/games.ts`:

```ts
import type { FastifyInstance, FastifyPluginOptions } from 'fastify'
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import type { components } from '../schema/api.js'
import { gameList } from '../games/index.js'
import { requireAuth } from '../auth/middleware.js'
import { listFinishedGames, getStatRows, getViewableGame, type HistoryGame } from '../db/history.js'
import { getSessionEvents } from '../db/queries.js'
import { decodeCursor, encodeCursor } from '../history/cursor.js'
import { aggregateStats } from '../history/stats.js'
import { buildDetail } from '../history/detail.js'
import { fromSpec } from './spec.js'
import type { Route } from './route.js'

type Opts = FastifyPluginOptions & { db: Kysely<Database> }
type GameSummary = components['schemas']['GameSummary']

const DAY_MS = 86_400_000

/** The API shape of a game; account ids only for someone who holds a seat. */
export function toSummary(g: HistoryGame): GameSummary {
  return {
    id: g.id, mode: g.game_id, config: g.config,
    createdAt: g.created_at.toISOString(), finishedAt: g.finished_at.toISOString(),
    board: g.board, mySeat: g.mySeat,
    players: g.seats.map(s => ({ seat: s.seat, name: s.name, userId: g.mySeat === null ? null : s.user_id, placement: s.placement, stats: s.stats })),
  }
}

export function gamesApiPlugin(app: FastifyInstance, opts: Opts, done: (err?: Error) => void): void {
  const { db } = opts

  app.get<Route<'listGameModes'>>('/api/gamemodes', { schema: fromSpec('listGameModes') }, () => ({
    modes: gameList.map(m => ({ id: m.id, defaultConfig: m.defaultConfig, configMeta: m.configMeta ?? {} })),
  }))

  app.get<Route<'listGames'>>('/api/games', { preValidation: requireAuth, schema: fromSpec('listGames') }, async (req, reply) => {
    const { mode, limit = 25, cursor } = req.query
    const after = cursor === undefined ? null : decodeCursor(cursor)
    if (cursor !== undefined && after === null) return reply.code(400).send({ error: 'invalid cursor' })
    const page = await listFinishedGames(db, req.userId, { mode, limit, after })
    return reply.send({ games: page.games.map(toSummary), nextCursor: page.next ? encodeCursor(page.next) : null })
  })

  app.get<Route<'getGameStats'>>('/api/games/stats', { preValidation: requireAuth, schema: fromSpec('getGameStats') }, async (req) => {
    const days = req.query.days ?? 30
    const now = new Date()
    // Twice the period: the earlier half is the comparison (previousAvg)
    const rows = await getStatRows(db, req.userId, new Date(now.getTime() - 2 * days * DAY_MS))
    return aggregateStats(rows, days, now)
  })

  app.get<Route<'getGame'>>('/api/games/:id', { preValidation: requireAuth, schema: fromSpec('getGame') }, async (req, reply) => {
    const game = await getViewableGame(db, req.params.id, req.userId)
    if (!game) return reply.code(404).send({ error: 'not found' })
    const detail = buildDetail(game, await getSessionEvents(db, game.id), (message, details) => { req.log.warn({ details }, message) })
    if (!detail) return reply.code(404).send({ error: 'not found' })
    return reply.send({ game: toSummary(game), detail })
  })

  done()
}
```

Remove the `/api/games` route (and the `gameList` import) from `backend/src/api/sessions.ts`. Register in `backend/src/app.ts` next to `sessionsApiPlugin`: `await app.register(gamesApiPlugin, { db })` (match how the other plugins are registered there).

Frontend in the same task (the old endpoint is gone):
- `backend/frontend/src/lib/api/index.ts`: add `export type GameSummary = Schemas['GameSummary']`, `export type GameStats = Schemas['GameStats']`, `export type GameSeat = Schemas['GameSeat']`.
- `backend/frontend/src/routes/CreateSession.svelte`: `api.GET('/api/gamemodes')` and `games = gr.data?.modes ?? []`.

- [ ] **Step 5: Run everything**

Run:
```bash
cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npm test && npm run typecheck && npm run lint
cd frontend && npm test && npm run typecheck && npm run lint
```
Expected: PASS, including `spec.test.ts` (every route in the spec and vice versa). If fast-json-stringify chokes on the `oneOf` + `discriminator` response, drop `discriminator` from the YAML (the two `mode` enums already discriminate) and regenerate.

- [ ] **Step 6: Commit**

```bash
git add schema/api-v1.yaml backend/src backend/frontend/src/lib/api backend/frontend/src/routes/CreateSession.svelte bridge/internal/api
git commit -m "feat(api): /api/gamemodes, and /api/games for finished games (list, stats, detail)

BREAKING CHANGE: GET /api/games now lists finished games; game modes moved to GET /api/gamemodes ({ modes }).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend history formatting

**Files:**
- Modify: `backend/frontend/src/lib/gameViews/meta.ts`, `backend/frontend/src/lib/__tests__/meta.test.ts`
- Create: `backend/frontend/src/lib/history.ts`, `backend/frontend/src/lib/__tests__/history.test.ts`

**Interfaces:**
- Consumes: `GameSummary`, `GameStats` (Task 6), `getGameView` (`$lib/gameViews`).
- Produces:
  ```ts
  // gameViews/meta.ts
  export type X01Rules = { startScore: number; inMode: 'straight' | 'double' | 'master'; outMode: 'straight' | 'double' | 'master'; firstTo: number }
  export type AtcRules = { order: 'asc' | 'desc' | 'random'; finishOn: 'twenty' | 'single_bull' | 'bull'; multiplierAdvances: boolean }
  export function x01Rules(r: X01Rules, playerCount: number): string
  export function atcRules(r: AtcRules, playerCount: number): string
  // history.ts
  export function formatWhen(iso: string, now: Date): { day: string; time: string }
  export function rulesLine(game: GameSummary): string
  export function opponents(game: GameSummary): string
  export function resultLabel(game: GameSummary): { text: string; won: boolean }
  export function historyStat(game: GameSummary): { value: string; label: string } | null
  export type Tile = { label: string; value: string; note: string | null; trend: 'up' | 'down' | null }
  export function statTiles(s: GameStats): Tile[]
  ```

- [ ] **Step 1: Write the failing tests**

Append to `backend/frontend/src/lib/__tests__/meta.test.ts`:

```ts
import { x01Rules, atcRules } from '../gameViews/meta.js'

describe('rules lines (config only)', () => {
  it('x01', () => {
    expect(x01Rules({ startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 }, 2)).toBe('501 · Double out · First to 3 legs')
    expect(x01Rules({ startScore: 301, inMode: 'double', outMode: 'master', firstTo: 1 }, 4)).toBe('4 players · 301 · Double in · Master out · First to 1 leg')
    expect(x01Rules({ startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 }, 1)).toBe('501 · Double out · Practice')
  })
  it('atc', () => {
    expect(atcRules({ order: 'asc', finishOn: 'bull', multiplierAdvances: false }, 2)).toBe('1–20, then Bull · any segment counts')
    expect(atcRules({ order: 'random', finishOn: 'twenty', multiplierAdvances: true }, 1)).toBe('Random order · Practice')
    expect(atcRules({ order: 'desc', finishOn: 'single_bull', multiplierAdvances: false }, 3)).toBe('3 players · 20–1, then 25')
  })
})
```

`backend/frontend/src/lib/__tests__/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { formatWhen, rulesLine, opponents, resultLabel, historyStat, statTiles } from '../history.js'
import type { GameSummary, GameStats } from '../api'

const game = (o: Partial<GameSummary> = {}): GameSummary => ({
  id: 'g1', mode: 'x01', config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
  createdAt: '2026-10-01T19:00:00.000Z', finishedAt: '2026-10-01T19:30:00.000Z', board: null, mySeat: 0,
  players: [
    { seat: 0, name: 'Christoph', userId: 'u1', placement: 1, stats: { average: 83.94, legsWon: 3, dartsThrown: 66 } },
    { seat: 1, name: 'Guest 1', userId: null, placement: 2, stats: { average: 71.6, legsWon: 1, dartsThrown: 65 } },
  ],
  ...o,
})

describe('formatWhen', () => {
  const now = new Date(2026, 9, 1, 22, 0)
  it('Today, Yesterday, then the date', () => {
    expect(formatWhen(new Date(2026, 9, 1, 21, 14).toISOString(), now)).toEqual({ day: 'Today', time: '21:14' })
    expect(formatWhen(new Date(2026, 8, 30, 8, 5).toISOString(), now)).toEqual({ day: 'Yesterday', time: '08:05' })
    expect(formatWhen(new Date(2026, 8, 24, 20, 40).toISOString(), now)).toEqual({ day: '24 Sep', time: '20:40' })
  })
})

describe('rulesLine', () => {
  it('per mode from the config', () => {
    expect(rulesLine(game())).toBe('501 · Double out · First to 3 legs')
    expect(rulesLine(game({ mode: 'atc', config: { order: 'asc', finishOn: 'bull', multiplierAdvances: false }, players: [game().players[0]] }))).toBe('1–20, then Bull · Practice')
  })
  it('empty for an unknown mode or an unreadable config', () => {
    expect(rulesLine(game({ mode: 'soccer' }))).toBe('')
    expect(rulesLine(game({ config: {} }))).toBe('')
  })
})

describe('opponents and result', () => {
  it('two players: the other name, won/lost with legs for X01', () => {
    expect(opponents(game())).toBe('Guest 1')
    expect(resultLabel(game())).toEqual({ text: 'Won 3–1', won: true })
    expect(resultLabel(game({ mySeat: 1 }))).toEqual({ text: 'Lost 1–3', won: false })
    expect(resultLabel(game({ mode: 'atc' }))).toEqual({ text: 'Won', won: true })
  })
  it('three or more: placement of n', () => {
    const party = game({ players: [...game().players, { seat: 2, name: 'Lena', userId: null, placement: 3, stats: {} }] })
    expect(opponents(party)).toBe('Guest 1, Lena')
    expect(resultLabel({ ...party, mySeat: 1 })).toEqual({ text: '2nd of 3', won: false })
    expect(resultLabel(party)).toEqual({ text: '1st of 3', won: true })
  })
  it('solo', () => {
    const solo = game({ players: [game().players[0]] })
    expect(opponents(solo)).toBe('Solo')
    expect(resultLabel(solo)).toEqual({ text: 'Finished', won: false })
  })
})

describe('historyStat', () => {
  it('X01 average, ATC darts', () => {
    expect(historyStat(game())).toEqual({ value: '83.9', label: '3-dart avg' })
    expect(historyStat(game({ mode: 'atc', players: [{ ...game().players[0], stats: { dartsThrown: 52, targetsHit: 21 } }] }))).toEqual({ value: '52', label: 'darts to finish' })
    expect(historyStat(game({ mode: 'soccer' }))).toBeNull()
  })
})

describe('statTiles', () => {
  const stats = (o: Partial<GameStats> = {}): GameStats => ({ days: 30, matches: 23, wins: 14, contested: 22, modes: {}, ...o })
  it('fills all four tiles', () => {
    const tiles = statTiles(stats({ modes: {
      x01: { matches: 10, wins: 6, contested: 10, stats: { average: { avg: 72.64, min: 50, max: 90, previousAvg: 69.5 } } },
      atc: { matches: 5, wins: 2, contested: 3, stats: { dartsThrown: { avg: 60, min: 52, max: 70, previousAvg: null } } },
    } }))
    expect(tiles).toEqual([
      { label: 'Matches · 30 days', value: '23', note: null, trend: null },
      { label: 'Won', value: '14', note: '64%', trend: null },
      { label: 'X01 3-dart average', value: '72.6', note: '▲ 3.1 vs previous 30 days', trend: 'up' },
      { label: 'Around the Clock best', value: '52', note: 'darts', trend: null },
    ])
  })
  it('shows – without data', () => {
    const tiles = statTiles(stats({ matches: 1, wins: 0, contested: 0 }))
    expect(tiles.map(t => t.value)).toEqual(['1', '–', '–', '–'])
    expect(tiles[2].note).toBeNull()
  })
  it('a falling average', () => {
    const t = statTiles(stats({ modes: { x01: { matches: 1, wins: 0, contested: 1, stats: { average: { avg: 60, min: 60, max: 60, previousAvg: 65 } } } } }))[2]
    expect([t.note, t.trend]).toEqual(['▼ 5.0 vs previous 30 days', 'down'])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/meta.test.ts src/lib/__tests__/history.test.ts`
Expected: FAIL: `x01Rules`, `../history.js` missing.

- [ ] **Step 3: Implement**

`backend/frontend/src/lib/gameViews/meta.ts`: split the config-only part out; the live meta lines keep their output.

```ts
export type Mode = 'straight' | 'double' | 'master'
export type X01Rules = { startScore: number; inMode: Mode; outMode: Mode; firstTo: number }
export type AtcRules = { order: 'asc' | 'desc' | 'random'; finishOn: 'twenty' | 'single_bull' | 'bull'; multiplierAdvances: boolean }

/** The X01 rules as one line, e.g. "501 · Double out · First to 3 legs". */
export function x01Rules(r: X01Rules, playerCount: number): string {
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(String(r.startScore))
  if (r.inMode !== 'straight') parts.push(`${cap(r.inMode)} in`)
  parts.push(`${cap(r.outMode)} out`)
  parts.push(playerCount === 1 ? 'Practice' : `First to ${r.firstTo} ${r.firstTo === 1 ? 'leg' : 'legs'}`)
  return parts.join(' · ')
}

/** The Around the Clock rules as one line, e.g. "1–20, then Bull · any segment counts". */
export function atcRules(r: AtcRules, playerCount: number): string {
  const order = r.order === 'desc' ? '20–1' : r.order === 'random' ? 'Random order' : '1–20'
  const bull = r.finishOn === 'bull' ? ', then Bull' : r.finishOn === 'single_bull' ? ', then 25' : ''
  const parts: string[] = []
  if (playerCount > 2) parts.push(`${playerCount} players`)
  parts.push(order + bull)
  if (playerCount === 2) parts.push(r.multiplierAdvances ? 'multiplier advances' : 'any segment counts')
  if (playerCount === 1) parts.push('Practice')
  return parts.join(' · ')
}

export function x01Meta(game: X01Game, playerCount: number): string {
  const { legs, firstTo, winner } = game
  const played = legs.reduce((a, b) => a + b, 0)
  // After the match: the leg in play when it ended (a won final leg, or one cut short by the round limit)
  const finalLegWon = winner !== null && (legs.at(winner) ?? 0) >= firstTo
  return `${x01Rules({ ...game.config, firstTo }, playerCount)} · Leg ${finalLegWon ? played : played + 1}`
}

export function atcMeta(game: AtcGame, playerCount: number): string {
  const round = game.totalVisits.length ? Math.min(...game.totalVisits) + 1 : 1
  return `${atcRules(game.cfg, playerCount)} · Round ${round}`
}
```

If an existing `atcMeta` test fixture has a `sequence` that disagrees with its `cfg.finishOn` (the old code read the bull from the sequence), fix the fixture so the two agree; the live game always builds the sequence from `cfg`.

`backend/frontend/src/lib/history.ts`:

```ts
// Formatting for the History page: one finished game per row, plus the stat tiles.
import { z } from 'zod'
import type { GameSeat, GameStats, GameSummary } from './api'
import { atcRules, x01Rules } from './gameViews/meta.js'

const DAY_MS = 86_400_000
const ModeSchema = z.enum(['straight', 'double', 'master'])
const X01ConfigSchema = z.object({ startScore: z.number(), inMode: ModeSchema, outMode: ModeSchema, firstTo: z.number() })
const AtcConfigSchema = z.object({ order: z.enum(['asc', 'desc', 'random']), finishOn: z.enum(['twenty', 'single_bull', 'bull']), multiplierAdvances: z.boolean() })

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Today" / "Yesterday" / "24 Sep", and the time, in the viewer's time zone. */
export function formatWhen(iso: string, now: Date): { day: string; time: string } {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS)
  const day = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return { day, time }
}

/** The rules the game was played with; empty for a mode this frontend doesn't know. */
export function rulesLine(game: GameSummary): string {
  const n = game.players.length
  if (game.mode === 'x01') {
    const c = X01ConfigSchema.safeParse(game.config)
    return c.success ? x01Rules(c.data, n) : ''
  }
  if (game.mode === 'atc') {
    const c = AtcConfigSchema.safeParse(game.config)
    return c.success ? atcRules(c.data, n) : ''
  }
  return ''
}

const mine = (game: GameSummary): GameSeat | undefined => game.players.find(p => p.seat === game.mySeat)
const others = (game: GameSummary): GameSeat[] => game.players.filter(p => p.seat !== game.mySeat)
const stat = (p: GameSeat, key: string): number | undefined => Object.hasOwn(p.stats, key) ? p.stats[key] : undefined

/** Who else played, or "Solo". */
export function opponents(game: GameSummary): string {
  return game.players.length === 1 ? 'Solo' : others(game).map(p => p.name).join(', ')
}

const ordinal = (n: number) => {
  const tens = n % 100, ones = n % 10
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
}

/** "Won 3–1" / "Lost" for two players, "2nd of 4" for more, "Finished" solo. */
export function resultLabel(game: GameSummary): { text: string; won: boolean } {
  const me = mine(game)
  const n = game.players.length
  if (!me) return { text: '', won: false }
  if (n === 1) return { text: 'Finished', won: false }
  const won = me.placement === 1
  if (n > 2) return { text: `${ordinal(me.placement)} of ${n}`, won }
  const other = others(game).at(0)
  const legs = game.mode === 'x01' && other ? ` ${stat(me, 'legsWon') ?? 0}–${stat(other, 'legsWon') ?? 0}` : ''
  return { text: `${won ? 'Won' : 'Lost'}${legs}`, won }
}

/** The one number the list shows per game mode. */
export function historyStat(game: GameSummary): { value: string; label: string } | null {
  const me = mine(game)
  if (!me) return null
  if (game.mode === 'x01') {
    const avg = stat(me, 'average')
    return avg === undefined ? null : { value: avg.toFixed(1), label: '3-dart avg' }
  }
  if (game.mode === 'atc') {
    const darts = stat(me, 'dartsThrown')
    return darts === undefined ? null : { value: String(darts), label: 'darts to finish' }
  }
  return null
}

export type Tile = { label: string; value: string; note: string | null; trend: 'up' | 'down' | null }

const modeStat = (s: GameStats, mode: string, key: string) => {
  const m = Object.hasOwn(s.modes, mode) ? s.modes[mode] : undefined
  return m && Object.hasOwn(m.stats, key) ? m.stats[key] : undefined
}

/** The four tiles above the list (design: History). "–" where there's nothing yet. */
export function statTiles(s: GameStats): Tile[] {
  const avg = modeStat(s, 'x01', 'average')
  const atc = modeStat(s, 'atc', 'dartsThrown')
  const delta = avg && avg.previousAvg !== null ? avg.avg - avg.previousAvg : null
  return [
    { label: `Matches · ${s.days} days`, value: String(s.matches), note: null, trend: null },
    s.contested > 0
      ? { label: 'Won', value: String(s.wins), note: `${Math.round(s.wins / s.contested * 100)}%`, trend: null }
      : { label: 'Won', value: '–', note: null, trend: null },
    {
      label: 'X01 3-dart average',
      value: avg ? avg.avg.toFixed(1) : '–',
      note: delta === null ? null : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs previous ${s.days} days`,
      trend: delta === null ? null : delta >= 0 ? 'up' : 'down',
    },
    { label: 'Around the Clock best', value: atc ? String(atc.min) : '–', note: atc ? 'darts' : null, trend: null },
  ]
}
```

- [ ] **Step 4: Run tests, typecheck and lint**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`
Expected: PASS. `formatWhen` builds dates in local time on both sides, so it passes in any time zone.

- [ ] **Step 5: Commit**

```bash
git add backend/frontend/src/lib
git commit -m "feat(frontend): history row and tile formatting; config-only rules lines

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: History page

**Files:**
- Create: `backend/frontend/src/routes/History.svelte`
- Modify: `backend/frontend/src/App.svelte`

**Interfaces:**
- Consumes: everything from Task 7; `api` client; `getGameView(id).title`; `Layout`.

Design reference: `project/History.dc.html` (desktop), `project/Tablet-History.dc.html`, `project/Mobile-History.dc.html` in the design canvas (read with the Artifact tool, see `AGENTS.md`). Match spacing, type and colours; the markup below already does for desktop.

- [ ] **Step 1: Write the page**

`backend/frontend/src/routes/History.svelte`:

```svelte
<script lang="ts">
  import { onMount } from 'svelte'
  import { LoaderCircle } from '@lucide/svelte'
  import Layout from '$lib/components/Layout.svelte'
  import { api, type GameInfo, type GameStats, type GameSummary } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import { formatWhen, historyStat, opponents, resultLabel, rulesLine, statTiles } from '$lib/history'

  let modes = $state<GameInfo[]>([])
  let mode = $state<string | null>(null)
  let games = $state<GameSummary[]>([])
  let nextCursor = $state<string | null>(null)
  let stats = $state<GameStats | null>(null)
  let loading = $state(true)
  let loadingMore = $state(false)
  let error = $state('')
  const now = new Date()

  const tiles = $derived(stats ? statTiles(stats) : [])
  const filters = $derived([{ id: null, name: 'All' }, ...modes.map(m => ({ id: m.id, name: getGameView(m.id).title }))])

  async function loadGames(cursor: string | null) {
    const query = { ...(mode !== null && { mode }), ...(cursor !== null && { cursor }) }
    const { data, error: err } = await api.GET('/api/games', { params: { query } })
    if (!data) throw new Error(err?.error ?? 'Could not load your games')
    games = cursor === null ? data.games : [...games, ...data.games]
    nextCursor = data.nextCursor
  }

  async function pick(id: string | null) {
    if (id === mode) return
    mode = id
    loading = true
    error = ''
    try { await loadGames(null) }
    catch (e) { error = e instanceof Error ? e.message : 'Could not load your games' }
    finally { loading = false }
  }

  async function more() {
    if (nextCursor === null) return
    loadingMore = true
    try { await loadGames(nextCursor) }
    catch (e) { error = e instanceof Error ? e.message : 'Could not load more games' }
    finally { loadingMore = false }
  }

  onMount(async () => {
    try {
      const [m, s] = await Promise.all([api.GET('/api/gamemodes'), api.GET('/api/games/stats'), loadGames(null)])
      modes = m.data?.modes ?? []
      stats = s.data ?? null
    } catch (e) {
      error = e instanceof Error ? e.message : 'Could not load your games'
    } finally {
      loading = false
    }
  })
</script>

<Layout>
  <main class="flex min-h-0 flex-grow flex-col gap-6 overflow-auto px-4 py-6 md:px-11 md:py-10">
    <header class="flex flex-wrap items-end justify-between gap-6">
      <div class="flex flex-col gap-1.5">
        <h1 class="m-0 font-display text-[48px] font-bold uppercase leading-none tracking-[0.02em]">History</h1>
        <p class="m-0 text-[15px] text-text-muted">Every match you played. Open one to see it leg by leg.</p>
      </div>
      <div role="group" aria-label="Game mode" class="grid auto-cols-max grid-flow-col gap-1 rounded-[10px] border border-line bg-surface-1 p-1">
        {#each filters as f (f.id ?? 'all')}
          <button type="button" aria-pressed={f.id === mode} onclick={() => void pick(f.id)}
            class="h-10 rounded-[7px] border-0 px-4 text-[15px] {f.id === mode ? 'bg-line font-semibold text-text' : 'bg-transparent text-[#c9c9bf]'}">
            {f.name}
          </button>
        {/each}
      </div>
    </header>

    {#if tiles.length}
      <dl class="m-0 grid grid-cols-2 rounded-[14px] border border-line-2 bg-surface-panel lg:grid-cols-4">
        {#each tiles as t, i (t.label)}
          <div class="flex flex-col gap-1.5 px-[22px] py-[18px] {i % 2 === 1 ? 'border-l border-line-2' : ''} {i >= 2 ? 'max-lg:border-t max-lg:border-line-2 lg:border-l' : ''}">
            <dt class="text-[12px] uppercase tracking-[0.1em] text-text-dim">{t.label}</dt>
            <dd class="m-0 flex items-baseline gap-2.5">
              <span class="font-display text-[40px] font-bold leading-none">{t.value}</span>
              {#if t.note}<span class="text-[15px] {t.trend === 'up' ? 'text-accent' : 'text-text-muted'}">{t.note}</span>{/if}
            </dd>
          </div>
        {/each}
      </dl>
    {/if}

    <section aria-label="Matches" class="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-line-2 bg-surface-panel">
      <div class="hidden h-11 items-center gap-4 border-b border-line-2 px-[22px] text-[12px] uppercase tracking-[0.1em] text-text-dim lg:grid lg:grid-cols-[132px_minmax(0,1fr)_220px_124px_132px_124px]">
        <span>When</span><span>Game</span><span>Players</span><span>Result</span><span>Key stat</span><span>Board</span>
      </div>

      {#if loading}
        <p class="m-0 flex items-center gap-2 px-[22px] py-10 text-[15px] text-text-muted"><LoaderCircle size={18} class="animate-spin" /> Loading matches…</p>
      {:else if error}
        <p role="alert" class="m-0 px-[22px] py-10 text-[15px] text-text-muted">{error}</p>
      {:else if games.length === 0}
        <p class="m-0 px-[22px] py-10 text-[15px] text-text-muted">No matches in this mode yet.</p>
      {:else}
        <ul class="m-0 list-none p-0">
          {#each games as g (g.id)}
            {@const when = formatWhen(g.finishedAt, now)}
            {@const result = resultLabel(g)}
            {@const key = historyStat(g)}
            {@const vs = opponents(g)}
            <li class="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b border-line px-[22px] py-3 lg:min-h-[68px] lg:grid-cols-[132px_minmax(0,1fr)_220px_124px_132px_124px] lg:py-0">
              <span class="flex flex-col gap-0.5 max-lg:order-2 max-lg:text-right">
                <span class="text-[15px] font-semibold">{when.day}</span>
                <span class="font-mono text-[12px] text-text-dim">{when.time}</span>
              </span>
              <span class="flex min-w-0 flex-col gap-0.5 max-lg:order-1">
                <span class="font-display text-[24px] font-bold uppercase leading-none tracking-[0.02em]">{getGameView(g.mode).title}</span>
                <span class="text-[13px] text-text-muted">{rulesLine(g)}</span>
              </span>
              <span class="flex min-w-0 items-center gap-2.5 max-lg:order-3">
                <span class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-line-chip text-[13px] font-bold">{vs.charAt(0).toUpperCase()}</span>
                <span class="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] text-[#c9c9bf]">{vs}</span>
              </span>
              <span class="max-lg:order-4 max-lg:text-right">
                <span class="inline-flex h-7 items-center rounded-full px-3 text-[13px] font-bold uppercase tracking-[0.06em] {result.won ? 'bg-accent text-accent-fg' : 'border border-line-strong text-[#c9c9bf]'}">{result.text}</span>
              </span>
              <span class="hidden flex-col gap-0.5 lg:flex">
                {#if key}
                  <span class="font-display text-[24px] font-bold leading-none">{key.value}</span>
                  <span class="text-[12px] text-text-dim">{key.label}</span>
                {/if}
              </span>
              <span class="hidden text-[14px] text-text-muted lg:block">{g.board?.name ?? '–'}</span>
            </li>
          {/each}
        </ul>
        {#if nextCursor !== null}
          <div class="flex justify-center p-4">
            <button type="button" onclick={() => void more()} disabled={loadingMore}
              class="h-10 rounded-lg border border-line-strong bg-transparent px-5 text-[15px] text-text disabled:opacity-60">
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        {/if}
      {/if}
    </section>
  </main>
</Layout>
```

Check `Tablet-History` / `Mobile-History` in the canvas and adjust the small-screen layout (the `max-lg:` classes) if they differ: the desktop columns above are the reference.

In `backend/frontend/src/App.svelte`: `import History from './routes/History.svelte'` and add `'/history': History,` to `routes`.

- [ ] **Step 2: Typecheck, lint, build**

Run: `cd backend/frontend && npm run typecheck && npm run lint && npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 3: Look at it**

Run the dev stack (`scripts/dev.sh`), sign in, finish one short X01 game and one ATC game (manual entry is fine), then open `#/history`. Check against `project/History.dc.html`: filter switches the list, tiles fill, rows show the right result and stat, "Load more" appears only with more than 25 games. Check a narrow window (~390px) has no horizontal scroll.

- [ ] **Step 4: Commit**

```bash
git add backend/frontend/src/routes/History.svelte backend/frontend/src/App.svelte
git commit -m "feat(frontend): History page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Docs and end-to-end check

**Files:**
- Modify: `AGENTS.md`, `docs/architecture.md` (only if it describes rebuild from `bridge_events`; check with `grep -n "rebuild\|bridge_events" docs/architecture.md`)

- [ ] **Step 1: Update `AGENTS.md`**

In the "Where to look" table add:

```markdown
| Game history: input log, replay, results | `backend/src/session/{apply,replay}.ts`, `backend/src/history/`, `backend/src/db/history.ts`, `backend/src/api/games.ts` |
```

Replace step 1 of "Adding a game" with:

```markdown
1. Write a `GameModule` in `backend/src/games/<id>.ts`: `init` (use the `rng` it gets for
   anything random), `onBoardEvent`, `onUserAction`, `view`, `defaultConfig`/`configMeta`
   for the setup form, and for the history `version`, `summarize` (placement and stats per
   seat), `detail` (its per-mode detail; add the schema to `schema/api-v1.yaml` and the
   `GameDetail.detail` union) and `getLeg` if it has legs. Keep it a pure reducer: games
   are rebuilt by replaying their input log. Wrap it with `withBullOff` if it needs a
   throwing order.
```

If `docs/architecture.md` says running games are rebuilt from `bridge_events`, change it to: games are rebuilt by replaying their own input log (`game_session_events`).

- [ ] **Step 2: Full verification**

Run:
```bash
cd backend && TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/dartcade_test npm test && npm run typecheck && npm run lint
cd frontend && npm test && npm run typecheck && npm run lint && npm run build
cd ../../bridge && go test ./...
cd .. && npm run lint:api
```
Expected: all PASS.

- [ ] **Step 3: Manual check with a restart**

On the dev stack: start an X01 game on a board, throw two visits, restart the backend container, confirm the game comes back as it was (same scores, same throw order), finish it. Start a random-order ATC game, note the first target, restart, confirm it's unchanged. Then `curl -b <cookie> localhost:3000/api/games/<id>` returns `{ game, detail: { mode: 'x01', legs: [...] } }`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/architecture.md
git commit -m "docs: game history in agent notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
