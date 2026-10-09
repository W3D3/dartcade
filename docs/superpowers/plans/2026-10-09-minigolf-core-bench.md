# Minigolf core and test bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin-only page where you pick a minigolf hole, click a dartboard to putt, and watch a
nape-js ball roll, built on a shared core (hole format, dart → shot, simulation) the game will use later.

**Architecture:** A shared, pure core in `backend/src/shared/minigolf/` (types, `shotFromDart`,
`simulateShot` on nape-js, a `test` course). The backend gains an admin role (better-auth admin
plugin, plus an `ADMIN_EMAILS` allowlist) and `isAdmin` on `GET /api/me`. The SPA gets a lazy-loaded
`#/admin/minigolf` route that runs the core in the browser and animates the returned path on an SVG hole.

**Tech Stack:** TypeScript, `@newkrok/nape-js` 3.43.5 (pinned), better-auth 1.7.6 admin plugin, Kysely +
Postgres, Fastify, Svelte 5, svelte-spa-router, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md`

## Global Constraints

- `@newkrok/nape-js` at exactly `3.43.5` (no `^`) in both `backend/package.json` and `backend/frontend/package.json`.
- `backend/src/shared/minigolf/` is the only part of `shared/` allowed a dependency (nape-js); nothing else in `shared/` imports it.
- Course space is millimetres, x right, y down. The ball radius is `21.35` (a 42.7 mm golf ball).
- Board coords: bull-centred, `r = 1` at the outer double wire, y up (`schema/adbridge-v1.json`); bull radii from `R` in `backend/src/shared/board.ts`.
- `simulateShot` is pure: same input → same output on one runtime; `space.deterministic = true`, fixed step `1/240` s.
- No moving obstacles. No segment-based input anywhere in Minigolf.
- Commits: conventional (`type(scope): subject`), lower case, imperative, < 72 chars; end with the session's attribution lines.
- Formatting: `npm run format` at the repo root before each commit; lint with `npm run lint` in `backend/` and `backend/frontend/`.

## Review Focus

- A ball resting on a slope steeper than friction must keep rolling, not freeze because it was slow at one instant. Test in Task 3.
- A hole whose cup lies on or right next to a wall, or a ball resting against a wall, must not jitter forever: the time cap ends it and the result is still returned. Test in Task 3.
- A bull hit when the ball is already on the cup's centre (zero-length direction) must not produce `NaN`. Test in Task 2.
- Clicks on the dartboard while the ball is still rolling or after it's holed must be ignored, not queue extra strokes. Test in Task 6 (`bench.ts`).
- A non-admin opening `#/admin/minigolf` directly, or before `/api/me` has loaded, must not see the bench. Test in Task 6 (e2e).

---

## File structure

```
backend/src/shared/minigolf/
  types.ts          Pt, Hole, Wall, Bumper, Slope, Course, Shot, ShotResult, BALL_R
  physics.ts        Physics, DEFAULT_PHYSICS
  geometry.ts       pointInPolygon, segmentsIntersect, bounds (no trig)
  hole.ts           validateHole
  shot.ts           shotFromDart
  simulate.ts       simulateShot (nape-js)
  courses/test.ts   the `test` course (3 holes)
  courses/index.ts  COURSES, getCourse
  *.test.ts         unit + golden tests (backend vitest picks them up)
backend/src/auth/admin.ts          isAdmin, requireAdmin
backend/src/db/migrations/019_admin.sql
backend/frontend/src/lib/minigolf/bench.ts      bench state (pure)
backend/frontend/src/lib/minigolf/animate.ts    path playback helper
backend/frontend/src/lib/components/minigolf/HoleView.svelte
backend/frontend/src/lib/components/minigolf/PhysicsPanel.svelte   (milestone B)
backend/frontend/src/lib/components/minigolf/HoleEditor.svelte     (milestone B)
backend/frontend/src/routes/MinigolfBench.svelte
e2e/tests/minigolf-bench.spec.ts
```

---

# Milestone A: playable

### Task 1: nape-js, core types, physics defaults, hole validation

**Files:**

- Modify: `backend/package.json`, `backend/frontend/package.json` (dependency), `AGENTS.md` (shared exception + where-to-look row)
- Create: `backend/src/shared/minigolf/types.ts`, `physics.ts`, `geometry.ts`, `hole.ts`
- Test: `backend/src/shared/minigolf/geometry.test.ts`, `hole.test.ts`

**Interfaces:**

- Produces:
  - `type Pt = readonly [number, number]`
  - `interface Wall { points: Pt[]; closed?: boolean; restitution?: number }`
  - `interface Bumper { at: Pt; r: number; restitution?: number; kick?: number }`
  - `type Slope = { area: Pt[]; force: Pt } | { area: Pt[]; radial: { center: Pt; strength: number } }` (strength > 0 pushes away from the centre, the summit; < 0 pulls in)
  - `interface Hole { id: string; name: string; par: number; outline: Pt[]; walls: Wall[]; bumpers: Bumper[]; slopes: Slope[]; tee: Pt; cup: { at: Pt; r: number } }`
  - `interface Course { id: string; name: string; holes: Hole[] }`
  - `interface Shot { dir: Pt; power: number }` (unit `dir` in course space, `power` 0..1)
  - `interface ShotResult { path: Pt[]; rest: Pt; holed: boolean }`
  - `const BALL_R = 21.35`
  - `interface Physics { friction: number; restSpeed: number; captureSpeed: number; maxRoll: number; minPutt: number; wallRestitution: number; bumperRestitution: number; powerCurve: 'linear' | 'ease-in'; step: number; maxTime: number; wallThickness: number }`, `DEFAULT_PHYSICS`
  - `pointInPolygon(p: Pt, poly: readonly Pt[]): boolean`, `segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean`, `bounds(pts: readonly Pt[]): { minX; minY; maxX; maxY }`
  - `validateHole(hole: Hole): string[]` (empty = valid)

- [ ] **Step 1: Add the dependency**

```bash
cd backend && npm i -E @newkrok/nape-js@3.43.5 && cd frontend && npm i -E @newkrok/nape-js@3.43.5
```

Check both `package.json` files show `"@newkrok/nape-js": "3.43.5"`.

- [ ] **Step 2: Write `types.ts` and `physics.ts`**

```ts
// backend/src/shared/minigolf/types.ts
// Minigolf's data: holes in course space (millimetres, x right, y down) and shots.
// Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md

export type Pt = readonly [number, number]

/** A rail: a polyline, or a closed polygon when `closed` (an obstacle block). */
export interface Wall {
  points: Pt[]
  closed?: boolean
  /** Bounce, 0..1; Physics.wallRestitution when absent. */
  restitution?: number
}

/** A round obstacle the ball bounces off. `kick` (mm/s) is added along the normal on each hit. */
export interface Bumper {
  at: Pt
  r: number
  restitution?: number
  kick?: number
}

/** An area that pushes the ball while it's inside: a constant force (mm/s²), or radial around
 *  a centre (strength > 0 pushes away, a summit; < 0 pulls in, a bowl). */
export type Slope = { area: Pt[]; force: Pt } | { area: Pt[]; radial: { center: Pt; strength: number } }

export interface Hole {
  id: string
  name: string
  par: number
  /** The felt's edge; rails run along it. */
  outline: Pt[]
  walls: Wall[]
  bumpers: Bumper[]
  slopes: Slope[]
  tee: Pt
  cup: { at: Pt; r: number }
}

export interface Course {
  id: string
  name: string
  holes: Hole[]
}

/** A putt: a unit direction in course space and power 0..1. */
export interface Shot {
  dir: Pt
  power: number
}

/** `path` is the ball sampled at 60 Hz for animation, starting at the ball and ending at `rest`. */
export interface ShotResult {
  path: Pt[]
  rest: Pt
  holed: boolean
}

/** A golf ball, 42.7 mm across. */
export const BALL_R = 21.35
```

```ts
// backend/src/shared/minigolf/physics.ts
// How the ball feels. Kept apart from holes so the test bench can change it live.

export interface Physics {
  /** Rolling friction: constant deceleration, mm/s². */
  friction: number
  /** Below this speed (mm/s) the ball stops, unless a slope is stronger than friction. */
  restSpeed: number
  /** The fastest the ball may roll over the cup and still drop, mm/s. */
  captureSpeed: number
  /** Speed of a full-power shot, mm/s. */
  maxSpeed: number
  /** Power of a dart at the very centre, 0..1: the softest putt. */
  minPutt: number
  wallRestitution: number
  bumperRestitution: number
  /** How distance from the bull maps to power. */
  powerCurve: 'linear' | 'ease-in'
  /** Fixed simulation step, s. */
  step: number
  /** A shot stops where it is after this long, s. */
  maxTime: number
  /** Rails and walls are this thick, mm. */
  wallThickness: number
}

export const DEFAULT_PHYSICS: Physics = {
  friction: 1200,
  restSpeed: 8,
  captureSpeed: 1100,
  maxSpeed: 4500,
  minPutt: 0.05,
  wallRestitution: 0.7,
  bumperRestitution: 0.85,
  powerCurve: 'linear',
  step: 1 / 240,
  maxTime: 20,
  wallThickness: 20,
}
```

- [ ] **Step 3: Write failing tests for geometry and validation**

