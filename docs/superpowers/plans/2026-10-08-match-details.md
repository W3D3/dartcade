# Match Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A details page for one finished game (X01 duel/party/teams, Around the Clock duel/party), opened from History, fed by generic, self-describing match stats from `GET /api/games/{id}`.

**Architecture:** The backend replays the game (as `detail()` already does) and each game module's new `matchStats()` returns display rows (label, format, better, compact) plus per-seat and per-team values. The frontend renders those rows generically and draws the mode sections (X01 leg chart and chalkboard, Around the Clock target grid and race chart) from `detail`. Pure helpers hold all logic; Svelte components only lay it out.

**Tech Stack:** Fastify + TypeScript backend (vitest), OpenAPI in `schema/api-v1.yaml` (types via `npm run gen:api`), Svelte 5 + Tailwind v4 frontend (vitest, `svelte/server` render tests), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-10-08-match-details-design.md`

## Global Constraints

- Breaking API changes are fine (0.x); `GameDetail.stats` is required.
- The stats schema never names a mode's fields: `MatchStats { rows, seats, teams? }`, `StatRow { key, label, format, value?, of?, better, compact }`.
- `format` is one of `decimal | integer | darts | target | ratio`; `better` is `higher | lower | null`.
- A value missing from `values` means "doesn't apply": shown as "—", never better.
- Targets: 1–20, 21 = 25, 22 = Bull.
- X01 tiers: `count180` = 180, `count140` = 140–179, `count100` = 100–139.
- Generated files (`backend/src/schema/api.ts`, `api-v1.*.json`, `backend/frontend/src/lib/api/schema.ts`) are never edited by hand: `npm run gen:api` at the repo root.
- Commit messages: `type(scope): subject`, lower case, imperative, under 72 chars, ending with the session's `Co-Authored-By` and `Claude-Session` lines.
- Run `npm run format` (repo root) before each commit; `npm run lint` and `npm run typecheck` in `backend/` and `backend/frontend/` must pass.

## Review Focus

1. A player with no checkout (or a seat that never threw) → `highestFinish`, `bestLegDarts`, `checkout` show "—" and the other side wins the highlight. Test in Task 2 and Task 4.
2. A bust visit → scores 0 in every stat and never counts as a tier or highest score. Test in Task 2.
3. A solo game (one seat) → page renders the duel layout with one side, no lime highlight. Test in Task 4 (`betterSeats` with one value) and Task 7 (render).
4. Around the Clock with "multiplier advances" skipping targets → skipped targets are `darts: 0, hit: true` steps, hit rate stays ≤ 100%. Test in Task 3.
5. A game whose mode the page doesn't know (or a 404) → the page still renders header, result and stats, or "This game isn't available". Test in Task 7.

---

## File Structure

Backend:

- Create `backend/src/games/matchStats.ts` — `row()`, `values()`, `noStats()` helpers shared by modes.
- Create `backend/src/games/x01Stats.ts` — X01 `matchStats()`.
- Create `backend/src/games/atcProgress.ts` — the per-dart walk (`atcProgress()`) and Around the Clock `matchStats()`.
- Modify `backend/src/games/x01.ts` (wire `matchStats`), `backend/src/games/atc.ts` (export `hitsTarget`, `advanceInSequence`; `detail()` adds `progress`; wire `matchStats`).
- Modify `backend/src/session/types.ts` (types, `GameModule.matchStats?`), `backend/src/session/withBullOff.ts` (pass `matchStats` through).
- Modify `backend/src/history/detail.ts` (return `{ detail, stats }`), `backend/src/api/games.ts` (send `stats`).
- Modify `schema/api-v1.yaml`.
- Tests: `backend/src/games/matchStats.test.ts`, `backend/src/games/x01Stats.test.ts`, `backend/src/games/atcProgress.test.ts`, `backend/src/games/detail.contract.test.ts`, `backend/src/api/games.test.ts`, `backend/src/games/history.test.ts` (ATC detail `progress`).

Frontend (`backend/frontend/src/`):

- Create `lib/details/stats.ts` — format a value, better seats, ratio.
- Create `lib/details/x01.ts` — leg view: chart series, chalkboard rows, summary line, team shares.
- Create `lib/details/atc.ts` — target grid, race series, hardest-target sentence, result line.
- Create `lib/details/page.ts` — layout pick, sides, headline, meta line, highlight default.
- Create components in `lib/components/details/`: `DetailsHeader.svelte`, `ResultCard.svelte`, `StatsTable.svelte`, `Standings.svelte`, `TeamShares.svelte`, `X01Legs.svelte`, `RemainingChart.svelte`, `Chalkboard.svelte`, `AtcTargets.svelte`, `RaceChart.svelte`, `HighlightPicker.svelte`.
- Create `routes/GameDetails.svelte`; modify `App.svelte` (route), `routes/History.svelte` (rows link), `lib/api/index.ts` (type exports).
- Tests: `lib/__tests__/detailsStats.test.ts`, `detailsX01.test.ts`, `detailsAtc.test.ts`, `detailsPage.test.ts`, `gameDetailsRender.test.ts`.
- e2e: `e2e/tests/match-details.spec.ts`.

---

### Task 1: Generic match stats in the API

**Files:**

- Modify: `schema/api-v1.yaml` (`GameDetail` ~line 1455, `AtcDetail` ~line 1294, new `MatchStats`, `StatRow`)
- Create: `backend/src/games/matchStats.ts`
- Modify: `backend/src/session/types.ts:86-87,168-175`
- Modify: `backend/src/session/withBullOff.ts:68-72`
- Modify: `backend/src/history/detail.ts`
- Modify: `backend/src/api/games.ts:71-79`
- Modify: `backend/frontend/src/lib/api/index.ts:14`
- Test: `backend/src/games/matchStats.test.ts`, `backend/src/api/games.test.ts`

**Interfaces:**

- Produces: `type MatchStats`, `type StatRow`, `type StatValues = Record<string, number>` from `backend/src/session/types.ts`; `row(key, label, format, better, opts?)`, `values(v)`, `noStats()` from `backend/src/games/matchStats.ts`; `GameModule.matchStats?(visits: CommittedVisit<S>[], final: S): MatchStats`; `buildDetail(...)` returns `{ detail, stats } | null`. Frontend types `MatchStats`, `StatRow`, `X01Detail`, `AtcDetail` from `$lib/api`.

- [ ] **Step 1: Add the schema**

In `schema/api-v1.yaml`, replace `GameDetail` with:

```yaml
    GameDetail:
      type: object
      required: [game, detail, stats]
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
        stats: { $ref: '#/components/schemas/MatchStats' }

    MatchStats:
      type: object
      description: The game's match stats, the same shape for every game mode. Rows say how to show each value, so a mode adds stats without a frontend change.
      required: [rows, seats]
      additionalProperties: false
      properties:
        rows:
          type: array
          description: In display order
          items: { $ref: '#/components/schemas/StatRow' }
        seats:
          type: array
          description: One per seat, in seat order
          items: { $ref: '#/components/schemas/StatValues' }
        teams:
          type: array
          description: Only in a team game; one per team. Seats keep their own values.
          items: { $ref: '#/components/schemas/StatValues' }

    StatValues:
      type: object
      description: 'seat or team (the index), and its values by key; a missing key means the stat does not apply'
      required: [index, values]
      additionalProperties: false
      properties:
        index: { type: integer, minimum: 0 }
        values:
          type: object
          additionalProperties: { type: number }

    StatRow:
      type: object
      required: [key, label, format, better, compact]
      additionalProperties: false
      properties:
        key: { type: string, description: 'Names the row (e.g. first9Average); also the key of its value unless `value` says otherwise' }
        label: { type: string }
        format:
          type: string
          enum: [decimal, integer, darts, target, ratio]
          description: 'decimal 83.9, integer 6, darts "15 darts", target 1–20 / 21 = 25 / 22 = Bull, ratio "50% · 3/6"'
        value: { type: string, description: "The key holding the row's value (for a ratio, the numerator); default `key`" }
        of: { type: string, description: 'ratio only: the key of the denominator' }
        better:
          type: string
          enum: [higher, lower]
          nullable: true
          description: null when no side is better (e.g. darts thrown)
        compact: { type: boolean, description: 'Also shown where space is short (party standings, phone)' }
```

(One shared `StatValues` with `index` keeps a single schema: the index is the seat in `seats` and the team in `teams`.)

Check how the file writes nullable enums elsewhere (`grep -n "nullable\|type: \[string, 'null'\]" schema/api-v1.yaml | head`) and use the same style for `better`.

In `AtcDetail`, add `progress` to `required` and `properties`:

```yaml
        progress:
          type: array
          description: One per seat, in seat order. Every target the seat got to, in order.
          items:
            type: object
            required: [seat, steps]
            additionalProperties: false
            properties:
              seat: { type: integer, minimum: 0 }
              steps:
                type: array
                items:
                  type: object
                  required: [target, darts, hit]
                  additionalProperties: false
                  properties:
                    target: { type: integer, description: '1–20, 21 = 25, 22 = bull' }
                    darts: { type: integer, minimum: 0, description: 'Darts thrown at it; 0 when a multiplier skipped it' }
                    hit: { type: boolean, description: 'Completed; false only for the target the game ended on' }
```

- [ ] **Step 2: Regenerate types**

Run (repo root): `npm run gen:api`
Expected: `backend/src/schema/api.ts`, `backend/src/schema/api-v1.*.json`, `backend/frontend/src/lib/api/schema.ts` change; no errors.

- [ ] **Step 3: Types and the module hook**

In `backend/src/session/types.ts` next to `X01Detail`/`AtcDetail`:

```ts
export type MatchStats = components['schemas']['MatchStats']
export type StatRow = components['schemas']['StatRow']
```

In `GameModule`, after `detail(...)`:

```ts
  /** The match stats for GET /api/games/:id, from the same replay as detail(); none when left out. */
  matchStats?(visits: CommittedVisit<S>[], final: S): MatchStats
```

In `backend/src/session/withBullOff.ts`, read `matchStats` from `game` where the other optional hooks are destructured (look for `botTarget`/`teamsOf`) and add after `detail`:

```ts
    matchStats:
      matchStats &&
      ((visits, final) =>
        matchStats(
          visits.map(v => ({ ...v, start: v.start.game, end: v.end.game, after: v.after.game })),
          final.game,
        )),
```

If the wrapper reads hooks as `game.botTarget` rather than destructuring, follow that: `const matchStats = game.matchStats?.bind(game)` is not needed (modules are plain objects); `const { matchStats } = game` at the top of the function next to the existing ones.

- [ ] **Step 4: Write the helper's failing test**

`backend/src/games/matchStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { noStats, row, values } from './matchStats.js'

describe('matchStats helpers', () => {
  it('row() fills the defaults and keeps value/of only when given', () => {
    expect(row('average', '3-dart average', 'decimal', 'higher')).toEqual({
      key: 'average',
      label: '3-dart average',
      format: 'decimal',
      better: 'higher',
      compact: false,
    })
    expect(row('checkout', 'Checkout', 'ratio', 'higher', { compact: true, value: 'checkoutHits', of: 'checkoutAttempts' })).toEqual({
      key: 'checkout',
      label: 'Checkout',
      format: 'ratio',
      better: 'higher',
      compact: true,
      value: 'checkoutHits',
      of: 'checkoutAttempts',
    })
  })

  it('values() drops what does not apply', () => {
    expect(values({ a: 1, b: undefined, c: 0 })).toEqual({ a: 1, c: 0 })
  })

  it('noStats() is empty', () => {
    expect(noStats()).toEqual({ rows: [], seats: [] })
  })
})
```

- [ ] **Step 5: Run it to see it fail**

Run: `cd backend && npx vitest run src/games/matchStats.test.ts`
Expected: FAIL, cannot find `./matchStats.js`.

- [ ] **Step 6: Write the helper**

`backend/src/games/matchStats.ts`:

```ts
// Building blocks for a game module's matchStats(): the rows say how to show each value (label,
// format, which way is better), so the details page needs no change when a mode adds a stat.
import type { MatchStats, StatRow } from '../session/types.js'

type RowOptions = { compact?: boolean; value?: string; of?: string }

export function row(key: string, label: string, format: StatRow['format'], better: StatRow['better'], opts: RowOptions = {}): StatRow {
  return {
    key,
    label,
    format,
    better,
    compact: opts.compact ?? false,
    ...(opts.value !== undefined && { value: opts.value }),
    ...(opts.of !== undefined && { of: opts.of }),
  }
}

/** A seat's or team's values without the ones that don't apply (a missing key shows "—"). */
export function values(v: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, number] => e[1] !== undefined))
}

/** For a mode without matchStats(): the page shows the result only. */
export const noStats = (): MatchStats => ({ rows: [], seats: [] })
```

- [ ] **Step 7: Run it to see it pass**

Run: `cd backend && npx vitest run src/games/matchStats.test.ts`
Expected: PASS.

- [ ] **Step 8: Build stats with the detail**

`backend/src/history/detail.ts`, change the return type and the last line:

```ts
import { noStats } from '../games/matchStats.js'
import type { AtcDetail, MatchStats, X01Detail } from '../session/types.js'

/** The game's per-mode detail and match stats, from replaying its input log; null if its mode is gone. */
export function buildDetail(
  game: HistoryGame,
  events: LoggedInput[],
  warn: WarnFn,
): { detail: X01Detail | AtcDetail; stats: MatchStats } | null {
  // ...unchanged up to the replay...
  const { visits } = replay(session, events, warn)
  const final = session.committedState
  return { detail: mod.detail(visits, final), stats: mod.matchStats?.(visits, final) ?? noStats() }
}
```

If TypeScript rejects `mod.detail(visits, final)` because `AnyGameModule` is a union, keep the existing call shape (it compiled before) and only add the `matchStats` call alongside.

`backend/src/api/games.ts`:

```ts
    const built = buildDetail(game, await getSessionEvents(db, game.id), (message, details) => {
      req.log.warn({ details }, message)
    })
    if (!built) return reply.code(404).send({ error: 'not found' })
    return reply.send({ game: toSummary(game), detail: built.detail, stats: built.stats })
```

Until Task 3, `atc.detail()` lacks `progress`, which the response schema now requires. Add a temporary `progress: []` to the object `atc.ts` `detail()` returns, so the contract test and the route keep passing; Task 3 fills it.

- [ ] **Step 9: Route test**

In `backend/src/api/games.test.ts`, extend `'returns the game and its detail'`:

```ts
    expect(res.json()).toMatchObject({ game: { id: 'g1', mySeat: 0 }, detail: { mode: 'x01', legs: [] }, stats: { rows: [], seats: [] } })
