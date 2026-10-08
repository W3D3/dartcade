# Match Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Heatmap" view next to "Leg by leg" on the X01 match details page: per player, a fuzzy heat layer and dart dots on a muted board, a summary line and cards (In the 20, Trebles, Miss side, Grouping, Most hit).

**Architecture:** Frontend only. Pure helpers in `lib/details/heatmap.ts` compute everything from `detail.legs[].visits[].darts` (segment + optional board coords). `HeatBoard.svelte` draws the board as SVG, the heat with simpleheat on a canvas between the board and the dot layer; `HeatmapView.svelte` lays out chips, board and cards; `X01Section.svelte` puts "Leg by leg" and "Heatmap" behind title-tabs.

**Tech Stack:** Svelte 5 runes, Tailwind v4 tokens (`src/app.css`), simpleheat 0.4, vitest (+ `svelte/server` render tests), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-match-heatmap-design.md`

## Global Constraints

- X01 only; no API change.
- Board units: y up, r = 1 at the outer double wire = 170 mm from the centre; drawn in an SVG `viewBox="-200 -200 400 400"` where 1 board unit = 170 SVG units (so SVG x = 170·x, SVG y = −170·y).
- All darts count in the cards and Most hit; only darts with `coords` get a dot, feed the heat and count for Grouping.
- "In the 20" = darts whose segment is 20 with multiplier > 0. "Miss side": Right = segments 1 or 18, Left = 5 or 12 (multiplier > 0). Grouping needs ≥ 3 positioned darts, else "—". Most hit: top 5 segments with multiplier > 0, labelled with the chalkboard's `dartLabel`.
- Heat gradient from our tokens at runtime (`getComputedStyle(document.documentElement).getPropertyValue('--color-accent')`), canvas sized by `devicePixelRatio`, redrawn on resize, `aria-hidden`; no canvas in SSR.
- Commits: `type(scope): subject`, lower case, imperative, < 72 chars, ending with the session's `Co-Authored-By` and `Claude-Session` lines; `npm run format` (repo root), `npm run typecheck`, `npm run lint`, `npm test` in `backend/frontend` pass.

## Review Focus

1. A manual-only game (no coords at all) → board shows "No dart positions — these darts were entered by hand", cards still filled. Test in Task 1 (helpers) and Task 3 (render).
2. A player who never threw (forfeit before their first visit) → "No darts thrown", cards "—". Test in Task 1 and Task 3.
3. Bulls and misses → 25 / Bull labelled correctly in Most hit; misses never in Most hit, In the 20 or Miss side. Test in Task 1.
4. Phone width → board shrinks with the column and the heat stays aligned with the dots (one coordinate mapping used by both). Test in Task 2 (`toBoardPx` shared by dots and heat) and by eye.
5. Teams game → chips grouped under Team A / Team B; the selected player is a seat, not a team. Test in Task 3.

---

## File Structure

- Create `backend/frontend/src/lib/details/heatmap.ts` — pure helpers.
- Create `backend/frontend/src/lib/details/boardGeometry.ts` — SVG path data for the muted board (segments, rings, numbers), reused by HeatBoard only.
- Create `backend/frontend/src/lib/components/details/HeatBoard.svelte`, `HeatmapView.svelte`, `X01Section.svelte`.
- Create `backend/frontend/src/types/simpleheat.d.ts` (module types) — check `tsconfig.json` `include` covers `src/types`.
- Modify `backend/frontend/src/lib/components/details/X01Legs.svelte` (drop its own `<section>`/title so X01Section owns them), `backend/frontend/src/routes/GameDetails.svelte` (render `X01Section` instead of `X01Legs`).
- Tests: `src/lib/__tests__/detailsHeatmap.test.ts`, `src/lib/__tests__/gameDetailsRender.test.ts` (append), `e2e/tests/match-details.spec.ts` (append).

---

### Task 0: Branch and spec

- [ ] **Step 1:** In the worktree, after `feat/match-details` is cleaned up and its PR is open: `git switch -c feat/match-heatmap feat/match-details`.
- [ ] **Step 2:** Copy the spec from the controller's scratchpad to `docs/superpowers/specs/2026-10-08-match-heatmap-design.md` and this plan to `docs/superpowers/plans/2026-10-08-match-heatmap.md`; `npm run format`; commit `docs: design and plan for the match heatmap`.

(The controller does Task 0 itself before dispatching Task 1.)

---

### Task 1: Heatmap helpers

**Files:**

- Create: `backend/frontend/src/lib/details/heatmap.ts`
- Test: `backend/frontend/src/lib/__tests__/detailsHeatmap.test.ts`

**Interfaces:**

- Consumes: `X01Detail`, `GameSummary` from `$lib/api`; `dartLabel` from `./x01.js`.
- Produces:
  - `type HeatDart = { segment: Segment; coords: { x: number; y: number } | null }`
  - `seatDarts(detail: X01Detail, seat: number): HeatDart[]` — every dart of that seat across all legs, in order.
  - `inThe20(darts): { pct: number | null; hits: number; total: number }`
  - `trebles(darts): { count: number; top: { label: string; n: number } | null }`
  - `missSide(darts): { side: 'Right' | 'Left' | 'Even' | null; right: number; left: number }`
  - `groupingMm(darts): number | null`
  - `mostHit(darts, n = 5): { label: string; n: number }[]`
  - `heatSummary(name: string, legCount: number, darts): string` — "Christoph · All 4 legs · 66 darts" (+ " · 12 entered by hand, not on the board"; "1 leg" singular).
  - `boardLabel(name: string, darts): string` — "Heatmap of 66 dart positions for Christoph; most hit S20, T20, S5; average spread 38 mm" (positions = positioned darts; omit the spread clause when null; "No dart positions for Christoph" when none).
  - `toBoardPx(c: { x: number; y: number }): { x: number; y: number }` — `{ x: 170 * c.x, y: -170 * c.y }` (SVG units in the −200..200 viewBox).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import type { X01Detail } from '../api'
import { boardLabel, groupingMm, heatSummary, inThe20, missSide, mostHit, seatDarts, toBoardPx, trebles, type HeatDart } from '../details/heatmap.js'

const seg = (name: string, number: number, multiplier: 0 | 1 | 2 | 3) => ({
  name,
  number,
  multiplier,
  bed: (multiplier === 0 ? 'Outside' : multiplier === 2 ? 'Double' : multiplier === 3 ? 'Triple' : 'Single') as 'Single',
})
const d = (s: ReturnType<typeof seg>, coords: { x: number; y: number } | null = null): HeatDart => ({ segment: s, coords })
const S20 = seg('S20', 20, 1),
  T20 = seg('T20', 20, 3),
  D20 = seg('D20', 20, 2),
  S1 = seg('S1', 1, 1),
  S18 = seg('S18', 18, 1),
  S5 = seg('S5', 5, 1),
  T19 = seg('T19', 19, 3),
  BULL = seg('Bull', 50, 1),
  B25 = seg('25', 25, 1),
  MISS = seg('Miss', 0, 0),
  M20 = seg('M20', 20, 0)

describe('heatmap helpers', () => {
  it('collects a seat’s darts across legs', () => {
    const hd = (s: ReturnType<typeof seg>, coords: { x: number; y: number } | null) => ({ index: 0, segment: s, coords, source: 'camera' as const, corrected: false, thrownAt: '' })
    const v = (seat: number, darts: ReturnType<typeof hd>[]) => ({ visit: 0, seat, committedAt: '', darts, scored: 0, remaining: 0, bust: false })
    const detail = {
      mode: 'x01',
      legs: [
        { leg: 0, starter: 0, winner: 0, visits: [v(0, [hd(S20, { x: 0, y: 0.8 })]), v(1, [hd(S1, null)])] },
        { leg: 1, starter: 1, winner: null, visits: [v(0, [hd(T20, null), hd(S5, { x: -0.1, y: 0.7 })])] },
      ],
    } as X01Detail
    expect(seatDarts(detail, 0).map(x => x.segment.name)).toEqual(['S20', 'T20', 'S5'])
    expect(seatDarts(detail, 0)[1].coords).toBeNull()
    expect(seatDarts(detail, 2)).toEqual([])
  })

  it('counts darts in the 20, misses excluded from the 20 but in the total', () => {
    expect(inThe20([d(S20), d(T20), d(D20), d(S1), d(M20)])).toEqual({ pct: 60, hits: 3, total: 5 })
    expect(inThe20([])).toEqual({ pct: null, hits: 0, total: 0 })
  })

  it('counts trebles and the most common one', () => {
    expect(trebles([d(T20), d(T20), d(T19), d(S20)])).toEqual({ count: 3, top: { label: 'T20', n: 2 } })
    expect(trebles([d(S20)])).toEqual({ count: 0, top: null })
  })

  it('compares the miss sides around the 20', () => {
    expect(missSide([d(S1), d(S18), d(S5)])).toEqual({ side: 'Right', right: 2, left: 1 })
    expect(missSide([d(S1), d(S5)])).toEqual({ side: 'Even', right: 1, left: 1 })
    expect(missSide([d(S20)])).toEqual({ side: null, right: 0, left: 0 })
  })

  it('measures the grouping in mm from positioned darts only', () => {
    // Three darts 0.1 board units (17 mm) from their centre at (0, 0.8)
    const g = groupingMm([d(S20, { x: 0, y: 0.9 }), d(S20, { x: 0, y: 0.7 }), d(S20, { x: 0.1, y: 0.8 }), d(S20, { x: -0.1, y: 0.8 }), d(T20)])
    expect(g).toBeCloseTo(17)
    expect(groupingMm([d(S20, { x: 0, y: 0.8 }), d(S20, { x: 0, y: 0.7 })])).toBeNull()
  })

  it('lists the most hit segments without misses, bulls labelled', () => {
    expect(mostHit([d(S20), d(S20), d(BULL), d(B25), d(B25), d(MISS), d(MISS), d(MISS)], 3)).toEqual([
      { label: 'S20', n: 2 },
      { label: '25', n: 2 },
      { label: 'Bull', n: 1 },
    ])
  })

  it('writes the summary line and the board label', () => {
    const darts = [d(S20, { x: 0, y: 0.8 }), d(T20), d(S5)]
    expect(heatSummary('Christoph', 4, darts)).toBe('Christoph · All 4 legs · 3 darts · 2 entered by hand, not on the board')
    expect(heatSummary('Christoph', 1, [d(S20, { x: 0, y: 0.8 })])).toBe('Christoph · 1 leg · 1 dart')
    expect(boardLabel('Christoph', darts)).toBe('Heatmap of 1 dart position for Christoph; most hit S20, T20, S5')
    expect(boardLabel('Guest 1', [d(S20)])).toBe('No dart positions for Guest 1')
  })

  it('maps board units to SVG units, y up', () => {
    const right = toBoardPx({ x: 1, y: 0 }),
      top = toBoardPx({ x: 0, y: 1 })
    expect([right.x, right.y + 0]).toEqual([170, 0])
    expect([top.x + 0, top.y]).toEqual([0, -170])
  })
})
```