```ts
// backend/src/shared/minigolf/geometry.test.ts
import { describe, it, expect } from 'vitest'
import { bounds, pointInPolygon, segmentsIntersect } from './geometry.js'

const square = [[0, 0], [100, 0], [100, 100], [0, 100]] as const

describe('geometry', () => {
  it('finds points inside and outside a polygon', () => {
    expect(pointInPolygon([50, 50], square)).toBe(true)
    expect(pointInPolygon([150, 50], square)).toBe(false)
    // An L shape: the notch is outside
    const l = [[0, 0], [100, 0], [100, 40], [40, 40], [40, 100], [0, 100]] as const
    expect(pointInPolygon([70, 70], l)).toBe(false)
    expect(pointInPolygon([20, 70], l)).toBe(true)
  })
  it('detects crossing segments, not touching neighbours', () => {
    expect(segmentsIntersect([0, 0], [10, 10], [0, 10], [10, 0])).toBe(true)
    expect(segmentsIntersect([0, 0], [10, 0], [0, 5], [10, 5])).toBe(false)
  })
  it('measures bounds', () => {
    expect(bounds(square)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 100 })
  })
})
```

```ts
// backend/src/shared/minigolf/hole.test.ts
import { describe, it, expect } from 'vitest'
import { validateHole } from './hole.js'
import type { Hole } from './types.js'

const ok: Hole = {
  id: 'h', name: 'H', par: 2,
  outline: [[0, 0], [400, 0], [400, 1200], [0, 1200]],
  walls: [], bumpers: [], slopes: [],
  tee: [200, 1100], cup: { at: [200, 150], r: 54 },
}

describe('validateHole', () => {
  it('accepts a valid hole', () => expect(validateHole(ok)).toEqual([]))
  it('rejects a tee or cup outside the outline', () => {
    expect(validateHole({ ...ok, tee: [500, 100] })).toContain('tee is outside the outline')
    expect(validateHole({ ...ok, cup: { at: [-10, 0], r: 54 } })).toContain('cup is outside the outline')
  })
  it('rejects short and self-intersecting polygons', () => {
    expect(validateHole({ ...ok, outline: [[0, 0], [1, 1]] })).toContain('outline needs at least 3 points')
    expect(validateHole({ ...ok, outline: [[0, 0], [400, 1200], [400, 0], [0, 1200]] })).toContain('outline crosses itself')
    expect(validateHole({ ...ok, slopes: [{ area: [[0, 0], [1, 0]], force: [0, 1] }] })).toContain('slope 1 needs at least 3 points')
  })
  it('rejects non-finite numbers and bad sizes', () => {
    expect(validateHole({ ...ok, tee: [Number.NaN, 0] })).toContain('tee has a non-finite number')
    expect(validateHole({ ...ok, cup: { at: [200, 150], r: 0 } })).toContain('cup radius must be positive')
    expect(validateHole({ ...ok, bumpers: [{ at: [200, 600], r: -1 }] })).toContain('bumper 1 radius must be positive')
    expect(validateHole({ ...ok, walls: [{ points: [[10, 10]] }] })).toContain('wall 1 needs at least 2 points')
  })
})
```

- [ ] **Step 4: Run them to see them fail**

Run: `cd backend && npx vitest run src/shared/minigolf`
Expected: FAIL, modules `./geometry.js` / `./hole.js` not found.

- [ ] **Step 5: Implement `geometry.ts` and `hole.ts`**

```ts
// backend/src/shared/minigolf/geometry.ts
// Plane geometry for holes, with arithmetic only (no trig), so results match everywhere.
import type { Pt } from './types.js'

/** Even-odd ray cast; points exactly on an edge may land either side. */
export function pointInPolygon([x, y]: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** Proper crossing of segments ab and cd (touching endpoints and collinear overlaps don't count). */
export function segmentsIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

export function bounds(pts: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of pts) {
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
  }
  return { minX, minY, maxX, maxY }
}
```

```ts
// backend/src/shared/minigolf/hole.ts
// Checks a hole before it's played: readable errors instead of a broken simulation.
import { pointInPolygon, segmentsIntersect } from './geometry.js'
import type { Hole, Pt } from './types.js'

const finite = (pts: readonly Pt[]) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))

function crossesItself(poly: readonly Pt[]): boolean {
  const n = poly.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // neighbours through the closing edge
      if (segmentsIntersect(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return true
    }
  }
  return false
}

function checkPolygon(errors: string[], label: string, poly: readonly Pt[]): void {
  if (poly.length < 3) errors.push(`${label} needs at least 3 points`)
  else if (!finite(poly)) errors.push(`${label} has a non-finite number`)
  else if (crossesItself(poly)) errors.push(`${label} crosses itself`)
}

/** Everything wrong with the hole; empty when it can be played. */
export function validateHole(hole: Hole): string[] {
  const errors: string[] = []
  checkPolygon(errors, 'outline', hole.outline)
  const outlineOk = errors.length === 0
  if (!finite([hole.tee])) errors.push('tee has a non-finite number')
  else if (outlineOk && !pointInPolygon(hole.tee, hole.outline)) errors.push('tee is outside the outline')
  if (!finite([hole.cup.at])) errors.push('cup has a non-finite number')
  else if (outlineOk && !pointInPolygon(hole.cup.at, hole.outline)) errors.push('cup is outside the outline')
  if (!(hole.cup.r > 0)) errors.push('cup radius must be positive')
  if (!(hole.par >= 1)) errors.push('par must be at least 1')
  hole.walls.forEach((w, i) => {
    if (w.points.length < 2) errors.push(`wall ${i + 1} needs at least 2 points`)
    else if (!finite(w.points)) errors.push(`wall ${i + 1} has a non-finite number`)
  })
  hole.bumpers.forEach((b, i) => {
    if (!finite([b.at])) errors.push(`bumper ${i + 1} has a non-finite number`)
    if (!(b.r > 0)) errors.push(`bumper ${i + 1} radius must be positive`)
  })
  hole.slopes.forEach((s, i) => checkPolygon(errors, `slope ${i + 1}`, s.area))
  return errors
}
```

- [ ] **Step 6: Run the tests until they pass**

Run: `cd backend && npx vitest run src/shared/minigolf`
Expected: PASS.

- [ ] **Step 7: Note the exception in `AGENTS.md`**

In the "Where to look" table, change the shared row to
``| Code shared by backend and frontend (`$shared/...`) | `backend/src/shared/` (dependency-free, except `minigolf/`, which uses nape-js pinned to the same version in both packages) |``
and add a row:
``| Minigolf core: holes, dart → shot, physics (nape-js), courses | `backend/src/shared/minigolf/`; admin test bench `#/admin/minigolf` (`routes/MinigolfBench.svelte`, `lib/minigolf/`, `lib/components/minigolf/`) |``

- [ ] **Step 8: Typecheck, format, commit**

```bash
cd backend && npm run typecheck && cd .. && npm run format
git add backend/package.json backend/package-lock.json backend/frontend/package.json backend/frontend/package-lock.json backend/src/shared/minigolf AGENTS.md
git commit -m "feat(minigolf): add hole format, physics defaults and validation"
```

---

### Task 2: dart → shot

**Files:**

- Create: `backend/src/shared/minigolf/shot.ts`
- Test: `backend/src/shared/minigolf/shot.test.ts`

**Interfaces:**

- Consumes: `Pt`, `Shot`, `Physics` (Task 1); `R` from `backend/src/shared/board.ts`
- Produces: `shotFromDart(coords: { x: number; y: number } | null, ball: Pt, cup: Pt, physics: Physics): Shot | null`, `powerAt(r: number, physics: Physics): number`

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/shared/minigolf/shot.test.ts
import { describe, it, expect } from 'vitest'
import { R } from '../board.js'
import { DEFAULT_PHYSICS as P } from './physics.js'
import { powerAt, shotFromDart } from './shot.js'

const ball = [200, 1000] as const
const cup = [200, 200] as const

describe('shotFromDart', () => {
  it('rolls up the screen for a dart straight up (the 20)', () => {
    const s = shotFromDart({ x: 0, y: 0.5 }, ball, cup, P)!
    expect(s.dir[0]).toBeCloseTo(0)
    expect(s.dir[1]).toBeCloseTo(-1)
  })
  it('rolls right for a dart in the 6', () => {
    const s = shotFromDart({ x: 0.5, y: 0 }, ball, cup, P)!
    expect(s.dir[0]).toBeCloseTo(1)
    expect(s.dir[1]).toBeCloseTo(0)
  })
  it('aims both bull rings at the cup', () => {
    const toRight = [600, 1000] as const
    for (const c of [{ x: 0.01, y: 0.01 }, { x: -R.bull25 * 0.9, y: 0 }]) {
      const s = shotFromDart(c, ball, toRight, P)!
      expect(s.dir[0]).toBeCloseTo(1)
      expect(s.dir[1]).toBeCloseTo(0)
    }
  })
  it('putts up the screen from the bull when the ball already sits on the cup', () => {
    const s = shotFromDart({ x: 0, y: 0 }, cup, cup, P)!
    expect(s.dir).toEqual([0, -1])
    expect(Number.isNaN(s.power)).toBe(false)
  })
  it('misses outside the double wire and without coords', () => {
    expect(shotFromDart({ x: 0, y: 1.02 }, ball, cup, P)).toBeNull()
    expect(shotFromDart(null, ball, cup, P)).toBeNull()
  })
})

