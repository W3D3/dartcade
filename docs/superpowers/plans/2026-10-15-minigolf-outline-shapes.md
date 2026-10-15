# Minigolf Outline Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hole outlines get live circles and curved (Bézier) edges in the editor, baked into the plain polygon outline that physics and games already play.

**Architecture:** A new optional `Hole.shape` (corners, per-edge curves, circles) is the editor's source. A pure shared `bakeOutline(shape)` flattens curves, turns circles into 48-gons and unions everything with `polyclip-ts`. The editor rebakes on every shape edit and saves `shape` and `outline` together. Nothing that plays a hole changes.

**Tech Stack:** TypeScript, zod, `polyclip-ts` (new), Svelte 5, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-minigolf-outline-shapes-design.md`

## Global Constraints

- `outline: Pt[]` stays the only thing physics, ground, checks, bot, views and games read.
- `shape?: { corners: Pt[]; curves: (null | { c1: Pt; c2: Pt })[]; circles: { center: Pt; r: number }[] }`; `curves.length === corners.length`; curve `i` runs from corner `i` to corner `i + 1` (wrapping).
- Circles bake to 48 sides, first corner at angle 0. Curves flatten to within 2 mm of the true curve, at most 64 pieces per edge. Corners closer than 1 mm merge.
- A bake that yields an inner hole or a piece that doesn't touch the rest is refused; the tool keeps the last valid shape and shows why ("The circle must touch the course").
- Mismatch on load (`bakeOutline(shape)` ≠ `outline` within 1 mm): drop `shape`, edit plain corners, notice "This hole's circles were changed elsewhere and are now plain corners."
- Circle tool: centre snaps to the 50 mm grid, radius to 10 mm; Shift draws freely. Curve toggle key `K`; new control points a third along the edge, pushed out by a sixth of its length; handles snap to 50 mm.
- `polyclip-ts` pinned to the same exact version in `backend/package.json` and `backend/frontend/package.json`, added to the frontend's tsconfig `paths` and vite `dedupe` like nape-js. Say why in the commit.
- Physics on a keyhole hole stays within the 150 ms shot budget (`npm run test:perf`).
- Commits unsigned (`git -c commit.gpgsign=false commit`), conventional, ending with the session's attribution lines. Never push.
- Branch `feat/minigolf-outline-shapes` (exists, holds the spec).

## Review Focus

1. A circle dragged so it only just touches the lane (tangent): bake must give one connected outline or refuse cleanly, never a pinched outline that crashes physics. Test in Task 2.
2. Two circles overlapping each other and the lane at the cup: one smooth outline with no slivers. Test in Task 2.
3. Removing the corner next to a curved edge: `curves` must stay the same length as `corners`, and the neighbour's curve survives or straightens. Never an off-by-one. Test in Task 3.
4. Undo after a refused circle drag must return to the last valid hole, not to the invalid preview. Test in Task 3 (ops refuse, history never sees the invalid state).
5. An existing hole without `shape` must keep working unchanged in the editor, the game and the bench, and gets a `shape` only on its first circle or curve. Test in Task 3 (`ensureShape`) and Task 5 (e2e on the seeded course).

---

## File Structure

| File                                                                                                                 | Responsibility                                                     |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `backend/src/shared/minigolf/types.ts`                                                                               | `Shape`, `Curve`, `Circle` types; `Hole.shape?`                    |
| `backend/src/shared/minigolf/holeSchema.ts`, `hole.ts`                                                               | parse and validate `shape`                                         |
| `schema/api-v1.yaml`                                                                                                 | `MinigolfHole.shape`                                               |
| `backend/src/shared/minigolf/bake.ts` (new)                                                                          | `flattenCurve`, `circlePolygon`, `bakeOutline`, `outlinesMatch`    |
| `backend/frontend/src/lib/minigolf/editor/shapeOps.ts` (new)                                                         | pure shape edits that rebake the hole                              |
| `backend/frontend/src/lib/minigolf/editor/tools.ts`, `ops.ts`                                                        | Circle tool, `hitTest`/`elementsOf` for circles and control points |
| `backend/frontend/src/lib/components/minigolf/editor/EditorCanvas.svelte`, `Properties.svelte`, `ElementList.svelte` | handles, guides, fields                                            |
| `backend/frontend/src/routes/MinigolfHoleEditor.svelte`                                                              | mismatch rule on load, notice                                      |
| `backend/src/shared/minigolf/checks.ts`                                                                              | `ElementRef` kind `'circle'`                                       |

---

### Task 1: The `shape` field end to end

**Files:**

- Modify: `backend/src/shared/minigolf/types.ts`, `holeSchema.ts`, `hole.ts` (`validateHole`), `checks.ts` (`ElementRef.kind` gains `'circle'`; `elementFor` maps `circle N` messages), `schema/api-v1.yaml` (`MinigolfHole.shape`); `npm run gen:api`
- Test: `backend/src/shared/minigolf/hole.test.ts`, `backend/src/api/minigolfCourses.test.ts`

**Interfaces:**

- Produces: `export type Curve = { c1: Pt; c2: Pt }`, `export interface Circle { center: Pt; r: number }`, `export interface Shape { corners: Pt[]; curves: (Curve | null)[]; circles: Circle[] }`, `Hole.shape?: Shape`. `validateHole` messages: `shape curves must match its corners`, `circle N radius must be positive`, `circle N must have finite numbers`.

- [ ] **Step 1: Failing tests.** `hole.test.ts`: a hole with `shape: { corners: ok.outline, curves: [null], circles: [] }` (wrong length) → contains `'shape curves must match its corners'`; a circle with `r: 0` → `'circle 1 radius must be positive'`; a valid shape → no shape errors. `minigolfCourses.test.ts`: an admin PATCHes a hole with a `shape`; GET returns it unchanged (round-trip).
- [ ] **Step 2: Run** `cd backend && npx vitest run src/shared/minigolf/hole.test.ts` and the API test with `TEST_DATABASE_URL` — FAIL.
- [ ] **Step 3: Implement.** Types; zod in `holeSchema` (`shape: z.object({ corners: z.array(pt), curves: z.array(z.object({ c1: pt, c2: pt }).nullable()), circles: z.array(z.object({ center: pt, r: z.number() })) }).optional()`); `validateHole` checks; YAML `shape` (optional object; `curves` items `anyOf: [{ $ref: MinigolfCurve }, { type: string, nullable: true, enum: [null] }]` — the 3.0 nullable-$ref form the spec already uses); `npm run gen:api` (it lints the spec first).
- [ ] **Step 4: Run** the tests, `npm run typecheck` in backend and backend/frontend, `npm run lint:api` — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): give a hole an optional editable shape`