Note on Most hit ties: equal counts keep first-seen order (`S20` before `25` because S20 appeared first). Note on `dartLabel`: it returns 'Bull' for number 50 and '25' for 25 (check `lib/details/x01.ts`).

- [ ] **Step 2: Run to see it fail**

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/detailsHeatmap.test.ts` — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// The heatmap view of the X01 details page: one player's darts across the match, and the
// cards about them. Every dart counts in the cards; only darts with a board position get a dot,
// feed the heat and count for the grouping.
import type { Segment, X01Detail } from '../api'
import { plural } from '../fmt.js'
import { dartLabel } from './x01.js'

export type HeatDart = { segment: Segment; coords: { x: number; y: number } | null }

/** Board units (r = 1 at the outer double wire) in mm. */
const MM_PER_UNIT = 170

const scored = (s: Segment) => s.multiplier > 0
const positioned = (darts: HeatDart[]) => darts.flatMap(d => (d.coords ? [d.coords] : []))

export function seatDarts(detail: X01Detail, seat: number): HeatDart[] {
  return detail.legs.flatMap(l => l.visits.filter(v => v.seat === seat).flatMap(v => v.darts.map(x => ({ segment: x.segment, coords: x.coords ?? null }))))
}

export function inThe20(darts: HeatDart[]) {
  const hits = darts.filter(d => scored(d.segment) && d.segment.number === 20).length
  return { pct: darts.length > 0 ? Math.round((hits / darts.length) * 100) : null, hits, total: darts.length }
}

/** Counts by label in first-seen order. */
function tally(labels: string[]): { label: string; n: number }[] {
  const m = new Map<string, number>()
  for (const l of labels) m.set(l, (m.get(l) ?? 0) + 1)
  return [...m].map(([label, n]) => ({ label, n }))
}
const byCount = (a: { n: number }, b: { n: number }) => b.n - a.n

export function trebles(darts: HeatDart[]) {
  const t = darts.filter(d => d.segment.multiplier === 3).map(d => dartLabel(d.segment))
  const top = tally(t).sort(byCount)[0] ?? null
  return { count: t.length, top }
}

export function missSide(darts: HeatDart[]) {
  const n = (nums: number[]) => darts.filter(d => scored(d.segment) && nums.includes(d.segment.number)).length
  const right = n([1, 18]),
    left = n([5, 12])
  const side = right === 0 && left === 0 ? null : right === left ? 'Even' : right > left ? 'Right' : 'Left'
  return { side, right, left } as { side: 'Right' | 'Left' | 'Even' | null; right: number; left: number }
}

export function groupingMm(darts: HeatDart[]): number | null {
  const pts = positioned(darts)
  if (pts.length < 3) return null
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return (pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length) * MM_PER_UNIT
}

export function mostHit(darts: HeatDart[], n = 5) {
  return tally(darts.filter(d => scored(d.segment)).map(d => dartLabel(d.segment)))
    .sort(byCount)
    .slice(0, n)
}

export function heatSummary(name: string, legCount: number, darts: HeatDart[]): string {
  const legs = legCount === 1 ? '1 leg' : `All ${legCount} legs`
  const byHand = darts.length - positioned(darts).length
  return [name, legs, plural(darts.length, 'dart'), ...(byHand > 0 ? [`${byHand} entered by hand, not on the board`] : [])].join(' · ')
}

export function boardLabel(name: string, darts: HeatDart[]): string {
  const n = positioned(darts).length
  if (n === 0) return `No dart positions for ${name}`
  const top = mostHit(darts, 3).map(h => h.label)
  const spread = groupingMm(darts)
  return [
    `Heatmap of ${n} dart ${n === 1 ? 'position' : 'positions'} for ${name}`,
    ...(top.length > 0 ? [`most hit ${top.join(', ')}`] : []),
    ...(spread === null ? [] : [`average spread ${Math.round(spread)} mm`]),
  ].join('; ')
}

export const toBoardPx = (c: { x: number; y: number }) => ({ x: MM_PER_UNIT * c.x, y: -MM_PER_UNIT * c.y })
```

