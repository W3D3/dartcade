// Minigolf in 3D (a bench experiment): Rapier (its deterministic build) with real gravity on the
// ground from ground.ts, rails and bumpers as solid blocks and a real hole for the cup. Rolling
// friction is ours, as in 2D: the ball slides without spinning and loses `friction` mm/s² while
// it's on the ground. Rapier works in metres; everything going in and out is mm.
import type { ColliderDesc } from '@dimforge/rapier3d-deterministic-compat'
import type { Physics } from '$shared/minigolf/physics'
import { BALL_R, type Pt, type Shot } from '$shared/minigolf/types'
import { G, groundMesh, heightAt, type Hole3d } from './ground'

/** A point in the course (x, y) with its height (z), mm. */
export type Pt3 = [number, number, number]
export type Result3d = { path: Pt3[]; rest: Pt; holed: boolean }
export type Simulate3d = (hole: Hole3d, physics: Physics, ball: Pt, shot: Shot) => Result3d

const M = 1 / 1000
/** The ground mesh's grid, mm: fine enough for a round-ish cup. */
const GRID = 15
const CUP_DEPTH = 120
const RAIL_HEIGHT = 70

/** Loads Rapier (WebAssembly) once, then simulates synchronously. */
export async function loadPhysics3d(): Promise<Simulate3d> {
  const R = (await import('@dimforge/rapier3d-deterministic-compat')).default
  await R.init()
  return (hole, physics, ball, shot) => simulate(R, hole, physics, ball, shot)
}

type Rapier = (typeof import('@dimforge/rapier3d-deterministic-compat'))['default']

function simulate(R: Rapier, hole: Hole3d, physics: Physics, start: Pt, shot: Shot): Result3d {
  const world = new R.World({ x: 0, y: -G * M, z: 0 })
  world.timestep = physics.step
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed())
  const add = (c: ColliderDesc) => world.createCollider(c.setFriction(0), fixed)

  const { positions, indices } = groundMesh(hole, GRID)
  // Smooth over the seams between triangles, or the ball catches on them and hops
  add(
    R.ColliderDesc.trimesh(
      positions.map(v => v * M),
      indices,
      R.TriMeshFlags.FIX_INTERNAL_EDGES,
    ).setRestitution(0),
  )

  /** A block along the segment ab (mm) as tall as a rail, standing on the ground. */
  const block = (a: Pt, b: Pt, thick: number, restitution: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len === 0) return
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    // Turn about y so the block's x runs along ab (course y is three's z, hence the minus)
    const q = { x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }
    add(
      R.ColliderDesc.cuboid(((len + thick) / 2) * M, RAIL_HEIGHT * M, (thick / 2) * M)
        .setTranslation(mid[0] * M, heightAt(hole, mid) * M, mid[1] * M)
        .setRotation(q)
        .setRestitution(restitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Max),
    )
  }
  const ring = (pts: readonly Pt[], closed: boolean) => (closed ? [...pts, pts[0]] : pts)
  const rails = ring(hole.outline, true)
  for (let i = 1; i < rails.length; i++) block(rails[i - 1], rails[i], physics.wallThickness, physics.wallRestitution)
  for (const w of hole.walls) {
    const pts = ring(w.points, w.closed ?? false)
    for (let i = 1; i < pts.length; i++) block(pts[i - 1], pts[i], physics.wallThickness, w.restitution ?? physics.wallRestitution)
  }
  for (const b of hole.bumpers)
    add(
      R.ColliderDesc.cylinder(RAIL_HEIGHT * M, b.r * M)
        .setTranslation(b.at[0] * M, heightAt(hole, b.at) * M, b.at[1] * M)
        .setRestitution(b.restitution ?? physics.bumperRestitution)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Max),
    )

  // The cup: a floor and a ring of thin walls under the hole in the ground, their tops a ball's
  // radius down (any closer and the ball snags on them before it reaches the lip)
  const cupH = heightAt(hole, hole.cup.at)
  const [cx, cy] = hole.cup.at
  add(R.ColliderDesc.cuboid(hole.cup.r * 1.5 * M, 5 * M, hole.cup.r * 1.5 * M).setTranslation(cx * M, (cupH - CUP_DEPTH) * M, cy * M))
  const SIDES = 24
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * 2 * Math.PI
    const b = ((k + 1) / SIDES) * 2 * Math.PI
    const r = hole.cup.r + 3
    const p = (t: number): Pt => [cx + Math.cos(t) * r, cy + Math.sin(t) * r]
    const [pa, pb] = [p(a), p(b)]
    const mid: Pt = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
    const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0])
    add(
      R.ColliderDesc.cuboid((Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2 + 2) * M, ((CUP_DEPTH - BALL_R) / 2) * M, 3 * M)
        .setTranslation(mid[0] * M, (cupH - (CUP_DEPTH + BALL_R) / 2) * M, mid[1] * M)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }),
    )
  }

  const body = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(start[0] * M, (heightAt(hole, start) + BALL_R + 0.5) * M, start[1] * M)
      .setCcdEnabled(true)
      .lockRotations(),
  )
  world.createCollider(
    R.ColliderDesc.ball(BALL_R * M)
      .setFriction(0)
      .setRestitution(0)
      .setMass(0.045),
    body,
  )
  // Constant friction: a ball slides v² / 2a, so the speed for `power × maxRoll` is a square root
  const speed0 = Math.sqrt(2 * physics.friction * shot.power * physics.maxRoll) * M
  body.setLinvel({ x: shot.dir[0] * speed0, y: 0, z: shot.dir[1] * speed0 }, true)

  const dt = physics.step
  const sampleEvery = Math.max(1, Math.round(1 / 60 / dt))
  const path: Pt3[] = []
  const here = (): Pt3 => {
    const t = body.translation()
    return [t.x / M, t.z / M, t.y / M]
  }
  /** How steep the ground is at p, as the push gravity gives it (mm/s²). */
  const pull = (p: Pt) => {
    const e = 2
    const gx = (heightAt(hole, [p[0] + e, p[1]]) - heightAt(hole, [p[0] - e, p[1]])) / (2 * e)
    const gy = (heightAt(hole, [p[0], p[1] + e]) - heightAt(hole, [p[0], p[1] - e])) / (2 * e)
    return G * Math.hypot(gx, gy)
  }
  let holed = false
  const steps = Math.ceil(physics.maxTime / dt)
  for (let i = 0; i < steps; i++) {
    const [x, y, z] = here()
    if (i % sampleEvery === 0) path.push([x, y, z])
    const overCup = Math.hypot(x - cx, y - cy) < hole.cup.r
    if (overCup && z < cupH - BALL_R * 2) {
      holed = true
      break
    }
    const onGround = !overCup && z - BALL_R - heightAt(hole, [x, y]) < 2
    if (onGround) {
      const v = body.linvel()
      const speed = Math.hypot(v.x, v.y, v.z) / M
      if (speed < physics.restSpeed && pull([x, y]) <= physics.friction) break
      const slow = Math.min(speed, physics.friction * dt) / speed
      body.setLinvel({ x: v.x * (1 - slow), y: v.y * (1 - slow), z: v.z * (1 - slow) }, true)
    }
    world.step()
  }
  const end = here()
  path.push(end)
  world.free()
  return { path, rest: [end[0], end[1]], holed }
}