```

(The X01 module has no `matchStats` yet, so the route sends `noStats()`; Task 2 changes the expectation.)

Run: `cd backend && npx vitest run src/api/games.test.ts src/games/detail.contract.test.ts`
Expected: PASS.

- [ ] **Step 10: Frontend type exports**

`backend/frontend/src/lib/api/index.ts`, after `GameDetail`:

```ts
export type MatchStats = Schemas['MatchStats']
export type StatRow = Schemas['StatRow']
export type StatValues = Schemas['StatValues']
export type X01Detail = Schemas['X01Detail']
export type AtcDetail = Schemas['AtcDetail']
```

- [ ] **Step 11: Check and commit**

Run: `cd backend && npm run typecheck && npm run lint && npx vitest run src/games src/api/games.test.ts`, `cd backend/frontend && npm run typecheck`, then `npm run format` at the root.

```bash
git add schema backend/src backend/frontend/src/lib/api
git commit -m "feat(api): match stats with self-describing rows on game details"
```

---

### Task 2: X01 match stats

**Files:**

- Create: `backend/src/games/x01Stats.ts`
- Modify: `backend/src/games/x01.ts` (add `matchStats` to `x01Game`)
- Test: `backend/src/games/x01Stats.test.ts`, `backend/src/games/detail.contract.test.ts`, `backend/src/api/games.test.ts`

**Interfaces:**

- Consumes: `row`, `values` (Task 1); `X01State`, `x01Game` from `./x01.js`; `seatsByTeam` from `./teams.js`; `CommittedVisit`, `MatchStats` from `../session/types.js`.
- Produces: `x01MatchStats(visits: CommittedVisit<X01State>[], final: X01State): MatchStats`, wired as `x01Game.matchStats`. Value keys: `average, first9Average, checkoutHits, checkoutAttempts, highestFinish, highestScore, count180, count140, count100, bestLegDarts, dartsThrown, legsWon`, plus per seat `legsClosed` in a team game. Row keys as in the spec (`checkout` is the ratio row).

- [ ] **Step 1: Write the failing tests**

`backend/src/games/x01Stats.test.ts` plays real games through `x01Game` and records committed visits the way the engine does:

```ts
import { describe, it, expect } from 'vitest'
import { x01Game, type X01Config, type X01State } from './x01.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Segment } from '../session/types.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const T20 = seg('T20', 20, 3),
  T19 = seg('T19', 19, 3),
  S20 = seg('S20', 20, 1),
  S1 = seg('S1', 1, 1),
  D2 = seg('D2', 2, 2),
  D10 = seg('D10', 10, 2),
  MISS = seg('Miss', 0, 0)

const cfg = (over: Partial<X01Config> = {}): X01Config => ({
  startScore: 301,
  inMode: 'straight',
  outMode: 'double',
  bullOff: 'off',
  botSpeed: 'normal',
  bullValue: '25_50',
  maxRounds: 50,
  firstTo: 1,
  ...over,
})
const hd = (s: Segment, index: number): HistoryDart => ({
  index,
  segment: s,
  coords: null,
  source: 'manual',
  corrected: false,
  thrownAt: '2026-10-01T10:00:00.000Z',
})
const dartEvent = (s: Segment, index: number): BoardEvent => ({
  kind: 'dart.detected',
  data: { visit_id: 'v', index, source_seq: 0, dart: { segment: s, score: s.number * s.multiplier } },
})

/** Plays visits in order (whoever is up throws each); returns the committed visits and the final state. */
function play(c: X01Config, names: string[], throws: Segment[][]): { visits: CommittedVisit<X01State>[]; final: X01State } {
  let s = x01Game.init(c, names.map(name => ({ name })))
  const visits: CommittedVisit<X01State>[] = []
  throws.forEach((darts, n) => {
    const seat = s.currentPlayer
    const leg = x01Game.getLeg?.(s) ?? 0
    const start = x01Game.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
    let end = start
    darts.forEach((d, i) => {
      end = x01Game.onBoardEvent(end, dartEvent(d, i)).state
    })
    const after = x01Game.onBoardEvent(end, { kind: 'takeout.finished', data: {} }).state
    visits.push({ visit: n, seat, leg, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: darts.map(hd), start, end, after })
    s = after
  })
  return { visits, final: s }
}

const statsOf = (r: ReturnType<typeof play>) => x01Game.matchStats!(r.visits, r.final)
const seatValues = (r: ReturnType<typeof play>, seat: number) => statsOf(r).seats.find(v => v.index === seat)!.values

describe('X01 matchStats', () => {
  it('declares the rows in the spec order', () => {
    const r = play(cfg(), ['A'], [])
    expect(statsOf(r).rows.map(x => x.key)).toEqual([
      'average',
      'first9Average',
      'checkout',
      'highestFinish',
      'highestScore',
      'count180',
      'count140',
      'count100',
      'bestLegDarts',
      'dartsThrown',
    ])
    expect(statsOf(r).rows.find(x => x.key === 'checkout')).toMatchObject({ format: 'ratio', value: 'checkoutHits', of: 'checkoutAttempts' })
  })

  it('counts averages, first 9, tiers and highest score; nothing to finish yet', () => {
    const r = play(cfg(), ['A', 'B'], [
      [T20, T20, T20], // A 180 → 121
      [S20, S20, S1], // B 41 → 260
      [T19, S20, MISS], // A 77 → 44
      [S20, S1, S1], // B 22 → 238
      [S20, S1, MISS], // A 21 → 23
      [S1, S1, S1], // B 3 → 235
      [S1, MISS, MISS], // A 1 → 22 (first 9 stops before this visit)
    ])
    const a = seatValues(r, 0)
    expect(a.dartsThrown).toBe(12)
    expect(a.average).toBeCloseTo(((180 + 77 + 21 + 1) / 12) * 3)
    expect(a.first9Average).toBeCloseTo(((180 + 77 + 21) / 9) * 3)
    expect(a.count180).toBe(1)
    expect(a.count140).toBe(0)
    expect(a.count100).toBe(0)
    expect(a.highestScore).toBe(180)
    expect(a.highestFinish).toBeUndefined()
    expect(a.bestLegDarts).toBeUndefined()
  })

  it('takes checkout hits and attempts from the live counting, finish and best leg from the checkout', () => {
    const r = play(cfg(), ['A', 'B'], [
      [T20, T20, T20], // A → 121
      [S1, S1, S1], // B → 298
      [T20, T20, MISS], // A: 121 − 120 = 1, a dead end under double out → bust, 121 stays
      [S1, S1, S1], // B → 295
      [T20, T19, D2], // A checks out 121: 60 + 57 + 4
    ])
    const a = seatValues(r, 0)
    expect(a.highestFinish).toBe(121)
    expect(a.bestLegDarts).toBe(9)
    expect(a.checkoutHits).toBe(1)
    expect(a.checkoutAttempts).toBe(r.final.checkoutAttempts[0])
    // The bust visit scored 0: 180 + 0 + 121 over 9 darts
    expect(a.average).toBeCloseTo(((180 + 121) / 9) * 3)
    expect(a.highestScore).toBe(180)
    expect(a.count100).toBe(1) // the 121 checkout
    expect(seatValues(r, 1).bestLegDarts).toBeUndefined()
    expect(seatValues(r, 1).highestFinish).toBeUndefined()
  })

  it('puts each visit in one tier', () => {
    const r = play(cfg({ startScore: 701 }), ['A'], [
      [T20, T20, T20], // 180
      [T20, T20, S20], // 140
      [T20, S20, S20], // 100
      [T20, T20, T19], // 177 → 140 tier
    ])
    expect(seatValues(r, 0)).toMatchObject({ count180: 1, count140: 2, count100: 1 })
  })

  it('scores nothing before opening under double in', () => {
    const r = play(cfg({ inMode: 'double' }), ['A'], [
      [T20, T20, T20], // not opened: 0
      [D10, T20, T20], // opens on D10: 20 + 60 + 60 = 140
    ])
    const a = seatValues(r, 0)
    expect(a.highestScore).toBe(140)
    expect(a.count180).toBe(0)
    expect(a.count140).toBe(1)
  })

  it('gives team totals from the parts and legs closed per player', () => {
    const r = play(cfg({ format: 'teams', teams: 'by_seat' } as Partial<X01Config>), ['A', 'B', 'C', 'D'], [
      [T20, T20, T20], // team of seat 0: 180 → 121
      [S1, S1, S1],
      [T20, T19, D2], // the other player of the first team checks out 121: 60 + 57 + 4
    ])
    const s = statsOf(r)
    expect(s.teams).toHaveLength(2)
    const team0 = s.teams!.find(t => t.index === r.final.teamOf[0])!.values
    expect(team0.dartsThrown).toBe(6)
    expect(team0.average).toBeCloseTo(((180 + 121) / 6) * 3)
    expect(team0.legsWon).toBe(1)
    const closer = r.visits[2].seat
    expect(s.seats.find(v => v.index === closer)!.values.legsClosed).toBe(1)
    expect(s.seats.find(v => v.index === 0)!.values.legsClosed).toBe(0)
  })
})
```

Before running, open `backend/src/games/teams.ts` and `X01Config` to confirm the team config fields (`format`, `teams`) and how seats map to teams; adjust the team test's config literal and the "other player of the first team" comment to the real turn order (the visit's `seat` is recorded, and the assertions read it from `r.visits[2].seat`, so only the config needs to match). Also confirm the bust visit in the checkout test: under double out, `121 − 120 = 1` must be a bust (`deadEnd`); if the module instead lets it stand, change that visit to `[T20, T20, T20]` (a plain bust over 121) and keep the assertions.

- [ ] **Step 2: Run them to see them fail**

Run: `cd backend && npx vitest run src/games/x01Stats.test.ts`
Expected: FAIL, `x01Game.matchStats` is not a function.

- [ ] **Step 3: Implement**

`backend/src/games/x01Stats.ts`:

```ts
// X01 match stats for the details page: averages, checkout, tiers and best leg per seat, and in
// a team game per team (from the parts, never an average of averages).
import type { CommittedVisit, MatchStats } from '../session/types.js'
import type { X01State } from './x01.js'
import { row, values } from './matchStats.js'
import { seatsByTeam } from './teams.js'

const ROWS = [
  row('average', '3-dart average', 'decimal', 'higher'),
  row('first9Average', 'First 9 average', 'decimal', 'higher', { compact: true }),
  row('checkout', 'Checkout', 'ratio', 'higher', { compact: true, value: 'checkoutHits', of: 'checkoutAttempts' }),
  row('highestFinish', 'Highest finish', 'integer', 'higher', { compact: true }),
  row('highestScore', 'Highest score', 'integer', 'higher', { compact: true }),
  row('count180', '180s', 'integer', 'higher'),
  row('count140', '140+', 'integer', 'higher'),
  row('count100', '100+', 'integer', 'higher'),
  row('bestLegDarts', 'Best leg', 'darts', 'lower', { compact: true }),
  row('dartsThrown', 'Darts thrown', 'integer', null, { compact: true }),
]

type Visit = { seat: number; leg: number; darts: number; scored: number; checkedOut: boolean; finish: number }

function toVisit(v: CommittedVisit<X01State>): Visit {
  const t = v.start.teamOf[v.seat]
  const bust = v.end.bustThisVisit
  const checkedOut = v.after.legs[t] > v.start.legs[t]
  return {
    seat: v.seat,
    leg: v.leg,
    darts: v.darts.length,
    scored: bust ? 0 : v.start.scores[t] - v.end.scores[t],
    checkedOut,
    finish: checkedOut ? v.start.scores[t] : 0,
  }
}

const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0)
const maxOf = (ns: number[]) => (ns.length > 0 ? Math.max(...ns) : undefined)
const minOf = (ns: number[]) => (ns.length > 0 ? Math.min(...ns) : undefined)
const perVisit = (points: number, darts: number) => (darts > 0 ? (points / darts) * 3 : undefined)

/** The values of a group of seats (one seat, or a team's seats). */
function groupValues(all: Visit[], seats: number[], final: X01State): Record<string, number | undefined> {
  const mine = all.filter(v => seats.includes(v.seat))
  const legs = [...new Set(mine.map(v => v.leg))]
  const first9 = legs.flatMap(l => mine.filter(v => v.leg === l).slice(0, 3))
  const legDarts = legs.filter(l => mine.some(v => v.leg === l && v.checkedOut)).map(l => sum(mine.filter(v => v.leg === l).map(v => v.darts)))
  const scores = mine.filter(v => v.darts > 0).map(v => v.scored)
  return {
    average: perVisit(sum(mine.map(v => v.scored)), sum(mine.map(v => v.darts))),
    first9Average: perVisit(sum(first9.map(v => v.scored)), sum(first9.map(v => v.darts))),
    checkoutHits: sum(seats.map(s => final.checkoutHits[s] ?? 0)),
    checkoutAttempts: sum(seats.map(s => final.checkoutAttempts[s] ?? 0)),
    highestFinish: maxOf(mine.filter(v => v.checkedOut).map(v => v.finish)),
    highestScore: maxOf(scores),
    count180: scores.filter(s => s === 180).length,
    count140: scores.filter(s => s >= 140 && s < 180).length,
    count100: scores.filter(s => s >= 100 && s < 140).length,
    bestLegDarts: minOf(legDarts),
    dartsThrown: sum(mine.map(v => v.darts)),
    legsWon: final.legs[final.teamOf[seats[0]]] ?? 0,
  }
}