### Task 2: Baking a shape into an outline

**Files:**

- Create: `backend/src/shared/minigolf/bake.ts`, `bake.test.ts`
- Modify: `backend/package.json`, `backend/frontend/package.json` (add `polyclip-ts`, same exact version), `backend/frontend/tsconfig.json` (`paths`), `backend/frontend/vite.config.ts` (`dedupe`), `backend/src/shared/minigolf/3d/physics3d.perf.test.ts` (or the file `npm run test:perf` runs: add a keyhole hole)

**Interfaces:**

- Consumes: `Shape`, `Pt` (Task 1).
- Produces:
  - `flattenCurve(a: Pt, c: Curve, b: Pt, tolerance = 2, maxPieces = 64): Pt[]` — points after `a` up to and including `b`.
  - `circlePolygon(c: Circle, sides = 48): Pt[]`.
  - `bakeOutline(shape: Shape): { ok: true; outline: Pt[] } | { ok: false; reason: string }` — reasons: `'The circle must touch the course'`, `'The shape can't have a hole in the middle'`.
  - `outlinesMatch(a: Pt[], b: Pt[], tol = 1): boolean` — same corner count and each corner within `tol` (allowing a rotated start).

- [ ] **Step 1: Add the dependency.** `npm view polyclip-ts version`; add that exact version to both package.json files (`npm install --save-exact` in each), then `paths`/`dedupe` like `@newkrok/nape-js`. Revert `backend/package-lock.json` churn only if it isn't from this install.
- [ ] **Step 2: Failing tests** in `bake.test.ts`:
  - straight-only shape, no circles → outline equals corners (after 1 mm merge);
  - lane `[[0,0],[600,0],[600,2000],[0,2000]]` + circle `{ center: [300, 2000], r: 450 }` → `ok`, every corner of the lane's bottom half and every circle point outside the lane are inside or on the result, area within 1% of `area(lane) + area(circle) − area(overlap)` (overlap computed numerically by sampling a 10 mm grid);
  - a circle far from the lane → `{ ok: false, reason: 'The circle must touch the course' }`;
  - four circles in a ring with an empty middle, no corners covering it → `'The shape can't have a hole in the middle'`;
  - tangent case: circle `{ center: [300, 2450], r: 450 }` touching the lane's end at one point → either `ok` with one ring or refused with the touch message, never two rings (Review Focus 1);
  - two overlapping circles at the cup → one ring, no two corners closer than 1 mm (Review Focus 2);
  - `flattenCurve`: every returned point lies within 2 mm of the exact cubic at its parameter; a straight-line curve (controls on the chord) returns few points; never more than 64;
  - determinism: baking the same shape twice gives identical arrays.
