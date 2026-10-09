# Minigolf core and test bench: design

The first of four sub-projects for the Minigolf game in the design canvas (`project/Minigolf*.dc.html`,
`Play-Minigolf`, `Stats-Minigolf`):

1. **Core and test bench** (this spec): hole format, physics, dart → shot, and an admin-only page to
   play and tune holes with mouse clicks.
2. **Board input**: the bench takes darts from a paired board as well as clicks.
3. **Game integration**: a `GameModule` (strokes, tries, max strokes, par, turn order), snapshots,
   the match screen, course picker and scorecard.
4. **Content and extras**: the three courses, stats and match details.

## Goal

Find out whether the game feels good before building the game around it: shoot on a hole by clicking
a dartboard, watch the ball roll, change holes and physics values, repeat. The bench stays in the app
as the admin tool for testing levels; the code it runs is the code the game will run.

## Decisions

- **Your dart is the putter.** Direction is the dart's angle around the bull (20 rolls up the screen,
  6 to the right), power its distance from the bull.
- **Both bull rings putt toward the cup**: the direction snaps to a straight line at the cup (walls in
  between are ignored), power still comes from the distance.
- **A miss costs a stroke** and leaves the ball where it is. A miss is a dart outside the double wire
  (`r > 1`) or one without coordinates (bounce-out).
- **Only positions, never segments.** Minigolf takes darts with coordinates; its manual fallback (later)
  is clicking a spot on the dartboard, the same click input the bench uses.
- **No moving obstacles.** Darts can't be timed (detection delay, takeout), so nothing on a hole moves
  with time. A windmill can come back as a static obstacle or one that changes between strokes.
- **Physics with nape-js** (`@newkrok/nape-js`, MIT, TypeScript). No pure-JS engine guarantees
  bit-identical results across JS engines (they all use `Math.sin/cos`), and nape-js says so itself:
  determinism is same-platform only. That's enough here: in a game the backend is the only authority
  (it simulates, the browser animates the path it gets), and replays run in Node only. We keep it
  safe by pinning the exact version, `space.deterministic = true`, a fixed step, and golden-shot tests
  that fail CI when an upgrade changes results. Its minigolf example confirms the approach (zero
  gravity, the cup as a `TriggerZone`, slopes as sensor zones) but has no rolling friction, which we
  add. Rapier's `-deterministic-compat` build is the fallback if we ever need cross-platform results.
- **Holes are JSON files in git.** The bench is a test bench, not an editor: changes are copied back
  into the repo and shipped with a commit. A finished game can then always point at the hole it was
  played on. A visual editor can grow out of the bench later.
- **Admins through better-auth's admin plugin** rather than our own role column: it adds `user.role`
  and the checks we need, and we already use better-auth.

## Elements (v1)

| Element        | Data                                                                   | Behaviour                                                                                                    |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Course outline | polygon                                                                | Rails around the felt; the ball banks off them                                                               |
| Wall           | polyline or polygon, optional restitution                              | Obstacles inside the course                                                                                  |
| Bumper         | circle, restitution, optional kick                                     | Bounces the ball, a kick adds speed along the normal                                                         |
| Slope          | polygon + force vector, or polygon + `radial` (centre, strength, sign) | Pushes the ball while it's inside; `radial` with a negative sign is the summit (pushes away from the centre) |
| Tee            | point                                                                  | Where the first stroke starts                                                                                |
| Cup            | point, radius                                                          | Holes the ball when it passes over it slower than the capture speed                                          |

Water and out of bounds wait until a hole needs them.

## Architecture

### Shared core: `backend/src/shared/minigolf/`

Used by the backend (the game, sub-project 3) and the SPA (the bench). `backend/src/shared/` is
dependency-free today; `minigolf/` becomes the one exception and may import `@newkrok/nape-js`. Both
`backend/package.json` and `backend/frontend/package.json` get it at the same exact version (like
`zod` and `better-auth` today), and `AGENTS.md` notes the exception.