export function x01MatchStats(visits: CommittedVisit<X01State>[], final: X01State): MatchStats {
  const all = visits.filter(v => v.phase === 'game').map(toVisit)
  const teams = final.cfg.format === 'teams'
  const seats = Array.from({ length: final.playerCount }, (_, seat) => ({
    index: seat,
    values: values({
      ...groupValues(all, [seat], final),
      ...(teams && { legsClosed: all.filter(v => v.seat === seat && v.checkedOut).length }),
    }),
  }))
  if (!teams) return { rows: ROWS, seats }
  return { rows: ROWS, seats, teams: seatsByTeam(final.teamOf).map((ss, t) => ({ index: t, values: values(groupValues(all, ss, final)) })) }
}
```

In `x01.ts`, import `x01MatchStats` and add `matchStats: x01MatchStats,` to `x01Game` after `detail`. (`x01Stats.ts` imports only the `X01State` type from `x01.ts`, so there's no runtime cycle.)

- [ ] **Step 4: Run them to see them pass**

Run: `cd backend && npx vitest run src/games/x01Stats.test.ts`
Expected: PASS. If a scripted visit doesn't land where its comment says (rule details), fix the scripted darts, not the stats code, unless the stats code contradicts the spec.

- [ ] **Step 5: Contract and route**

In `detail.contract.test.ts`, add after the X01Detail case:

```ts
  it('X01 MatchStats', () => {
    const s = x01Game.init(
      { startScore: 301, inMode: 'straight', outMode: 'double', bullOff: 'off', botSpeed: 'normal', bullValue: '25_50', maxRounds: 50, firstTo: 1 },
      [{ name: 'A' }],
    )
    const end = { ...s, scores: [241] }
    const m = x01Game.matchStats!(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end, after: end }],
      end,
    )
    const validate = ajv.compile(schemas.MatchStats)
    expect(validate(m), JSON.stringify(validate.errors)).toBe(true)
  })
```

In `backend/src/api/games.test.ts`, change the expectation from Task 1 to `stats: { seats: [{ index: 0 }, { index: 1 }] }` if the `game()` fixture has two seats and an empty event log (check the fixture: `getSessionEvents` is mocked; with no events the final state still has both seats), else `stats: { rows: expect.any(Array) }`.

Run: `cd backend && npx vitest run src/games src/api/games.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npm run format
git add backend/src/games backend/src/api/games.test.ts
git commit -m "feat(x01): match stats for the details page"
```

---

### Task 3: Around the Clock progress and match stats

**Files:**

- Create: `backend/src/games/atcProgress.ts`
- Modify: `backend/src/games/atc.ts` (export `hitsTarget`, `advanceInSequence`; `detail()` returns `progress`; `matchStats`)
- Test: `backend/src/games/atcProgress.test.ts`, `backend/src/games/detail.contract.test.ts`, `backend/src/games/history.test.ts` (ATC detail)

**Interfaces:**

- Consumes: `row`, `values` (Task 1); `ATCState`, `hitsTarget(target, dart)`, `advanceInSequence(current, steps, sequence)`, `hitCounts(s)` from `./atc.js`.
- Produces: `atcProgress(visits: CommittedVisit<ATCState>[], final: ATCState): AtcDetail['progress']`; `atcMatchStats(visits, final): MatchStats` wired as `atcModule.matchStats`. Value keys: `dartsThrown, targetsHit, dartsHit, firstDartHits, longestStreak, dartsPerTarget, hardestTarget, reached, finished`.

- [ ] **Step 1: Export the walk's building blocks**

In `atc.ts`, change `function hitsTarget` and `function advanceInSequence` to `export function`. `hitsTarget` takes a `Dart`; a `HistoryDart` has `segment` too, so callers pass `{ segment: d.segment, score: 0 }` if the type demands `score` (check `Dart` in `session/types.ts`).

- [ ] **Step 2: Write the failing tests**

`backend/src/games/atcProgress.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { atcModule, type ATCState } from './atc.js'
import { atcProgress } from './atcProgress.js'
import type { BoardEvent, CommittedVisit, HistoryDart, Segment } from '../session/types.js'