- [ ] **Step 3: Run** `cd backend && npx vitest run src/shared/minigolf/bake.test.ts` — FAIL.
- [ ] **Step 4: Implement.** `flattenCurve` by recursive midpoint subdivision until the control points' distance to the chord ≤ tolerance (or depth cap); `circlePolygon` at angles `2πk/48`; `bakeOutline`: build the corners' ring (flattening curved edges), each circle's ring, `union([ring], ...circles.map(c => [circlePolygon(c)]))` from `polyclip-ts`; result `MultiPolygon` → refuse if `> 1` polygon (touch message) or the polygon has `> 1` ring (hole message); drop the closing duplicate point; merge consecutive corners < 1 mm apart; keep the result's winding consistent with the existing outlines (check `testCourse` orientation and reverse if needed).
- [ ] **Step 5: Run** the tests — PASS. Add a keyhole hole (the lane + circle above, cup inside the circle, tee in the lane) to the perf test and run `npm run test:perf` alone — PASS within budget.
- [ ] **Step 6: Commit** — `feat(minigolf): bake circles and curves into a hole outline`

### Task 3: Shape editing operations

**Files:**

- Create: `backend/frontend/src/lib/minigolf/editor/shapeOps.ts`, `backend/frontend/src/lib/__tests__/minigolfShapeOps.test.ts`
- Modify: `backend/frontend/src/lib/minigolf/editor/ops.ts` (`moveCorner`/`addCorner`/`removeCorner`, `moveElement`, `removeElement`, `elementsOf`, `hitTest` delegate to shape ops when `h.shape` exists)

**Interfaces:**