(The SVG viewBox unit equals 1 mm because the double wire is drawn at 170.)

- [ ] **Step 4: Run to see it pass; typecheck, lint; commit** `feat(ui): heatmap helpers for the X01 details page`.

---

### Task 2: The board with heat and dots

**Files:**

- Create: `backend/frontend/src/lib/details/boardGeometry.ts`, `backend/frontend/src/lib/components/details/HeatBoard.svelte`, `backend/frontend/src/types/simpleheat.d.ts`
- Modify: `backend/frontend/package.json`, `package-lock.json` (`npm install simpleheat@^0.4.0`)
- Test: `backend/frontend/src/lib/__tests__/gameDetailsRender.test.ts` (append), `detailsHeatmap.test.ts` (append geometry test)

**Interfaces:**

- Consumes: `HeatDart`, `toBoardPx`, `boardLabel` (Task 1); `R`, `SEGS`, `HALF`, `segAngle` from `$shared/board.js`.
- Produces: `boardSegments(): { d: string; ring: 'single' | 'treble' | 'double'; odd: boolean }[]`, `boardNumbers(): { n: number; x: number; y: number }[]` from `boardGeometry.ts`; component `HeatBoard { darts: HeatDart[]; name: string; size?: number }`.

- [ ] **Step 1: Geometry helper + test.** `boardGeometry.ts` builds annular-sector paths in SVG units (×170, y flipped) for each of the 20 segments × rings (inner single `R.bull25..R.si`, treble `R.si..R.tr`, outer single `R.tr..R.so`, double `R.so..R.db`), each sector spanning `segAngle(i) ± HALF`, plus number positions at radius 184. Test: 80 sector paths, 20 numbers, number 20 at (0, −184) within 0.01.

