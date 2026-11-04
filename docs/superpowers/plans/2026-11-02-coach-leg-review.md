# Coach Leg Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Coach section on a finished X01 game's details page that notes strategy mistakes on a
finish (from a checkout-chance model) and shows execution stats and miss tendencies, plus a
`#/coach` page listing the games it can review.

**Architecture:** Pure code in `backend/src/shared/coach/`, used by the frontend through
`$shared/coach`:

- A generated landing table: where a dart aimed at each of 102 aim points lands, for a reference
  81-average player, made with the bots' own throw model.
- A finish-chance DP over that table.
- A walk over the game's stored X01 detail.

No API, schema or DB change. The UI is a lazily loaded Svelte section and one route, behind the
`coach.enabled` flag.

**Tech Stack:** TypeScript, vitest, Svelte 5 (runes), svelte-spa-router, openapi-fetch, tsx
(for the generator).

**Spec:** `docs/superpowers/specs/2026-11-02-coach-leg-review-design.md`

## Global Constraints

- **Scope:** only X01 games with `inMode: 'straight'`, `outMode: 'double'`, `bullValue: '25_50'`,
  `format` not `'teams'`. A missing config key means the X01 default (`straight`, `double`,
  `25_50`, `singles`).
- **Reference player:** bot level 7, `sigmaForLevel(7)` = 0.05331, for every seat and every
  opponent.
- **Note threshold:** 5 points of checkout chance (`0.05`). Only darts with 170 or less left
  before them are judged, and never the dart that checks out.
- **Benefit of the doubt:** candidates are every aim on the number the dart landed in. A dart in
  25 or the bull counts as landing in 25. An unplaceable miss (number 0, no coords) is not
  judged.
- **Value:** checkout chance this visit, plus the next visit weighted by w. w is the product, over
  opponents, of (1 − their 3-dart finish chance from their score left). A bust's next visit
  starts from the visit's start.
- **`backend/src/shared/` is dependency-free**: only relative imports inside `shared/`.
- **Commits:** conventional format, `type(scope): subject`, lower case, under 72 characters, **no
  `Co-Authored-By` or other trailers**. Branch `docs/coach-design` (already holds the spec);
  rename it to `feat/coach` before the first code commit (`git branch -m feat/coach`).
- **Note copy is our own words.** Don't copy text from dartscheckoutassistant.com.
- **Formatting:** run `npm run format` at the repo root before each commit; `npm run lint` in
  `backend/` and `backend/frontend/` must pass.
- **Don't start the dev stack or docker yourself.** Ask the user to run anything that needs it
  (Task 9's screenshots).

## Review Focus

1. **A manual dart typed as "Miss"** (number 0, no coords) on a finish must not crash and must
   not get a note. This is pinned in Task 4.
2. **A visit whose darts bust mid-visit**, where the stored `remaining` equals the visit's start.
   The walk must rebuild the score before each dart from the start, not from `remaining` minus
   `scored`. This is pinned in Task 3.
3. **A seat that never threw in a leg** (the other player won 3-dart legs early), and **legs where
   the chosen seat has no visits**. These must give an empty review, not NaN averages. Pinned in
   Task 5.
4. **Old games whose config lacks `bullValue` or `inMode`.** They must still count as coachable.
   Pinned in Task 6.
5. **The details page opened by a spectator** (`mySeat` null) of a public game. The picker must
   default to the first human seat. Pinned in Task 6.

---

## File Structure

```
backend/src/shared/coach/
  aims.ts             AIMS (102 aim points), Aim, Outcome
  landing.gen.ts      GENERATED: LANDING_LEVEL, LANDING (per aim: outcomes)
  model.ts            fin (finish table), evaluator(start, w)(left, darts) → Evaluation
  walk.ts             CoachDart/CoachVisit/CoachLeg types, throwsOf(legs, seat), opponentWeight
  aim.ts              landedNumber, candidates, scoringAim
  notes.ts            NOTE_THRESHOLD, numberCost, strategyNotes, CoachNote
  stats.ts            executionStats, missTendencies, CoachStats, Tendency
  index.ts            coachGame(input) → CoachReport (re-exports the types)
  *.test.ts           one per module above, except index (covered via notes/stats)
backend/src/coach/genLanding.ts   the generator (imports the bots' throwAt)
backend/package.json              script "gen:coach"
backend/src/flags/definitions.ts  flag coach.enabled
backend/frontend/src/lib/coach/view.ts (+ view.test.ts)   coachable, coachSeats, defaultCoachSeat
backend/frontend/src/lib/components/coach/
  CoachSection.svelte   the section (picker, biggest mistakes, stats, tendencies, legs)
  CoachLegs.svelte      per leg visit rows with notes
backend/frontend/src/routes/GameDetails.svelte   mounts CoachSection, scrolls to #coach
backend/frontend/src/routes/Coach.svelte         #/coach list
backend/frontend/src/App.svelte                  route '/coach'
backend/frontend/src/routes/History.svelte       link to #/coach behind the flag
e2e/screenshots/04-features.spec.ts, e2e/docker-compose.screenshots.yaml   screenshot
AGENTS.md                                        a "Where to look" row
```

---

### Task 1: Aim points and the generated landing table

**Files:**

- Create: `backend/src/shared/coach/aims.ts`
- Create: `backend/src/coach/genLanding.ts`
- Create (generated): `backend/src/shared/coach/landing.gen.ts`
- Modify: `backend/package.json` (scripts)
- Test: `backend/src/shared/coach/aims.test.ts`

**Interfaces:**

- Consumes: `R`, `SEGS`, `HALF`, `segAngle`, `segmentAt` from `backend/src/shared/board.ts`;
  `throwAt` from `backend/src/bots/accuracy.ts`; `sigmaForLevel` from `backend/src/bots/levels.ts`;
  `seededRng` from `backend/src/shared/rng.ts`.
- Produces:
  - `type Aim = { id: string; label: string; numbers: readonly number[]; x: number; y: number }`
  - `type Outcome = readonly [name: string, points: number, double: boolean, p: number]`
  - `const AIMS: readonly Aim[]` (102 entries, fixed order)
  - `landing.gen.ts`: `const LANDING_LEVEL: number` and
    `const LANDING: readonly (readonly Outcome[])[]`, indexed like `AIMS`

- [ ] **Step 1: Write the failing test**

`backend/src/shared/coach/aims.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { segmentAt } from '../board.js'
import { AIMS } from './aims.js'
import { LANDING, LANDING_LEVEL } from './landing.gen.js'

describe('the aim points', () => {
  it('has a treble, double, two singles and a wire per number, plus the bull and 25', () => {
    expect(AIMS).toHaveLength(102)
    expect(new Set(AIMS.map(a => a.id)).size).toBe(102)
  })

  it('puts every bed aim inside its own bed', () => {
    for (const a of AIMS.filter(a => !a.id.startsWith('W'))) {
      const s = segmentAt(a.x, a.y)
      const expected = a.id === 'Bull' ? 'Bull' : a.id === '25' ? '25' : a.label
      expect({ id: a.id, landed: s.name }).toEqual({ id: a.id, landed: expected })
    }
  })

  it('puts each wire between the two numbers it names', () => {
    const w = AIMS.find(a => a.id === 'W20-1')!
    expect(w.numbers).toEqual([20, 1])
    // A hair either side of the wire lands in each of its numbers
    const a = Math.atan2(w.y, w.x)
    const r = Math.hypot(w.x, w.y)
    const at = (da: number) => segmentAt(r * Math.cos(a + da), r * Math.sin(a + da)).number
    expect([at(0.01), at(-0.01)]).toEqual([20, 1])
  })
})

describe('the landing table', () => {
  it('is for the reference player, one row per aim', () => {
    expect(LANDING_LEVEL).toBe(7)
    expect(LANDING).toHaveLength(AIMS.length)
  })

  it("sums each aim's chances to 1, give or take the dropped tail", () => {
    for (const outs of LANDING) {
      const sum = outs.reduce((s, o) => s + o[3], 0)
      expect(sum).toBeGreaterThan(0.98)
      expect(sum).toBeLessThanOrEqual(1.00001)
    }
  })

  it('hits T20 about a third of the time, as an 81-average player does', () => {
    const t20 = LANDING[AIMS.findIndex(a => a.id === 'T20')]
    const hit = t20.find(o => o[0] === 'T20')![3]
    expect(hit).toBeGreaterThan(0.28)
    expect(hit).toBeLessThan(0.42)
  })

  it('scores and marks doubles like the game', () => {
    const all = LANDING.flat()
    expect(all.find(o => o[0] === 'Bull')).toMatchObject(['Bull', 50, true])
    expect(all.find(o => o[0] === '25')).toMatchObject(['25', 25, false])
    expect(all.find(o => o[0] === 'D16')).toMatchObject(['D16', 32, true])
    expect(all.find(o => o[0] === 'T19')).toMatchObject(['T19', 57, false])
    expect(all.find(o => o[0] === 'Miss')).toMatchObject(['Miss', 0, false])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/coach/aims.test.ts`
Expected: FAIL, cannot resolve `./aims.js`.

- [ ] **Step 3: Write `aims.ts`**

```ts
// The points the coach considers aiming at: per number its treble, double, outer and inner single,
// the wire to its clockwise neighbour; and the bull and 25. Board units, as in ../board.ts.
import { HALF, R, SEGS, segAngle } from '../board.js'

export type Aim = {
  /** Unique: T20, D20, SO20 (outer single), SI20 (inner single), W20-1 (wire), Bull, 25 */
  id: string
  /** What a player reads: T20, D20, S20, 20/1, Bull, 25 */
  label: string
  /** The numbers a dart around this aim lands in: one, two for a wire, 25 for the bull and 25 */
  numbers: readonly number[]
  x: number
  y: number
}

/** One way a dart can land: the segment's name (Miss off the board), its points, whether it is a
 *  double (the bull is), and its chance. */
export type Outcome = readonly [name: string, points: number, double: boolean, p: number]

const at = (r: number, angle: number) => ({ x: r * Math.cos(angle), y: r * Math.sin(angle) })

export const AIMS: readonly Aim[] = [
  ...SEGS.flatMap((n, i): Aim[] => {
    const a = segAngle(i)
    const next = SEGS[(i + 1) % 20]
    return [
      { id: `T${n}`, label: `T${n}`, numbers: [n], ...at((R.si + R.tr) / 2, a) },
      { id: `D${n}`, label: `D${n}`, numbers: [n], ...at((R.so + R.db) / 2, a) },
      { id: `SO${n}`, label: `S${n}`, numbers: [n], ...at((R.tr + R.so) / 2, a) },
      { id: `SI${n}`, label: `S${n}`, numbers: [n], ...at((R.bull25 + R.si) / 2, a) },
      // Segments run clockwise, so the next one is half a segment further clockwise
      { id: `W${n}-${next}`, label: `${n}/${next}`, numbers: [n, next], ...at((R.tr + R.so) / 2, a - HALF) },
    ]
  }),
  { id: 'Bull', label: 'Bull', numbers: [25], x: 0, y: 0 },
  { id: '25', label: '25', numbers: [25], ...at((R.bull50 + R.bull25) / 2, Math.PI / 2) },
]
```

- [ ] **Step 4: Write the generator `backend/src/coach/genLanding.ts`**

```ts
// Writes shared/coach/landing.gen.ts: where a dart aimed at each of the coach's aims lands, for the
// reference player (bot level 7), from 40,000 darts per aim thrown with the bots' own model
// (bots/accuracy.ts throwAt, jitter included). Seeded, so a rerun gives the same file.
// Run: npm run gen:coach (then npm run format at the repo root).
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { throwAt } from '../bots/accuracy.js'
import { sigmaForLevel } from '../bots/levels.js'
import { seededRng } from '../shared/rng.js'
import { AIMS, type Outcome } from '../shared/coach/aims.js'

const LEVEL = 7
const THROWS = 40_000
const MIN_P = 0.001

const sigma = sigmaForLevel(LEVEL)
const rng = seededRng(1)

const table: Outcome[][] = AIMS.map(aim => {
  const counts = new Map<string, { points: number; double: boolean; n: number }>()
  for (let i = 0; i < THROWS; i++) {
    const { segment: s } = throwAt(aim, sigma, rng)
    const name = s.multiplier === 0 ? 'Miss' : s.name
    const c = counts.get(name) ?? { points: s.number * s.multiplier, double: s.multiplier === 2 || s.number === 50, n: 0 }
    c.n++
    counts.set(name, c)
  }
  return [...counts]
    .map(([name, c]): Outcome => [name, c.points, c.double, Math.round((c.n / THROWS) * 1e5) / 1e5])
    .filter(o => o[3] >= MIN_P)
    .sort((a, b) => b[3] - a[3])
})

const out = `// Generated by \`npm run gen:coach\` (src/coach/genLanding.ts) from the bots' throw model. Don't edit.
import type { Outcome } from './aims.js'

/** The bot level the table is for: the coach's reference player. */
export const LANDING_LEVEL = ${LEVEL}

/** Per aim (AIMS order): where a dart thrown at it lands, likeliest first. */
export const LANDING: readonly (readonly Outcome[])[] = ${JSON.stringify(table)}
`
writeFileSync(fileURLToPath(new URL('../shared/coach/landing.gen.ts', import.meta.url)), out)
console.log(`wrote ${table.length} aims, ${table.reduce((s, t) => s + t.length, 0)} outcomes`)
```

In `backend/package.json` `scripts`, next to `"calibrate:bots"`, add:

```json
"gen:coach": "tsx src/coach/genLanding.ts",
```

- [ ] **Step 5: Generate the table and format it**

Run: `cd backend && npm run gen:coach && cd .. && npm run format`
Expected: `wrote 102 aims, … outcomes`, and `backend/src/shared/coach/landing.gen.ts` exists.

- [ ] **Step 6: Run the tests**

Run: `cd backend && npx vitest run src/shared/coach/aims.test.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 7: Typecheck and commit**

```bash
cd backend && npm run typecheck && npm run lint && cd ..
git branch -m feat/coach
git add backend/src/shared/coach/aims.ts backend/src/shared/coach/aims.test.ts backend/src/shared/coach/landing.gen.ts backend/src/coach/genLanding.ts backend/package.json
git commit -m "feat(coach): landing table for the reference player's aims"
```

---

### Task 2: The checkout-chance model

**Files:**

- Create: `backend/src/shared/coach/model.ts`
- Test: `backend/src/shared/coach/model.test.ts`

**Interfaces:**

- Consumes: `AIMS`, `Outcome` (Task 1), `LANDING` (Task 1).
- Produces:
  - `const fin: readonly (readonly number[])[]`: `fin[r][k]` is the chance to check out r
    (0–170) with at most k (0–3) darts this visit, where a bust counts as no.
  - `nextVisit(score: number): number`: `fin[score][3]` for scores 2–170, otherwise 0.
  - `type OutcomeValue = { outcome: Outcome; after: number | 'bust' | 'out'; value: number }`
  - `type Evaluation = { values: number[]; outcomes(aim: number): OutcomeValue[] }`, where
    `values` follows the `AIMS` order.
  - `evaluator(start: number, w: number): (left: number, darts: number) => Evaluation`

- [ ] **Step 1: Write the failing test**

`backend/src/shared/coach/model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AIMS } from './aims.js'
import { evaluator, fin, nextVisit } from './model.js'