- Consumes: `bakeOutline`, `outlinesMatch` (Task 2), `Shape` (Task 1), presets `GRID`.
- Produces (all return `{ ok: true; hole: Hole } | { ok: false; reason: string }`, never mutating):
  - `ensureShape(h): Shape` — `h.shape` or `{ corners: h.outline, curves: h.outline.map(() => null), circles: [] }`.
  - `withShape(h, shape)` — bakes; on success `{ ...h, shape, outline }`.
  - `addCircle(h, center, r)`, `moveCircle(h, i, center)`, `resizeCircle(h, i, r)`, `removeCircle(h, i)`.
  - `curveEdge(h, i)` (controls a third along, pushed outward by a sixth of the edge length, outward = away from the polygon's centroid side), `straightenEdge(h, i)`, `moveControl(h, i, which: 'c1' | 'c2', p)`.
  - `moveShapeCorner(h, i, p)` (moves `c2` of edge `i-1` and `c1` of edge `i` by the same delta), `addShapeCorner(h, afterIndex)` (splits the edge; a curved edge is split at t = 0.5 with de Casteljau so the shape is unchanged), `removeShapeCorner(h, i)` (refuses below 3; merges edges `i-1` and `i` into one straight edge).
  - `loadShape(h): { hole: Hole; dropped: boolean }` — the mismatch rule (drops `shape` when `bakeOutline(shape)` fails or doesn't match `outline`).
  - `ElementRef` `{ kind: 'circle', index }`; `elementsOf` lists `Circle 1 — r 450 mm`.

- [ ] **Step 1: Failing tests:** each op on a lane hole; `addCircle` far away → `{ ok: false, reason: 'The circle must touch the course' }`; `curveEdge` then `straightenEdge` round-trips the outline; `moveShapeCorner` carries both neighbouring controls by the delta; `addShapeCorner` on a curved edge keeps the baked outline within 2 mm; `removeShapeCorner` next to a curved edge keeps `curves.length === corners.length` (Review Focus 3); `loadShape` keeps a matching shape, drops a mismatching one (`dropped: true`, outline untouched); a hole without `shape` passes through `ensureShape` and first `addCircle` gets `curves` all null (Review Focus 5); history never holds a refused state: push only `ok` results, then undo returns the last valid hole (Review Focus 4).
- [ ] **Step 2: Run** `cd backend/frontend && npx vitest run src/lib/__tests__/minigolfShapeOps.test.ts` — FAIL.
- [ ] **Step 3: Implement** them; make `ops.ts`'s corner ops and `moveElement`/`removeElement` call the shape versions when `h.shape` exists (unwrap `ok`; on refusal return `h` unchanged), so existing callers keep their signatures.
- [ ] **Step 4: Run** the new tests and the existing `minigolfEditorOps.test.ts` — PASS.
- [ ] **Step 5: Commit** — `feat(minigolf): edit circles and curved edges of a hole`

### Task 4: The editor UI

**Files:**

- Modify: `backend/frontend/src/lib/minigolf/editor/tools.ts` (tool `'circle'`, label Circle, key from a free letter — check `TOOLS`; hint "Drag from the centre for a round area · Shift draws freely"), `EditorCanvas.svelte` (circle drag preview red while refused; circle centre/rim handles in Select; curve control handles with lines to their corners in Outline; guides: corners' polygon dashed and circles as thin rings while Outline or Circle is active), `Properties.svelte` (circle centre and radius fields; selected edge: "Curve"/"Straighten", key `K`), `ElementList.svelte`, `routes/MinigolfHoleEditor.svelte` (`loadShape` on load; notice when dropped; refused-edit reason shown in the Checks area)
- Test: render tests in `backend/frontend/src/lib/__tests__/minigolfHoleEditor.test.ts`

**Interfaces:**

- Consumes: everything from Task 3.

- [ ] **Step 1: Failing render tests:** the tool rail lists Circle with its key; a hole with a circle shows "Circle 1 — r 450 mm" in Elements; a selected circle shows centre and radius fields; a selected edge shows "Curve", a curved one "Straighten"; loading a mismatching hole shows the notice text from the spec.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** Snap the circle centre with `snap(p, { grid })`, radius to 10 mm (`Math.round(r / 10) * 10`, min 50 mm), control points with `snap`. Every commit goes through the existing `commit` (one history entry per drag, on pointer up), using only `ok` results. **Step 4: Run** frontend tests, typecheck, lint — PASS. Check by hand on the e2e stack: draw a keyhole, curve an edge, undo/redo, Test putt rolls round the circle's rail; save a screenshot to the scratchpad.
- [ ] **Step 5: Commit** — `feat(minigolf): draw circles and curves in the hole editor`

### Task 5: End to end and docs

**Files:**

- Modify: `e2e/tests/minigolf-editor.spec.ts` (or a new `minigolf-shapes.spec.ts`), `AGENTS.md` (the Minigolf courses row: `bake.ts`, `shapeOps.ts`), the course editor spec's "Sharp corners only" note (one line pointing to this spec)

- [ ] **Step 1:** e2e: on a fresh course (unique name, per-worker admin as the existing spec does), add a hole, add a circle round the cup, curve one long edge, publish, start a game on the course, and see the hole card; also open the seeded `test` course's hole 1 in the editor and check it still shows plain corners (Review Focus 5).
- [ ] **Step 2:** run all minigolf e2e specs with `--workers=2` on a fresh stack (`docker compose -f docker-compose.e2e.yaml down -v` first) — PASS.
- [ ] **Step 3:** docs.
- [ ] **Step 4: Commit** — `test(minigolf): draw, publish and play a keyhole hole` and `docs(minigolf): note outline shapes`