```ts
// SVG path data for a plain dartboard in the heatmap's viewBox (-200..200, 1 unit = 1 mm,
// double wire at 170): 20 segments × 4 rings and the numbers around it.
import { HALF, R, SEGS, segAngle } from '$shared/board.js'

const MM = 170
const pt = (r: number, a: number) => `${(MM * r * Math.cos(a)).toFixed(2)} ${(-MM * r * Math.sin(a)).toFixed(2)}`

function sector(r0: number, r1: number, a0: number, a1: number): string {
  // Board angles are y-up; in SVG (y down) a larger board angle is counter-clockwise, sweep 0
  return `M${pt(r1, a0)} A${MM * r1} ${MM * r1} 0 0 0 ${pt(r1, a1)} L${pt(r0, a1)} A${MM * r0} ${MM * r0} 0 0 1 ${pt(r0, a0)} Z`
}

const RINGS = [
  { ring: 'single', r0: R.bull25, r1: R.si },
  { ring: 'treble', r0: R.si, r1: R.tr },
  { ring: 'single', r0: R.tr, r1: R.so },
  { ring: 'double', r0: R.so, r1: R.db },
] as const

export function boardSegments() {
  return SEGS.flatMap((_, i) => RINGS.map(r => ({ d: sector(r.r0, r.r1, segAngle(i) - HALF, segAngle(i) + HALF), ring: r.ring, odd: i % 2 === 1 })))
}

export function boardNumbers() {
  return SEGS.map((n, i) => ({ n, x: 184 * Math.cos(segAngle(i)), y: -184 * Math.sin(segAngle(i)) }))
}
```