const seg = (number: number, multiplier: 0 | 1 | 2 | 3): Segment => ({
  name: multiplier === 0 ? 'Miss' : `${['', 'S', 'D', 'T'][multiplier]}${number}`,
  number,
  multiplier,
  bed: multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single',
})
const MISS = seg(0, 0)
const hd = (s: Segment, index: number): HistoryDart => ({
  index,
  segment: s,
  coords: null,
  source: 'manual',
  corrected: false,
  thrownAt: '2026-10-01T10:00:00.000Z',
})
const dartEvent = (s: Segment, index: number): BoardEvent => ({
  kind: 'dart.detected',
  data: { visit_id: 'v', index, source_seq: 0, dart: { segment: s, score: s.number * s.multiplier } },
})
const base = { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' } as const

function play(cfg: typeof base | Record<string, unknown>, players: number, throws: Segment[][]) {
  let s = atcModule.init(cfg as never, Array.from({ length: players }, (_, i) => ({ name: `P${i}` })))
  const visits: CommittedVisit<ATCState>[] = []
  throws.forEach((darts, n) => {
    const seat = s.currentPlayer
    const start = atcModule.onBoardEvent(s, { kind: 'visit.opened', data: {} }).state
    let end = start
    darts.forEach((d, i) => {
      end = atcModule.onBoardEvent(end, dartEvent(d, i)).state
    })
    const after = atcModule.onBoardEvent(end, { kind: 'takeout.finished', data: {} }).state
    visits.push({ visit: n, seat, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: darts.map(hd), start, end, after })
    s = after
  })
  return { visits, final: s }
}

describe('atcProgress', () => {
  it('counts darts per target and ends on the target the game stopped at', () => {
    const r = play(base, 2, [
      [MISS, seg(1, 1), seg(2, 1)], // P0: 1 in 2 darts, 2 in 1
      [MISS, MISS, MISS], // P1: 3 darts at 1
      [MISS, MISS, MISS], // P0: 3 darts at 3
    ])
    expect(atcProgress(r.visits, r.final)).toEqual([
      { seat: 0, steps: [{ target: 1, darts: 2, hit: true }, { target: 2, darts: 1, hit: true }, { target: 3, darts: 3, hit: false }] },
      { seat: 1, steps: [{ target: 1, darts: 3, hit: false }] },
    ])
  })

  it('lists targets a multiplier skips as hit with no darts', () => {
    const r = play({ ...base, multiplierAdvances: true }, 1, [[seg(1, 3)]]) // T1: 1, 2, 3 done
    expect(atcProgress(r.visits, r.final)[0].steps.slice(0, 4)).toEqual([
      { target: 1, darts: 1, hit: true },
      { target: 2, darts: 0, hit: true },
      { target: 3, darts: 0, hit: true },
      { target: 4, darts: 0, hit: false },
    ])
  })
})

describe('ATC matchStats', () => {
  it('counts hits, first-dart hits, streaks, darts per target and the hardest target', () => {
    const r = play(base, 2, [
      [seg(1, 1), seg(2, 1), MISS], // P0: 1 and 2 first dart, streak 2
      [MISS, MISS, seg(1, 1)], // P1: 1 on the third dart
      [MISS, MISS, seg(3, 1)], // P0: 3 on the third dart (hardest)
      [seg(2, 1), seg(3, 1), seg(4, 1)], // P1: hits 2, 3, 4; with the 1 that ended their last visit, a streak of 4
    ])
    const m = atcModule.matchStats!(r.visits, r.final)
    const p0 = m.seats.find(s => s.index === 0)!.values
    const p1 = m.seats.find(s => s.index === 1)!.values
    expect(p0).toMatchObject({ dartsThrown: 6, targetsHit: 3, dartsHit: 3, firstDartHits: 2, longestStreak: 2, hardestTarget: 3, reached: 4, finished: 0 })
    expect(p0.dartsPerTarget).toBeCloseTo(6 / 3)
    expect(p1).toMatchObject({ dartsThrown: 6, targetsHit: 4, dartsHit: 4, firstDartHits: 3, longestStreak: 4, hardestTarget: 1 })
    expect(m.rows.find(x => x.key === 'hitRate')).toMatchObject({ format: 'ratio', value: 'dartsHit', of: 'dartsThrown' })
  })

  it('keeps the hit rate at or under 100% when a multiplier skips targets', () => {
    const r = play({ ...base, multiplierAdvances: true }, 1, [[seg(1, 3), seg(4, 3)]]) // 2 darts, 6 targets
    const v = atcModule.matchStats!(r.visits, r.final).seats[0].values
    expect(v.dartsHit).toBe(2)
    expect(v.targetsHit).toBe(6)
  })

  it('leaves out the hardest target for a seat that hit nothing', () => {
    const r = play(base, 1, [[MISS, MISS, MISS]])
    expect(atcModule.matchStats!(r.visits, r.final).seats[0].values.hardestTarget).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `cd backend && npx vitest run src/games/atcProgress.test.ts`
Expected: FAIL, cannot find `./atcProgress.js`.

- [ ] **Step 4: Implement**

`backend/src/games/atcProgress.ts`:

```ts
// Around the Clock, dart by dart: which target each dart was thrown at and whether it hit,
// using the module's own rules (a multiplier can skip targets), for the details page's target
// grid, race chart and match stats.
import type { AtcDetail, CommittedVisit, MatchStats } from '../session/types.js'
import { advanceInSequence, hitCounts, hitsTarget, type ATCState } from './atc.js'
import { row, values } from './matchStats.js'

type Step = AtcDetail['progress'][number]['steps'][number]
type Throw = { target: number; hit: boolean }

const ROWS = [
  row('dartsThrown', 'Darts thrown', 'integer', null, { compact: true }),
  row('targetsHit', 'Targets hit', 'integer', 'higher', { compact: true }),
  row('hitRate', 'Hit rate', 'ratio', 'higher', { value: 'dartsHit', of: 'dartsThrown' }),
  row('firstDartHits', 'Hit with first dart', 'integer', 'higher', { compact: true }),
  row('longestStreak', 'Longest hit streak', 'integer', 'higher', { compact: true }),
  row('dartsPerTarget', 'Darts per target', 'decimal', 'lower'),
  row('hardestTarget', 'Hardest target', 'target', null, { compact: true }),
]

/** Every dart a seat threw, with the target it was aimed at; and the steps (targets reached). */
function walk(visits: CommittedVisit<ATCState>[], final: ATCState, seat: number): { throws: Throw[]; steps: Step[] } {
  const throws: Throw[] = []
  const steps: Step[] = []
  let current: Step | null = null
  for (const v of visits) {
    if (v.phase !== 'game' || v.seat !== seat) continue
    let target = v.start.targets[seat]
    for (const d of v.darts) {
      if (!final.sequence.includes(target)) break // finished
      if (!current || current.target !== target) {
        current = { target, darts: 0, hit: false }
        steps.push(current)
      }
      const hit = hitsTarget(target, { segment: d.segment, score: 0 })
      current.darts += 1
      throws.push({ target, hit })
      if (!hit) continue
      current.hit = true
      const stepsAhead = final.cfg.multiplierAdvances ? d.segment.multiplier : 1
      const next = advanceInSequence(target, stepsAhead, final.sequence)
      // Targets jumped over count as done with no darts
      const from = final.sequence.indexOf(target)
      const to = final.sequence.includes(next) ? final.sequence.indexOf(next) : final.sequence.length
      for (let i = from + 1; i < to; i++) steps.push({ target: final.sequence[i], darts: 0, hit: true })
      target = next
      current = null
    }
  }
  // The target it ended on, even without a dart at it yet
  const end = final.targets[seat]
  if (final.sequence.includes(end) && steps.at(-1)?.target !== end) steps.push({ target: end, darts: 0, hit: false })
  return { throws, steps }
}

export function atcProgress(visits: CommittedVisit<ATCState>[], final: ATCState): AtcDetail['progress'] {
  return Array.from({ length: final.playerCount }, (_, seat) => ({ seat, steps: walk(visits, final, seat).steps }))
}

function longestStreak(throws: Throw[]): number {
  let best = 0,
    run = 0
  for (const t of throws) {
    run = t.hit ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

export function atcMatchStats(visits: CommittedVisit<ATCState>[], final: ATCState): MatchStats {
  const completed = hitCounts(final)
  return {
    rows: ROWS,
    seats: Array.from({ length: final.playerCount }, (_, seat) => {
      const { throws, steps } = walk(visits, final, seat)
      const thrownAt = steps.filter(s => s.darts > 0 && s.hit)
      const hardest = thrownAt.reduce<Step | null>((h, s) => (!h || s.darts > h.darts ? s : h), null)
      const darts = throws.length
      return {
        index: seat,
        values: values({
          dartsThrown: darts,
          targetsHit: completed[seat],
          dartsHit: throws.filter(t => t.hit).length,
          firstDartHits: thrownAt.filter(s => s.darts === 1).length,
          longestStreak: longestStreak(throws),
          dartsPerTarget: completed[seat] > 0 ? darts / completed[seat] : undefined,
          hardestTarget: hardest?.target,
          reached: final.targets[seat],
          finished: completed[seat] === final.sequence.length ? 1 : 0,
        }),
      }
    }),
  }
}
```

Note on `firstDartHits`: a target hit with its first dart has `darts === 1` and `hit === true`; skipped targets (`darts: 0`) don't count.

In `atc.ts`: import `atcMatchStats` and `atcProgress` from `./atcProgress.js`, change `detail(visits)` to `detail(visits, final)` and return `{ mode: 'atc', visits: ..., progress: atcProgress(visits, final) }` (drop the temporary `progress: []`), and add `matchStats: atcMatchStats,`. `atcProgress.ts` imports runtime functions from `atc.ts` and `atc.ts` imports from `atcProgress.ts`: the functions are only called later, so the ES module cycle is safe, but if the test run reports `hitsTarget is not a function` at import time, move `hitsTarget`, `advanceInSequence` and `hitCounts` into `backend/src/games/atcRules.ts` and import them from there in both files.

- [ ] **Step 5: Run them to see them pass**

Run: `cd backend && npx vitest run src/games/atcProgress.test.ts src/games/history.test.ts`
Expected: PASS. If `history.test.ts` checks the ATC detail with `toEqual`, add `progress` to its expectation.

- [ ] **Step 6: Contract**

In `detail.contract.test.ts`, pass the final state to `atcModule.detail(..., s)` (it already does) and add:

```ts
  it('ATC MatchStats', () => {
    const s = atcModule.init({ throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' }, [{ name: 'A' }])
    const m = atcModule.matchStats!(
      [{ visit: 0, seat: 0, leg: 0, phase: 'game', committedAt: '2026-10-01T10:00:00.000Z', darts: [dart], start: s, end: s, after: s }],
      s,
    )
    const validate = ajv.compile(schemas.MatchStats)
    expect(validate(m), JSON.stringify(validate.errors)).toBe(true)
  })
```

Run: `cd backend && npx vitest run src/games && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format
git add backend/src/games
git commit -m "feat(atc): target progress and match stats for the details page"
```

---

### Task 4: Frontend stat formatting and better values

**Files:**

- Create: `backend/frontend/src/lib/details/stats.ts`
- Test: `backend/frontend/src/lib/__tests__/detailsStats.test.ts`

**Interfaces:**

- Consumes: `StatRow`, `StatValues` from `$lib/api` (Task 1).
- Produces: `targetLabel(n: number): string`; `formatStat(row: StatRow, values: Record<string, number>): string`; `statNumber(row, values): number | undefined` (the comparable number: the rate for a ratio); `betterIndexes(row: StatRow, all: StatValues[]): Set<number>` (indexes holding the best value; empty when `better` is null, fewer than two values, or all equal).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { StatRow } from '../api'
import { betterIndexes, formatStat, statNumber, targetLabel } from '../details/stats.js'

const r = (over: Partial<StatRow>): StatRow => ({ key: 'k', label: 'K', format: 'integer', better: 'higher', compact: false, ...over })

describe('formatStat', () => {
  it('formats each kind', () => {
    expect(formatStat(r({ format: 'decimal' }), { k: 83.94 })).toBe('83.9')
    expect(formatStat(r({ format: 'integer' }), { k: 6 })).toBe('6')
    expect(formatStat(r({ format: 'darts' }), { k: 15 })).toBe('15 darts')
    expect(formatStat(r({ format: 'darts' }), { k: 1 })).toBe('1 dart')
    expect(formatStat(r({ format: 'target' }), { k: 17 })).toBe('17')
    expect(formatStat(r({ format: 'target' }), { k: 21 })).toBe('25')
    expect(formatStat(r({ format: 'target' }), { k: 22 })).toBe('Bull')
    expect(formatStat(r({ format: 'ratio', value: 'h', of: 'a' }), { h: 3, a: 6 })).toBe('50% · 3/6')
  })
  it('shows a dash for what does not apply', () => {
    expect(formatStat(r({}), {})).toBe('—')
    expect(formatStat(r({ format: 'ratio', value: 'h', of: 'a' }), { h: 0, a: 0 })).toBe('—')
  })
})

describe('betterIndexes', () => {
  const seats = (...vs: (number | undefined)[]) => vs.map((v, index) => ({ index, values: v === undefined ? {} : { k: v } }))
  it('marks the higher or lower value', () => {
    expect([...betterIndexes(r({ better: 'higher' }), seats(83.9, 71.6))]).toEqual([0])
    expect([...betterIndexes(r({ better: 'lower' }), seats(15, 17))]).toEqual([0])
  })
  it('marks nobody without a direction, on a tie, or with one value', () => {
    expect(betterIndexes(r({ better: null }), seats(1, 2)).size).toBe(0)
    expect(betterIndexes(r({}), seats(4, 4)).size).toBe(0)
    expect(betterIndexes(r({}), seats(4)).size).toBe(0)
  })
  it('ignores missing values and compares ratios by rate', () => {
    expect([...betterIndexes(r({ better: 'lower' }), seats(undefined, 17))]).toEqual([])
    const ratio = r({ format: 'ratio', value: 'h', of: 'a' })
    const all = [
      { index: 0, values: { h: 3, a: 6 } },
      { index: 1, values: { h: 1, a: 4 } },
    ]
    expect([...betterIndexes(ratio, all)]).toEqual([0])
    expect(statNumber(ratio, all[0].values)).toBeCloseTo(0.5)
  })
  it('marks every seat sharing the best value in a party', () => {
    expect([...betterIndexes(r({}), seats(5, 7, 7))]).toEqual([1, 2])
  })
})

describe('targetLabel', () => {
  it('names the bull targets', () => {
    expect([targetLabel(20), targetLabel(21), targetLabel(22)]).toEqual(['20', '25', 'Bull'])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsStats.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// The details page's stats table, for any game mode: each row from the server says how to show
// its value and which way is better.
import type { StatRow, StatValues } from '../api'
import { plural } from '../fmt.js'

const has = (values: Record<string, number>, key: string | undefined): key is string => key !== undefined && Object.hasOwn(values, key)

/** 1–20, 21 = 25, 22 = Bull. */
export const targetLabel = (n: number): string => (n === 22 ? 'Bull' : n === 21 ? '25' : String(n))

/** The number to compare (a ratio's rate); undefined when the stat doesn't apply. */
export function statNumber(row: StatRow, values: Record<string, number>): number | undefined {
  const key = row.value ?? row.key
  if (!has(values, key)) return undefined
  if (row.format !== 'ratio') return values[key]
  if (!has(values, row.of) || values[row.of] === 0) return undefined
  return values[key] / values[row.of]
}

export function formatStat(row: StatRow, values: Record<string, number>): string {
  const n = statNumber(row, values)
  if (n === undefined) return '—'
  switch (row.format) {
    case 'decimal':
      return n.toFixed(1)
    case 'darts':
      return plural(n, 'dart')
    case 'target':
      return targetLabel(n)
    case 'ratio':
      return `${Math.round(n * 100)}% · ${values[row.value ?? row.key]}/${values[row.of ?? '']}`
    default:
      return String(n)
  }
}

/** Who holds the best value; nobody without a direction, with fewer than two values, or all equal. */
export function betterIndexes(row: StatRow, all: StatValues[]): Set<number> {
  if (row.better === null) return new Set()
  const scored = all.flatMap(s => {
    const n = statNumber(row, s.values)
    return n === undefined ? [] : [{ index: s.index, n }]
  })
  if (scored.length < 2) return new Set()
  const best = row.better === 'higher' ? Math.max(...scored.map(s => s.n)) : Math.min(...scored.map(s => s.n))
  if (scored.every(s => s.n === best)) return new Set()
  return new Set(scored.filter(s => s.n === best).map(s => s.index))
}
```

Note the "ignores missing values" test: with one present value (`[undefined, 17]`) nothing is marked, since a single value has nothing to beat. That matches "never counts as better" from the spec and the solo rule.

- [ ] **Step 4: Run to see it pass, commit**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsStats.test.ts`
Expected: PASS.

```bash
npm run format
git add backend/frontend/src/lib/details/stats.ts backend/frontend/src/lib/__tests__/detailsStats.test.ts
git commit -m "feat(frontend): format match stats and mark the better value"
```

---

### Task 5: X01 leg view helpers

**Files:**

- Create: `backend/frontend/src/lib/details/x01.ts`
- Test: `backend/frontend/src/lib/__tests__/detailsX01.test.ts`

**Interfaces:**

- Consumes: `X01Detail`, `GameSummary` from `$lib/api`.
- Produces:
  - `type Side = { key: number; name: string; seats: number[] }` (a seat in singles, a team in a team game).
  - `x01Sides(game: GameSummary, detail: X01Detail): Side[]` — teams from `detail.teams` (index order), else one side per seat in seat order.
  - `legSeries(detail: X01Detail, leg: number, sides: Side[], start: number): { key: number; points: { visit: number; left: number; scored: number }[] }[]` — per side, starting with `{ visit: 0, left: start, scored: 0 }`, one point per visit of that side.
  - `chalkboardRows(detail: X01Detail, leg: number, sides: Side[]): ChalkRow[]` with `type ChalkCell = { seat: number; scored: number; left: number; darts: string[]; bust: boolean; out: boolean; tier: 'max' | 'ton' | null; crossed: boolean }` and `type ChalkRow = { n: number; cells: (ChalkCell | null)[] }` (cells in `sides` order; `crossed` = the side has a later visit in this leg).
  - `legSummary(detail: X01Detail, leg: number, sides: Side[], nameOf: (seat: number) => string): string` — "Christoph won in 15 darts, checking out T20 · S20 · D18 · Guest 1 threw first", or "No winner: the round limit ended it · Guest 1 threw first".
  - `dartLabel(segment): string` — "T20", "D18", "25", "Bull", "–" for a miss.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { GameSummary, X01Detail } from '../api'
import { chalkboardRows, dartLabel, legSeries, legSummary, x01Sides } from '../details/x01.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
  name,
  number,
  multiplier,
  bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
})
const d = (s: ReturnType<typeof seg>, index: number) => ({ index, segment: s, coords: null, source: 'manual' as const, corrected: false, thrownAt: '' })
const T20 = seg('T20', 20, 3),
  S20 = seg('S20', 20, 1),
  D18 = seg('D18', 18, 2),
  MISS = seg('Miss', 0, 0)
const v = (visit: number, seat: number, darts: ReturnType<typeof d>[], scored: number, remaining: number, bust = false) => ({
  visit,
  seat,
  committedAt: '',
  darts,
  scored,
  remaining,
  bust,
})

const detail: X01Detail = {
  mode: 'x01',
  legs: [
    {
      leg: 0,
      starter: 0,
      winner: 0,
      visits: [
        v(0, 0, [d(T20, 0), d(T20, 1), d(T20, 2)], 180, 121),
        v(1, 1, [d(S20, 0), d(S20, 1), d(MISS, 2)], 40, 261),
        v(2, 0, [d(T20, 0), d(S20, 1), d(D18, 2)], 116, 5),
      ],
    },
  ],
}
const game = { players: [{ seat: 0, name: 'Christoph' }, { seat: 1, name: 'Guest 1' }] } as GameSummary

describe('X01 details helpers', () => {
  const sides = x01Sides(game, detail)

  it('makes one side per seat in singles', () => {
    expect(sides).toEqual([
      { key: 0, name: 'Christoph', seats: [0] },
      { key: 1, name: 'Guest 1', seats: [1] },
    ])
  })

  it('makes one side per team in a team game', () => {
    const teams = { ...detail, teams: [{ id: 'A', name: 'Team A', seats: [0, 2] }, { id: 'B', name: 'Team B', seats: [1, 3] }] } as X01Detail
    expect(x01Sides(game, teams).map(s => [s.name, s.seats])).toEqual([
      ['Team A', [0, 2]],
      ['Team B', [1, 3]],
    ])
  })

  it('charts points left from the start score', () => {
    expect(legSeries(detail, 0, sides, 301).map(s => s.points.map(p => p.left))).toEqual([
      [301, 121, 5],
      [301, 261],
    ])
  })

  it('lays the chalkboard out per visit and side', () => {
    const rows = chalkboardRows(detail, 0, sides)
    expect(rows).toHaveLength(2)
    expect(rows[0].cells[0]).toMatchObject({ scored: 180, tier: 'max', darts: ['T20', 'T20', 'T20'], crossed: true, out: false })
    expect(rows[0].cells[1]).toMatchObject({ scored: 40, tier: null, darts: ['S20', 'S20', '–'], crossed: false })
    expect(rows[1].cells[0]).toMatchObject({ scored: 116, tier: 'ton', out: true, crossed: false })
    expect(rows[1].cells[1]).toBeNull()
  })

  it('sums the leg up', () => {
    expect(legSummary(detail, 0, sides, s => game.players[s].name)).toBe(
      'Christoph won in 6 darts, checking out T20 · S20 · D18 · Christoph threw first',
    )
    const cut = { ...detail, legs: [{ ...detail.legs[0], winner: null }] }
    expect(legSummary(cut, 0, sides, s => game.players[s].name)).toBe('No winner: the round limit ended it · Christoph threw first')
  })

  it('labels darts the way the chalkboard does', () => {
    expect([dartLabel(T20), dartLabel(seg('25', 25, 1)), dartLabel(seg('Bull', 50, 2)), dartLabel(MISS)]).toEqual(['T20', '25', 'Bull', '–'])
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsX01.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// X01 on the details page: the sides (seats, or teams), and per leg the points-left chart, the
// chalkboard and the one-line summary, all from the server's X01Detail.
import type { GameSummary, Segment, X01Detail } from '../api'

export type Side = { key: number; name: string; seats: number[] }
export type ChalkCell = {
  seat: number
  scored: number
  left: number
  darts: string[]
  bust: boolean
  out: boolean
  tier: 'max' | 'ton' | null
  crossed: boolean
}
export type ChalkRow = { n: number; cells: (ChalkCell | null)[] }
type Visit = X01Detail['legs'][number]['visits'][number]

export function x01Sides(game: GameSummary, detail: X01Detail): Side[] {
  if (detail.teams) return detail.teams.map((t, key) => ({ key, name: t.name, seats: t.seats }))
  return [...game.players].sort((a, b) => a.seat - b.seat).map(p => ({ key: p.seat, name: p.name, seats: [p.seat] }))
}

export function dartLabel(s: Segment): string {
  if (s.multiplier === 0) return '–'
  if (s.number === 50) return 'Bull'
  if (s.number === 25) return '25'
  return `${s.multiplier === 3 ? 'T' : s.multiplier === 2 ? 'D' : 'S'}${s.number}`
}

const legOf = (detail: X01Detail, leg: number) => detail.legs.find(l => l.leg === leg)
const sideVisits = (detail: X01Detail, leg: number, side: Side): Visit[] => (legOf(detail, leg)?.visits ?? []).filter(v => side.seats.includes(v.seat))

export function legSeries(detail: X01Detail, leg: number, sides: Side[], start: number) {
  return sides.map(side => ({
    key: side.key,
    points: [{ visit: 0, left: start, scored: 0 }, ...sideVisits(detail, leg, side).map((v, i) => ({ visit: i + 1, left: v.remaining, scored: v.scored }))],
  }))
}

export function chalkboardRows(detail: X01Detail, leg: number, sides: Side[]): ChalkRow[] {
  const perSide = sides.map(side => sideVisits(detail, leg, side))
  const winner = legOf(detail, leg)?.winner ?? null
  const n = Math.max(0, ...perSide.map(vs => vs.length))
  return Array.from({ length: n }, (_, i) => ({
    n: i + 1,
    cells: perSide.map(vs => {
      const v = vs[i]
      if (!v) return null
      const last = i === vs.length - 1
      return {
        seat: v.seat,
        scored: v.scored,
        left: v.remaining,
        darts: v.darts.map(d => dartLabel(d.segment)),
        bust: v.bust,
        out: last && winner !== null && v.seat === winner && v.remaining === 0,
        tier: v.scored === 180 ? 'max' : v.scored >= 100 ? 'ton' : null,
        crossed: !last,
      }
    }),
  }))
}

export function legSummary(detail: X01Detail, leg: number, sides: Side[], nameOf: (seat: number) => string): string {
  const l = legOf(detail, leg)
  if (!l) return ''
  const first = `${nameOf(l.starter)} threw first`
  if (l.winner === null) return `No winner: the round limit ended it · ${first}`
  const side = sides.find(s => s.seats.includes(l.winner!))
  const winnerName = side && side.seats.length > 1 ? side.name : nameOf(l.winner)
  const darts = side ? sideVisits(detail, leg, side).reduce((n, v) => n + v.darts.length, 0) : 0
  const checkout = l.visits.at(-1)?.darts.map(d => dartLabel(d.segment)).join(' · ') ?? ''
  return `${winnerName} won in ${darts} darts, checking out ${checkout} · ${first}`
}
```

Check `Segment` is exported from `$lib/api` (it is: `export type { Snapshot, UserAction, Segment, ... } from './game-ws'`; if the `HistoryDart.segment` type differs, import `Schemas['Segment']` instead).

- [ ] **Step 4: Run to see it pass, commit**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsX01.test.ts`
Expected: PASS.

```bash
npm run format
git add backend/frontend/src/lib/details/x01.ts backend/frontend/src/lib/__tests__/detailsX01.test.ts
git commit -m "feat(frontend): X01 leg chart, chalkboard and summary for details"
```

---

### Task 6: Around the Clock view helpers

**Files:**

- Create: `backend/frontend/src/lib/details/atc.ts`
- Test: `backend/frontend/src/lib/__tests__/detailsAtc.test.ts`

**Interfaces:**

- Consumes: `AtcDetail`, `StatValues` from `$lib/api`; `targetLabel` from `./stats.js`.
- Produces:
  - `type GridCell = { target: number; state: 'hit' | 'ended' | 'none'; darts: number; tone: 1 | 2 | 3 | 4 | null; skipped: boolean }`.
  - `targetGrid(detail: AtcDetail, sequence: number[]): { seat: number; cells: GridCell[] }[]` — one cell per target of `sequence` per seat.
  - `sequenceOf(detail: AtcDetail): number[]` — the targets in order, as the longest `progress` shows them (the full sequence for whoever finished; for nobody finishing, the union in order of appearance).
  - `raceSeries(detail: AtcDetail): { seat: number; points: { darts: number; hits: number }[] }[]` — cumulative, starting at `{0,0}`, one point per hit step (`darts` summed).
  - `hardestLine(stats: StatValues[], nameOf: (seat: number) => string): string` — "11 cost Christoph the most; Guest 1 stalled on 7." (one clause per seat with a `hardestTarget`).
  - `atcResult(values: Record<string, number>): string` — "Finished · 49 darts" or "Reached 15".

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { AtcDetail } from '../api'
import { atcResult, hardestLine, raceSeries, sequenceOf, targetGrid } from '../details/atc.js'

const detail = {
  mode: 'atc',
  visits: [],
  progress: [
    { seat: 0, steps: [{ target: 1, darts: 2, hit: true }, { target: 2, darts: 0, hit: true }, { target: 3, darts: 5, hit: false }] },
    { seat: 1, steps: [{ target: 1, darts: 4, hit: true }, { target: 2, darts: 1, hit: false }] },
  ],
} as AtcDetail

describe('ATC details helpers', () => {
  it('reads the sequence from the progress', () => {
    expect(sequenceOf(detail)).toEqual([1, 2, 3])
  })

  it('grids darts per target with tones, the ended target and targets not reached', () => {
    const g = targetGrid(detail, [1, 2, 3, 4])
    expect(g[0].cells.map(c => [c.target, c.state, c.darts, c.tone, c.skipped])).toEqual([
      [1, 'hit', 2, 2, false],
      [2, 'hit', 0, null, true],
      [3, 'ended', 5, null, false],
      [4, 'none', 0, null, false],
    ])
    expect(g[1].cells[0].tone).toBe(4)
  })

  it('races cumulative hits against darts', () => {
    expect(raceSeries(detail)[0].points).toEqual([
      { darts: 0, hits: 0 },
      { darts: 2, hits: 1 },
      { darts: 2, hits: 2 },
    ])
  })

  it('names each player hardest target', () => {
    const stats = [
      { index: 0, values: { hardestTarget: 11 } },
      { index: 1, values: { hardestTarget: 22 } },
      { index: 2, values: {} },
    ]
    expect(hardestLine(stats, s => ['Christoph', 'Guest 1', 'Lena'][s])).toBe('11 cost Christoph the most; Bull cost Guest 1 the most.')
  })

  it('words the result', () => {
    expect(atcResult({ finished: 1, dartsThrown: 49 })).toBe('Finished · 49 darts')
    expect(atcResult({ finished: 0, reached: 15 })).toBe('Reached 15')
    expect(atcResult({ finished: 0, reached: 22 })).toBe('Reached Bull')
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsAtc.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// Around the Clock on the details page: the target-by-target grid, the race chart and the
// sentences around them, from the server's per-seat progress.
import type { AtcDetail, StatValues } from '../api'
import { targetLabel } from './stats.js'

export type GridCell = { target: number; state: 'hit' | 'ended' | 'none'; darts: number; tone: 1 | 2 | 3 | 4 | null; skipped: boolean }

export function sequenceOf(detail: AtcDetail): number[] {
  const seen: number[] = []
  for (const p of detail.progress) for (const s of p.steps) if (!seen.includes(s.target)) seen.push(s.target)
  return seen
}

export function targetGrid(detail: AtcDetail, sequence: number[]): { seat: number; cells: GridCell[] }[] {
  return detail.progress.map(p => ({
    seat: p.seat,
    cells: sequence.map(target => {
      const step = p.steps.find(s => s.target === target)
      if (!step) return { target, state: 'none', darts: 0, tone: null, skipped: false }
      const skipped = step.hit && step.darts === 0
      const tone = step.hit && !skipped ? (Math.min(step.darts, 4) as 1 | 2 | 3 | 4) : null
      return { target, state: step.hit ? 'hit' : 'ended', darts: step.darts, tone, skipped }
    }),
  }))
}

export function raceSeries(detail: AtcDetail) {
  return detail.progress.map(p => {
    let darts = 0,
      hits = 0
    const points = [{ darts: 0, hits: 0 }]
    for (const s of p.steps) {
      darts += s.darts
      if (!s.hit) continue
      hits += 1
      points.push({ darts, hits })
    }
    return { seat: p.seat, points }
  })
}

export function hardestLine(stats: StatValues[], nameOf: (seat: number) => string): string {
  const parts = stats
    .filter(s => Object.hasOwn(s.values, 'hardestTarget'))
    .map(s => `${targetLabel(s.values.hardestTarget)} cost ${nameOf(s.index)} the most`)
  return parts.length > 0 ? `${parts.join('; ')}.` : ''
}

export function atcResult(values: Record<string, number>): string {
  if (values.finished === 1) return `Finished · ${values.dartsThrown ?? 0} darts`
  return Object.hasOwn(values, 'reached') ? `Reached ${targetLabel(values.reached)}` : ''
}
```

(The spec's artboard sentence also says "stalled on 7 and 15" for a player stuck on a target; this plan keeps one clause per player for the hardest target only. YAGNI; iterate later.)

- [ ] **Step 4: Run to see it pass, commit**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsAtc.test.ts`
Expected: PASS.

```bash
npm run format
git add backend/frontend/src/lib/details/atc.ts backend/frontend/src/lib/__tests__/detailsAtc.test.ts
git commit -m "feat(frontend): ATC target grid and race chart for details"
```

---

### Task 7: The details page: route, header, result, stats, standings, History links

**Files:**

- Create: `backend/frontend/src/lib/details/page.ts`
- Create: `backend/frontend/src/lib/components/details/DetailsHeader.svelte`, `ResultCard.svelte`, `StatsTable.svelte`, `Standings.svelte`, `TeamShares.svelte`
- Create: `backend/frontend/src/routes/GameDetails.svelte`
- Modify: `backend/frontend/src/App.svelte:23-34` (route), `backend/frontend/src/routes/History.svelte:170-222` (rows link)
- Test: `backend/frontend/src/lib/__tests__/detailsPage.test.ts`, `backend/frontend/src/lib/__tests__/gameDetailsRender.test.ts`

**Interfaces:**

- Consumes: `GameDetail`, `GameSummary`, `StatValues` from `$lib/api`; `formatStat`, `betterIndexes` (Task 4); `x01Sides` (Task 5); `atcResult` (Task 6); `rulesLine`, `resultLabel` from `$lib/history`; `getGameView` from `$lib/gameViews`; `dayMonth`, `ordinal` from `$lib/fmt`.
- Produces:
  - `layoutOf(d: GameDetail): 'duel' | 'teams' | 'party'` — `teams` when `d.stats.teams` has 2 entries, `party` for 3+ seats, else `duel` (1 or 2 seats).
  - `type DetailSide = { index: number; name: string; placement: number; values: Record<string, number>; me: boolean; guest: boolean; members: string[] }`.
  - `detailSides(d: GameDetail): DetailSide[]` — teams (from `stats.teams` + `detail.teams`) or seats (seat order, values from `stats.seats`).
  - `headline(d: GameDetail, sides: DetailSide[]): { big: string; caption: string }` — X01: "3–1" / "Legs · first to 3" (one side: `legsWon`); ATC: winner's `atcResult`; other modes: empty strings.
  - `metaLine(d: GameDetail): string` — `rulesLine(game)` + " · 26 Sep 2026, 21:14" + (" · board") .
  - `highlightDefault(d: GameDetail): number` — your seat, else the winner (placement 1), else 0.
  - Components: `DetailsHeader { detail }`, `ResultCard { detail, sides }`, `StatsTable { rows, sides }`, `Standings { detail, sides }`, `TeamShares { detail }`.

- [ ] **Step 1: Write the failing helper tests**

`backend/frontend/src/lib/__tests__/detailsPage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { GameDetail } from '../api'
import { detailSides, headline, highlightDefault, layoutOf, metaLine } from '../details/page.js'

const seat = (s: number, name: string, placement: number, stats: Record<string, number> = {}) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: s === 0 ? 'me' : null,
  placement,
  stats,
  forfeited: false,
})
const x01 = (players: ReturnType<typeof seat>[], extra: Partial<GameDetail> = {}): GameDetail => ({
  game: {
    id: 'g1',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: { id: 'b', name: 'Living room' },
    mySeat: 0,
    players,
  },
  detail: { mode: 'x01', legs: [] },
  stats: {
    rows: [],
    seats: players.map(p => ({ index: p.seat, values: { legsWon: p.placement === 1 ? 3 : 1 } })),
  },
  ...extra,
})

describe('details page helpers', () => {
  it('picks the layout', () => {
    expect(layoutOf(x01([seat(0, 'A', 1)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 3)]))).toBe('party')
    const teams = x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 1), seat(3, 'D', 2)])
    teams.stats.teams = [
      { index: 0, values: { legsWon: 2 } },
      { index: 1, values: { legsWon: 1 } },
    ]
    teams.detail = { mode: 'x01', legs: [], teams: [{ id: 'A', name: 'Team A', seats: [0, 2] }, { id: 'B', name: 'Team B', seats: [1, 3] }] } as GameDetail['detail']
    expect(layoutOf(teams)).toBe('teams')
    expect(detailSides(teams).map(s => [s.name, s.members, s.placement])).toEqual([
      ['Team A', ['A', 'C'], 1],
      ['Team B', ['B', 'D'], 2],
    ])
  })

  it('makes the X01 headline from legs', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(headline(d, detailSides(d))).toEqual({ big: '3–1', caption: 'Legs · first to 3' })
  })

  it('writes the meta line', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(metaLine(d)).toMatch(/^501 · Double out · First to 3 legs · 26 Sep 2026, \d\d:\d\d · Living room$/)
  })

  it('marks who gave up', () => {
    const d = x01([seat(0, 'A', 2), { ...seat(1, 'B', 1), forfeited: false }])
    d.game.players[0].forfeited = true
    expect(detailSides(d).map(s => s.forfeited)).toEqual([true, false])
  })

  it('highlights you, else the winner', () => {
    const d = x01([seat(0, 'A', 2), seat(1, 'B', 1), seat(2, 'C', 3)])
    expect(highlightDefault(d)).toBe(0)
    expect(highlightDefault({ ...d, game: { ...d.game, mySeat: null } })).toBe(1)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsPage.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/details/page.ts`**

```ts
// The details page's frame for any game mode: which layout, the sides (seats or teams), the
// result headline and the meta line under the title.
import type { GameDetail } from '../api'
import { rulesLine } from '../history.js'
import { MONTHS, pad2 } from '../fmt.js'
import { atcResult } from './atc.js'

export type DetailSide = {
  index: number
  name: string
  placement: number
  values: Record<string, number>
  me: boolean
  guest: boolean
  members: string[]
  /** Gave up the game (a team: any of its players did) */
  forfeited: boolean
}

export function layoutOf(d: GameDetail): 'duel' | 'teams' | 'party' {
  if ((d.stats.teams?.length ?? 0) === 2) return 'teams'
  return d.game.players.length >= 3 ? 'party' : 'duel'
}

const valuesOf = (list: GameDetail['stats']['seats'] | undefined, index: number) => list?.find(v => v.index === index)?.values ?? {}

export function detailSides(d: GameDetail): DetailSide[] {
  const players = [...d.game.players].sort((a, b) => a.seat - b.seat)
  const teams = d.detail.mode === 'x01' ? d.detail.teams : undefined
  if (layoutOf(d) === 'teams' && teams) {
    return teams.map((t, i) => {
      const members = t.seats.map(s => players.find(p => p.seat === s)).filter(p => p !== undefined)
      return {
        index: i,
        name: t.name,
        placement: members[0]?.placement ?? i + 1,
        values: valuesOf(d.stats.teams, i),
        me: t.seats.includes(d.game.mySeat ?? -1),
        guest: false,
        members: members.map(p => p.name),
        forfeited: members.some(p => p.forfeited),
      }
    })
  }
  return players.map(p => ({
    index: p.seat,
    name: p.name,
    placement: p.placement,
    values: valuesOf(d.stats.seats, p.seat),
    me: p.seat === d.game.mySeat,
    guest: p.userId === null && p.seat !== d.game.mySeat,
    members: [p.name],
    forfeited: p.forfeited,
  }))
}

export function headline(d: GameDetail, sides: DetailSide[]): { big: string; caption: string } {
  if (d.game.mode === 'x01') {
    const firstTo = typeof d.game.config.firstTo === 'number' ? d.game.config.firstTo : null
    const legs = sides.map(s => s.values.legsWon ?? 0)
    return { big: legs.join('–'), caption: firstTo === null ? 'Legs' : `Legs · first to ${firstTo}` }
  }
  if (d.game.mode === 'atc') {
    const winner = sides.find(s => s.placement === 1) ?? sides[0]
    return { big: '', caption: winner ? atcResult(winner.values) : '' }
  }
  return { big: '', caption: '' }
}

export function metaLine(d: GameDetail): string {
  const at = new Date(d.game.finishedAt)
  const when = `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  return [rulesLine(d.game), when, d.game.board?.name].filter(Boolean).join(' · ')
}

export function highlightDefault(d: GameDetail): number {
  if (d.game.mySeat !== null) return d.game.mySeat
  return d.game.players.find(p => p.placement === 1)?.seat ?? 0
}
```

- [ ] **Step 4: Run to see it pass**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsPage.test.ts`
Expected: PASS.

- [ ] **Step 5: Components**

`lib/components/details/DetailsHeader.svelte`:

```svelte
<script lang="ts">
  // The details page's header bar: back to History, the mode, the meta line and your result.
  import { ArrowLeft } from '@lucide/svelte'
  import type { GameDetail } from '$lib/api'
  import { getGameView } from '$lib/gameViews'
  import { resultLabel } from '$lib/history'
  import { metaLine } from '$lib/details/page'

  let { detail }: { detail: GameDetail } = $props()
  const result = $derived(resultLabel(detail.game))
</script>

<header
  class="shrink-0 flex flex-wrap items-center gap-x-6 gap-y-2 min-h-14 md:min-h-16 box-border px-4 md:px-7 py-2 border-b border-line bg-surface-1"
>
  <a
    href="#/history"
    class="h-11 flex items-center gap-2 pl-[10px] pr-[14px] rounded-[10px] border border-line-strong text-ink-2 no-underline text-[14px] font-medium hover:text-text"
    ><ArrowLeft size={16} />History</a
  >
  <div class="flex items-baseline gap-3 min-w-0 flex-wrap">
    <h1 class="m-0 font-display font-bold text-[24px] md:text-[26px] uppercase tracking-[0.04em]">{getGameView(detail.game.mode).title}</h1>
    <span class="text-[13px] md:text-[14px] text-text-muted">{metaLine(detail)}</span>
  </div>
  {#if result.text}
    <span
      class="ml-auto h-[30px] px-3 inline-flex items-center rounded-full text-[13px] font-bold tracking-[0.08em] uppercase
             {result.won ? 'bg-accent text-accent-fg' : 'border border-line-chip text-ink-2'}">{result.text}</span
    >
  {/if}
</header>
```

`lib/components/details/StatsTable.svelte` (duel and teams: two sides; one side for solo):

```svelte
<script lang="ts">
  // Match stats for two sides: left value | label | right value, the better value in lime.
  // Any mode: the rows come from the server. Solo: one value column.
  import type { StatRow } from '$lib/api'
  import { betterIndexes, formatStat } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'

  let { rows, sides, title = 'Match stats' }: { rows: StatRow[]; sides: DetailSide[]; title?: string } = $props()
  const left = $derived(sides[0])
  const right = $derived(sides.at(1))
  const H = 'text-[12px] label-caps text-text-dim'
</script>

{#if rows.length > 0}
  <section aria-label={title} class="flex flex-col min-h-0 box-border px-4 md:px-6 pt-4 pb-2 card">
    <div class="grid grid-cols-[1fr_1.3fr_1fr] pb-2 border-b border-line-2">
      <span class={H}>{left?.name}</span><span class="{H} text-center">{title}</span><span class="{H} text-right">{right?.name ?? ''}</span>
    </div>
    {#each rows as row (row.key)}
      {@const best = betterIndexes(
        row,
        sides.map(s => ({ index: s.index, values: s.values })),
      )}
      <!-- Phones show the compact rows only (Mobile-X01-Details) -->
      <div class="grid grid-cols-[1fr_1.3fr_1fr] items-center min-h-11 border-b border-line last:border-b-0 {row.compact ? '' : 'max-md:hidden'}">
        <span class="text-[16px] {left && best.has(left.index) ? 'text-accent font-bold' : 'text-text font-semibold'}"
          >{left ? formatStat(row, left.values) : ''}</span
        >
        <span class="text-center text-[14px] text-text-muted">{row.label}</span>
        <span class="text-right text-[16px] {right && best.has(right.index) ? 'text-accent font-bold' : 'text-ink-2 font-medium'}"
          >{right ? formatStat(row, right.values) : ''}</span
        >
      </div>
    {/each}
  </section>
{/if}
```

`lib/components/details/ResultCard.svelte`:

```svelte
<script lang="ts">
  // Duel and teams: both sides facing each other around the headline (3–1), the Winner tag on
  // the winner. Teams list their players under the name.
  import Avatar from '$lib/components/Avatar.svelte'
  import type { GameDetail } from '$lib/api'
  import { headline, type DetailSide } from '$lib/details/page'

  let { detail, sides }: { detail: GameDetail; sides: DetailSide[] } = $props()
  const head = $derived(headline(detail, sides))
  const solo = $derived(sides.length === 1)
</script>

{#snippet side(s: DetailSide, align: 'start' | 'end')}
  <div class="flex flex-col gap-[10px] min-w-0 {align === 'end' ? 'items-end text-right' : 'items-start'}">
    <span class="flex items-center gap-[10px] min-w-0 {align === 'end' ? 'flex-row-reverse' : ''}">
      <Avatar name={s.name} size={36} guest={s.guest} tone={s.me ? 'accent' : 'default'} />
      <span class="text-[18px] md:text-[20px] font-semibold truncate {s.placement === 1 ? 'text-text' : 'text-ink-2'}">{s.name}</span>
    </span>
    {#if s.members.length > 1}<span class="text-[13px] text-text-muted">{s.members.join(' · ')}</span>{/if}
    {#if s.forfeited}
      <span class="h-[26px] px-[10px] inline-flex items-center rounded-full border border-danger-line text-danger-text text-[12px] font-bold tracking-[0.08em] uppercase"
        >Gave up</span
      >
    {:else if s.placement === 1 && !solo}
      <span class="h-[26px] px-[10px] inline-flex items-center rounded-full bg-accent text-accent-fg text-[12px] font-bold tracking-[0.08em] uppercase"
        >Winner</span
      >
    {/if}
  </div>
{/snippet}

<section
  aria-label="Result"
  class="grid {solo ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto_1fr]'} items-center gap-4 px-5 md:px-7 py-5 md:py-6 rounded-[18px] bg-surface-active border-2 border-accent"
>
  {@render side(sides[0], 'start')}
  <div class="flex flex-col items-center gap-2">
    {#if head.big}<span class="font-display font-bold text-[72px] md:text-[104px] leading-[0.85]">{head.big}</span>{/if}
    {#if head.caption}<span class="text-[12px] label-caps text-text-muted text-center">{head.caption}</span>{/if}
  </div>
  {#if sides[1]}{@render side(sides[1], 'end')}{/if}
</section>
```

Check `Avatar`'s props (`name`, `size`, `guest`, `tone`) in `lib/components/Avatar.svelte` before using `tone`; if it has no `tone`, drop it.

`lib/components/details/Standings.svelte` (party):

```svelte
<script lang="ts">
  // Party: place, player and one column per compact stat row, the better value in lime.
  import Avatar from '$lib/components/Avatar.svelte'
  import type { StatRow } from '$lib/api'
  import { ordinal } from '$lib/fmt'
  import { betterIndexes, formatStat } from '$lib/details/stats'
  import type { DetailSide } from '$lib/details/page'

  let { rows, sides }: { rows: StatRow[]; sides: DetailSide[] } = $props()
  const compact = $derived(rows.filter(r => r.compact))
  const ranked = $derived([...sides].sort((a, b) => a.placement - b.placement))
  const all = $derived(sides.map(s => ({ index: s.index, values: s.values })))
</script>

<section aria-label="Standings and match stats" class="card overflow-x-auto">
  <table class="w-full border-collapse text-[15px]">
    <thead>
      <tr class="text-[12px] label-caps text-text-dim">
        <th class="text-left font-normal px-4 py-3">Place</th>
        <th class="text-left font-normal px-2 py-3">Player</th>
        {#each compact as row (row.key)}<th class="text-right font-normal px-3 py-3 whitespace-nowrap">{row.label}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each ranked as s (s.index)}
        <tr class="border-t border-line {s.me ? 'bg-surface-active' : ''}">
          <td class="px-4 py-3 font-display font-bold text-[20px]">{ordinal(s.placement)}</td>
          <td class="px-2 py-3"
            ><span class="flex items-center gap-2"
              ><Avatar name={s.name} size={28} guest={s.guest} /><span class="font-semibold">{s.name}</span>{#if s.forfeited}<span
                  class="text-[12px] text-danger-text">gave up</span
                >{/if}</span
            ></td
          >
          {#each compact as row (row.key)}
            <td class="px-3 py-3 text-right whitespace-nowrap {betterIndexes(row, all).has(s.index) ? 'text-accent font-bold' : ''}"
              >{formatStat(row, s.values)}</td
            >
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>
```

`lib/components/details/TeamShares.svelte`:

```svelte
<script lang="ts">
  // Teams: each player's share (X01-Details-Teams): their average and the legs they closed.
  import type { GameDetail } from '$lib/api'

  let { detail }: { detail: GameDetail } = $props()
  const teams = $derived(detail.detail.mode === 'x01' ? (detail.detail.teams ?? []) : [])
  const rows = $derived(
    teams.flatMap(t =>
      t.seats.map(seat => ({
        seat,
        team: t.name,
        name: detail.game.players.find(p => p.seat === seat)?.name ?? '',
        values: detail.stats.seats.find(v => v.index === seat)?.values ?? {},
      })),
    ),
  )
</script>

{#if rows.length > 0}
  <section aria-label="Each player's share" class="card overflow-x-auto">
    <table class="w-full border-collapse text-[15px]">
      <thead>
        <tr class="text-[12px] label-caps text-text-dim">
          <th class="text-left font-normal px-4 py-3">Player</th><th class="text-left font-normal px-2 py-3">Team</th>
          <th class="text-right font-normal px-3 py-3">Avg</th><th class="text-right font-normal px-4 py-3">Closed</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as r (r.seat)}
          <tr class="border-t border-line">
            <td class="px-4 py-3 font-semibold">{r.name}</td><td class="px-2 py-3 text-text-muted">{r.team}</td>
            <td class="px-3 py-3 text-right">{r.values.average === undefined ? '—' : r.values.average.toFixed(1)}</td>
            <td class="px-4 py-3 text-right">{r.values.legsClosed ?? 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}
```

- [ ] **Step 6: The route**

`routes/GameDetails.svelte` (mode sections come in Tasks 8 and 9; this task leaves a slot):

```svelte
<script lang="ts">
  // A finished game's details (X01-Details*, ATC-Details* boards): the result, the match stats
  // for any mode, and the mode's own section. Finished games don't change: loaded once.
  import { onMount } from 'svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import DetailsHeader from '$lib/components/details/DetailsHeader.svelte'
  import ResultCard from '$lib/components/details/ResultCard.svelte'
  import StatsTable from '$lib/components/details/StatsTable.svelte'
  import Standings from '$lib/components/details/Standings.svelte'
  import TeamShares from '$lib/components/details/TeamShares.svelte'
  import { api, type GameDetail } from '$lib/api'
  import { detailSides, layoutOf } from '$lib/details/page'

  let { params }: { params: { id: string } } = $props()
  let detail = $state<GameDetail | null>(null)
  let phase = $state<'loading' | 'ready' | 'missing' | 'failed'>('loading')

  async function load() {
    phase = 'loading'
    try {
      const res = await api.GET('/api/games/{id}', { params: { path: { id: params.id } } })
      if (res.data) {
        detail = res.data
        phase = 'ready'
      } else phase = res.response.status === 404 ? 'missing' : 'failed'
    } catch {
      phase = 'failed'
    }
  }
  onMount(() => void load())
</script>

<Layout title="Match details">
  <div class="flex flex-col flex-grow min-h-0 min-w-0">
    {#if phase === 'loading'}
      <p class="m-0 p-8 text-[15px] text-text-muted">Loading the game…</p>
    {:else if phase === 'missing'}
      <div class="flex flex-col items-start gap-3 p-8">
        <p class="m-0 text-[17px] font-semibold">This game isn't available</p>
        <a href="#/history" class="font-semibold no-underline">Back to History</a>
      </div>
    {:else if phase === 'failed' || !detail}
      <div class="flex flex-col items-start gap-3 p-8">
        <ErrorText>Couldn't load the game.</ErrorText>
        <Button variant="outline" size="md" onclick={() => void load()}>Try again</Button>
      </div>
    {:else}
      {@const d = detail}
      {@const layout = layoutOf(d)}
      {@const sides = detailSides(d)}
      <DetailsHeader detail={d} />
      <main class="flex-grow min-h-0 overflow-y-auto box-border p-4 md:p-6 xl:px-7 flex flex-col lg:flex-row gap-4 md:gap-6">
        <section
          aria-label="Result and statistics"
          class="flex flex-col gap-4 min-w-0 lg:shrink-0 {layout === 'party' ? 'lg:w-[560px]' : 'lg:w-[420px] xl:w-[520px]'}"
        >
          {#if layout === 'party'}
            <Standings rows={d.stats.rows} {sides} />
          {:else}
            <ResultCard detail={d} {sides} />
            <StatsTable rows={d.stats.rows} {sides} title={layout === 'teams' ? 'Team stats' : 'Match stats'} />
            {#if layout === 'teams'}<TeamShares detail={d} />{/if}
          {/if}
        </section>
        <div class="flex-grow min-w-0 flex flex-col gap-4 md:gap-6">
          <!-- Mode sections: X01Legs (Task 8), AtcTargets / RaceChart (Task 9) -->
        </div>
      </main>
    {/if}
  </div>
</Layout>
```

The comment placeholder in the mode column is replaced in Tasks 8 and 9 (nothing renders there until then).

Check how other routes receive params (`routes/GameDisplay.svelte` uses `/session/:id`): use the same `params` prop pattern. Check `Layout`'s `title` (it's the phone header title).

`App.svelte`: add `'/history/:id': GameDetails,` (import `GameDetails from './routes/GameDetails.svelte'`) above `'/history'`.

- [ ] **Step 7: History rows link**

In `routes/History.svelte`, wrap each row's content in a link and add a chevron. Replace the `<li ...>` opening/closing so the row is:

```svelte
            <li class="border-b border-line">
              <a
                href="#/history/{g.id}"
                aria-label="{getGameView(g.mode).title}, {when.day} {when.time}{result.text ? `, ${result.text}` : ''}: details"
                class="relative block px-[22px] pr-12 py-3 lg:min-h-[68px] lg:py-0 text-text no-underline hover:bg-surface-active"
              >
                <!-- the existing two layout blocks, unchanged -->
                <ChevronRight size={18} class="absolute right-4 top-1/2 -translate-y-1/2 text-text-dim" />
              </a>
            </li>
```

Import `ChevronRight` from `@lucide/svelte`. Keep the two inner `<div>` blocks as they are (move `px-[22px] py-3 lg:min-h-[68px] lg:py-0` from `li` to the `a`). Widen the header grid by the chevron's column: add `pr-12` to the column-heading row as well so headings stay aligned.

- [ ] **Step 8: Render tests**

`backend/frontend/src/lib/__tests__/gameDetailsRender.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import StatsTable from '../components/details/StatsTable.svelte'
import Standings from '../components/details/Standings.svelte'
import ResultCard from '../components/details/ResultCard.svelte'
import type { GameDetail, StatRow } from '../api'
import { detailSides } from '../details/page.js'

const rows: StatRow[] = [
  { key: 'average', label: '3-dart average', format: 'decimal', better: 'higher', compact: false },
  { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true },
]
const seat = (s: number, name: string, placement: number) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: null,
  placement,
  stats: {},
  forfeited: false,
})
const game = (n: number): GameDetail => ({
  game: {
    id: 'g',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: null,
    mySeat: 0,
    players: Array.from({ length: n }, (_, i) => seat(i, `P${i}`, i + 1)),
  },
  detail: { mode: 'x01', legs: [] },
  stats: { rows, seats: Array.from({ length: n }, (_, i) => ({ index: i, values: i === 1 ? { average: 71.6 } : { average: 83.9, bestLegDarts: 15 } })) },
})

describe('details components', () => {
  it('duel stats: labels, values, a dash for what does not apply, lime on the better side', () => {
    const d = game(2)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('3-dart average')
    expect(out).toContain('83.9')
    expect(out).toContain('71.6')
    expect(out).toContain('—')
    expect(out).toMatch(/text-accent[^>]*>83\.9/)
  })

  it('solo: one side, no highlight', () => {
    const d = game(1)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('83.9')
    expect(out).not.toMatch(/text-accent[^>]*>83\.9/)
    expect(render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body).not.toContain('Winner')
  })

  it('shows who gave up instead of a Winner tag', () => {
    const d = game(2)
    d.game.players[0].forfeited = true
    const out = render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body
    expect(out).toContain('Gave up')
  })

  it('hides non-compact rows on phones', () => {
    const out = render(StatsTable, { props: { rows, sides: detailSides(game(2)) } }).body
    expect(out).toMatch(/max-md:hidden[^>]*>[^<]*<span[^>]*>83\.9/)
  })

  it('party standings: places and only the compact rows', () => {
    const d = game(3)
    const out = render(Standings, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('1st')
    expect(out).toContain('3rd')
    expect(out).toContain('Best leg')
    expect(out).not.toContain('3-dart average')
  })
})
```

If `Avatar` pulls in something that crashes SSR (see the `bits-ui` mock in `lobbyAccessPanel.test.ts`), add the same `vi.mock('bits-ui', ...)` block.

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/gameDetailsRender.test.ts src/lib/__tests__/detailsPage.test.ts`
Expected: PASS.

- [ ] **Step 9: Check in the browser, commit**

Run the worktree's Vite (`cd backend/frontend && npx vite --port 5174 --host 0.0.0.0`, already running in this session) and open History, click a finished X01 and an ATC game: header, result card, stats table (party: standings) show; the right column is empty for now.

Run: `cd backend/frontend && npm run typecheck && npm run lint && npm test`

```bash
npm run format
git add backend/frontend/src
git commit -m "feat(ui): match details page with result and match stats"
```

---

### Task 8: X01 leg by leg

**Files:**

- Create: `backend/frontend/src/lib/components/details/X01Legs.svelte`, `RemainingChart.svelte`, `Chalkboard.svelte`, `HighlightPicker.svelte`
- Modify: `backend/frontend/src/routes/GameDetails.svelte` (mode column)
- Test: `backend/frontend/src/lib/__tests__/gameDetailsRender.test.ts`

**Interfaces:**

- Consumes: `x01Sides`, `legSeries`, `chalkboardRows`, `legSummary`, `type Side` (Task 5); `highlightDefault` (Task 7).
- Produces: `X01Legs { detail: GameDetail; party: boolean }`; `RemainingChart { series, sides, start, highlight: number | null }`; `Chalkboard { rows: ChalkRow[]; sides: Side[]; showThrower: boolean; nameOf: (seat: number) => string }`; `HighlightPicker { options: { key: number; name: string }[]; value: number; onpick: (key: number) => void }`.

- [ ] **Step 1: Write the failing render test**

Append to `gameDetailsRender.test.ts`:

```ts
import X01Legs from '../components/details/X01Legs.svelte'

describe('X01 leg by leg', () => {
  it('shows the last leg: summary, chart and chalkboard', () => {
    const seg = (name: string, number: number, multiplier: 1 | 2 | 3) => ({ name, number, multiplier, bed: 'Single' as const })
    const dart = (s: ReturnType<typeof seg>, index: number) => ({ index, segment: s, coords: null, source: 'manual' as const, corrected: false, thrownAt: '' })
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [
            { visit: 0, seat: 0, committedAt: '', darts: [dart(seg('T20', 20, 3), 0), dart(seg('T20', 20, 3), 1), dart(seg('T20', 20, 3), 2)], scored: 180, remaining: 321, bust: false },
            { visit: 1, seat: 1, committedAt: '', darts: [dart(seg('S20', 20, 1), 0)], scored: 20, remaining: 481, bust: false },
          ],
        },
      ],
    }
    const out = render(X01Legs, { props: { detail: d, party: false } }).body
    expect(out).toContain('Leg by leg')
    expect(out).toContain('Leg 1')
    expect(out).toContain('P0 threw first')
    expect(out).toContain('<svg')
    expect(out).toContain('T20')
    expect(out).toContain('321')
  })
})
```

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/gameDetailsRender.test.ts`
Expected: FAIL, cannot find `X01Legs.svelte`.

- [ ] **Step 2: `RemainingChart.svelte`**

```svelte
<script lang="ts">
  // Points left after each visit, one line per side (X01-Details): lime for the highlighted (or
  // first) side, dashed grey for the others; a ring on 100+ visits, a bigger one on 180.
  import type { Side } from '$lib/details/x01'

  type Point = { visit: number; left: number; scored: number }
  let {
    series,
    sides,
    start,
    highlight = null,
  }: { series: { key: number; points: Point[] }[]; sides: Side[]; start: number; highlight?: number | null } = $props()

  const W = 720,
    H = 200,
    L = 44,
    R = 700,
    T = 12,
    B = 184
  const maxVisits = $derived(Math.max(1, ...series.map(s => s.points.length - 1)))
  const x = (i: number) => L + (i * (R - L)) / maxVisits
  const y = (left: number) => T + (1 - left / start) * (B - T)
  const lead = $derived(highlight ?? series[0]?.key ?? 0)
  const name = (key: number) => sides.find(s => s.key === key)?.name ?? ''
  const ticks = $derived([0, 0.2, 0.4, 0.6, 0.8, 1].map(f => Math.round((start * f) / 100) * 100))
</script>

<figure class="m-0 flex flex-col gap-2">
  <figcaption class="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-text-muted">
    <span>Points remaining after each visit</span>
    {#each series as s (s.key)}
      <span class="inline-flex items-center gap-[6px] {s.key === lead ? 'ml-auto md:ml-0' : ''}"
        ><span class="w-4 h-[2px] {s.key === lead ? 'bg-accent' : 'bg-line-pip'}"></span>{name(s.key)}</span
      >
    {/each}
  </figcaption>
  <svg viewBox="0 0 {W} {H}" class="w-full h-auto" role="img" aria-label="Points left after each visit">
    {#each ticks as t (t)}
      <line x1={L} x2={R} y1={y(t)} y2={y(t)} class="stroke-line" stroke-width="1" />
      <text x={L - 8} y={y(t) + 4} text-anchor="end" class="fill-text-dim text-[11px]">{t}</text>
    {/each}
    {#each series as s (s.key)}
      {@const on = s.key === lead}
      <path
        d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i)} ${y(p.left)}`).join(' ')}
        fill="none"
        stroke-width={on ? 2.5 : 1.5}
        stroke-dasharray={on ? undefined : '4 4'}
        class={on ? 'stroke-accent' : 'stroke-line-pip'}
      />
      {#each s.points as p, i (i)}
        {#if p.scored >= 100}
          <circle cx={x(i)} cy={y(p.left)} r={p.scored === 180 ? 10 : 7} fill="none" stroke-width={p.scored === 180 ? 3 : 1.5} class={on ? 'stroke-accent' : 'stroke-line-pip'} />
        {/if}
      {/each}
    {/each}
  </svg>
</figure>
```

If Tailwind doesn't generate `stroke-accent`/`fill-text-dim` for the theme colours, use `stroke="var(--color-accent)"` / `fill="var(--color-text-dim)"` attributes instead (the tokens are CSS variables in `app.css`).

- [ ] **Step 3: `Chalkboard.svelte`**

```svelte
<script lang="ts">
  // Every visit of the leg, side by side: the score badge (lime ring at 100+, inverted on 180),
  // the darts, and the points left, crossed out once passed; "Out" on the checkout. In a team
  // game each cell names who threw.
  import type { ChalkRow, Side } from '$lib/details/x01'

  let {
    rows,
    sides,
    showThrower = false,
    nameOf,
  }: { rows: ChalkRow[]; sides: Side[]; showThrower?: boolean; nameOf: (seat: number) => string } = $props()
  const cols = $derived(`40px repeat(${sides.length}, minmax(0, 1fr))`)
</script>

<div role="table" aria-label="Visits in this leg, dart by dart" class="flex flex-col overflow-x-auto">
  <div role="row" class="grid gap-[10px] h-7 items-center border-b border-line-2 text-[12px] label-caps text-text-dim" style:grid-template-columns={cols}>
    <span role="columnheader">#</span>
    {#each sides as s (s.key)}<span role="columnheader" class="truncate">{s.name}</span>{/each}
  </div>
  {#each rows as row (row.n)}
    <div role="row" class="grid gap-[10px] min-h-[38px] items-center border-b border-line" style:grid-template-columns={cols}>
      <span role="cell" class="font-mono text-[13px] text-ink-faint">{row.n}</span>
      {#each row.cells as c, i (i)}
        {#if c}
          <span
            role="cell"
            aria-label="{showThrower ? `${nameOf(c.seat)}: ` : ''}{c.darts.join(', ')} = {c.scored}{c.out ? ', checkout' : `, ${c.left} left`}{c.bust
              ? ', bust'
              : ''}"
            class="flex items-center gap-2 min-w-0 px-2 py-1 rounded-[8px] {c.tier === 'max' ? 'bg-accent text-accent-fg' : ''}"
          >
            <span
              class="w-[52px] h-7 shrink-0 box-border flex items-center justify-center rounded-[7px] font-display font-bold text-[20px]
                     {c.tier === 'max' ? 'bg-bg text-accent' : c.tier === 'ton' ? 'border-[1.5px] border-accent bg-surface-active text-accent' : ''}"
              >{c.bust ? 'Bust' : c.scored}</span
            >
            {#if showThrower}<span class="text-[12px] text-text-muted truncate">{nameOf(c.seat)}</span>{/if}
            <span class="hidden sm:flex gap-1" aria-hidden="true">
              {#each c.darts as d, k (k)}
                <span
                  class="w-10 h-[22px] flex items-center justify-center rounded-[5px] font-display text-[14px]
                         {c.tier === 'max' ? 'bg-[#a9cf42] text-accent-fg' : 'bg-surface-chip'} {d.startsWith('T') || d === 'Bull' ? 'font-bold' : 'font-medium'}"
                  >{d}</span
                >
              {/each}
            </span>
            <span
              class="ml-auto font-display font-semibold text-[17px] {c.out ? 'text-accent' : c.crossed ? 'line-through text-text-dim' : 'text-text'}"
              >{c.out ? 'Out' : c.left}</span
            >
          </span>
        {:else}
          <span role="cell"></span>
        {/if}
      {/each}
    </div>
  {/each}
</div>
```

- [ ] **Step 4: `HighlightPicker.svelte` and `X01Legs.svelte`**

`HighlightPicker.svelte`:

```svelte
<script lang="ts">
  // Party: whose line and chalkboard stand out.
  let { options, value, onpick }: { options: { key: number; name: string }[]; value: number; onpick: (key: number) => void } = $props()
</script>

<label class="flex items-center gap-2 text-[13px] text-text-muted">
  Highlight
  <select
    value={value}
    onchange={e => onpick(Number((e.currentTarget as HTMLSelectElement).value))}
    class="h-9 px-2 rounded-[8px] bg-surface-card border border-line-strong text-text text-[14px] font-[inherit]"
    aria-label="Highlight a player"
  >
    {#each options as o (o.key)}<option value={o.key}>{o.name}</option>{/each}
  </select>
</label>
```

`X01Legs.svelte`:

```svelte
<script lang="ts">
  // X01 leg by leg (X01-Details*): leg tabs, the leg's summary line, the points-left chart and
  // the chalkboard. Party: a highlight picker, and the chalkboard beside the chart on desktop.
  import type { GameDetail } from '$lib/api'
  import Chalkboard from './Chalkboard.svelte'
  import HighlightPicker from './HighlightPicker.svelte'
  import RemainingChart from './RemainingChart.svelte'
  import { chalkboardRows, legSeries, legSummary, x01Sides } from '$lib/details/x01'
  import { highlightDefault } from '$lib/details/page'

  let { detail, party = false }: { detail: GameDetail; party?: boolean } = $props()
  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const sides = $derived(x01 ? x01Sides(detail.game, x01) : [])
  const start = $derived(typeof detail.game.config.startScore === 'number' ? detail.game.config.startScore : 501)
  const legs = $derived(x01?.legs.map(l => l.leg) ?? [])
  let picked = $state<number | null>(null)
  const leg = $derived(picked ?? legs.at(-1) ?? 0)
  let highlightPick = $state<number | null>(null)
  const highlight = $derived(highlightPick ?? (party ? highlightDefault(detail) : (sides.find(s => s.seats.includes(detail.game.mySeat ?? -1))?.key ?? null)))
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
</script>

{#if x01}
  <section aria-label="Leg by leg" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] leading-none uppercase">Leg by leg</h2>
      <div class="flex flex-wrap items-center gap-3">
        {#if party}
          <HighlightPicker options={sides.map(s => ({ key: s.key, name: s.name }))} value={highlight ?? 0} onpick={k => (highlightPick = k)} />
        {/if}
        {#if legs.length > 1}
          <div role="group" aria-label="Leg" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
            {#each legs as l (l)}
              <button
                type="button"
                aria-pressed={l === leg}
                onclick={() => (picked = l)}
                class="h-10 min-w-[72px] md:min-w-24 px-3 border-0 rounded-[7px] font-[inherit] text-[15px] cursor-pointer
                       {l === leg ? 'bg-accent text-accent-fg font-bold' : 'bg-transparent text-ink-2'}">Leg {l + 1}</button
              >
            {/each}
          </div>
        {:else}
          <span class="text-[14px] text-text-muted">Leg 1</span>
        {/if}
      </div>
    </div>
    <p class="m-0 text-[15px] text-text-muted">{legSummary(x01, leg, sides, nameOf)}</p>
    <div class="flex flex-col gap-4 {party ? 'xl:flex-row xl:items-start' : ''}">
      <div class="min-w-0 {party ? 'xl:flex-grow' : ''}">
        <RemainingChart series={legSeries(x01, leg, sides, start)} {sides} {start} {highlight} />
      </div>
      <div class="min-w-0 {party ? 'xl:w-[560px] xl:shrink-0' : ''}">
        <Chalkboard rows={chalkboardRows(x01, leg, sides)} {sides} showThrower={!!x01.teams} {nameOf} />
      </div>
    </div>
  </section>
{/if}
```

Single-leg games still show "Leg 1" as a label, so the render test's `'Leg 1'` passes with one leg.

- [ ] **Step 5: Wire into the page**

In `GameDetails.svelte`, import `X01Legs` and replace the mode-column comment with:

```svelte
          {#if d.game.mode === 'x01'}<X01Legs detail={d} party={layout === 'party'} />{/if}
          <!-- ATC sections (Task 9) -->
```

- [ ] **Step 6: Run, check in the browser, commit**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/gameDetailsRender.test.ts && npm run typecheck && npm run lint`
Expected: PASS. Open an X01 game's details on desktop, tablet and phone widths; switch legs.

```bash
npm run format
git add backend/frontend/src
git commit -m "feat(ui): X01 leg by leg on the details page"
```

---

### Task 9: Around the Clock target by target and race

**Files:**

- Create: `backend/frontend/src/lib/components/details/AtcTargets.svelte`, `RaceChart.svelte`
- Modify: `backend/frontend/src/routes/GameDetails.svelte`
- Test: `backend/frontend/src/lib/__tests__/gameDetailsRender.test.ts`

**Interfaces:**

- Consumes: `targetGrid`, `sequenceOf`, `raceSeries`, `hardestLine` (Task 6); `targetLabel` (Task 4); `highlightDefault` (Task 7); `HighlightPicker` (Task 8).
- Produces: `AtcTargets { detail: GameDetail }`, `RaceChart { detail: GameDetail; highlight: number | null }`.

- [ ] **Step 1: Write the failing render test**

```ts
import AtcTargets from '../components/details/AtcTargets.svelte'
import RaceChart from '../components/details/RaceChart.svelte'

describe('Around the Clock sections', () => {
  const atc = (): GameDetail => {
    const d = game(2)
    d.game.mode = 'atc'
    d.game.config = { order: 'asc', finishOn: 'twenty', multiplierAdvances: false }
    d.detail = {
      mode: 'atc',
      visits: [],
      progress: [
        { seat: 0, steps: [{ target: 1, darts: 2, hit: true }, { target: 2, darts: 3, hit: false }] },
        { seat: 1, steps: [{ target: 1, darts: 5, hit: false }] },
      ],
    }
    d.stats = { rows: [], seats: [{ index: 0, values: { hardestTarget: 1 } }, { index: 1, values: {} }] }
    return d
  }

  it('grids targets per player with the hardest-target line', () => {
    const out = render(AtcTargets, { props: { detail: atc() } }).body
    expect(out).toContain('Target by target')
    expect(out).toContain('1 cost P0 the most.')
    expect(out).toContain('P1')
  })

  it('draws the race', () => {
    const out = render(RaceChart, { props: { detail: atc(), highlight: 0 } }).body
    expect(out).toContain('Race to the Bull')
    expect(out).toContain('<path')
  })
})
```

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/gameDetailsRender.test.ts`
Expected: FAIL, components missing.

- [ ] **Step 2: `AtcTargets.svelte`**

```svelte
<script lang="ts">
  // Target by target (ATC-Details*): darts each target took per player, coloured 1 / 2 / 3 / 4+;
  // the target the game ended on outlined; targets not reached empty; skipped by a multiplier "·".
  import type { GameDetail } from '$lib/api'
  import { hardestLine, sequenceOf, targetGrid } from '$lib/details/atc'
  import { targetLabel } from '$lib/details/stats'

  let { detail }: { detail: GameDetail } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const sequence = $derived(atc ? sequenceOf(atc) : [])
  const grid = $derived(atc ? targetGrid(atc, sequence) : [])
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
  const TONE = { 1: 'bg-accent text-accent-fg', 2: 'bg-[#8fb33a] text-accent-fg', 3: 'bg-[#5c7323] text-text', 4: 'bg-[#3a4a1a] text-text' }
  const cols = $derived(`minmax(72px, 120px) repeat(${sequence.length}, minmax(24px, 1fr))`)
</script>

{#if atc}
  <section aria-label="Target by target" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-col gap-2">
      <h2 class="m-0 font-display font-bold text-[24px] md:text-[32px] leading-none uppercase">Target by target</h2>
      <p class="m-0 text-[15px] text-text-muted">How many darts each target took. {hardestLine(detail.stats.seats, nameOf)}</p>
    </div>
    <div class="overflow-x-auto">
      <div class="grid gap-1 items-center min-w-[560px]" style:grid-template-columns={cols}>
        <span></span>
        {#each sequence as t (t)}<span class="text-center text-[12px] text-text-dim">{t === 22 ? 'B' : targetLabel(t)}</span>{/each}
        {#each grid as row (row.seat)}
          <span class="text-[14px] font-semibold truncate pr-2">{nameOf(row.seat)}</span>
          {#each row.cells as c (c.target)}
            <span
              title="{targetLabel(c.target)}: {c.state === 'none'
                ? 'not reached'
                : c.skipped
                  ? 'skipped by a multiplier'
                  : c.state === 'ended'
                    ? `${c.darts} darts, not hit when the match ended`
                    : `hit with dart ${c.darts}`}"
              class="h-8 flex items-center justify-center rounded-[6px] text-[13px] font-semibold
                     {c.state === 'none' ? 'border border-dashed border-line-dashed' : c.state === 'ended' ? 'border-2 border-warn text-warn' : c.tone ? TONE[c.tone] : 'bg-surface-chip text-text-dim'}"
              >{c.state === 'none' ? '' : c.skipped ? '·' : c.darts}</span
            >
          {/each}
        {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-text-muted">
      <span>Darts needed</span>
      {#each [1, 2, 3, 4] as n (n)}<span class="inline-flex items-center gap-[6px]"
          ><span class="w-4 h-4 rounded-[4px] {TONE[n as 1 | 2 | 3 | 4]}"></span>{n === 4 ? '4+' : n}</span
        >{/each}
      <span class="inline-flex items-center gap-[6px]"><span class="w-4 h-4 rounded-[4px] border-2 border-warn"></span>Target when it ended</span>
      <span class="inline-flex items-center gap-[6px]"><span class="w-4 h-4 rounded-[4px] border border-dashed border-line-dashed"></span>Not reached</span>
    </div>
  </section>
{/if}
```

Before committing, compare the four tone colours with `ATC-Details.dc.html` (`grep -o 'background: #[0-9a-f]*' ` on the grid cells in the saved artboard under the scratchpad's `artifact-files/.../project/`) and use the artboard's hex values.

- [ ] **Step 3: `RaceChart.svelte`**

```svelte
<script lang="ts">
  // Race to the Bull (ATC-Details*): targets hit against darts thrown, one line per player; the
  // highlighted (you, or the winner) in lime.
  import type { GameDetail } from '$lib/api'
  import { raceSeries, sequenceOf } from '$lib/details/atc'

  let { detail, highlight = null }: { detail: GameDetail; highlight?: number | null } = $props()
  const atc = $derived(detail.detail.mode === 'atc' ? detail.detail : null)
  const series = $derived(atc ? raceSeries(atc) : [])
  const total = $derived(atc ? Math.max(1, sequenceOf(atc).length) : 1)
  const maxDarts = $derived(Math.max(3, ...series.flatMap(s => s.points.map(p => p.darts))))
  const W = 720,
    H = 220,
    L = 36,
    R = 700,
    T = 12,
    B = 196
  const x = (darts: number) => L + (darts / maxDarts) * (R - L)
  const y = (hits: number) => B - (hits / total) * (B - T)
  const nameOf = (seat: number) => detail.game.players.find(p => p.seat === seat)?.name ?? ''
</script>

{#if atc}
  <section aria-label="Race to the Bull" class="flex flex-col gap-2 min-w-0 box-border p-4 md:p-6 card">
    <h2 class="m-0 font-display font-bold text-[24px] md:text-[28px] leading-none uppercase">Race to the Bull</h2>
    <p class="m-0 text-[13px] text-text-muted">Targets hit against darts thrown</p>
    <svg viewBox="0 0 {W} {H}" class="w-full h-auto" role="img" aria-label="Targets hit against darts thrown">
      <line x1={L} x2={R} y1={B} y2={B} stroke="var(--color-line)" />
      {#each series as s (s.seat)}
        {@const on = s.seat === highlight}
        <path
          d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.darts)} ${y(p.hits)}`).join(' ')}
          fill="none"
          stroke={on ? 'var(--color-accent)' : 'var(--color-line-pip)'}
          stroke-width={on ? 2.5 : 1.5}
          stroke-dasharray={on ? undefined : '4 4'}
        />
        <text x={x(s.points.at(-1)?.darts ?? 0) + 6} y={y(s.points.at(-1)?.hits ?? 0) + 4} fill="var(--color-text-muted)" font-size="12"
          >{nameOf(s.seat)}</text
        >
      {/each}
    </svg>
  </section>
{/if}
```

- [ ] **Step 4: Wire into the page**

In `GameDetails.svelte` import `AtcTargets`, `RaceChart`, `HighlightPicker` and `highlightDefault`, add `let atcHighlight = $state<number | null>(null)` in the script, and replace the ATC comment with:

```svelte
          {#if d.game.mode === 'atc'}
            <AtcTargets detail={d} />
            {#if layout === 'party'}
              <HighlightPicker
                options={d.game.players.map(p => ({ key: p.seat, name: p.name }))}
                value={atcHighlight ?? highlightDefault(d)}
                onpick={k => (atcHighlight = k)}
              />
            {/if}
            <RaceChart detail={d} highlight={atcHighlight ?? highlightDefault(d)} />
          {/if}
```

- [ ] **Step 5: Run, check, commit**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/gameDetailsRender.test.ts && npm run typecheck && npm run lint && npm test`
Expected: PASS. Open an ATC game's details at desktop, tablet and phone widths.

```bash
npm run format
git add backend/frontend/src
git commit -m "feat(ui): Around the Clock targets and race on the details page"
```

---

### Task 10: End-to-end: open a game from History

**Files:**

- Create: `e2e/tests/match-details.spec.ts`
- Modify: `AGENTS.md` (the "Where to look" table)

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '../fixtures/auth.js'
import { startGame } from '../fixtures/lobby.js'

test('a finished game opens its details from History', async ({ authedPage: page }) => {
  // A solo X01 from 301, first to 1 leg, manual entry (as rematch.spec.ts)
  await startGame(page, {
    mode: 'X01',
    setup: async page => {
      const main = page.locator('main')
      await main.getByRole('button', { name: '301', exact: true }).click()
      const fewer = main.getByRole('button', { name: 'Fewer legs' })
      const legs = fewer.locator('xpath=following-sibling::span[1]')
      const isOne = async () => /^1\s*leg$/.test(((await legs.textContent()) ?? '').trim())
      for (let i = 0; i < 10 && !(await isOne()); i++) await fewer.click()
      await expect(legs).toHaveText(/^\s*1\s*leg\s*$/)
    },
  })
  const treble = page.getByRole('button', { name: 'Treble', exact: true })
  const double = page.getByRole('button', { name: 'Double', exact: true })
  const throwDart = async (multiplier: typeof treble | null, label: string) => {
    if (multiplier) await multiplier.click()
    await page.click(`button[aria-label="${label}"]`)
  }
  for (let i = 0; i < 3; i++) await throwDart(treble, 'Treble 20')
  await page.getByRole('button', { name: 'Next player' }).click()
  await throwDart(treble, 'Treble 17')
  await throwDart(treble, 'Treble 18')
  await throwDart(double, 'Double 8')
  await page.getByRole('button', { name: 'Finish game' }).click()
  await expect(page.getByRole('button', { name: /Rematch/ })).toBeVisible()

  await page.goto('/#/history')
  await page.getByRole('link', { name: /X01.*details/ }).first().click()
  await page.waitForURL(url => url.hash.startsWith('#/history/'))
  await expect(page.getByRole('heading', { name: 'X01' })).toBeVisible()
  await expect(page.getByText('3-dart average')).toBeVisible()
  await expect(page.getByText('Leg by leg')).toBeVisible()
  await expect(page.getByRole('table', { name: /Visits in this leg/ })).toContainText('T20')
})
```

- [ ] **Step 2: Run it**

Run: per `DEVELOPMENT.md`'s e2e section (check it for the exact command; typically `cd e2e && npx playwright test tests/match-details.spec.ts` against the dev stack).
Expected: PASS. If the solo layout's single side renders the stats with a different label path, adjust the selectors, not the page.

- [ ] **Step 3: Docs**

In `AGENTS.md` "Where to look", add a row:

```markdown
| Match details page (a finished game's result, match stats, leg/target sections) | `backend/frontend/src/routes/GameDetails.svelte`, helpers in `lib/details/`, components in `lib/components/details/`; stats from each module's `matchStats()` (`backend/src/games/matchStats.ts`, `x01Stats.ts`, `atcProgress.ts`) |
```

And in "Adding a game", step 1, after `detail`: "`matchStats` (rows and values for the details page; see `backend/src/games/matchStats.ts`)".

- [ ] **Step 4: Commit**

```bash
npm run format
git add e2e/tests/match-details.spec.ts AGENTS.md
git commit -m "test(e2e): open a finished game's details from history"
```