const BOGEYS = [159, 162, 163, 165, 166, 168, 169]

describe('the finish table', () => {
  it("has no chance on the bogey numbers, or with one dart on what one dart can't finish", () => {
    for (const r of BOGEYS) expect(fin[r][3]).toBe(0)
    for (const r of [41, 57, 99, 3]) expect(fin[r][1]).toBe(0)
    expect(fin[1][3]).toBe(0)
  })

  it('never gets worse with more darts', () => {
    for (let r = 2; r <= 170; r++) {
      expect(fin[r][2]).toBeGreaterThanOrEqual(fin[r][1])
      expect(fin[r][3]).toBeGreaterThanOrEqual(fin[r][2])
    }
  })

  it('finishes 40 more often than 99, and 170 least of the big ones', () => {
    expect(fin[40][3]).toBeGreaterThan(fin[99][3])
    expect(fin[99][3]).toBeGreaterThan(fin[170][3])
    expect(fin[170][3]).toBeGreaterThan(0)
  })

  it('gives nothing for a next visit outside 2–170', () => {
    expect([nextVisit(1), nextVisit(0), nextVisit(171), nextVisit(501)]).toEqual([0, 0, 0, 0])
    expect(nextVisit(40)).toBe(fin[40][3])
  })
})

describe('the evaluator', () => {
  it('values every aim between 0 and 1', () => {
    const ev = evaluator(99, 1)(99, 3)
    expect(ev.values).toHaveLength(AIMS.length)
    for (const v of ev.values) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('makes a last dart worthless when there is no next visit and no one-dart finish', () => {
    const ev = evaluator(57, 0)(57, 1)
    expect(Math.max(...ev.values)).toBe(0)
  })

  it('prefers D20 on 40 with three darts', () => {
    const ev = evaluator(40, 1)(40, 3)
    const best = ev.values.indexOf(Math.max(...ev.values))
    expect(AIMS[best].id).toBe('D20')
  })

  it("explains an aim through its outcomes: a dart in 20 busts on 7", () => {
    const ev = evaluator(7, 1)(7, 3)
    const t20 = AIMS.findIndex(a => a.id === 'T20')
    const outs = ev.outcomes(t20)
    expect(outs.find(o => o.outcome[0] === 'T20')?.after).toBe('bust')
    expect(outs.find(o => o.outcome[0] === 'S1')?.after).toBe(6)
    // The outcomes' values, weighted by their chances, add up to the aim's value
    const sum = outs.reduce((s, o) => s + o.outcome[3] * o.value, 0)
    expect(sum).toBeCloseTo(ev.values[t20], 10)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/coach/model.test.ts`
Expected: FAIL, cannot resolve `./model.js`.

- [ ] **Step 3: Write `model.ts`**

```ts
// The coach's checkout model, for the reference player (landing.gen.ts), double out, bull 25/50:
// how likely each aim is to lead to a checkout this visit, or in the next one weighted by the
// chance of getting it (w: the opponents don't check out first).
import type { Outcome } from './aims.js'
// LANDING follows AIMS' order, so the evaluator's values do too
import { LANDING } from './landing.gen.js'

function finishTable(): number[][] {
  const t = Array.from({ length: 171 }, () => [0, 0, 0, 0])
  for (let k = 1; k <= 3; k++) {
    for (let r = 2; r <= 170; r++) {
      let best = 0
      for (const outs of LANDING) {
        let v = 0
        for (const [, points, double, p] of outs) {
          const after = r - points
          if (after === 0 && double) v += p
          else if (after >= 2) v += p * t[after][k - 1]
        }
        if (v > best) best = v
      }
      t[r][k] = best
    }
  }
  return t
}

/** fin[r][k]: the chance to check out r (0–170) with at most k darts (0–3) this visit; a bust is a no. */
export const fin: readonly (readonly number[])[] = finishTable()

/** The chance to check out a score with a fresh visit: 0 outside 2–170. */
export const nextVisit = (score: number): number => (score >= 2 && score <= 170 ? fin[score][3] : 0)

export type OutcomeValue = { outcome: Outcome; after: number | 'bust' | 'out'; value: number }

export type Evaluation = {
  /** Each aim's value, in AIMS order */
  values: number[]
  /** How each way a dart at `aim` can land turns out, and what it is worth */
  outcomes(aim: number): OutcomeValue[]
}

/** Values within one visit that started on `start`, with w the chance of a next visit. Spots of
 *  the same visit share the evaluator, so they share its memo. */
export function evaluator(start: number, w: number): (left: number, darts: number) => Evaluation {
  const memo = new Map<number, number>()

  const outcome = (o: Outcome, left: number, darts: number): OutcomeValue => {
    const after = left - o[1]
    if (after === 0 && o[2]) return { outcome: o, after: 'out', value: 1 }
    // Below 0, on 1, or 0 without a double: the visit ends and the next starts where this one did
    if (after < 2) return { outcome: o, after: 'bust', value: w * nextVisit(start) }
    return { outcome: o, after, value: darts === 1 ? w * nextVisit(after) : best(after, darts - 1) }
  }
  const value = (aim: number, left: number, darts: number): number =>
    LANDING[aim].reduce((sum, o) => sum + o[3] * outcome(o, left, darts).value, 0)
  const best = (left: number, darts: number): number => {
    const key = left * 4 + darts
    let v = memo.get(key)
    if (v === undefined) {
      v = 0
      for (let a = 0; a < LANDING.length; a++) v = Math.max(v, value(a, left, darts))
      memo.set(key, v)
    }
    return v
  }

  return (left, darts) => ({
    values: LANDING.map((_, a) => value(a, left, darts)),
    outcomes: aim => LANDING[aim].map(o => outcome(o, left, darts)),
  })
}
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx vitest run src/shared/coach/model.test.ts`
Expected: PASS. If "prefers D20 on 40" fails because D20 and another aim are within 0.001, print
the top 3 and check the landing table before changing the test.

- [ ] **Step 5: Commit**

```bash
cd backend && npm run typecheck && npm run lint && cd .. && npm run format
git add backend/src/shared/coach/model.ts backend/src/shared/coach/model.test.ts
git commit -m "feat(coach): checkout-chance model over the landing table"
```

---

### Task 3: Walking a seat's darts, and where a dart landed

**Files:**

- Create: `backend/src/shared/coach/walk.ts`
- Create: `backend/src/shared/coach/aim.ts`
- Test: `backend/src/shared/coach/walk.test.ts`, `backend/src/shared/coach/aim.test.ts`

**Interfaces:**

- Consumes: `segmentAt` from `../board.js`; `AIMS` (Task 1); `nextVisit` (Task 2).
- Produces (`walk.ts`):

  ```ts
  export type CoachDart = { segment: { name: string; number: number; multiplier: number }; coords: { x: number; y: number } | null }
  export type CoachVisit = { seat: number; darts: readonly CoachDart[]; scored: number; remaining: number; bust: boolean }
  export type CoachLeg = { leg: number; visits: readonly CoachVisit[] }
  export type Throw = {
    leg: number; visit: number /* index in the leg's visits */; dart: number /* 0–2 */
    start: number /* score when the visit started */; left: number /* score before this dart */
    darts: number /* darts left in the visit, this one included: 3, 2 or 1 */
    d: CoachDart; visitDarts: readonly CoachDart[]
    checkout: boolean /* this dart finished the leg */; bust: boolean /* this dart busted */
    w: number /* chance of a next visit: opponents don't check out first */
  }
  export const dartPoints: (d: CoachDart) => number
  export const isDoubleDart: (d: CoachDart) => boolean
  export function throwsOf(legs: readonly CoachLeg[], seat: number, startScore: number): Throw[]
  ```

- Produces (`aim.ts`):

  ```ts
  export function landedNumber(d: CoachDart): number | null   // 1–20, 25 (bull or 25), null
  export function candidates(n: number): number[]             // AIMS indexes on number n
  export type ScoringAim = 20 | 19 | 18 | 17
  export function scoringAim(d: CoachDart, visitDarts: readonly CoachDart[]): ScoringAim | null
  ```

- [ ] **Step 1: Write the failing tests**

`backend/src/shared/coach/testLegs.ts`, a test helper shared by Tasks 3–5. It isn't a test file,
so vitest won't run it.

```ts
// Builds X01 legs for the coach's tests the way the game stores them (games/x01.ts detail()).
import type { CoachDart, CoachLeg, CoachVisit } from './walk.js'

export function seg(name: string): CoachDart['segment'] {
  if (name === 'Bull') return { name, number: 50, multiplier: 1 }
  if (name === '25') return { name, number: 25, multiplier: 1 }
  if (name === 'Miss') return { name, number: 0, multiplier: 0 }
  const m = { S: 1, D: 2, T: 3 }[name[0] as 'S' | 'D' | 'T']
  return { name, number: Number(name.slice(1)), multiplier: m }
}

export const dart = (name: string, coords: CoachDart['coords'] = null): CoachDart => ({ segment: seg(name), coords })

/** A visit by `seat` from `start`; stops at a bust or a checkout, as the game does. */
export function visit(seat: number, start: number, names: string[]): CoachVisit {
  let left = start
  let bust = false
  const darts: CoachDart[] = []
  for (const n of names) {
    const d = dart(n)
    darts.push(d)
    const after = left - d.segment.number * d.segment.multiplier
    const double = d.segment.multiplier === 2 || d.segment.number === 50
    if (after < 0 || after === 1 || (after === 0 && !double)) {
      bust = true
      break
    }
    left = after
    if (left === 0) break
  }
  return { seat, darts, scored: bust ? 0 : start - left, remaining: bust ? start : left, bust }
}

export const leg = (visits: CoachVisit[], n = 0): CoachLeg => ({ leg: n, visits })
```

`backend/src/shared/coach/walk.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { fin } from './model.js'
import { throwsOf } from './walk.js'
import { leg, visit } from './testLegs.js'

describe('throwsOf', () => {
  it('gives the score before each dart and the darts left', () => {
    const t = throwsOf([leg([visit(0, 501, ['T20', 'T20', 'S20'])])], 0, 501)
    expect(t.map(x => [x.left, x.darts])).toEqual([[501, 3], [441, 2], [381, 1]])
    expect(t.every(x => x.start === 501)).toBe(true)
  })

  it('rebuilds a busting visit from its start, not from what was left after it', () => {
    // 40 left: S20 (20), S19 busts. The game stores remaining 40, scored 0.
    const t = throwsOf([leg([visit(0, 40, ['S20', 'S19'])])], 0, 501)
    expect(t.map(x => [x.left, x.bust])).toEqual([[40, false], [20, true]])
  })

  it('marks the dart that checks out', () => {
    const t = throwsOf([leg([visit(0, 40, ['D20'])])], 0, 501)
    expect(t[0].checkout).toBe(true)
  })

  it("only walks the chosen seat, with w from the opponent's score", () => {
    const l = leg([visit(1, 501, ['T20']), visit(1, 32, []), visit(0, 97, ['S20', 'S20', 'S20'])])
    // The opponent's last visit left them on 32 (the empty visit stands for "they are on 32")
    const t = throwsOf([l], 0, 501)
    expect(t).toHaveLength(3)
    expect(t[0].w).toBeCloseTo(1 - fin[32][3], 10)
  })

  it('gives w = 1 solo and before the opponent has thrown', () => {
    expect(throwsOf([leg([visit(0, 501, ['S20'])])], 0, 501)[0].w).toBe(1)
    // The opponent hasn't thrown in this leg yet: still on 501, no finish
    const t = throwsOf([leg([visit(0, 501, ['S20']), visit(1, 501, ['S20'])])], 0, 501)
    expect(t[0].w).toBe(1)
  })

  it("is empty for a seat that didn't throw", () => {
    expect(throwsOf([leg([visit(1, 501, ['T20'])])], 0, 501)).toEqual([])
  })
})
```

Note on the w test: a stored visit always has darts, so `visit(1, 32, [])` is just a way to put
seat 1 on 32 (its `remaining` is 32). `throwsOf` reads the opponent's `remaining` from their last
visit before the one being walked.

`backend/src/shared/coach/aim.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { AIMS } from './aims.js'
import { candidates, landedNumber, scoringAim } from './aim.js'
import { dart } from './testLegs.js'

describe('landedNumber', () => {
  it('reads the number, with the bull and 25 as 25', () => {
    expect([landedNumber(dart('T20')), landedNumber(dart('S5')), landedNumber(dart('Bull')), landedNumber(dart('25'))]).toEqual([20, 5, 25, 25])
  })

  it('places a miss off the board by its position, and gives up without one', () => {
    expect(landedNumber(dart('Miss', { x: 0, y: 1.05 }))).toBe(20)
    expect(landedNumber(dart('Miss'))).toBeNull()
  })
})

describe('candidates', () => {
  it('are every aim on the number, the two wires next to it included', () => {
    const ids = candidates(20).map(i => AIMS[i].id).sort()
    expect(ids).toEqual(['D20', 'SI20', 'SO20', 'T20', 'W20-1', 'W5-20'].sort())
    expect(candidates(25).map(i => AIMS[i].id).sort()).toEqual(['25', 'Bull'])
  })
})

describe('scoringAim', () => {
  it('reads 20, 19, 18, 17 and their neighbours', () => {
    expect(scoringAim(dart('S5'), [])).toBe(20)
    expect(scoringAim(dart('T7'), [])).toBe(19)
    expect(scoringAim(dart('S4'), [])).toBe(18)
    expect(scoringAim(dart('S2'), [])).toBe(17)
  })

  it('leaves other numbers and the bull out', () => {
    expect(scoringAim(dart('S12'), [])).toBeNull()
    expect(scoringAim(dart('25'), [])).toBeNull()
    expect(scoringAim(dart('Miss'), [])).toBeNull()
  })

  it("splits 1 and 3 by the visit's other darts", () => {
    const one = dart('S1')
    expect(scoringAim(one, [dart('T20'), one, dart('S20')])).toBe(20)
    expect(scoringAim(one, [dart('S18'), one, dart('T18')])).toBe(18)
    const three = dart('S3')
    expect(scoringAim(three, [three, dart('S17'), dart('T17')])).toBe(17)
    // No other darts to go by: the higher-scoring aim
    expect(scoringAim(three, [three])).toBe(19)
  })

  it('splits by position when the darts have one', () => {
    const one = dart('S1', { x: 0.25, y: 0.75 })
    // The other darts sit in the 18, right of the 1
    expect(scoringAim(one, [one, dart('T18', { x: 0.33, y: 0.5 }), dart('S18', { x: 0.4, y: 0.6 })])).toBe(18)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx vitest run src/shared/coach/walk.test.ts src/shared/coach/aim.test.ts`
Expected: FAIL, cannot resolve `./walk.js` / `./aim.js`.

- [ ] **Step 3: Write `walk.ts`**

```ts
// A seat's darts in a finished X01 game, with what was left before each, for the coach. Reads the
// stored detail (games/x01.ts detail()): each visit's remaining is after it, unchanged on a bust.
import { nextVisit } from './model.js'

export type CoachDart = { segment: { name: string; number: number; multiplier: number }; coords: { x: number; y: number } | null }
export type CoachVisit = { seat: number; darts: readonly CoachDart[]; scored: number; remaining: number; bust: boolean }
export type CoachLeg = { leg: number; visits: readonly CoachVisit[] }

export type Throw = {
  leg: number
  /** Index in the leg's visits */
  visit: number
  /** 0–2 */
  dart: number
  /** The score when the visit started */
  start: number
  /** The score before this dart */
  left: number
  /** Darts left in the visit, this one included */
  darts: number
  d: CoachDart
  visitDarts: readonly CoachDart[]
  checkout: boolean
  bust: boolean
  /** The chance of a next visit: every opponent fails to check out first */
  w: number
}

// The bull comes as number 50 with multiplier 1, a miss as multiplier 0
export const dartPoints = (d: CoachDart): number => d.segment.number * d.segment.multiplier
export const isDoubleDart = (d: CoachDart): boolean => d.segment.multiplier === 2 || d.segment.number === 50

/** Every dart `seat` threw, leg by leg. `startScore` is the game's start, for opponents yet to throw. */
export function throwsOf(legs: readonly CoachLeg[], seat: number, startScore: number): Throw[] {
  const out: Throw[] = []
  for (const l of legs) {
    // Each other seat's score so far in this leg
    const scores = new Map<number, number>()
    const opponents = [...new Set(l.visits.map(v => v.seat).filter(s => s !== seat))]
    l.visits.forEach((v, vi) => {
      if (v.seat !== seat) {
        scores.set(v.seat, v.remaining)
        return
      }
      const start = v.bust ? v.remaining : v.remaining + v.scored
      // An opponent who hasn't thrown in this leg yet is still on the start score
      const w = opponents.reduce((p, o) => p * (1 - nextVisit(scores.get(o) ?? startScore)), 1)
      let left = start
      v.darts.forEach((d, i) => {
        const after = left - dartPoints(d)
        const checkout = after === 0 && isDoubleDart(d)
        const bust = !checkout && after < 2
        out.push({ leg: l.leg, visit: vi, dart: i, start, left, darts: 3 - i, d, visitDarts: v.darts, checkout, bust, w })
        left = after
      })
    })
  }
  return out
}
```

`startScore` covers opponents who haven't thrown in the leg yet. On 501 that gives no finish
chance, but a game started on 121 does have one.

- [ ] **Step 4: Write `aim.ts`**

```ts
// Where a dart landed, for judging what it was thrown at.
import { R, SEGS, segmentAt } from '../board.js'
import { AIMS } from './aims.js'
import type { CoachDart } from './walk.js'

/** The number a dart landed in: 1–20, 25 for the bull and 25, or null for a miss we can't place. */
export function landedNumber(d: CoachDart): number | null {
  const { number, multiplier } = d.segment
  if (number === 50 || number === 25) return 25
  if (multiplier > 0 && number >= 1 && number <= 20) return number
  if (!d.coords) return null
  const s = segmentAt(d.coords.x, d.coords.y)
  return s.number === 50 ? 25 : s.number
}

/** The aims (AIMS indexes) a dart in number `n` could have been thrown at. */
export const candidates = (n: number): number[] => AIMS.flatMap((a, i) => (a.numbers.includes(n) ? [i] : []))

export type ScoringAim = 20 | 19 | 18 | 17
const NEIGHBOURS: Record<ScoringAim, readonly number[]> = { 20: [5, 1], 19: [7, 3], 18: [1, 4], 17: [3, 2] }
const ORDER: readonly ScoringAim[] = [20, 19, 18, 17]

const trebleCentre = (n: number) => {
  const a = Math.PI / 2 - SEGS.indexOf(n) * (Math.PI / 10)
  const r = (R.si + R.tr) / 2
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

/** The scoring treble a dart thrown with more than 170 left was aimed at, or null when it landed
 *  nowhere near one. A dart in 1 or 3 (next to two of them) goes with the visit's other darts. */
export function scoringAim(d: CoachDart, visitDarts: readonly CoachDart[]): ScoringAim | null {
  const n = landedNumber(d)
  if (n === null || n === 25) return null
  const owners = ORDER.filter(a => a === n || NEIGHBOURS[a].includes(n))
  if (owners.length <= 1) return owners[0] ?? null
  const others = visitDarts.filter(o => o !== d)
  const placed = others.filter(o => o.coords)
  if (d.coords && placed.length > 0) {
    const mx = placed.reduce((s, o) => s + o.coords!.x, 0) / placed.length
    const my = placed.reduce((s, o) => s + o.coords!.y, 0) / placed.length
    const dist = (a: ScoringAim) => Math.hypot(trebleCentre(a).x - mx, trebleCentre(a).y - my)
    return owners.reduce((a, b) => (dist(b) < dist(a) ? b : a))
  }
  const count = (a: ScoringAim) => others.filter(o => landedNumber(o) === a).length
  // owners are in ORDER, so a tie keeps the higher-scoring aim
  return owners.reduce((a, b) => (count(b) > count(a) ? b : a))
}
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && npx vitest run src/shared/coach/walk.test.ts src/shared/coach/aim.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && npm run typecheck && npm run lint && cd .. && npm run format
git add backend/src/shared/coach/walk.ts backend/src/shared/coach/aim.ts backend/src/shared/coach/testLegs.ts backend/src/shared/coach/walk.test.ts backend/src/shared/coach/aim.test.ts
git commit -m "feat(coach): walk a seat's darts and read where each landed"
```

---

### Task 4: Strategy notes

**Files:**

- Create: `backend/src/shared/coach/notes.ts`
- Test: `backend/src/shared/coach/notes.test.ts`

**Interfaces:**

- Consumes: `evaluator`, `fin`, `Evaluation`, `OutcomeValue` (Task 2); `throwsOf`, `Throw`,
  `CoachLeg` (Task 3); `landedNumber`, `candidates` (Task 3); `AIMS` (Task 1); `checkoutHint`
  from `../checkout.js`.
- Produces:

  ```ts
  export const NOTE_THRESHOLD = 0.05
  export type CoachNote = {
    leg: number; visit: number; dart: number
    left: number; darts: number
    thrown: string        // the dart's segment name, 'Miss' off the board
    better: string        // the better aim's label, e.g. 'S17', '20/1', 'Bull'
    cost: number          // checkout chance lost, 0–1
    reason: string        // e.g. 'S20 leaves 37, with no one-dart finish'
    book: string[] | null // checkoutHint(left, 'double', darts)
  }
  export function numberCost(start: number, left: number, darts: number, w: number, n: number):
    { cost: number; best: number; candidate: number; evaluation: Evaluation }
  export function strategyNotes(legs: readonly CoachLeg[], seat: number, startScore: number): CoachNote[]
  ```

- [ ] **Step 1: Write the failing test**

`backend/src/shared/coach/notes.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CHECKOUTS } from '../checkoutTable.js'
import { NOTE_THRESHOLD, numberCost, strategyNotes } from './notes.js'
import { leg, visit } from './testLegs.js'

const solo = (start: number, names: string[]) => strategyNotes([leg([visit(0, start, names)])], 0, 501)
const noteOn = (start: number, names: string[], dart: number) => solo(start, names).find(n => n.dart === dart)

describe('strategy notes: the wrong number', () => {
  it('notes the last dart in 20 on 57 (S17 leaves 40)', () => {
    const n = noteOn(97, ['S20', 'S20', 'S20'], 2)
    expect(n).toMatchObject({ left: 57, darts: 1, thrown: 'S20' })
    expect(n!.better).toMatch(/17/)
    expect(n!.cost).toBeGreaterThan(0.1)
    // Which outcome of the best aim at 20 loses most is the model's call; it leaves a score
    expect(n!.reason).toMatch(/leaves \d+/)
  })

  it('notes the last dart in 20 on 47', () => {
    expect(noteOn(87, ['S20', 'S20', 'S20'], 2)).toMatchObject({ left: 47, thrown: 'S20' })
  })

  it('notes a dart at 20 on 7 and on 3, where 20 busts', () => {
    const seven = noteOn(7, ['S20'], 0)
    expect(seven).toMatchObject({ left: 7, darts: 3 })
    expect(seven!.reason).toMatch(/busts$/)
    expect(noteOn(3, ['S20'], 0)).toBeDefined()
  })

  it('notes a dart in 20 on 23 with two darts left', () => {
    expect(noteOn(43, ['S20', 'S20', 'S1'], 1)).toMatchObject({ left: 23, darts: 2 })
  })
})

describe('strategy notes: no note', () => {
  it.each([
    ['99 in 20', 99, ['S20', 'S19', 'S20']],
    ['119 in 20', 119, ['T20', 'S19', 'S20']],
    ['65 in 25', 65, ['25', 'D20']],
    ['90 in 18', 90, ['S18', 'S20']],
    ['3 in T1 (S1 is on the same number)', 3, ['T1']],
    ['60 in T20 (S20 is on the same number)', 60, ['T20']],
  ])('%s', (_label, start, names) => {
    expect(noteOn(start as number, names as string[], 0)).toBeUndefined()
  })

  it('never notes the dart that checks out, or darts with more than 170 left', () => {
    expect(solo(50, ['Bull'])).toEqual([])
    expect(solo(501, ['S5', 'S1', 'S12'])).toEqual([])
  })

  it('skips a typed-in miss it cannot place', () => {
    expect(solo(57, ['Miss', 'Miss', 'Miss'])).toEqual([])
  })
})

describe('strategy notes: the opponent', () => {
  it('lets a setup slide when the opponent is about to finish', () => {
    const withOpponent = (oppLeft: number) =>
      strategyNotes([leg([visit(1, oppLeft, []), visit(0, 97, ['S20', 'S20', 'S20'])])], 0, 501).find(n => n.dart === 2)
    expect(withOpponent(301)).toBeDefined()
    expect(withOpponent(32)).toBeUndefined()
  })
})

describe('strategy notes: the book', () => {
  it("never notes the first dart of a route in our checkout table (but 45's alternative S19)", () => {
    const number = (label: string) => (label === 'Bull' || label === '25' ? 25 : Number(label.slice(1)))
    const costly: string[] = []
    for (const [score, entry] of Object.entries(CHECKOUTS)) {
      const firsts = [...entry.routes.map(r => [r[0], 3] as const), ...(entry.twoDarts ? [[entry.twoDarts[0], 2] as const] : [])]
      for (const [label, darts] of firsts) {
        if (score === '45' && label === 'S19') continue
        const { cost } = numberCost(Number(score), Number(score), darts, 1, number(label))
        if (cost >= NOTE_THRESHOLD) costly.push(`${score}/${darts} ${label}: ${(cost * 100).toFixed(1)}`)
      }
    }
    expect(costly).toEqual([])
  })

  it('shows the book route with a note', () => {
    expect(noteOn(97, ['S20', 'S20', 'S20'], 2)!.book).toEqual(null) // no one-dart finish on 57
    expect(noteOn(43, ['S20', 'S20', 'S1'], 1)!.book).toEqual(['S7', 'D8'])
  })
})
```

The last assertion's route comes from `checkoutHint(23, 'double', 2)`. If the table's ladder
gives a different route for 23 (check `shared/checkout.ts`'s ladder below 41), use whatever
`checkoutHint(23, 'double', 2)` returns. The test is about the note carrying the book route, not
about which route.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/coach/notes.test.ts`
Expected: FAIL, cannot resolve `./notes.js`.

- [ ] **Step 3: Write `notes.ts`**

```ts
// Strategy notes: a dart on a finish whose number was clearly worse than the best aim, judged with
// the benefit of the doubt (the best aim on the number it landed in).
import { checkoutHint } from '../checkout.js'
import { AIMS } from './aims.js'
import { candidates, landedNumber } from './aim.js'
import { evaluator, fin, type Evaluation, type OutcomeValue } from './model.js'
import { throwsOf, type CoachLeg } from './walk.js'

/** A note needs the better aim to give this much more checkout chance (5 points). */
export const NOTE_THRESHOLD = 0.05

export type CoachNote = {
  leg: number
  visit: number
  dart: number
  left: number
  darts: number
  /** The dart's segment name, Miss off the board */
  thrown: string
  /** The better aim's label: S17, 20/1, Bull */
  better: string
  /** Checkout chance lost, 0–1 */
  cost: number
  reason: string
  /** The checkout table's route from here, if any */
  book: string[] | null
}

/** How much checkout chance throwing at number `n` loses against the best aim, given its best aim. */
export function numberCost(start: number, left: number, darts: number, w: number, n: number) {
  const evaluation = evaluator(start, w)(left, darts)
  const v = evaluation.values
  const best = v.indexOf(Math.max(...v))
  const candidate = candidates(n).reduce((a, b) => (v[b] > v[a] ? b : a))
  return { cost: v[best] - v[candidate], best, candidate, evaluation }
}

const what = (name: string) => (name === 'Miss' ? 'A miss off the board' : name)

/** Why the candidate aim is worse: its outcome that loses the most against the better aim. */
function reason(ev: Evaluation, candidate: number, better: number, darts: number): string {
  const loss = (o: OutcomeValue) => o.outcome[3] * (ev.values[better] - o.value)
  const worst = ev.outcomes(candidate).reduce((a, b) => (loss(b) > loss(a) ? b : a))
  const name = what(worst.outcome[0])
  if (worst.after === 'bust') return `${name} busts`
  if (worst.after === 'out') return `${name} checks out`
  const after = worst.after
  const next = darts - 1
  if (next === 0) {
    if (after > 170 || fin[after][3] === 0) return `${name} leaves ${after}, which one visit can't finish`
    return fin[after][1] === 0 ? `${name} leaves ${after}, with no one-dart finish` : `${name} leaves ${after}`
  }
  if (fin[after][next] === 0) return `${name} leaves ${after}, which ${next === 1 ? 'one dart' : 'two darts'} can't finish`
  return `${name} leaves ${after}`
}

/** The notes for `seat`'s darts on a finish, in throw order. */
export function strategyNotes(legs: readonly CoachLeg[], seat: number, startScore: number): CoachNote[] {
  const notes: CoachNote[] = []
  for (const t of throwsOf(legs, seat, startScore)) {
    if (t.left > 170 || t.checkout) continue
    const n = landedNumber(t.d)
    if (n === null) continue
    const { cost, best, candidate, evaluation } = numberCost(t.start, t.left, t.darts, t.w, n)
    if (cost < NOTE_THRESHOLD) continue
    notes.push({
      leg: t.leg,
      visit: t.visit,
      dart: t.dart,
      left: t.left,
      darts: t.darts,
      thrown: t.d.segment.multiplier === 0 ? 'Miss' : t.d.segment.name,
      better: AIMS[best].label,
      cost,
      reason: reason(evaluation, candidate, best, t.darts),
      book: checkoutHint(t.left, 'double', t.darts),
    })
  }
  return notes
}
```

`numberCost` makes a fresh evaluator per dart. That's fine: a game is a few dozen judged darts.

- [ ] **Step 4: Run the tests**

Run: `cd backend && npx vitest run src/shared/coach/notes.test.ts`
Expected: PASS.

- If a no-note case fails, print `numberCost(...)`. The prototype's gaps were 0–1 point. A gap
  near 5 points means a bug in the evaluator, not a threshold to move.

- [ ] **Step 5: Commit**

```bash
cd backend && npm run typecheck && npm run lint && cd .. && npm run format
git add backend/src/shared/coach/notes.ts backend/src/shared/coach/notes.test.ts
git commit -m "feat(coach): strategy notes on darts thrown at the wrong number"
```

---

### Task 5: Execution stats, miss tendencies and `coachGame`

**Files:**

- Create: `backend/src/shared/coach/stats.ts`
- Create: `backend/src/shared/coach/index.ts`
- Test: `backend/src/shared/coach/stats.test.ts`

**Interfaces:**

- Consumes: `throwsOf`, `dartPoints`, `CoachLeg` (Task 3); `landedNumber`, `scoringAim` (Task 3);
  `R` from `../board.js`; `strategyNotes`, `CoachNote` (Task 4).
- Produces:

  ```ts
  export type DoubleStat = { target: string; darts: number; hits: number }   // target 'D16' | 'Bull'
  export type CoachStats = {
    scoringAverage: number | null   // 3-dart average of darts thrown with more than 170 left
    scoringDarts: number
    busts: number                   // visits that busted
    doubles: DoubleStat[]           // most darts first
    checkouts: number
    dartsAtDouble: number
  }
  export type Tendency = {
    aim: string                     // 'T20' | 'T19' | 'T18' | 'T17' | 'D1'…'D20'
    darts: number; on: number       // darts thrown at it; of those, in its number
    wedges: { number: number; darts: number }[]   // darts in other numbers, most first
    positioned: number; inside: number; outside: number   // camera darts only
  }
  export function executionStats(legs: readonly CoachLeg[], seat: number, startScore: number): CoachStats
  export function missTendencies(legs: readonly CoachLeg[], seat: number, startScore: number): Tendency[]
  // index.ts
  export type CoachReport = { notes: CoachNote[]; stats: CoachStats; tendencies: Tendency[] }
  export function coachGame(legs: readonly CoachLeg[], seat: number, startScore: number): CoachReport
  ```

- [ ] **Step 1: Write the failing test**

`backend/src/shared/coach/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { coachGame } from './index.js'
import { executionStats, missTendencies } from './stats.js'
import { dart, leg, visit } from './testLegs.js'

describe('executionStats', () => {
  it('averages the darts thrown with more than 170 left', () => {
    // 501 → 321 (180), 321 → 261 (60), 261 → 201 (60): nine darts, all with more than 170 left
    const l = leg([visit(0, 501, ['T20', 'T20', 'T20']), visit(0, 321, ['S20', 'S20', 'S20']), visit(0, 261, ['S20', 'S20', 'S20'])])
    const s = executionStats([l], 0, 501)
    expect(s.scoringDarts).toBe(9)
    expect(s.scoringAverage).toBeCloseTo(100, 10)
  })

  it('stops counting a dart as scoring once 170 or less is left before it', () => {
    // 261 → 201 → 141: the third dart is thrown on 141
    const s = executionStats([leg([visit(0, 261, ['T20', 'T20', 'S1'])])], 0, 501)
    expect(s.scoringDarts).toBe(2)
  })

  it('counts darts at a double, hits and busts', () => {
    const l = leg([visit(0, 40, ['S20', 'S19']), visit(0, 40, ['D20']), visit(0, 32, ['S16', 'D8'])])
    const s = executionStats([l], 0, 501)
    expect(s.busts).toBe(1)
    // On 40: S20 (at D20), then on 20 S19 busts (at D10). D20 hits. On 32: S16 (at D16), D8 hits.
    expect(s.doubles).toEqual(
      expect.arrayContaining([
        { target: 'D20', darts: 2, hits: 1 },
        { target: 'D10', darts: 1, hits: 0 },
        { target: 'D16', darts: 1, hits: 0 },
        { target: 'D8', darts: 1, hits: 1 },
      ]),
    )
    expect([s.checkouts, s.dartsAtDouble]).toEqual([2, 5])
  })

  it('gives no average, not NaN, for a seat that never threw', () => {
    const s = executionStats([leg([visit(1, 501, ['T20'])])], 0, 501)
    expect(s.scoringAverage).toBeNull()
    expect(s).toMatchObject({ scoringDarts: 0, busts: 0, checkouts: 0, dartsAtDouble: 0, doubles: [] })
  })
})

describe('missTendencies', () => {
  it('counts where darts at T20 went', () => {
    const l = leg([visit(0, 501, ['T20', 'S5', 'S1']), visit(0, 435, ['S20', 'S5', 'S20'])])
    const t20 = missTendencies([l], 0, 501).find(t => t.aim === 'T20')!
    expect(t20).toMatchObject({ darts: 6, on: 3 })
    expect(t20.wedges).toEqual([{ number: 5, darts: 2 }, { number: 1, darts: 1 }])
  })

  it('reads inside and outside from positions only', () => {
    // On 32 (at D16): a miss just off the board by the 16, then S16 inside the double; on 16 (at D8): S8
    const v = {
      seat: 0,
      darts: [dart('Miss', { x: -0.849, y: -0.617 }), dart('S16', { x: -0.728, y: -0.529 }), dart('S8')],
      scored: 24,
      remaining: 8,
      bust: false,
    }
    const d16 = missTendencies([leg([v])], 0, 501).find(t => t.aim === 'D16')!
    expect(d16).toMatchObject({ darts: 2, positioned: 2, inside: 1, outside: 1 })
  })
})

describe('coachGame', () => {
  it('puts notes, stats and tendencies together', () => {
    const r = coachGame([leg([visit(0, 97, ['S20', 'S20', 'S20'])])], 0, 501)
    expect(r.notes.length).toBeGreaterThan(0)
    expect(r.stats.scoringDarts).toBe(0)
    expect(Array.isArray(r.tendencies)).toBe(true)
  })
})
```

How the inside/outside visit works:

- It starts on 32 (`scored: 24, remaining: 8`).
- The miss and the S16 are both thrown on 32, so both count as aimed at D16. The S8 is thrown on
  16, so it counts as aimed at D8.
- The 16's centre line is at −144° (`segAngle(13)`). (−0.728, −0.529) is r = 0.90: the outer
  single, inside the double ring (`R.so` = 0.953). (−0.849, −0.617) is r = 1.05: off the board.
- Check both with `segmentAt` once. If a boundary differs, keep one dart inside `R.so` and one
  beyond `R.db`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/shared/coach/stats.test.ts`
Expected: FAIL, cannot resolve `./index.js` / `./stats.js`.

- [ ] **Step 3: Write `stats.ts`**

```ts
// Execution: how the darts went where they were meant to. Scoring average until 170, busts,
// doubles, and per aim where the misses went.
import { R } from '../board.js'
import { landedNumber, scoringAim } from './aim.js'
import { dartPoints, throwsOf, type CoachLeg, type Throw } from './walk.js'

export type DoubleStat = { target: string; darts: number; hits: number }
export type CoachStats = {
  /** 3-dart average of the darts thrown with more than 170 left; null without any */
  scoringAverage: number | null
  scoringDarts: number
  /** Visits that busted */
  busts: number
  /** Most darts first */
  doubles: DoubleStat[]
  checkouts: number
  dartsAtDouble: number
}
export type Tendency = {
  /** T20, T19, T18, T17, or D1–D20 */
  aim: string
  darts: number
  /** Darts in the aim's own number */
  on: number
  /** Darts in other numbers, most first */
  wedges: { number: number; darts: number }[]
  /** Camera darts, and of those, inside and outside the aim's ring */
  positioned: number
  inside: number
  outside: number
}

/** The double a one-dart finish needs, or null. */
const doubleFor = (left: number): string | null => (left === 50 ? 'Bull' : left <= 40 && left % 2 === 0 && left >= 2 ? `D${left / 2}` : null)

export function executionStats(legs: readonly CoachLeg[], seat: number, startScore: number): CoachStats {
  const throws = throwsOf(legs, seat, startScore)
  const scoring = throws.filter(t => t.left > 170)
  const points = scoring.reduce((s, t) => s + dartPoints(t.d), 0)
  const doubles = new Map<string, DoubleStat>()
  for (const t of throws) {
    const target = doubleFor(t.left)
    if (!target) continue
    const s = doubles.get(target) ?? { target, darts: 0, hits: 0 }
    s.darts++
    if (t.checkout) s.hits++
    doubles.set(target, s)
  }
  const list = [...doubles.values()].sort((a, b) => b.darts - a.darts)
  return {
    scoringAverage: scoring.length ? (points / scoring.length) * 3 : null,
    scoringDarts: scoring.length,
    busts: throws.filter(t => t.bust).length,
    doubles: list,
    checkouts: throws.filter(t => t.checkout).length,
    dartsAtDouble: list.reduce((s, d) => s + d.darts, 0),
  }
}

/** Per aim, where the darts thrown at it went. Scoring darts go to 20/19/18/17; darts on a
 *  one-dart finish to that double (the bull is left out). */
export function missTendencies(legs: readonly CoachLeg[], seat: number, startScore: number): Tendency[] {
  const by = new Map<string, Tendency & { wedgeMap: Map<number, number> }>()
  const add = (aim: string, number: number, t: Throw, ring: { inner: number; outer: number }) => {
    const e = by.get(aim) ?? { aim, darts: 0, on: 0, wedges: [], positioned: 0, inside: 0, outside: 0, wedgeMap: new Map() }
    e.darts++
    const n = landedNumber(t.d)
    if (n === number) e.on++
    else if (n !== null) e.wedgeMap.set(n, (e.wedgeMap.get(n) ?? 0) + 1)
    if (t.d.coords) {
      e.positioned++
      const r = Math.hypot(t.d.coords.x, t.d.coords.y)
      if (r < ring.inner) e.inside++
      else if (r > ring.outer) e.outside++
    }
    by.set(aim, e)
  }
  for (const t of throwsOf(legs, seat, startScore)) {
    if (t.left > 170) {
      const aim = scoringAim(t.d, t.visitDarts)
      if (aim) add(`T${aim}`, aim, t, { inner: R.si, outer: R.tr })
      continue
    }
    const target = doubleFor(t.left)
    if (target && target !== 'Bull') add(target, t.left / 2, t, { inner: R.so, outer: R.db })
  }
  return [...by.values()]
    .map(({ wedgeMap, ...e }) => ({ ...e, wedges: [...wedgeMap].map(([number, darts]) => ({ number, darts })).sort((a, b) => b.darts - a.darts) }))
    .sort((a, b) => b.darts - a.darts)
}
```

`index.ts`:

```ts
// The coach's review of one player's finished X01 game: strategy notes, execution stats, miss
// tendencies. Pure; the frontend runs it on the game's stored detail.
import { strategyNotes, type CoachNote } from './notes.js'
import { executionStats, missTendencies, type CoachStats, type Tendency } from './stats.js'
import type { CoachLeg } from './walk.js'

export type { CoachNote } from './notes.js'
export type { CoachStats, DoubleStat, Tendency } from './stats.js'
export type { CoachLeg } from './walk.js'
export { NOTE_THRESHOLD } from './notes.js'
export { LANDING_LEVEL } from './landing.gen.js'

export type CoachReport = { notes: CoachNote[]; stats: CoachStats; tendencies: Tendency[] }

export function coachGame(legs: readonly CoachLeg[], seat: number, startScore: number): CoachReport {
  return {
    notes: strategyNotes(legs, seat, startScore),
    stats: executionStats(legs, seat, startScore),
    tendencies: missTendencies(legs, seat, startScore),
  }
}
```

- [ ] **Step 4: Run all coach tests**

Run: `cd backend && npx vitest run src/shared/coach`
Expected: PASS (aims, model, walk, aim, notes, stats).

- [ ] **Step 5: Commit**

```bash
cd backend && npm run typecheck && npm run lint && cd .. && npm run format
git add backend/src/shared/coach/stats.ts backend/src/shared/coach/stats.test.ts backend/src/shared/coach/index.ts
git commit -m "feat(coach): execution stats, miss tendencies and coachGame"
```

---

### Task 6: The flag and the frontend's coach rules

**Files:**

- Modify: `backend/src/flags/definitions.ts` (two places: `FLAG_META` and the flag config, next
  to `lights.enabled`)
- Create: `backend/frontend/src/lib/coach/view.ts`
- Test: `backend/frontend/src/lib/coach/view.test.ts`

**Interfaces:**

- Consumes: `GameSummary` from `$lib/api`.
- Produces:

  ```ts
  export function coachable(game: Pick<GameSummary, 'mode' | 'config'>): boolean
  export function coachSeats(game: Pick<GameSummary, 'players'>): number[]   // human seats, in seat order
  export function defaultCoachSeat(game: Pick<GameSummary, 'players' | 'mySeat'>): number | null
  ```

  Plus the flag key `'coach.enabled'`.

- [ ] **Step 1: Add the flag**

In `backend/src/flags/definitions.ts`, add after the `'lights.enabled'` entry in `FLAG_META`:

```ts
  'coach.enabled': {
    kind: 'boolean',
    description: "Shows the Coach: a review of a finished X01 game's darts on its details page, and the Coach page listing the games it can review.",
    defaultRule: 'admins',
  },
```

And after the `'lights.enabled'` entry in the flags config:

```ts
    'coach.enabled': {
      variants: { on: true, off: false },
      defaultVariant: 'off',
      disabled: false,
      contextEvaluator: on('coach.enabled', isAdmin),
    },
```

Run: `cd backend && npx vitest run src/flags`
Expected: PASS. If a test lists every flag key, add `'coach.enabled'` to it the way
`'lights.enabled'` appears.

- [ ] **Step 2: Write the failing test**

`backend/frontend/src/lib/coach/view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { coachable, coachSeats, defaultCoachSeat } from './view'

const x01 = (config: Record<string, unknown>) => ({ mode: 'x01', config })
const seat = (n: number, bot = false) => ({ seat: n, name: `P${n}`, userId: bot ? null : `u${n}`, bot, placement: n + 1, forfeited: false })

describe('coachable', () => {
  it('takes X01, straight in, double out, bull 25/50, singles', () => {
    expect(coachable(x01({ startScore: 501, inMode: 'straight', outMode: 'double', bullValue: '25_50', format: 'singles' }))).toBe(true)
  })

  it('takes an old game whose config lacks the newer keys', () => {
    expect(coachable(x01({ startScore: 501 }))).toBe(true)
  })

  it.each([
    ['straight out', { outMode: 'straight' }],
    ['master out', { outMode: 'master' }],
    ['double in', { inMode: 'double' }],
    ['bull 50/50', { bullValue: '50_50' }],
    ['teams', { format: 'teams' }],
  ])('leaves out %s', (_l, config) => {
    expect(coachable(x01(config))).toBe(false)
  })

  it('leaves out other modes', () => {
    expect(coachable({ mode: 'atc', config: {} })).toBe(false)
  })
})

describe('seats', () => {
  it('lists humans only, and defaults to your seat', () => {
    const game = { players: [seat(0, true), seat(1), seat(2)], mySeat: 2 }
    expect(coachSeats(game)).toEqual([1, 2])
    expect(defaultCoachSeat(game)).toBe(2)
  })

  it("defaults to the first human for a spectator, or when you're not a human seat", () => {
    expect(defaultCoachSeat({ players: [seat(0, true), seat(1)], mySeat: null })).toBe(1)
    expect(defaultCoachSeat({ players: [seat(0, true)], mySeat: null })).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend/frontend && npx vitest run src/lib/coach/view.test.ts`
Expected: FAIL, cannot resolve `./view`.

- [ ] **Step 4: Write `view.ts`**

```ts
// Which finished games the coach reviews, and whose darts it shows.
import type { GameSummary } from '$lib/api'

/** X01, straight in, double out, bull 25/50, singles. A missing key is X01's default. */
export function coachable(game: Pick<GameSummary, 'mode' | 'config'>): boolean {
  if (game.mode !== 'x01') return false
  const c = game.config as Record<string, unknown>
  return (
    (c.inMode ?? 'straight') === 'straight' &&
    (c.outMode ?? 'double') === 'double' &&
    (c.bullValue ?? '25_50') === '25_50' &&
    (c.format ?? 'singles') !== 'teams'
  )
}

/** The seats the coach can review: the humans, in seat order. */
export const coachSeats = (game: Pick<GameSummary, 'players'>): number[] =>
  game.players.filter(p => !p.bot).map(p => p.seat).sort((a, b) => a - b)

/** Your seat if you played, else the first human seat; null without one. */
export function defaultCoachSeat(game: Pick<GameSummary, 'players' | 'mySeat'>): number | null {
  const seats = coachSeats(game)
  return game.mySeat !== null && seats.includes(game.mySeat) ? game.mySeat : (seats[0] ?? null)
}
```

If `GameSummary['players']` items have more required fields than the test's `seat()` helper,
widen the helper (copy the fields from `schema/api-v1.yaml` `GameSeat`). Keep the `Pick` in the
signatures.

- [ ] **Step 5: Run the tests**

Run: `cd backend/frontend && npx vitest run src/lib/coach/view.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd backend && npm run typecheck && npm run lint && cd frontend && npm run typecheck && npm run lint && cd ../.. && npm run format
git add backend/src/flags/definitions.ts backend/frontend/src/lib/coach/view.ts backend/frontend/src/lib/coach/view.test.ts
git commit -m "feat(coach): coach.enabled flag and which games the coach reviews"
```

---

### Task 7: The Coach section on the details page

**Files:**

- Create: `backend/frontend/src/lib/components/coach/CoachSection.svelte`
- Create: `backend/frontend/src/lib/components/coach/CoachLegs.svelte`
- Modify: `backend/frontend/src/routes/GameDetails.svelte` (import; mount below the X01 section,
  around line 193: `{#if d.game.mode === 'x01'}<X01Section …/>{/if}`; scroll to `#coach`)

**Interfaces:**

- Consumes: `coachable`, `coachSeats`, `defaultCoachSeat` (Task 6); `flag` from `$lib/flags`;
  `coachGame`, `CoachReport`, `CoachNote`, `LANDING_LEVEL` from `$shared/coach` (Task 5);
  `averageForLevel` from `$shared/botLevels`; `GameDetail` from `$lib/api`; `querystring` from
  `svelte-spa-router`.
- Produces: `<CoachSection detail={GameDetail} />` renders nothing unless the game is coachable
  and the flag is on. It has the element id `coach`.

- [ ] **Step 1: Write `CoachLegs.svelte`**

```svelte
<script lang="ts">
  // The coach's legs: each of the player's visits as "left → darts → left", with its notes.
  import type { CoachLeg, CoachNote } from '$shared/coach'

  let { legs, seat, notes }: { legs: readonly CoachLeg[]; seat: number; notes: CoachNote[] } = $props()

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const notesFor = (leg: number, visit: number) => notes.filter(n => n.leg === leg && n.visit === visit)
  const startOf = (v: CoachLeg['visits'][number]) => (v.bust ? v.remaining : v.remaining + v.scored)
</script>

{#each legs as leg (leg.leg)}
  {@const mine = leg.visits.map((v, i) => ({ v, i })).filter(x => x.v.seat === seat)}
  <div class="flex flex-col gap-2">
    <h3 class="text-[15px] font-semibold">Leg {leg.leg + 1}</h3>
    {#if !notes.some(n => n.leg === leg.leg)}
      <p class="text-[13px] text-text-dim">No strategy notes</p>
    {/if}
    <ol class="flex flex-col gap-1">
      {#each mine as { v, i } (i)}
        <li id="coach-{leg.leg}-{i}" class="flex flex-col gap-1 rounded-[10px] px-3 py-2 bg-bg">
          <div class="flex items-center gap-3 text-[14px] tabular-nums">
            <span class="w-10 text-right text-text-dim">{startOf(v)}</span>
            <span class="flex gap-2">{#each v.darts as d, di (di)}<span>{d.segment.multiplier === 0 ? 'Miss' : d.segment.name}</span>{/each}</span>
            <span class="text-text-dim">→ {v.remaining}</span>
            {#if v.bust}<span class="text-[12px] font-semibold text-danger">Bust</span>{/if}
          </div>
          {#each notesFor(leg.leg, i) as n (n.dart)}
            <div class="text-[13px] leading-snug">
              <span class="font-semibold">Better: {n.better}</span>
              <span class="text-text-dim"> · {n.reason} · −{pct(n.cost)} checkout chance</span>
              {#if n.book}<span class="text-text-dim"> · The book plays {n.book.join(' · ')}</span>{/if}
            </div>
          {/each}
        </li>
      {/each}
    </ol>
  </div>
{/each}
```

Use the project's existing token class names. Check `X01Legs.svelte` for the exact ones it uses
(e.g. `text-text-dim`, `bg-bg`, the danger colour) and match them. Don't invent new colours.

- [ ] **Step 2: Write `CoachSection.svelte`**

```svelte
<script lang="ts">
  // The coach (Coach-Leg / Coach-Phone-Leg artboards, trimmed to the leg review): a player's
  // strategy notes on a finish, their execution stats and where they miss, for one finished X01
  // game. The model is loaded only when the section shows.
  import type { GameDetail } from '$lib/api'
  import { flag } from '$lib/flags'
  import { coachable, coachSeats, defaultCoachSeat } from '$lib/coach/view'
  import { averageForLevel } from '$shared/botLevels'
  import CoachLegs from './CoachLegs.svelte'

  let { detail }: { detail: GameDetail } = $props()
  const enabled = flag('coach.enabled')

  const x01 = $derived(detail.detail.mode === 'x01' ? detail.detail : null)
  const show = $derived($enabled && x01 !== null && coachable(detail.game) && coachSeats(detail.game).length > 0)
  const seats = $derived(coachSeats(detail.game))
  let picked = $state<number | null>(null)
  const seat = $derived(picked ?? defaultCoachSeat(detail.game) ?? 0)
  const nameOf = (s: number) => detail.game.players.find(p => p.seat === s)?.name ?? `Seat ${s + 1}`
  const startScore = $derived(Number((detail.game.config as Record<string, unknown>).startScore ?? 501))

  const coach = import('$shared/coach')
  const pct = (x: number) => `${Math.round(x * 100)}%`
</script>

{#if show && x01}
  <section id="coach" aria-label="Coach" class="flex flex-col gap-4 min-w-0 box-border p-4 md:p-6 card">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-[18px] font-semibold">Coach</h2>
      {#if seats.length > 1}
        <div role="group" aria-label="Player" class="flex flex-wrap gap-1 p-1 bg-bg rounded-[10px]">
          {#each seats as s (s)}
            <button type="button" aria-pressed={s === seat} class="px-3 py-1 rounded-[8px] text-[13px] {s === seat ? 'bg-surface font-semibold' : ''}" onclick={() => (picked = s)}>
              {nameOf(s)}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    {#await coach}
      <p class="text-[13px] text-text-dim">Loading the coach…</p>
    {:then { coachGame, LANDING_LEVEL }}
      {@const report = coachGame(x01.legs, seat, startScore)}
      {@const biggest = [...report.notes].sort((a, b) => b.cost - a.cost).slice(0, 3)}
      <p class="text-[13px] text-text-dim">Notes judge every dart on a finish against a {averageForLevel(LANDING_LEVEL)}-average player's chances.</p>

      {#if biggest.length}
        <div class="flex flex-col gap-1">
          <h3 class="text-[15px] font-semibold">Biggest mistakes</h3>
          {#each biggest as n (`${n.leg}-${n.visit}-${n.dart}`)}
            <a class="text-[14px] underline-offset-2 hover:underline" href="#coach-{n.leg}-{n.visit}"
              onclick={e => { e.preventDefault(); document.getElementById(`coach-${n.leg}-${n.visit}`)?.scrollIntoView({ block: 'center' }) }}>
              Leg {n.leg + 1}, on {n.left}: {n.thrown} → better {n.better} (−{pct(n.cost)})
            </a>
          {/each}
        </div>
      {/if}

      <dl class="grid grid-cols-2 md:grid-cols-4 gap-3 text-[14px]">
        <div><dt class="text-text-dim text-[12px]">Average until 170</dt><dd>{report.stats.scoringAverage?.toFixed(1) ?? '–'}</dd></div>
        <div><dt class="text-text-dim text-[12px]">Darts per checkout</dt><dd>{report.stats.checkouts ? (report.stats.dartsAtDouble / report.stats.checkouts).toFixed(1) : '–'}</dd></div>
        <div><dt class="text-text-dim text-[12px]">Busts</dt><dd>{report.stats.busts}</dd></div>
        <div><dt class="text-text-dim text-[12px]">Doubles</dt><dd>{report.stats.doubles.map(d => `${d.target} ${d.hits}/${d.darts}`).join(', ') || '–'}</dd></div>
      </dl>

      {@const tendencies = report.tendencies.filter(t => t.darts >= 6)}
      {#if tendencies.length}
        <div class="flex flex-col gap-1">
          <h3 class="text-[15px] font-semibold">Where you miss</h3>
          {#each tendencies as t (t.aim)}
            <p class="text-[13px]">
              <span class="font-semibold">{t.aim}</span>
              <span class="text-text-dim">
                · in the {t.aim.slice(1)} {pct(t.on / t.darts)}
                {#each t.wedges.slice(0, 2) as w (w.number)} · in {w.number} {pct(w.darts / t.darts)}{/each}
                {#if t.positioned} · inside {pct(t.inside / t.positioned)}, outside {pct(t.outside / t.positioned)} of {t.positioned} camera darts{/if}
                · {t.darts} darts
              </span>
            </p>
          {/each}
        </div>
      {/if}

      <CoachLegs legs={x01.legs} {seat} notes={report.notes} />
    {:catch}
      <p class="text-[13px] text-text-dim">The coach couldn't load. Reload the page to try again.</p>
    {/await}
  </section>
{/if}
```

Notes for the implementer:

- `{@const}` must sit directly inside a block. If Svelte rejects `{@const tendencies}` where it
  is, move it to the top of the `{:then}` block.
- Match the page's look. The section uses `card` and the paddings of `X01Section.svelte`, and the
  picker copies that file's leg selector (`role="group"`, `bg-bg rounded-[10px]`). Copy the
  selected-button classes from there too.
- The design reference is `project/Coach-Leg.dc.html` and `project/Coach-Phone-Leg.dc.html` in
  the canvas (read with the Artifact tool, per AGENTS.md). Take the visit row and the note card's
  layout from it. Leave out grades, tabs and the practice button.

- [ ] **Step 3: Mount it on the details page, and scroll when asked**

In `backend/frontend/src/routes/GameDetails.svelte`:

```ts
  import CoachSection from '$lib/components/coach/CoachSection.svelte'
  import { querystring } from 'svelte-spa-router'
  import { tick } from 'svelte'
```

Right after `{#if d.game.mode === 'x01'}<X01Section detail={d} party={layout === 'party'} />{/if}`:

```svelte
              {#if d.game.mode === 'x01'}<CoachSection detail={d} />{/if}
```

Where `load()` sets `phase = 'ready'`, add after it:

```ts
    if (new URLSearchParams($querystring ?? '').has('coach')) {
      await tick()
      document.getElementById('coach')?.scrollIntoView({ block: 'start' })
    }
```

If `load()` isn't `async`, or sets `phase` from a callback, put this in an `$effect` that runs
when `phase === 'ready'`, once.

- [ ] **Step 4: Check it in the type checker and the linter**

Run: `cd backend/frontend && npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 5: Check it by eye (the user runs the stack)**

Ask the user to start the dev stack (`scripts/dev.sh`) and turn `coach.enabled` on for their
account at `#/admin/flags`. **Don't start it yourself.** Then open a finished double-out X01 game
at `#/history/<id>?coach` on a desktop and a phone width, and check:

- the page scrolls to the Coach section;
- notes show under the right visits;
- "Biggest mistakes" links jump to them;
- the section is absent on a straight-out game.

Report what you saw, with screenshots if the browser tools are available.

- [ ] **Step 6: Commit**

```bash
npm run format
git add backend/frontend/src/lib/components/coach backend/frontend/src/routes/GameDetails.svelte
git commit -m "feat(coach): coach section on the X01 match details page"
```

---

### Task 8: The Coach page

**Files:**

- Create: `backend/frontend/src/routes/Coach.svelte`
- Modify: `backend/frontend/src/App.svelte` (routes map: add `'/coach': Coach` next to
  `'/history': History`)
- Modify: `backend/frontend/src/routes/History.svelte` (a link to `#/coach` behind the flag)

**Interfaces:**

- Consumes: `api` from `$lib/api` (`GET /api/games` with `query: { mode: 'x01', limit, cursor }`,
  returning `{ games: GameSummary[]; nextCursor: string | null }`. Check the exact response field
  names in `schema/api-v1.yaml` under `/api/games`); `coachable` (Task 6); `formatWhen`,
  `resultLabel` from `$lib/history`; `flag`; `Layout`.
- Produces: route `#/coach`.

- [ ] **Step 1: Write `Coach.svelte`**

```svelte
<script lang="ts">
  // The Coach page: your finished X01 games the coach can review, each opening its details page
  // at the Coach section. No coach numbers here: those would need the coach run on the server.
  import { onMount } from 'svelte'
  import Layout from '$lib/components/Layout.svelte'
  import ErrorText from '$lib/components/ErrorText.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import { api, type GameSummary } from '$lib/api'
  import { flag } from '$lib/flags'
  import { coachable } from '$lib/coach/view'
  import { formatWhen, resultLabel } from '$lib/history'

  const enabled = flag('coach.enabled')
  let games = $state<GameSummary[]>([])
  let cursor = $state<string | null>(null)
  let phase = $state<'loading' | 'ready' | 'failed'>('loading')

  async function more() {
    phase = 'loading'
    const { data } = await api.GET('/api/games', { params: { query: { mode: 'x01', limit: 25, ...(cursor ? { cursor } : {}) } } })
    if (!data) {
      phase = 'failed'
      return
    }
    games = [...games, ...data.games.filter(coachable)]
    cursor = data.nextCursor ?? null
    phase = 'ready'
  }
  onMount(more)

  const opponents = (g: GameSummary) => g.players.filter(p => p.seat !== g.mySeat).map(p => p.name).join(', ') || 'Solo'
</script>

<Layout>
  <main class="flex flex-col gap-4 p-4 md:p-7 max-w-[900px] mx-auto w-full">
    <h1 class="text-[24px] font-semibold">Coach</h1>
    {#if !$enabled}
      <p class="text-text-dim">The coach isn't available yet.</p>
    {:else}
      <p class="text-[14px] text-text-dim">Your X01 games with double out. Open one to see where your finishing could be smarter.</p>
      {#if phase === 'failed'}<ErrorText>Couldn't load your games.</ErrorText>{/if}
      {#if phase === 'ready' && games.length === 0 && !cursor}
        <p>Play an X01 game with double out to get a review. <a class="underline" href="#/play">Play</a></p>
      {/if}
      <ul class="flex flex-col gap-2">
        {#each games as g (g.id)}
          {@const when = formatWhen(g.finishedAt ?? g.createdAt, new Date())}
          {@const result = resultLabel(g)}
          <li>
            <a class="flex items-center justify-between gap-3 rounded-[12px] p-3 card hover:brightness-110" href="#/history/{g.id}?coach">
              <span class="flex flex-col">
                <span class="font-semibold">{opponents(g)}</span>
                <span class="text-[13px] text-text-dim">{when.day} · {when.time}</span>
              </span>
              <span class="text-[14px] {result.won ? 'text-success' : 'text-text-dim'}">{result.text}</span>
            </a>
          </li>
        {/each}
      </ul>
      {#if cursor}<Button variant="secondary" disabled={phase === 'loading'} onclick={more}>Show more</Button>{/if}
    {/if}
  </main>
</Layout>
```

Check these against the real code, and fix what differs:

- `/api/games`' response shape (`games`, `nextCursor`);
- `GameSummary`'s `finishedAt` (it is required in the schema, so the `??` may be unnecessary);
- `formatWhen`/`resultLabel`'s signatures in `lib/history.ts`;
- the Play route (`#/play` or `#/`, see App.svelte);
- `Layout`'s props (see `History.svelte`);
- the token classes (`text-success`, `card`).

Show your average per game if `GameSummary` carries it (`History.svelte`'s `historyStat` does it
for the list). Reuse that rather than computing it.

- [ ] **Step 2: Add the route and the History link**

In `backend/frontend/src/App.svelte`'s routes map, after `'/history': History,`:

```ts
    '/coach': Coach,
```

with `import Coach from './routes/Coach.svelte'` beside the other route imports. Check whether
`History` is imported statically or with `wrap({ asyncComponent })`, and do the same.

In `History.svelte`, next to the page title, behind the flag:

```svelte
  {#if $coachEnabled}<a class="text-[14px] underline-offset-2 hover:underline" href="#/coach">Coach: review your X01 games</a>{/if}
```

with `import { flag } from '$lib/flags'` and `const coachEnabled = flag('coach.enabled')`.

- [ ] **Step 3: Check it**

Run: `cd backend/frontend && npm run typecheck && npm run lint && npm test`
Expected: PASS. Then with the user's running stack (don't start it yourself), open `#/coach`:

- the list shows only double-out singles X01 games;
- "Show more" pages;
- a row opens the details page at the Coach section.

- [ ] **Step 4: Commit**

```bash
npm run format
git add backend/frontend/src/routes/Coach.svelte backend/frontend/src/App.svelte backend/frontend/src/routes/History.svelte
git commit -m "feat(coach): coach page listing the games it can review"
```

---

### Task 8b: Seed games with known coach mistakes

Added at the user's request during execution. It runs after Task 8 and before Task 9, so the
screenshot shows a game with notes.

**Files:**

- Create: `backend/src/seed/coachGames.ts`, the scripted games as data.
- Modify: `backend/src/seed/sample.ts`. `SampleGame` gets an optional `script`; `play()` throws
  the scripted dart when the seat has one; the new games are appended at the **end** of `GAMES`
  (the file's rule: a preview only plays the games after the ones it already has).
- Test: `backend/src/seed/coachGames.test.ts` (pure, no DB).

**Interfaces:**

- Consumes:
  - `pointFor(label)` from `bots/accuracy.ts`, the centre of a bed;
  - `segmentAt` from `shared/board.ts`;
  - `coachGame`, `CoachLeg` from `shared/coach/index.ts`;
  - `seg`, `visit` and `leg` helpers from `shared/coach/testLegs.ts`, in the test only.
- Produces:

  ```ts
  /** Per seat in throw order, its visits (each up to 3 dart labels like 'S20', 'D16', 'Bull', '25', 'Miss'). */
  export type DartScript = string[][][]
  export const COACH_GAMES: { players: Who[]; config: object; script: DartScript; expect: ExpectedNote[] }[]
  export type ExpectedNote = { seat: number; leg: 0; visit: number /* index among that seat's visits */; dart: number }
  ```

  `Who` must be exported from `sample.ts`, or moved into `coachGames.ts` and imported back.

**Requirements:**

1. **Two or three X01 games.** Use `startScore: 301`, `firstTo: 1`, double out (the defaults
   otherwise). Every seat is scripted. The darts must follow the rules exactly: no accidental
   checkout before the scripted one, busts only where intended, and the last scripted visit of
   the winner checks out on a double. Use dev accounts that don't play together elsewhere, or any
   pair. The players' names don't matter to the coach.
2. **Known mistakes** across the games, at least one of each kind. Every one must get a note, at
   5 or more points, under the shipped model:
   - **odd leave with the last dart:** a dart in 20 with 57, 47, 43 or 35 left and one dart in
     hand;
   - **busting near the target:** a dart in 20 with 7 or 3 left and 3 darts in hand;
   - **wrong number with two darts left:** a dart in 20 with 23 left;
   - **the opponent effect:** the same last-dart setup in 20 on 57, once with the opponent far
     away (gets a note) and once with the opponent on a finish such as 32 (no note).
3. **Good darts that must get no note**, in the same games:
   - a T20 on 99 or 119;
   - a 25 on 65;
   - a clean D16 checkout;
   - a near-miss on the right number (e.g. T1 on 3, which benefit of the doubt excuses).
4. **The unit test** `coachGames.test.ts` turns each scripted game into `CoachLeg`s the way the
   game stores them (use `testLegs.visit` per scripted visit, in throw order, alternating seats).
   It runs `coachGame` for each human seat, and asserts:
   - the set of noted darts **equals** `expect` exactly: no missing notes, no extra ones;
   - the scripted game ends with a checkout by the intended winner.

   Design the scripts against the real model: print `numberCost` for each scripted dart while
   designing, and keep every intended note at 7 or more points and every intended non-note under
   3 points, so a regenerated landing table doesn't flip them.

5. **In `play()`:** a scripted seat's next dart becomes
   `{ type: 'add_dart', segment: segmentAt(p.x, p.y), coords: p }` with `p = pointFor(label)`.
   - A `Miss` goes at a point just off the board, e.g. `{ x: 0, y: 1.05 }`.
   - After the scripted darts of a visit (fewer than 3 when the visit busts or checks out), the
     seat sends `TAKEOUT`, as `aim()` does.
   - Unscripted games stay exactly as they are.
   - Check how `add_dart` is typed in `session/types.ts`, and pass coords the way `throwAt`'s
     result does.
6. **`sample.test.ts`** (a DB test, skipped without `TEST_DATABASE_URL`) keeps passing. If it
   counts games, update its expected count.

- [ ] Step 1: Write `coachGames.test.ts` against the planned scripts. Run it and see it fail.
- [ ] Step 2: Write `coachGames.ts`, tuning the scripts with `numberCost` until the test passes
      with the margins above.
- [ ] Step 3: Wire `script` into `SampleGame`/`play()`, and append the games to `GAMES`.
- [ ] Step 4: Run `cd backend && npx vitest run src/seed src/shared/coach && npm run typecheck
  && npm run lint`. Run `npm run format` at the root.
- [ ] Step 5: Commit: `feat(seed): sample games with known coach mistakes`.

---

### Task 9: Screenshot and docs

**Files:**

- Modify: `e2e/docker-compose.screenshots.yaml` (`FLAGS_ON`: append `,coach.enabled`)
- Modify: `e2e/screenshots/04-features.spec.ts` (a coach test after "match details: stats,
  charts and the heatmap")
- Create (by the screenshot run): `docs/coach/coach-desktop.png`, `docs/coach/coach-phone.png`
- Modify: `AGENTS.md` ("Where to look" table)

- [ ] **Step 1: Add the screenshot test**

In `e2e/screenshots/04-features.spec.ts`, after the match-details test:

```ts
test('coach: the review of a finished X01 game', async ({ browser }) => {
  // The seed's best-of-3 between Michael and Gerwyn, double out, darts with positions
  for (const [view, suffix] of [
    [VIEW.wide, 'desktop'],
    [VIEW.phone, 'phone'],
  ] as const) {
    const { ctx, page } = await open(browser, 'michael', view)
    await page.goto('/#/coach')
    await page.locator('a[href^="#/history/"]').filter({ hasText: 'Gerwyn' }).first().click()
    await page.waitForURL(url => url.hash.startsWith('#/history/'))
    await expect(page.getByRole('region', { name: 'Coach' })).toBeVisible()
    await page.getByRole('region', { name: 'Coach' }).evaluate(el => el.scrollIntoView({ block: 'start' }))
    await shot(page, `coach/coach-${suffix}.png`, { settle: 1500 })
    await ctx.close()
  }
})
```

Check `shot()`'s output folder in `helpers.ts`. The details shots go to `details/…`, which ends up
under `docs/details/`, so `coach/…` lands in `docs/coach/`. If the seed game isn't double out,
pick the seed game that is, or say so to the user instead of changing the seed.

- [ ] **Step 2: Ask the user to run it**

The screenshot run starts docker. **Don't run it yourself.** Ask the user to run
`cd e2e && npm run screenshots -- -g coach`. Then check that `docs/coach/coach-desktop.png` and
`docs/coach/coach-phone.png` exist and show the section (open them with the Read tool).

- [ ] **Step 3: Add the AGENTS.md row**

In `AGENTS.md`'s "Where to look" table, after the "Match details page" row:

```markdown
| Coach (X01 leg review: strategy notes on a finish, execution stats, miss tendencies; the Coach page) | pure model in `backend/src/shared/coach/` (`aims.ts` the 102 aim points, `landing.gen.ts` generated by `npm run gen:coach` (`backend/src/coach/genLanding.ts`, the bots' `throwAt` at level 7, the reference player), `model.ts` finish chances and the evaluator, `notes.ts` notes at 5+ points with benefit of the doubt on the landed number, `stats.ts`, `index.ts` `coachGame`); frontend `lib/coach/view.ts` (which games), `lib/components/coach/` (`CoachSection` on `GameDetails.svelte`, `#coach`), `routes/Coach.svelte` (`#/coach`); behind `coach.enabled`; spec `docs/superpowers/specs/2026-11-02-coach-leg-review-design.md` |
```

- [ ] **Step 4: Commit**

```bash
npm run format
git add e2e/docker-compose.screenshots.yaml e2e/screenshots/04-features.spec.ts docs/coach AGENTS.md
git commit -m "docs(coach): screenshots and where to find the coach"
```

---

## After the last task

- Run everything once:
  - `cd backend && npm test && npm run typecheck && npm run lint`
  - `cd backend/frontend && npm test && npm run typecheck && npm run lint`
  - `npm run format:check` at the root
- The visual regression check (`cd e2e && npm run visual`) shouldn't change, because the flag is
  off for the visual run's users. If it does change, report it rather than updating the images.
- Open the PR against `main`. Title for players: `feat(coach): review a finished X01 game's
  finishing`. Put the screenshots in the body, and say that it's behind `coach.enabled`.