Verify the arc sweep flags against a rendered board in the preview (a wrong sweep draws the big arc); fix the flags, not the test.

- [ ] **Step 2: simpleheat.** `cd backend/frontend && npm install simpleheat@^0.4.0`. Add `src/types/simpleheat.d.ts`:

```ts
declare module 'simpleheat' {
  interface SimpleHeat {
    data(points: [number, number, number][]): SimpleHeat
    max(max: number): SimpleHeat
    radius(r: number, blur?: number): SimpleHeat
    gradient(stops: Record<number, string>): SimpleHeat
    resize(): void
    clear(): SimpleHeat
    draw(minOpacity?: number): SimpleHeat
  }
  export default function simpleheat(canvas: HTMLCanvasElement | string): SimpleHeat
}
```

Check simpleheat's real API in `node_modules/simpleheat/simpleheat.js` and adjust the declaration to it; check it's CommonJS/UMD and that Vite's default import works.

- [ ] **Step 3: `HeatBoard.svelte`.** SVG board (`viewBox="-200 -200 400 400"`, `role="img"`, `aria-label={boardLabel(name, darts)}`): background disc `--color-bg-deep`, segments in surface greys (`odd` alternating `surface-chip`/`surface-active`, treble/double rings a step lighter), bull circles, numbers in `text-dim`. Above it, absolutely positioned at the same box, a `<canvas aria-hidden="true">` drawn in `onMount`/`$effect` (browser only): size = rendered px × `devicePixelRatio`; `simpleheat(canvas).data(points).max(m).radius(r, r * 1.2).gradient(stops).draw(0.05)` where points are each positioned dart's `toBoardPx` mapped to canvas px (`(x + 200) / 400 * width`), `r` ≈ 18 mm in canvas px, `m` = max(2, round(positioned/12)), stops `{ 0.25: transparent-ish accent, 0.55: accent at 50%, 1: accent }` built from `getComputedStyle(document.documentElement).getPropertyValue('--color-accent')`. A `ResizeObserver` on the wrapper redraws. Above the canvas, an SVG layer of dots (r 2.2, dark fill 75%, light ring) for positioned darts. Empty states over the board: no darts → "No darts thrown"; darts but none positioned → "No dart positions — these darts were entered by hand". Legend under the board: "Fewer" + gradient bar (CSS linear-gradient from the same token) + "More darts" + dot "Dart". Wrapper keeps a square aspect and `max-w-[500px] w-full`.

- [ ] **Step 4: Render test (append).** Render `HeatBoard` with 3 positioned and 1 manual dart: the `role="img"` label, 3 dot circles (count `<circle` with the dot class), the legend text, and no "No dart positions" text; with manual-only darts the empty text shows; with none, "No darts thrown".

- [ ] **Step 5: Check in the preview** (port 5174) that dots and heat line up (S20 darts above the bull, T20 in the treble ring at the top) on desktop and at phone width; typecheck, lint, test, format; commit `feat(ui): heatmap board with simpleheat`.

---

### Task 3: The heatmap view

**Files:**

- Create: `backend/frontend/src/lib/components/details/HeatmapView.svelte`
- Test: `gameDetailsRender.test.ts` (append)

**Interfaces:**

- Consumes: Task 1 helpers, `HeatBoard` (Task 2), `x01Sides` (teams), `highlightDefault`, `Avatar`.
- Produces: `HeatmapView { detail: GameDetail }`.