- **`hole.ts`**: the `Hole` and `Course` types and `validateHole(hole)` (the tee and cup lie inside the
  outline, polygons have at least three points and don't self-intersect, numbers are finite). Returns a
  list of readable errors rather than throwing.
- **`shot.ts`**: `shotFromDart(coords | null, ballPos, cup, physics) → Shot | null`. `coords` are board
  units (bull-centred, `r = 1` at the outer double wire, y up; see `schema/adbridge-v1.json`).
  - `null` coords or `r > 1` → `null` (a miss).
  - `r ≤ R.bull25` (both bull rings) → direction from the ball to the cup.
  - Otherwise → direction `(x, -y) / r` in course space (y down), no trig.
  - Power: `0` at `R.bull25`, `1` at `r = 1`, shaped by the power curve, never below the minimum putt.
- **`physics.ts`**: `Physics`, the feel values kept apart from holes so the bench can change them:
  rolling friction (constant deceleration, mm/s²), rest speed (below it the ball stops), capture speed
  (the most the ball may have to drop into the cup), the full-power roll (how far power 1 rolls on flat felt; power is a share of it, so the dart's
  distance from the bull maps linearly to roll distance), minimum putt speed,
  default wall and bumper restitution, the power curve (`linear` first; the shape is a parameter), and
  the step (fixed, 1/240 s) and caps (max simulated time). `DEFAULT_PHYSICS` is the shipped set.
- **`simulate.ts`**: `simulateShot(hole, physics, ballPos, shot) → { path, rest, holed }`.
  - Builds a nape `Space` (zero gravity, `deterministic = true`) from the hole: the outline and walls
    as static bodies, bumpers as static circles, slopes and the cup as sensors. The ball is a dynamic
    circle with CCD on, so a full-power ball can't pass through a thin wall.
  - Steps synchronously at the fixed step until the ball is at rest, holed, or the time cap is hit (it
    then stops where it is). Each step applies our rolling friction (a force against the velocity,
    clamped so it never reverses it), slope forces for the zones the ball is in, and the cup check.
  - `path` is the ball's position sampled at 60 Hz for animation; `rest` the final position.
  - Frees the `Space` before returning. The function has no other state, so the same input gives the
    same output on the same runtime.
- **Course units are millimetres** in course space, x right, y down (SVG's). The ball is 42.7 mm, a
  standard golf ball, and holes are a few metres long, so physics values read like the real thing.

### Holes: `backend/src/shared/minigolf/courses/`

One JSON file per course (`{ id, name, holes: Hole[] }`), loaded through an index that validates every
hole. This sub-project ships a `test` course with three holes: a straight one, a dogleg with a bank shot
(like `Minigolf.dc.html`'s hole 4, without the windmill) and one with a slope and a bumper. The real
courses come in sub-project 4.

### Backend: admin role

- Add better-auth's `admin()` plugin to `backend/src/auth/index.ts` (and its client plugin to the SPA's
  auth client) and a migration for its columns (`user.role`, `banned`, `ban_reason`, `ban_expires`,
  `session.impersonated_by`), following how our migrations add better-auth's columns.
- The dev seed makes `admin@dartcade.local` an admin. In production an admin is set by hand in the DB
  (documented in `DEVELOPMENT.md`).
- A `requireAdmin` guard next to the existing auth middleware, so admin APIs have one place to check.
  This sub-project adds no admin API: the bench simulates in the browser. The guard comes with a test
  so the next sub-project can rely on it.
- `GET /api/me` gets an `isAdmin` flag (added to `schema/api-v1.yaml`), so the SPA can show and guard
  the page.

### Frontend: `#/admin/minigolf`

- A route that only admins see: no nav entry for others, and a non-admin who opens the URL is sent home.
  Admins get an entry in the account menu.
- Components in `backend/frontend/src/lib/minigolf/` (logic) and `lib/components/minigolf/`:
  - **`HoleView.svelte`**: the hole as SVG in the design's look (felt pattern, cream rails, tee, cup and
    flag, slope chevrons, bumpers), the ball, and the ball animated along a `path`. It respects
    `prefers-reduced-motion` (jumps to the end).
  - **Dartboard input**: the existing `DartBoard.svelte` (or a thin wrapper) turns a click into board
    coords, exactly the coords a real dart would have. Sub-project 2 adds the board as a second source.
- The page: the hole on the left as large as fits, the dartboard on the right (as in
  `Minigolf.dc.html`), a course → hole picker, and the stroke counter.

## The bench, in two milestones

The plan builds it so it can be played halfway through.

**Milestone A, playable**

- Admin role and the guarded route.
- Hole format, validation and the `test` course.
- `shot.ts` and `simulate.ts` with friction, slopes, bumpers and the cup.
- The page: pick a hole, click the dartboard to shoot, the ball rolls, the stroke counter counts (a miss
  counts too), "Holed in N" when it drops, Reset to tee.

**Milestone B, quality of life**

- **Undo** the last stroke.
- **Place ball**: drag the ball anywhere to test a tricky spot.
- **Physics panel**: sliders for the `Physics` values; changes apply to the next shot; **Copy as JSON**
  to paste into `physics.ts`.
- **Debug overlay** (toggle): wall normals, slope arrows, the cup's capture radius, the last shot's
  sampled path.
- **Hole JSON editor**: a text area with the current hole; edits re-render live (invalid JSON or a hole
  that fails `validateHole` shows the errors and keeps the last good hole); **Copy** to paste back into
  the repo.
- **Preview line** while hovering the dartboard: the direction and a power bar. A bench aid only, not in
  the game.

## Testing

- **`shot.ts`** (unit): a point straight up rolls up the screen and one at 6 rolls right; power is 0 at
  the bull's edge, 1 at the double wire and capped beyond; both bull rings aim at the cup; `r > 1` and
  `null` are misses.
- **`simulate.ts`** (unit, on small fixture holes): a straight putt stops short or rolls past as power
  changes; a ball banks off a wall at the mirrored angle (within a tolerance); a full-power shot at a
  thin wall doesn't pass through; a slope bends the path; a fast ball rolls over the cup and a slow one
  drops; the simulation always ends (the time cap).
- **Golden shots**: a fixed set of shots on each `test` hole whose `rest` and `holed` are kept as a
  vitest snapshot. A nape, Node or physics change that moves them fails CI; changing the physics on
  purpose updates the snapshot in the same commit.
- **Holes**: every shipped hole passes `validateHole`; broken fixture holes produce the expected errors.
- **Admin**: `requireAdmin` lets admins through and rejects others; the seeded admin has the role.
- **Frontend**: the click → coords mapping (centre is `(0, 0)`, the top of the double ring `(0, 1)`);
  an e2e smoke test where the seeded admin opens the bench, shoots once and sees the stroke counter go
  up, and a non-admin is sent away.

## Out of scope

Board input (sub-project 2); the game module, tries, turns, par scoring, match screen, course picker and
scorecard (3); real courses, stats and match details (4); moving obstacles; water and out of bounds; a
visual hole editor.