describe('powerAt', () => {
  it('runs from the softest putt at the centre to full power at the double wire', () => {
    expect(powerAt(0, P)).toBeCloseTo(P.minPutt)
    expect(powerAt(1, P)).toBeCloseTo(1)
    expect(powerAt(0.5, P)).toBeCloseTo(P.minPutt + (1 - P.minPutt) * 0.5)
  })
  it('bends with the ease-in curve', () => {
    expect(powerAt(0.5, { ...P, powerCurve: 'ease-in' })).toBeCloseTo(P.minPutt + (1 - P.minPutt) * 0.25)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && npx vitest run src/shared/minigolf/shot.test.ts`
Expected: FAIL, `./shot.js` not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/shared/minigolf/shot.ts
// Your dart is the putter: the angle around the bull is the direction, the distance the power.
// Arithmetic and sqrt only, no trig. Board coords: r = 1 at the outer double wire, y up.
import { R } from '../board.js'
import type { Physics } from './physics.js'
import type { Pt, Shot } from './types.js'

/** Power for a dart at distance r from the bull: the softest putt at the centre, 1 at the double wire. */
export function powerAt(r: number, physics: Physics): number {
  const t = Math.min(1, Math.max(0, r))
  const curved = physics.powerCurve === 'ease-in' ? t * t : t
  return physics.minPutt + (1 - physics.minPutt) * curved
}

/** The putt a dart makes, or null for a miss (off the board, or a bounce-out without coords).
 *  Either bull ring putts straight at the cup. */
export function shotFromDart(coords: { x: number; y: number } | null, ball: Pt, cup: Pt, physics: Physics): Shot | null {
  if (!coords) return null
  const r = Math.sqrt(coords.x * coords.x + coords.y * coords.y)
  if (r > 1) return null
  const power = powerAt(r, physics)
  if (r <= R.bull25) {
    const dx = cup[0] - ball[0]
    const dy = cup[1] - ball[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    return { dir: len === 0 ? [0, -1] : [dx / len, dy / len], power }
  }
  // Board y points up, course y down
  return { dir: [coords.x / r, -coords.y / r], power }
}
```

- [ ] **Step 4: Run until it passes**

Run: `cd backend && npx vitest run src/shared/minigolf/shot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format && git add backend/src/shared/minigolf/shot.ts backend/src/shared/minigolf/shot.test.ts
git commit -m "feat(minigolf): turn a dart into a putt"
```

---

### Task 3: simulate a shot with nape-js

**Files:**

- Create: `backend/src/shared/minigolf/simulate.ts`
- Test: `backend/src/shared/minigolf/simulate.test.ts`

**Interfaces:**

- Consumes: `Hole`, `Pt`, `Shot`, `ShotResult`, `BALL_R`, `Physics`, `pointInPolygon` (Task 1)
- Produces: `simulateShot(hole: Hole, physics: Physics, ball: Pt, shot: Shot): ShotResult`

Facts from the nape-js spike (3.43.5): `new Space(new Vec2(0, 0))`; `space.deterministic = true`;
`space.step(dt, 10, 10)`; static bodies `new Body(BodyType.STATIC)` + `body.shapes.add(shape)` + `body.space = space`;
`Polygon` takes `Vec2[]` and does **not** check convexity (only build quads); `Circle(radius, undefined, material)`;
`Material(elasticity, dynamicFriction, staticFriction, density, rollingFriction)`; the effective restitution
of a contact is the **mean** of both materials' elasticity, **capped at 1**. So the ball gets elasticity 0
and every surface `2 × restitution`. `ball.isBullet = true` stops tunnelling (tested at 40 m/s);
`ball.allowRotation = false`; `body.velocity` is a live `Vec2`, set it with `new Vec2(x, y)`.
`space.clear()` frees everything. nape slows every body by default (`space.worldLinearDrag = 0.015`, `worldAngularDrag` too):
set both to 0, rolling friction is ours. A radial slope only moves a resting ball when it is stronger than friction.

- [ ] **Step 1: Write the failing behaviour tests**

```ts
// backend/src/shared/minigolf/simulate.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_PHYSICS as P } from './physics.js'
import { simulateShot } from './simulate.js'
import type { Hole } from './types.js'

// A long, empty lane: 400 wide, 4000 long
const lane: Hole = {
  id: 'lane', name: 'Lane', par: 2,
  outline: [[0, 0], [400, 0], [400, 4000], [0, 4000]],
  walls: [], bumpers: [], slopes: [],
  tee: [200, 3800], cup: { at: [200, 300], r: 54 },
}
const up = (power: number) => ({ dir: [0, -1] as const, power })
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])

describe('simulateShot', () => {
  it('rolls further with more power and stops where friction says', () => {
    const soft = simulateShot(lane, P, lane.tee, up(0.2))
    const v = 0.2 * P.maxSpeed
    expect(lane.tee[1] - soft.rest[1]).toBeCloseTo((v * v) / (2 * P.friction), -1)
    const hard = simulateShot(lane, P, lane.tee, up(0.4))
    expect(hard.rest[1]).toBeLessThan(soft.rest[1])
    expect(soft.holed).toBe(false)
  })

  it('starts the path at the ball and ends it at rest', () => {
    const r = simulateShot(lane, P, lane.tee, up(0.2))
    expect(r.path[0]).toEqual(lane.tee)
    expect(r.path.at(-1)).toEqual(r.rest)
  })

  it('banks off a rail at the mirrored angle', () => {
    // Heading up-right at 45°, hits the right rail, comes back up-left
    const r = simulateShot(lane, { ...P, wallRestitution: 1 }, [200, 3800], { dir: [Math.SQRT1_2, -Math.SQRT1_2], power: 0.5 })
    const hit = r.path.findIndex(p => p[0] > 400 - 21.35 - P.wallThickness / 2 - 2)
    expect(hit).toBeGreaterThan(0)
    const after = r.path[hit + 10]
    const at = r.path[hit]
    expect(after[0]).toBeLessThan(at[0]) // now moving left
    expect(at[1] - after[1]).toBeGreaterThan(0) // still moving up
    expect(Math.abs((at[0] - after[0]) - (at[1] - after[1]))).toBeLessThan(15) // about 45° again
  })

  it('never passes through a thin wall, even at full power', () => {
    const walled: Hole = { ...lane, walls: [{ points: [[0, 2000], [400, 2000]] }] }
    const r = simulateShot(walled, { ...P, maxSpeed: 40000 }, lane.tee, up(1))
    expect(r.path.every(p => p[1] > 2000)).toBe(true)
  })

  it('bends the path on a slope', () => {
    const sloped: Hole = { ...lane, slopes: [{ area: [[0, 1000], [400, 1000], [400, 3000], [0, 3000]], force: [300, 0] }] }
    const r = simulateShot(sloped, P, lane.tee, up(0.5))
    expect(r.rest[0]).toBeGreaterThan(220)
  })

  it('keeps rolling on a slope stronger than friction', () => {
    const steep: Hole = { ...lane, slopes: [{ area: [[0, 0], [400, 0], [400, 4000], [0, 4000]], force: [0, -2 * P.friction] }] }
    const r = simulateShot(steep, P, [200, 3000], up(0.01))
    expect(r.rest[1]).toBeLessThan(2000)
  })

  it('pushes away from a summit', () => {
    const summit: Hole = { ...lane, slopes: [{ area: lane.outline, radial: { center: [200, 2000], strength: 2 * P.friction } }] }
    const r = simulateShot(summit, P, [200, 2100], up(P.minPutt))
    expect(r.rest[1]).toBeGreaterThan(2100)
  })

  it('drops a slow ball into the cup and lets a fast one roll over', () => {
    const slow = Math.sqrt(2 * P.friction * (lane.tee[1] - lane.cup.at[1] - 20)) / P.maxSpeed
    const holed = simulateShot(lane, P, lane.tee, up(slow))
    expect(holed.holed).toBe(true)
    expect(holed.rest).toEqual(lane.cup.at)
    const fast = simulateShot(lane, P, [200, 600], up(0.9))
    expect(fast.holed).toBe(false)
  })

  it('kicks the ball off a bumper', () => {
    const bumped: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 40, restitution: 1, kick: 0 }] }
    const kicked: Hole = { ...lane, bumpers: [{ at: [200, 2500], r: 40, restitution: 1, kick: 1500 }] }
    const a = simulateShot(bumped, P, lane.tee, up(0.4))
    const b = simulateShot(kicked, P, lane.tee, up(0.4))
    expect(b.rest[1]).toBeGreaterThan(a.rest[1]) // bounced back further
  })

  it('always ends: a ball pinned in a corner stops at the time cap', () => {
    const r = simulateShot(lane, { ...P, friction: 0, maxTime: 2 }, [200, 200], { dir: [Math.SQRT1_2, Math.SQRT1_2], power: 0.3 })
    expect(r.path.length).toBeLessThanOrEqual(2 * 60 + 2)
  })

  it('gives the same result for the same input', () => {
    const a = simulateShot(lane, P, lane.tee, { dir: [0.3, -0.954], power: 0.7 })
    const b = simulateShot(lane, P, lane.tee, { dir: [0.3, -0.954], power: 0.7 })
    expect(b).toEqual(a)
    expect(dist(a.rest, a.path.at(-1)!)).toBe(0)
  })
})
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && npx vitest run src/shared/minigolf/simulate.test.ts`
Expected: FAIL, `./simulate.js` not found.

- [ ] **Step 3: Implement**

```ts
// backend/src/shared/minigolf/simulate.ts
// One putt on one hole, run to the end in a single call. nape-js resolves the contacts (rails,
// walls, bumpers); rolling friction, slopes, bumper kicks and the cup are ours, applied each step.
// Pure: a fresh Space per call, freed before returning, so the same input gives the same output.
import { Body, BodyType, Circle, Material, Polygon, Space, Vec2 } from '@newkrok/nape-js'
import { pointInPolygon } from './geometry.js'
import type { Physics } from './physics.js'
import { BALL_R, type Hole, type Pt, type Shot, type ShotResult } from './types.js'

/** nape takes the mean of both materials' elasticity; the ball has 0, so surfaces get double. */
const surface = (restitution: number) => new Material(2 * restitution, 0, 0, 1, 0)

/** A segment as a thin quad (convex), plus round caps so corners don't snag the ball. */
function addSegment(body: Body, a: Pt, b: Pt, thickness: number, material: Material): void {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return
  const nx = (-dy / len) * (thickness / 2)
  const ny = (dx / len) * (thickness / 2)
  body.shapes.add(
    new Polygon(
      [new Vec2(a[0] - nx, a[1] - ny), new Vec2(b[0] - nx, b[1] - ny), new Vec2(b[0] + nx, b[1] + ny), new Vec2(a[0] + nx, a[1] + ny)],
      material,
    ),
  )
}

function addPolyline(body: Body, points: readonly Pt[], closed: boolean, thickness: number, material: Material): void {
  const n = points.length
  for (let i = 0; i < (closed ? n : n - 1); i++) addSegment(body, points[i], points[(i + 1) % n], thickness, material)
  for (const p of points) body.shapes.add(new Circle(thickness / 2, new Vec2(p[0], p[1]), material))
}

function buildSpace(hole: Hole, physics: Physics): Space {
  const space = new Space(new Vec2(0, 0))
  space.deterministic = true
  const rails = new Body(BodyType.STATIC)
  addPolyline(rails, hole.outline, true, physics.wallThickness, surface(physics.wallRestitution))
  for (const w of hole.walls) addPolyline(rails, w.points, !!w.closed, physics.wallThickness, surface(w.restitution ?? physics.wallRestitution))
  for (const b of hole.bumpers) rails.shapes.add(new Circle(b.r, new Vec2(b.at[0], b.at[1]), surface(b.restitution ?? physics.bumperRestitution)))
  rails.space = space
  return space
}

/** The slopes' pull on a ball at p, mm/s². */
function slopeForce(hole: Hole, p: Pt): Pt {
  let fx = 0
  let fy = 0
  for (const s of hole.slopes) {
    if (!pointInPolygon(p, s.area)) continue
    if ('force' in s) {
      fx += s.force[0]
      fy += s.force[1]
    } else {
      const dx = p[0] - s.radial.center[0]
      const dy = p[1] - s.radial.center[1]
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 0) {
        fx += (dx / len) * s.radial.strength
        fy += (dy / len) * s.radial.strength
      }
    }
  }
  return [fx, fy]
}

/** Play `shot` from `ball` to the end: at rest, in the cup, or out of time. */
export function simulateShot(hole: Hole, physics: Physics, ball: Pt, shot: Shot): ShotResult {
  const space = buildSpace(hole, physics)
  const body = new Body(BodyType.DYNAMIC, new Vec2(ball[0], ball[1]))
  body.shapes.add(new Circle(BALL_R, undefined, new Material(0, 0, 0, 1, 0)))
  body.isBullet = true
  body.allowRotation = false
  body.space = space
  const speed0 = shot.power * physics.maxSpeed
  body.velocity = new Vec2(shot.dir[0] * speed0, shot.dir[1] * speed0)

  const dt = physics.step
  const sampleEvery = Math.max(1, Math.round(1 / 60 / dt))
  const maxSteps = Math.ceil(physics.maxTime / dt)
  const path: Pt[] = [ball]
  const touching = new Set<number>() // bumpers the ball is against, so each hit kicks once
  let holed = false

  for (let i = 1; i <= maxSteps; i++) {
    const pos: Pt = [body.position.x, body.position.y]
    let vx = body.velocity.x
    let vy = body.velocity.y
    let speed = Math.sqrt(vx * vx + vy * vy)

    const dc = Math.sqrt((pos[0] - hole.cup.at[0]) ** 2 + (pos[1] - hole.cup.at[1]) ** 2)
    if (dc < hole.cup.r && speed < physics.captureSpeed) {
      holed = true
      break
    }

    const [sx, sy] = slopeForce(hole, pos)
    const slope = Math.sqrt(sx * sx + sy * sy)
    if (speed < physics.restSpeed && slope <= physics.friction) break

    vx += sx * dt
    vy += sy * dt
    speed = Math.sqrt(vx * vx + vy * vy)
    if (speed > 0) {
      const slow = Math.min(speed, physics.friction * dt) / speed
      vx -= vx * slow
      vy -= vy * slow
    }
    body.velocity = new Vec2(vx, vy)
    space.step(dt, 10, 10)

    hole.bumpers.forEach((b, k) => {
      const dx = body.position.x - b.at[0]
      const dy = body.position.y - b.at[1]
      const d = Math.sqrt(dx * dx + dy * dy)
      const near = d < b.r + BALL_R + 1
      if (near && !touching.has(k) && b.kick && d > 0) {
        body.velocity = new Vec2(body.velocity.x + (dx / d) * b.kick, body.velocity.y + (dy / d) * b.kick)
      }
      if (near) touching.add(k)
      else touching.delete(k)
    })

    if (i % sampleEvery === 0) path.push([body.position.x, body.position.y])
  }

  const rest: Pt = holed ? hole.cup.at : [body.position.x, body.position.y]
  const last = path[path.length - 1]
  if (last[0] !== rest[0] || last[1] !== rest[1]) path.push(rest)
  space.clear()
  return { path, rest, holed }
}
```

- [ ] **Step 4: Run until it passes**

Run: `cd backend && npx vitest run src/shared/minigolf/simulate.test.ts`
Expected: PASS. If a feel-number test is off by a little (e.g. friction distance), fix the
implementation, not the tolerance; if a nape behaviour differs from the facts above, re-check it in a
scratch script and correct both the code and the facts block.

- [ ] **Step 5: Commit**

```bash
npm run format && git add backend/src/shared/minigolf/simulate.ts backend/src/shared/minigolf/simulate.test.ts
git commit -m "feat(minigolf): simulate a putt with nape-js"
```

---

### Task 4: the `test` course and golden shots

**Files:**

- Create: `backend/src/shared/minigolf/courses/test.ts`, `courses/index.ts`
- Test: `backend/src/shared/minigolf/courses/courses.test.ts` (with its `__snapshots__`)

**Interfaces:**

- Consumes: `Course`, `validateHole`, `simulateShot`, `DEFAULT_PHYSICS`
- Produces: `COURSES: readonly Course[]`, `getCourse(id: string): Course | undefined`

Holes are TypeScript files holding plain JSON-shaped data (`satisfies Course`): JSON pasted from the
bench is valid as-is, and the type checker catches a broken shape.

- [ ] **Step 1: Write the course**

```ts
// backend/src/shared/minigolf/courses/test.ts
// Test holes for the bench. Plain JSON-shaped data: paste from the bench's hole editor.
import type { Course } from '../types.js'

export const testCourse = {
  id: 'test',
  name: 'Test',
  holes: [
    {
      id: 'straight',
      name: 'Straight',
      par: 2,
      outline: [[0, 0], [500, 0], [500, 3000], [0, 3000]],
      walls: [],
      bumpers: [],
      slopes: [],
      tee: [250, 2750],
      cup: { at: [250, 300], r: 54 },
    },
    {
      id: 'dogleg',
      name: 'Dogleg',
      par: 3,
      // An L: tee bottom-left, cup top-right, bank off the corner
      outline: [[0, 2000], [1600, 2000], [1600, 0], [2500, 0], [2500, 900], [2200, 900], [2200, 2800], [0, 2800]],
      walls: [],
      bumpers: [],
      slopes: [{ area: [[700, 2000], [1300, 2000], [1300, 2800], [700, 2800]], force: [250, 0] }],
      tee: [300, 2500],
      cup: { at: [2150, 400], r: 54 },
    },
    {
      id: 'summit',
      name: 'Summit',
      par: 3,
      outline: [[0, 0], [1800, 0], [1800, 2600], [0, 2600]],
      walls: [{ points: [[600, 1700], [1200, 1700]] }],
      bumpers: [{ at: [450, 900], r: 60, kick: 600 }, { at: [1350, 900], r: 60, kick: 600 }],
      slopes: [{ area: [[600, 300], [1200, 300], [1200, 900], [600, 900]], radial: { center: [900, 600], strength: 1500 } }],
      tee: [900, 2350],
      cup: { at: [900, 600], r: 54 },
    },
  ],
} satisfies Course
```

```ts
// backend/src/shared/minigolf/courses/index.ts
import type { Course } from '../types.js'
import { testCourse } from './test.js'

export const COURSES: readonly Course[] = [testCourse]

export function getCourse(id: string): Course | undefined {
  return COURSES.find(c => c.id === id)
}
```

- [ ] **Step 2: Write the validation and golden tests**

```ts
// backend/src/shared/minigolf/courses/courses.test.ts
// Golden shots: if a nape, Node or physics change moves a ball, this fails. Changing the
// physics on purpose means updating the snapshot (`npx vitest -u`) in the same commit.
import { describe, it, expect } from 'vitest'
import { validateHole } from '../hole.js'
import { DEFAULT_PHYSICS } from '../physics.js'
import { simulateShot } from '../simulate.js'
import type { Shot } from '../types.js'
import { COURSES } from './index.js'

const SHOTS: Shot[] = [
  { dir: [0, -1], power: 0.3 },
  { dir: [0, -1], power: 0.9 },
  { dir: [0.6, -0.8], power: 0.6 },
  { dir: [-0.8, -0.6], power: 1 },
  { dir: [1, 0], power: 0.45 },
]

describe('courses', () => {
  for (const course of COURSES) {
    for (const hole of course.holes) {
      it(`${course.id}/${hole.id} is valid`, () => expect(validateHole(hole)).toEqual([]))
      it(`${course.id}/${hole.id} golden shots`, () => {
        const results = SHOTS.map(s => {
          const r = simulateShot(hole, DEFAULT_PHYSICS, hole.tee, s)
          return { rest: r.rest.map(n => Math.round(n * 1000) / 1000), holed: r.holed, samples: r.path.length }
        })
        expect(results).toMatchSnapshot()
      })
    }
  }
})
```

- [ ] **Step 3: Run once to write the snapshot, then again to see it stable**

Run: `cd backend && npx vitest run src/shared/minigolf/courses && npx vitest run src/shared/minigolf/courses`
Expected: first run writes `__snapshots__/courses.test.ts.snap`, second run PASS with no changes.
Open the snapshot and check no `rest` is outside its hole (that would be a tunnelling bug).

- [ ] **Step 4: Commit**

```bash
npm run format && git add backend/src/shared/minigolf/courses
git commit -m "feat(minigolf): add a test course with golden shots"
```

---

### Task 5: admin role

**Files:**

- Create: `backend/src/db/migrations/019_admin.sql`, `backend/src/auth/admin.ts`, `backend/src/auth/admin.test.ts`
- Modify: `backend/src/auth/index.ts` (plugin), `backend/src/db/schema.ts` (`UserTable`, `SessionTable` if it exists), `backend/src/db/users.ts` (`getAccount`), `backend/src/auth/seed.ts`, `schema/api-v1.yaml` (`Me.isAdmin`), `docker-compose.dev.yaml`, `docker-compose.e2e.yaml` (`ADMIN_EMAILS`), `DEVELOPMENT.md`
- Regenerate: `npm run gen:api` at the repo root
- Test: `backend/src/auth/admin.test.ts`, the existing `/api/me` tests

**Interfaces:**

- Produces:
  - `isAdmin(user: { role: string | null; email: string }, adminEmails?: readonly string[]): boolean` (admin role, or the email is in `ADMIN_EMAILS`, comma-separated, case-insensitive)
  - `requireAdmin` Fastify `preValidation` hook (after `requireAuth`; 403 `{ error: 'forbidden' }` for non-admins)
  - `Me.isAdmin: boolean` in the API and `CurrentUser.isAdmin` in the SPA

`ADMIN_EMAILS` exists so a deployment (the PR preview, production) can name its admins without
DB access; better-auth's `role` column stays the real record and is what the seed sets.

- [ ] **Step 1: Migration**

```sql
-- backend/src/db/migrations/019_admin.sql
-- better-auth's admin plugin: roles, bans, impersonation. camelCase like 002_auth.sql.
-- Design: docs/superpowers/specs/2026-10-09-minigolf-core-bench-design.md ("Backend: admin role")
ALTER TABLE "user"
  ADD COLUMN role TEXT,
  ADD COLUMN banned BOOLEAN DEFAULT false,
  ADD COLUMN "banReason" TEXT,
  ADD COLUMN "banExpires" TIMESTAMPTZ;
ALTER TABLE "session" ADD COLUMN "impersonatedBy" TEXT;
```

Add to `UserTable` in `schema.ts`:

```ts
  /** better-auth admin plugin (migration 019): 'admin' or 'user'/null. */
  role: ColumnType<string | null, string | null | undefined, string | null>
  banned: ColumnType<boolean | null, boolean | undefined, boolean>
  banReason: string | null
  banExpires: Date | null
```

and `impersonatedBy: string | null` to the session table type if `schema.ts` declares one.

- [ ] **Step 2: Failing tests for `isAdmin` and `requireAdmin`**

```ts
// backend/src/auth/admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/index.js', () => ({ db: {} }))
vi.mock('./session.js', () => ({ getAuthUser: vi.fn() }))
vi.mock('../db/users.js', () => ({ getRoleAndEmail: vi.fn() }))

const { isAdmin, requireAdmin } = await import('./admin.js')
const { getRoleAndEmail } = await import('../db/users.js')

beforeEach(() => vi.clearAllMocks())

describe('isAdmin', () => {
  it('trusts the admin role', () => expect(isAdmin({ role: 'admin', email: 'a@x' }, [])).toBe(true))
  it('trusts ADMIN_EMAILS, ignoring case', () => expect(isAdmin({ role: null, email: 'Boss@X.org' }, ['boss@x.org'])).toBe(true))
  it('refuses everyone else', () => expect(isAdmin({ role: 'user', email: 'a@x' }, ['b@x'])).toBe(false))
})

function run(req: any, reply: any): Promise<void> {
  return new Promise(resolve => {
    reply.send.mockImplementation(() => {
      resolve()
      return reply
    })
    requireAdmin(req, reply, () => resolve())
  })
}

describe('requireAdmin', () => {
  it('lets an admin through', async () => {
    vi.mocked(getRoleAndEmail).mockResolvedValue({ role: 'admin', email: 'a@x' })
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() } as any
    await run({ userId: 'u1' }, reply)
    expect(reply.code).not.toHaveBeenCalled()
  })
  it('answers 403 for anyone else', async () => {
    vi.mocked(getRoleAndEmail).mockResolvedValue({ role: null, email: 'a@x' })
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as any
    await run({ userId: 'u1' }, reply)
    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ error: 'forbidden' })
  })
})
```

Run: `cd backend && npx vitest run src/auth/admin.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

In `backend/src/db/users.ts`:

```ts
/** What decides whether someone is an admin (auth/admin.ts). */
export async function getRoleAndEmail(db: Kysely<Database>, userId: string): Promise<{ role: string | null; email: string } | undefined> {
  return db.selectFrom('user').select(['role', 'email']).where('id', '=', userId).executeTakeFirst()
}
```

and extend `getAccount` to select `role` and return `isAdmin: isAdmin({ role: row.role, email: row.email })`
(import `isAdmin` from `../auth/admin.js`; update the `Account` type).

```ts
// backend/src/auth/admin.ts
// Admins: better-auth's admin role, or an email in ADMIN_EMAILS (so a deployment can name its
// admins without touching the DB). Admin pages and APIs check here.
import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify'
import { db } from '../db/index.js'
import { getRoleAndEmail } from '../db/users.js'

const envAdmins = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

export function isAdmin(user: { role: string | null; email: string }, adminEmails: readonly string[] = envAdmins): boolean {
  return user.role === 'admin' || adminEmails.includes(user.email.toLowerCase())
}

/** After requireAuth: lets admins through, 403 for everyone else. */
export function requireAdmin(req: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction): void {
  getRoleAndEmail(db, req.userId)
    .then(user => {
      if (!user || !isAdmin(user)) {
        reply.code(403).send({ error: 'forbidden' })
        return
      }
      done()
    })
    .catch((err: unknown) => done(err instanceof Error ? err : new Error(String(err))))
}
```

In `backend/src/auth/index.ts`: `import { admin, openAPI } from 'better-auth/plugins'` and
`plugins: [openAPI({ disableDefaultReference: true }), admin()]`.

In `seed.ts`, after the admin user exists:
`await db.updateTable('user').set({ role: 'admin' }).where('id', '=', admin.id).execute()`.

In `schema/api-v1.yaml` `Me`: add `isAdmin` to `required` and
`isAdmin: { type: boolean, description: 'May open admin pages (the minigolf test bench)' }`.
Run `npm run gen:api` at the repo root.

Compose files: add `ADMIN_EMAILS: admin@dartcade.local` to the dev backend's `environment`, and
`ADMIN_EMAILS: e2e-admin@test.local` to the e2e backend's. In `DEVELOPMENT.md`, document
`ADMIN_EMAILS` next to the other backend env vars (and that `role = 'admin'` in the DB works too).

- [ ] **Step 4: Run tests and typecheck**

Run: `cd backend && npx vitest run src/auth src/api && npm run typecheck && npm run lint`
Expected: PASS (fix any `/api/me` test fixtures that now need `isAdmin`). If Postgres is up, run the
whole `npm test` so the migration is exercised.

- [ ] **Step 5: Commit**

```bash
npm run format && git add -A backend/src schema docker-compose.dev.yaml docker-compose.e2e.yaml DEVELOPMENT.md backend/frontend/src/lib/api
git commit -m "feat(auth): add an admin role with better-auth's admin plugin"
```

---

### Task 6: the bench page (milestone A)

**Files:**

- Create: `backend/frontend/src/lib/minigolf/bench.ts`, `lib/minigolf/animate.ts`, `lib/components/minigolf/HoleView.svelte`, `routes/MinigolfBench.svelte`
- Modify: `backend/frontend/src/App.svelte` (lazy route), `lib/components/AccountMenu.svelte` (admin link)
- Test: `backend/frontend/src/lib/__tests__/minigolfBench.test.ts`, `e2e/tests/minigolf-bench.spec.ts`

**Interfaces:**

- Consumes: `COURSES`, `Hole`, `Pt`, `ShotResult`, `shotFromDart`, `simulateShot`, `DEFAULT_PHYSICS` via `$shared/minigolf/...`; `DartBoard`'s `onBoardClick({ coords })`; `currentUser` (`isAdmin`)
- Produces:
  - `interface BenchState { ball: Pt; strokes: number; holed: boolean; rolling: boolean; history: Pt[] }`
  - `initBench(hole: Hole): BenchState`, `startShot(s): BenchState` (marks rolling, counts the stroke), `finishShot(s, result: ShotResult | null): BenchState`, `canShoot(s): boolean`, `resetBench(hole): BenchState`
  - `playPath(path: Pt[], onFrame: (p: Pt) => void, reducedMotion: boolean): Promise<void>` (60 Hz samples at real time)

- [ ] **Step 1: Failing tests for the bench state**

```ts
// backend/frontend/src/lib/__tests__/minigolfBench.test.ts
import { describe, it, expect } from 'vitest'
import { canShoot, finishShot, initBench, startShot } from '$lib/minigolf/bench'
import { testCourse } from '$shared/minigolf/courses/test'

const hole = testCourse.holes[0]

describe('bench', () => {
  it('starts on the tee with no strokes', () => {
    expect(initBench(hole)).toMatchObject({ ball: hole.tee, strokes: 0, holed: false, rolling: false })
  })
  it('counts a stroke and moves the ball when the shot ends', () => {
    let s = startShot(initBench(hole))
    expect(s.strokes).toBe(1)
    expect(canShoot(s)).toBe(false) // still rolling: further clicks are ignored
    s = finishShot(s, { path: [hole.tee, [250, 1000]], rest: [250, 1000], holed: false })
    expect(s).toMatchObject({ ball: [250, 1000], rolling: false, history: [hole.tee] })
    expect(canShoot(s)).toBe(true)
  })
  it('counts a miss without moving the ball', () => {
    const s = finishShot(startShot(initBench(hole)), null)
    expect(s).toMatchObject({ ball: hole.tee, strokes: 1, rolling: false })
  })
  it('takes no more shots once holed', () => {
    const s = finishShot(startShot(initBench(hole)), { path: [hole.cup.at], rest: hole.cup.at, holed: true })
    expect(s.holed).toBe(true)
    expect(canShoot(s)).toBe(false)
  })
})
```

Run: `cd backend/frontend && npx vitest run src/lib/__tests__/minigolfBench.test.ts` → FAIL.

- [ ] **Step 2: Implement `bench.ts` and `animate.ts`**

```ts
// backend/frontend/src/lib/minigolf/bench.ts
// The test bench's state: where the ball is, strokes, and whether a shot is still rolling.
import type { Hole, Pt, ShotResult } from '$shared/minigolf/types'

export interface BenchState {
  ball: Pt
  strokes: number
  holed: boolean
  rolling: boolean
  /** The ball before each stroke, for undo. */
  history: Pt[]
}

export const initBench = (hole: Hole): BenchState => ({ ball: hole.tee, strokes: 0, holed: false, rolling: false, history: [] })
export const resetBench = initBench
export const canShoot = (s: BenchState): boolean => !s.rolling && !s.holed

export function startShot(s: BenchState): BenchState {
  return { ...s, strokes: s.strokes + 1, rolling: true, history: [...s.history, s.ball] }
}

/** The shot's result, or null for a miss (the stroke counts, the ball stays). */
export function finishShot(s: BenchState, result: ShotResult | null): BenchState {
  if (!result) return { ...s, rolling: false }
  return { ...s, ball: result.rest, holed: result.holed, rolling: false }
}
```

```ts
// backend/frontend/src/lib/minigolf/animate.ts
import type { Pt } from '$shared/minigolf/types'

/** Plays a path sampled at 60 Hz in real time; with reduced motion, jumps to the end. */
export function playPath(path: Pt[], onFrame: (p: Pt) => void, reducedMotion: boolean): Promise<void> {
  if (reducedMotion || path.length < 2) {
    onFrame(path[path.length - 1])
    return Promise.resolve()
  }
  return new Promise(resolve => {
    const start = performance.now()
    const tick = (now: number) => {
      const i = Math.min(path.length - 1, Math.floor(((now - start) / 1000) * 60))
      onFrame(path[i])
      if (i === path.length - 1) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}
```

Run the test again → PASS.

- [ ] **Step 3: `HoleView.svelte`**

An SVG of the hole in the design's look (`project/Minigolf.dc.html`): dark ground, felt pattern
(`#2a7045`/`#2e784a` stripes rotated 35°), cream rails `#e9dfc4`, red bumpers `#d23b36`, slopes as a
translucent fill with an arrow along the force (radial: arrows outward), the tee box, the cup with its
flag (lime `#c6f24e`), and the ball (lime with a dark stroke).

```svelte
<!-- backend/frontend/src/lib/components/minigolf/HoleView.svelte -->
<script lang="ts">
  import { bounds } from '$shared/minigolf/geometry'
  import { BALL_R, type Hole, type Pt } from '$shared/minigolf/types'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'

  let { hole, ball, wallThickness = DEFAULT_PHYSICS.wallThickness }: { hole: Hole; ball: Pt; wallThickness?: number } = $props()

  const PAD = 80
  const box = $derived(bounds(hole.outline))
  const viewBox = $derived(`${box.minX - PAD} ${box.minY - PAD} ${box.maxX - box.minX + 2 * PAD} ${box.maxY - box.minY + 2 * PAD}`)
  const pts = (p: readonly Pt[]) => p.map(([x, y]) => `${x},${y}`).join(' ')
  const centroid = (p: readonly Pt[]): Pt => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
  function arrow(from: Pt, dir: Pt): string {
    const len = Math.hypot(dir[0], dir[1]) || 1
    const ux = (dir[0] / len) * 90, uy = (dir[1] / len) * 90
    return `M${from[0] - ux} ${from[1] - uy} L${from[0] + ux} ${from[1] + uy} M${from[0] + ux - uy * 0.4 - ux * 0.4} ${from[1] + uy + ux * 0.4 - uy * 0.4} L${from[0] + ux} ${from[1] + uy} L${from[0] + ux + uy * 0.4 - ux * 0.4} ${from[1] + uy - ux * 0.4 - uy * 0.4}`
  }
</script>

<svg {viewBox} class="block w-full h-full" role="img" aria-label="Hole {hole.name}, par {hole.par}" data-testid="hole-view">
  <defs>
    <pattern id="mg-felt" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="56" height="56" fill="#2a7045" /><rect width="28" height="56" fill="#2e784a" />
    </pattern>
  </defs>
  <polygon points={pts(hole.outline)} fill="url(#mg-felt)" stroke="#e9dfc4" stroke-width={wallThickness} stroke-linejoin="round" />
  {#each hole.slopes as s, i (i)}
    <polygon points={pts(s.area)} fill="#e9dfc4" fill-opacity="0.07" />
    {#if 'force' in s}
      <path d={arrow(centroid(s.area), s.force)} fill="none" stroke="#e9dfc4" stroke-opacity="0.35" stroke-width="12" stroke-linecap="round" />
    {:else}
      {#each [[1, 0], [0, 1], [-1, 0], [0, -1]] as d, k (k)}
        <path d={arrow([s.radial.center[0] + d[0] * 160, s.radial.center[1] + d[1] * 160], [d[0] * Math.sign(s.radial.strength), d[1] * Math.sign(s.radial.strength)])} fill="none" stroke="#e9dfc4" stroke-opacity="0.35" stroke-width="12" stroke-linecap="round" />
      {/each}
    {/if}
  {/each}
  {#each hole.walls as w, i (i)}
    {#if w.closed}
      <polygon points={pts(w.points)} fill="#e9dfc4" stroke="#e9dfc4" stroke-width={wallThickness} stroke-linejoin="round" />
    {:else}
      <polyline points={pts(w.points)} fill="none" stroke="#e9dfc4" stroke-width={wallThickness} stroke-linecap="round" stroke-linejoin="round" />
    {/if}
  {/each}
  {#each hole.bumpers as b, i (i)}
    <circle cx={b.at[0]} cy={b.at[1]} r={b.r} fill="#d23b36" stroke="#6e1b18" stroke-width="6" />
  {/each}
  <rect x={hole.tee[0] - 70} y={hole.tee[1] - 70} width="140" height="140" rx="14" fill="#1f5134" stroke="#e9dfc4" stroke-opacity="0.35" stroke-dasharray="8 8" />
  <circle cx={hole.cup.at[0]} cy={hole.cup.at[1]} r={hole.cup.r} fill="#050604" />
  <line x1={hole.cup.at[0]} y1={hole.cup.at[1]} x2={hole.cup.at[0]} y2={hole.cup.at[1] - 220} stroke="#efeee6" stroke-width="8" stroke-linecap="round" />
  <path d="M{hole.cup.at[0]} {hole.cup.at[1] - 220} l110 34 l-110 34 z" fill="#c6f24e" stroke="#0a0b09" stroke-width="4" />
  <circle cx={ball[0]} cy={ball[1]} r={BALL_R} fill="#c6f24e" stroke="#0a0b09" stroke-width="5" data-testid="ball" />
</svg>
```

- [ ] **Step 4: `MinigolfBench.svelte` and the route**

```svelte
<!-- backend/frontend/src/routes/MinigolfBench.svelte -->
<!-- Admin test bench: putt on a hole by clicking the dartboard. Runs the shared core locally. -->
<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { currentUser } from '$lib/auth'
  import DartBoard from '$lib/components/DartBoard.svelte'
  import HoleView from '$lib/components/minigolf/HoleView.svelte'
  import { canShoot, finishShot, initBench, startShot, type BenchState } from '$lib/minigolf/bench'
  import { playPath } from '$lib/minigolf/animate'
  import { COURSES } from '$shared/minigolf/courses/index'
  import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
  import { shotFromDart } from '$shared/minigolf/shot'
  import { simulateShot } from '$shared/minigolf/simulate'
  import type { Pt } from '$shared/minigolf/types'

  // Not an admin (or signed out): nothing to see here
  $effect(() => {
    if ($currentUser && !$currentUser.isAdmin) void push('/')
  })

  let courseId = $state(COURSES[0].id)
  let holeIdx = $state(0)
  const course = $derived(COURSES.find(c => c.id === courseId) ?? COURSES[0])
  const hole = $derived(course.holes[Math.min(holeIdx, course.holes.length - 1)])
  let physics = $state({ ...DEFAULT_PHYSICS })
  let bench = $state<BenchState>(initBench(COURSES[0].holes[0]))
  let shown = $state<Pt>(COURSES[0].holes[0].tee)

  function pickHole(): void {
    bench = initBench(hole)
    shown = hole.tee
  }

  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  async function shoot(coords: { x: number; y: number }): Promise<void> {
    if (!canShoot(bench)) return
    const shot = shotFromDart(coords, bench.ball, hole.cup.at, physics)
    bench = startShot(bench)
    const result = shot ? simulateShot(hole, physics, bench.ball, shot) : null
    if (result) await playPath(result.path, p => (shown = p), reducedMotion())
    bench = finishShot(bench, result)
    shown = bench.ball
  }
</script>

{#if $currentUser?.isAdmin}
  <main class="flex flex-col gap-4 p-6 h-full min-h-0">
    <header class="flex flex-wrap items-center gap-4">
      <h1 class="m-0 font-display text-[32px] uppercase">Minigolf bench</h1>
      <label class="flex items-center gap-2">Course
        <select bind:value={courseId} onchange={() => { holeIdx = 0; pickHole() }} class="bg-surface-2 rounded-lg px-2 py-1">
          {#each COURSES as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </select>
      </label>
      <label class="flex items-center gap-2">Hole
        <select bind:value={holeIdx} onchange={pickHole} class="bg-surface-2 rounded-lg px-2 py-1">
          {#each course.holes as h, i (h.id)}<option value={i}>{i + 1}. {h.name} (par {h.par})</option>{/each}
        </select>
      </label>
      <span class="ml-auto text-[18px]" data-testid="strokes">
        {#if bench.holed}Holed in {bench.strokes}{:else}Strokes {bench.strokes}{/if}
      </span>
      <button type="button" onclick={pickHole} class="rounded-lg px-3 py-1 bg-surface-2 hover:bg-surface-hover">Reset to tee</button>
    </header>
    <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 flex-1 min-h-0">
      <div class="min-h-0"><HoleView {hole} ball={shown} wallThickness={physics.wallThickness} /></div>
      <div class="min-h-0 flex items-center justify-center">
        <DartBoard onBoardClick={hit => void shoot(hit.coords)} />
      </div>
    </div>
  </main>
{/if}
```

Adjust class names to the project's Tailwind tokens if any above don't exist (check `app.css`).

In `App.svelte`, lazy-load it like match details, so nape-js stays out of the main bundle:

```ts
  const loadMinigolfBench = Object.assign(() => import('./routes/MinigolfBench.svelte').catch(() => ({ default: RouteLoadFailed })), {
    loading: RouteLoading,
  })
```

and the route `'/admin/minigolf': wrap({ asyncComponent: loadMinigolfBench }),`.

In `AccountMenu.svelte`, above Settings, for admins only (icon `Flag` from `@lucide/svelte`):

```svelte
      {#if $currentUser?.isAdmin}
        <a href="#/admin/minigolf" role="menuitem" onclick={closeMenu} class={ITEM}>
          <Flag size={18} strokeWidth={1.8} />
          Minigolf bench
        </a>
      {/if}
```

(use however the menu already reads the current user; import `currentUser` from `$lib/auth` if it doesn't).

- [ ] **Step 5: e2e smoke test**

```ts
// e2e/tests/minigolf-bench.spec.ts
import { test, expect } from '../fixtures/auth.js'

test('a non-admin is sent away from the bench', async ({ authedPage: page }) => {
  await page.goto('/#/admin/minigolf')
  await page.waitForURL(url => !url.hash.startsWith('#/admin'))
  await expect(page.getByTestId('hole-view')).toHaveCount(0)
})

test('an admin putts once on the bench', async ({ page }) => {
  const email = 'e2e-admin@test.local' // ADMIN_EMAILS in docker-compose.e2e.yaml
  const password = 'TestPass1!'
  const headers = { Origin: 'http://localhost:5174' }
  await page.request.post('http://localhost:5174/api/auth/sign-up/email', { data: { name: 'e2eadmin', email, password }, headers })
  const signIn = await page.request.post('http://localhost:5174/api/auth/sign-in/email', { data: { email, password }, headers })
  expect(signIn.ok()).toBeTruthy()

  await page.goto('/#/admin/minigolf')
  await expect(page.getByTestId('hole-view')).toBeVisible()
  await expect(page.getByTestId('strokes')).toHaveText('Strokes 0')
  const board = page.locator('svg').filter({ has: page.locator('text=20') }).first()
  const box = (await board.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3) // in the 20: putt up
  await expect(page.getByTestId('strokes')).toHaveText(/Strokes 1|Holed in 1/, { timeout: 15_000 })
})
```

(The sign-up may 4xx when the user exists from an earlier run; only the sign-in must succeed. Pick
the board locator the same way other e2e tests do if one exists.)

- [ ] **Step 6: Verify**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`, then the e2e suite per
`DEVELOPMENT.md` (`cd e2e && npx playwright test minigolf-bench`).
Then run the dev stack (`scripts/dev.sh`), sign in as `admin@dartcade.local`, open the bench, putt on
all three holes, and check: the ball banks, stops, drops in, slopes bend it, the stroke counter counts
misses (click outside the double ring).

- [ ] **Step 7: Commit, push, open a draft PR (preview)**

```bash
cd /home/wedenigc/Dev/dartcade && npm run format
git add -A backend/frontend/src e2e/tests/minigolf-bench.spec.ts
git commit -m "feat(minigolf): add the admin test bench"
git push -u origin feat/minigolf
gh pr create --draft --title "feat(minigolf): core and admin test bench" --body "..."
```

The PR's sprout preview deploys the branch. The preview needs `ADMIN_EMAILS` in its app env
(`SPROUT_APP_ENV`) to show the bench to anyone; tell the user which email to add.

**Checkpoint: the user tests milestone A on the preview before milestone B.**

---

# Milestone B: quality of life

### Task 7: undo and place ball

**Files:**

- Modify: `lib/minigolf/bench.ts`, `routes/MinigolfBench.svelte`, `lib/components/minigolf/HoleView.svelte`
- Test: `lib/__tests__/minigolfBench.test.ts`

**Interfaces:**

- Produces: `undoShot(s: BenchState): BenchState` (back to the ball before the last stroke, one stroke less, not holed; no-op with empty history or while rolling), `placeBall(s: BenchState, at: Pt): BenchState` (moves the ball, keeps strokes, clears holed); `HoleView` prop `onPlace?: (at: Pt) => void` (pointer drag on the ball, converted to course coords via `svg.getScreenCTM().inverse()`)

- [ ] **Step 1: Failing tests**

```ts
  it('undoes the last stroke', () => {
    let s = finishShot(startShot(initBench(hole)), { path: [], rest: [250, 1000], holed: false })
    s = finishShot(startShot(s), { path: [], rest: hole.cup.at, holed: true })
    s = undoShot(s)
    expect(s).toMatchObject({ ball: [250, 1000], strokes: 1, holed: false, history: [hole.tee] })
    expect(undoShot(undoShot(undoShot(s)))).toMatchObject({ ball: hole.tee, strokes: 0 })
  })
  it('places the ball anywhere without a stroke', () => {
    const s = placeBall(initBench(hole), [100, 100])
    expect(s).toMatchObject({ ball: [100, 100], strokes: 0, holed: false })
  })
```

(add `undoShot, placeBall` to the import). Run → FAIL.

- [ ] **Step 2: Implement**

```ts
export function undoShot(s: BenchState): BenchState {
  if (s.rolling || s.history.length === 0) return s
  return { ...s, ball: s.history[s.history.length - 1], strokes: s.strokes - 1, holed: false, history: s.history.slice(0, -1) }
}

export function placeBall(s: BenchState, at: Pt): BenchState {
  return s.rolling ? s : { ...s, ball: at, holed: false }
}
```

Run → PASS.

- [ ] **Step 3: Wire up**

`HoleView`: when `onPlace` is set, the ball gets `cursor: grab`; `pointerdown` on the ball captures the
pointer, `pointermove` converts `(clientX, clientY)` with `svg.getScreenCTM()!.inverse()` and reports
the point via `onPlace`. The bench header gets an **Undo** button (disabled when `history` is empty or
rolling) and a **Place ball** toggle that passes `onPlace` while on; `onPlace` does
`bench = placeBall(bench, at); shown = at`.

- [ ] **Step 4: Verify and commit**

Run: `cd backend/frontend && npm test && npm run typecheck && npm run lint`; try undo and dragging the ball in the dev stack.

```bash
npm run format && git add -A backend/frontend/src && git commit -m "feat(minigolf): undo and place the ball on the bench"
```

---

### Task 8: physics panel

**Files:**

- Create: `lib/components/minigolf/PhysicsPanel.svelte`
- Modify: `routes/MinigolfBench.svelte`

**Interfaces:**

- Consumes: `Physics`, `DEFAULT_PHYSICS`
- Produces: `<PhysicsPanel bind:physics />`: a slider (with number readout) per number field, a select for `powerCurve`, **Reset**, and **Copy as JSON** (`navigator.clipboard.writeText(JSON.stringify(physics, null, 2))`, then "Copied" for 2 s). `step` is shown but read-only (golden shots depend on it).

- [ ] **Step 1: Implement**

Ranges: `friction` 200–4000 (step 50), `restSpeed` 1–50, `captureSpeed` 200–3000 (step 50),
`maxRoll` 1000–10000 (step 100), `minPutt` 0–0.3 (step 0.01), `wallRestitution` / `bumperRestitution`
0–1 (step 0.05), `maxTime` 5–60, `wallThickness` 5–60. Labels in plain words ("Rolling friction
(mm/s²)", …). Mark fields that differ from `DEFAULT_PHYSICS` (e.g. the value in lime).

```svelte
<!-- backend/frontend/src/lib/components/minigolf/PhysicsPanel.svelte -->
<script lang="ts">
  import { DEFAULT_PHYSICS, type Physics } from '$shared/minigolf/physics'

  let { physics = $bindable() }: { physics: Physics } = $props()

  type NumKey = Exclude<keyof Physics, 'powerCurve' | 'step'>
  const FIELDS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
    { key: 'friction', label: 'Rolling friction (mm/s²)', min: 200, max: 4000, step: 50 },
    { key: 'maxRoll', label: 'Full-power roll (mm)', min: 1000, max: 10000, step: 100 },
    { key: 'minPutt', label: 'Softest putt (power)', min: 0, max: 0.3, step: 0.01 },
    { key: 'captureSpeed', label: 'Cup capture speed (mm/s)', min: 200, max: 3000, step: 50 },
    { key: 'restSpeed', label: 'Rest speed (mm/s)', min: 1, max: 50, step: 1 },
    { key: 'wallRestitution', label: 'Rail bounce', min: 0, max: 1, step: 0.05 },
    { key: 'bumperRestitution', label: 'Bumper bounce', min: 0, max: 1, step: 0.05 },
    { key: 'wallThickness', label: 'Rail thickness (mm)', min: 5, max: 60, step: 1 },
    { key: 'maxTime', label: 'Time cap (s)', min: 5, max: 60, step: 1 },
  ]
  let copied = $state(false)
  async function copy(): Promise<void> {
    await navigator.clipboard.writeText(JSON.stringify(physics, null, 2))
    copied = true
    setTimeout(() => (copied = false), 2000)
  }
</script>

<section class="flex flex-col gap-3 p-4 rounded-2xl bg-surface-2" aria-label="Physics">
  {#each FIELDS as f (f.key)}
    <label class="grid grid-cols-[1fr_auto] gap-x-3 text-[14px]">
      <span>{f.label}</span>
      <span class:text-accent={physics[f.key] !== DEFAULT_PHYSICS[f.key]} class="tabular-nums">{physics[f.key]}</span>
      <input type="range" class="col-span-2" min={f.min} max={f.max} step={f.step} bind:value={physics[f.key]} />
    </label>
  {/each}
  <label class="flex items-center justify-between text-[14px]">Power curve
    <select bind:value={physics.powerCurve} class="bg-surface-3 rounded-lg px-2 py-1">
      <option value="linear">Linear</option><option value="ease-in">Ease in</option>
    </select>
  </label>
  <div class="flex gap-2">
    <button type="button" onclick={() => (physics = { ...DEFAULT_PHYSICS })} class="rounded-lg px-3 py-1 bg-surface-3">Reset</button>
    <button type="button" onclick={() => void copy()} class="rounded-lg px-3 py-1 bg-surface-3">{copied ? 'Copied' : 'Copy as JSON'}</button>
  </div>
</section>
```

In the bench, put it in a collapsible column next to the dartboard: `<PhysicsPanel bind:physics />`.

- [ ] **Step 2: Verify and commit**

Run `npm run typecheck && npm run lint` in `backend/frontend`; in the dev stack, raise friction and see shots shorten.

```bash
npm run format && git add -A backend/frontend/src && git commit -m "feat(minigolf): tune physics live on the bench"
```

---

### Task 9: debug overlay and preview line

**Files:**

- Modify: `lib/components/minigolf/HoleView.svelte`, `routes/MinigolfBench.svelte`, `lib/components/DartBoard.svelte` only if it lacks a hover callback

**Interfaces:**

- Consumes: `shotFromDart`, `ShotResult`
- Produces: `HoleView` props `debug?: boolean`, `lastPath?: Pt[] | null`, `preview?: { from: Pt; dir: Pt; power: number } | null`

- [ ] **Step 1: Overlay**

With `debug`: the cup's capture circle (dashed, radius `cup.r`), each wall segment's normal as a short
tick at its midpoint, the slope areas outlined, and `lastPath` as a thin lime polyline with a dot per
sample. The bench keeps the last shot's path and has a **Debug** toggle.

- [ ] **Step 2: Preview line**

The bench passes a hover handler to the dartboard. `DartBoard.svelte` has `onBoardClick` but no hover:
add `onBoardHover?: (coords: { x: number; y: number } | null) => void`, called from a `pointermove`
on the board svg with `toBoard(e)` and with `null` on `pointerleave`. The bench turns the hover coords
into `shotFromDart(...)` and passes `preview` (null for a miss); `HoleView` draws a dashed lime line
from the ball along `dir`, `power × 600` mm long, with the power as a percentage at its tip.

- [ ] **Step 3: Verify and commit**

Run `npm test && npm run typecheck && npm run lint` in `backend/frontend` (the existing `DartBoard`
tests must still pass). Check the overlay and preview in the dev stack.

```bash
npm run format && git add -A backend/frontend/src && git commit -m "feat(minigolf): add a debug overlay and shot preview to the bench"
```

---

### Task 10: hole JSON editor

**Files:**

- Create: `lib/components/minigolf/HoleEditor.svelte`
- Modify: `routes/MinigolfBench.svelte`
- Test: `lib/__tests__/minigolfBench.test.ts` (`parseHole`)

**Interfaces:**

- Produces: `parseHole(text: string): { hole: Hole } | { errors: string[] }` in `lib/minigolf/bench.ts` (JSON.parse error → `['invalid JSON: <message>']`; missing arrays default to `[]` for `walls`/`bumpers`/`slopes`; then `validateHole`); `<HoleEditor hole onChange={(h: Hole) => void} />`

- [ ] **Step 1: Failing tests**

```ts
  it('parses an edited hole', () => {
    const r = parseHole(JSON.stringify(hole))
    expect(r).toEqual({ hole })
  })
  it('reports bad JSON and invalid holes', () => {
    expect(parseHole('{')).toMatchObject({ errors: [expect.stringMatching(/^invalid JSON/)] })
    expect(parseHole(JSON.stringify({ ...hole, tee: [9999, 9999] }))).toEqual({ errors: ['tee is outside the outline'] })
  })
```

Run → FAIL.

- [ ] **Step 2: Implement**

```ts
export function parseHole(text: string): { hole: Hole } | { errors: string[] } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { errors: [`invalid JSON: ${(e as Error).message}`] }
  }
  if (typeof raw !== 'object' || raw === null) return { errors: ['a hole is a JSON object'] }
  const h = { walls: [], bumpers: [], slopes: [], ...raw } as Hole
  for (const key of ['id', 'name', 'par', 'outline', 'tee', 'cup'] as const) {
    if (!(key in h)) return { errors: [`missing ${key}`] }
  }
  const errors = validateHole(h)
  return errors.length ? { errors } : { hole: h }
}
```

Run → PASS.

`HoleEditor.svelte`: a monospace `<textarea>` initialised with `JSON.stringify(hole, null, 2)`;
on input (debounced 300 ms) runs `parseHole`; valid → `onChange(hole)`, invalid → shows the errors under
it (the bench keeps the last good hole). **Copy** writes the text to the clipboard. Switching holes in
the picker replaces the text. The bench uses the edited hole for rendering and shooting, and **Reset
to tee** keeps the edit; picking the hole again in the picker drops it.

- [ ] **Step 3: Verify and commit**

Run `npm test && npm run typecheck && npm run lint` in `backend/frontend`; in the dev stack, move the
cup in the editor and putt at it.

```bash
npm run format && git add -A backend/frontend/src && git commit -m "feat(minigolf): edit holes as JSON on the bench"
```

---

### Task 11: finish

- [ ] Run everything: `mise run test` (or each part per `AGENTS.md`), both typechecks, both lints, `npm run format:check`.
- [ ] Push; the draft PR's preview updates. Mark ready for review when the user is happy.