- [ ] **Step 1: Failing render tests (append).** (a) A duel with darts: chips for both players with `aria-pressed`, the summary line, "In the 20" with its percentage, "Trebles", "Miss side", "Grouping", "Most hit" with the top label. (b) A teams game (`detail.teams`): "Team A" and "Team B" group labels above their players' chips. (c) A player with only manual darts: the summary line ends with "entered by hand, not on the board".

- [ ] **Step 2: Implement.** Chips: `role="group" aria-label="Show heatmap for"`, buttons with `aria-pressed`, avatar + name (lime 2px border + `bg-accent-tint` when selected, `border-line-chip` otherwise); teams: a small `label-caps` heading per team over its chips. Selected seat state: `$state<number | null>(null)`, default `highlightDefault(detail)`. Layout: `flex flex-col lg:flex-row gap-6 lg:gap-9` — `HeatBoard` left, right column: summary `<p>` (name bold), a 2×2 grid of cards (label caps `text-dim`, value `font-display` 32px, sub 12px `text-muted`): In the 20 (`pct%`, "hits of total"), Trebles (count, "T20 × 16" or "—"), Miss side (side or "—", "1 / 18 · R vs L" when Right/Even, "5 / 12 · L vs R" when Left), Grouping (`Math.round(mm) mm` or "—", "avg. spread"); then "Most hit" as an `<ol>` of label, bar (width relative to the first, `bg-accent` for the first, `bg-line-pip` for the rest), count.

- [ ] **Step 3: Run, typecheck, lint, format; commit** `feat(ui): heatmap view with chips, cards and most hit`.

---

### Task 4: Leg by leg / Heatmap tabs

**Files:**

- Create: `backend/frontend/src/lib/components/details/X01Section.svelte`
- Modify: `backend/frontend/src/lib/components/details/X01Legs.svelte` (render its content without the outer `<section>`/`<h2>`: move the highlight picker and leg tabs into a header row it still owns, but the title comes from X01Section), `backend/frontend/src/routes/GameDetails.svelte` (use `X01Section`)
- Test: `gameDetailsRender.test.ts` (adjust the existing X01Legs tests to the new structure; add tab tests)

**Interfaces:**

- Consumes: `X01Legs { detail, party }`, `HeatmapView { detail }`.
- Produces: `X01Section { detail: GameDetail; party: boolean }`.

- [ ] **Step 1: Failing render test.** `X01Section` renders a `role="tablist"` with two `role="tab"` buttons "Leg by leg" (selected) and "Heatmap", and the Leg by leg panel (`role="tabpanel"`) content (e.g. the chalkboard's table).

- [ ] **Step 2: Implement.** One `<section class="card ...">` with a header: `role="tablist" aria-label="Match view"`, two tab buttons styled as the artboard's titles (Barlow Condensed 24/32px uppercase; selected `text-text`, other `text-text-dim hover:text-ink-2`), `aria-selected`, `aria-controls`, roving `tabindex`, Left/Right/Home/End switch tabs (same pattern as `LobbySidePanel.svelte`'s tabs). On the right of the header: "Where every dart landed" (13px `text-dim`) when Heatmap is selected. Panels: `role="tabpanel"` with `X01Legs` (no own card/title) or `HeatmapView`. Keep X01Legs' accessible name for its content region ("Leg by leg") via the tabpanel's `aria-labelledby`.

- [ ] **Step 3: Update existing tests** that looked for X01Legs' own "Leg by leg" heading: the heading text now comes from the tab; keep their content assertions.

- [ ] **Step 4: Run all frontend tests, typecheck, lint, format; check in the preview; commit** `feat(ui): leg by leg and heatmap tabs on X01 details`.

---

### Task 5: e2e and docs

**Files:**

- Modify: `e2e/tests/match-details.spec.ts`, `AGENTS.md`

- [ ] **Step 1:** In the existing "a finished game opens its details from History" test, after the leg-by-leg assertions: click the `tab` named "Heatmap", expect "Where every dart landed", "In the 20" and "Most hit" visible. (Manual-entry e2e games have no positions: also expect "No dart positions".)
- [ ] **Step 2:** AGENTS.md "Where to look", extend the match details row: "the X01 heatmap in `HeatmapView.svelte`/`HeatBoard.svelte` (simpleheat), helpers in `lib/details/heatmap.ts`".
- [ ] **Step 3:** Run the e2e spec (stop any server on 5174 first; see DEVELOPMENT.md), format, commit `test(e2e): open the heatmap on a game's details`.
