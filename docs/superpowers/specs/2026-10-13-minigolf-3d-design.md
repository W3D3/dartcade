# Minigolf in 3D

Minigolf moves from a flat, 2D table to a 3D one: real heights, real gravity, a real hole, drawn
in 3D with a camera that follows the ball. The bench experiment (`lib/minigolf/3d/`, `Hole3D.svelte`)
showed it reads far better: you can see how high a hill or a ramp is, so you can judge how hard to
putt. This spec turns that experiment into the game.

Builds on the game spec (`2026-10-10-minigolf-game-design.md`) and the feature flags spec
(`2026-10-12-feature-flags-design.md`). Minigolf hasn't shipped, so there are no old lobbies or
games to keep working: 3D simply becomes how Minigolf plays.

## Goals

- Games play with 3D physics on the server, which stays the authority, as in 2D.
- The match screen draws the hole in 3D: a light cartoon look, a tilted view while aiming, a chase
  camera while the ball rolls.
- Holes can be shaped by height (plateaus, ramps, cliffs), not only by slopes that push.
- The 2D physics and view stay in the code, behind a feature flag that is off by default.

## Not in scope

- Moving parts (as before: timing a putt with darts isn't possible).
- Real courses and stats (sub-project 4); this spec only ports the test course and adds the mesa.
- Ball spin. The ball slides without spinning and loses speed to our own rolling friction, as in 2D.

## Physics

### Where it runs

`ground.ts` and `physics3d.ts` move from the bench into `backend/src/shared/minigolf/3d/`, so the
server and the browser run the same code. `@dimforge/rapier3d-deterministic-compat` is added to the
backend, pinned to the same version as the frontend (as with nape-js; Vite already dedupes shared
dependencies).

Rapier loads WebAssembly, which is asynchronous; the game logic isn't. So loading is split from
simulating:

- `initPhysics3d(): Promise<void>` loads Rapier once. The backend awaits it at startup, before it
  serves games; tests await it in their setup; the browser awaits it before the match screen or
  the bench plays a shot.
- `simulateShot3d(hole, physics, ball, shot, others)` is synchronous and pure, like the 2D
  `simulateShot`, and throws if Rapier isn't loaded yet. The game module calls it from its
  reducer as it calls the 2D one today.

### The ground: a height grid with a hole that isn't there

The bench builds a triangle mesh of the ground for every shot, which costs 80 to 180 ms per shot.
The server replays the open turn on every input (through the shot cache in `minigolfShots.ts`), so a
shot has to cost far less. The ground becomes Rapier's **heightfield** collider instead: a grid of
heights, which Rapier is built to handle quickly and which has no inner edges for the ball to catch
on.

A heightfield can't have a hole in it. So the cup is made by switching the ground off under the
ball while the ball's centre is over the cup: a contact filter (Rapier's physics hooks) drops the
ball–ground contact there, and the ball falls into the cup (a floor and a ring of walls, as on the
bench, their tops a ball's radius below the rim). The rim is then exactly round.

Target: under 20 ms for a full-power shot on the test holes, measured in a test. If it can't be
met, work stops and we decide together (a coarser grid, a cached world per hole).

### Heights

As on the bench, and the same in all code:

- A slope (hill, bowl, bump) rises `strength / g` per mm, so gravity on it pushes as hard as the
  slope's force does in 2D.
- `terrain` adds ground shaped by height: a mesa is a raised rectangle that falls to the felt over
  each side's own width (a wide side is a ramp, a narrow one a cliff). `Hole` gains an optional
  `terrain` field (shared type, `validateHole`, the snapshot schema, the bench's editor).
- Rails and bumpers stand on the ground at their spot.

### What 3D physics must do that the bench doesn't yet

The game uses more of the physics than the bench does. The 3D simulation reaches parity with 2D:

- **Other balls.** With ball contact on, the other players' balls are dynamic balls too, and a
  shot can move them. `others` reports where they ended up, on the same timeline as `path`.
- **Bumper kicks.** A bumper's `kick` adds speed when the ball leaves it, as in 2D.
- **Hits**, for the sounds: rail, bumper, ball, cup.
- **Path with heights.** `path` and the others' paths carry each point's height: `[x, y, z]`.

`preview` (the 2D path up to the first contact) goes away; see the shot preview below.

### The cup

The 2D cup pulls a slow ball in. In 3D the hole is real: a ball drops when its centre passes over
it slowly enough to fall before it reaches the far edge. That's less forgiving than the pull. If
playtests say it's too hard, the first fix is a slightly wider cup, not a fake pull.

## The 2D game behind a flag

The 2D physics and the 2D view stay. A new flag, **`gamemode.minigolf.flat`**, off by default and
on through `FLAGS_ON`, brings them back:

- The game config gains `physics: '3d' | '2d'`, `'3d'` by default. It's only offered in the
  setup form to users who have the flag on; for everyone else it stays at `'3d'`, and the
  server refuses `'2d'` from a user without the flag, as it refuses Minigolf from a user without
  `gamemode.minigolf.enabled`.
- A game's config is fixed when it starts, so a game keeps its physics while it's replayed.

## The match screen in 3D

`Hole3D.svelte` grows into the match screen's hole view, with what `HoleView` does today:

- **Balls.** Each player's ball in their colour; the other players' balls with their initial over
  them. A ball in the cup is drawn in it.
- **Aim.** While a player can aim: the reach rings (how far a treble and a double roll on flat
  felt) and the aim dial around the ball, lying on the ground.
- **The shot preview** (the game option): for each try of the turn, a dotted line from the ball in
  the putt's direction, as long as the putt would roll on flat felt. It isn't simulated: it doesn't
  bend on slopes or stop at walls, so it shows strength and direction, not the result. The current
  try's line is bright, replaced tries' lines faint. (This replaces the 2D preview's path up to the
  first contact, which also changes in 2D.)
- **Camera.** Tilted over the whole hole while aiming; once the turn is played, the chase camera
  follows the ball and glides back when everything is at rest. Slow motion near the cup stays (the
  existing `rollRate`), and so do the 3-second delay before the roll and holding the win screen until
  the roll is over.
- **The look.** Toon shading in a few tones, a low sun with soft shadows, checkered felt, cream
  rails, red bumpers, the cup and flag. Heights are drawn true (no relief setting in the game).
- **No WebGL.** If the 3D view can't start, the match screen shows the 2D view of the same game
  with a short note, so the game can still be played.

`three` is loaded only on Minigolf screens.

## The bench

- The bench plays 3D by default, with the same hole view as the game.
- Its 2D view and physics stay as toggles (an admin tool; no flag needed).
- The 3D lab's mesa moves into the shared test course, as a fourth hole.
- Felt and relief settings stay on the bench for trying out looks.

## Testing

- **Physics (vitest, backend):** the bench's 3D tests move along (flat roll distance, rolling off a
  hill, dropping into the cup, a ramp too soft to climb), plus other balls, bumper kicks, hits, the
  cup on raised ground, and the speed target.
- **Golden shots:** a snapshot of 3D shots per test hole, like the 2D one, to catch drift between
  versions of the code or of Rapier.
- **Determinism:** the same shot twice gives the same path, bit for bit.
- **Game module:** the existing Minigolf tests run with 3D physics; one test plays a 2D game.
- **Flag:** without `gamemode.minigolf.flat` the setup form has no physics option and the server
  refuses `'2d'`.
- **E2e:** the Minigolf game test plays a stroke in 3D (the headless browser renders WebGL in
  software); the bench test switches between 2D and 3D.

## Risks

- **Speed.** The heightfield is the plan; the 20 ms target is checked in a test before the rest
  is built on it.
- **Determinism across machines.** Rapier's deterministic build promises the same results on every
  platform; the golden shots and the server being the only authority cover the rest.
- **Rapier's size.** A few MB of WebAssembly in the backend, and in the browser on Minigolf screens
  only.
- **Phones.** The match screen hasn't been tried in 3D on a real phone or the TV next to the board.
