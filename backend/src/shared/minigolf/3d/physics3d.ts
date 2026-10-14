// Minigolf in 3D: Rapier (its deterministic build) with real gravity on the ground from ground.ts
// as one triangle mesh with a round hole and the cup under it, rails and bumpers as solid blocks.
// A ball drops in by gravity alone, tipping over the rim's edge. Rolling friction is ours, as in
// 2D: contacts are frictionless and the ball loses `friction` mm/s² while it's on the felt.
// Rapier works in metres; everything going in and out is mm.
import RAPIER, { type Collider, type ColliderDesc, type RigidBody } from '@dimforge/rapier3d-deterministic-compat'
import type { Physics } from '../physics.js'
import { pointInPolygon } from '../geometry.js'
import { BALL_R, type Bumper, type Hole, type OtherBall, type PathPt, type Pt, type Shot, type ShotResult } from '../types.js'
import { CUP_DEPTH, G, cupMesh, groundMesh, heightAt } from './ground.js'

const M = 1 / 1000
/** How finely rails follow the ground's height, mm. */
const GRID = 20
const RAIL_HEIGHT = 70
/** Rails and walls stop a ball this far above the highest ground along them, mm: drawn low, they never let one fly out. */
const RAIL_REACH = 1000
/** Ball on ball bounce, as golf balls do (and as in 2D). */
const BALL_BOUNCE = 0.9
/** A ball slower than restSpeed this long rests, s, even where the slope under its centre is steep. */
const STILL = 0.2

let R: typeof RAPIER | null = null
/** Loads Rapier's WebAssembly, once. Await it before the first simulateShot3d. */
export async function initPhysics3d(): Promise<void> {
  if (!R) {
    await RAPIER.init()
    R = RAPIER
  }
}

const rapier = (): typeof RAPIER => {
  if (!R) throw new Error('Call initPhysics3d() before simulateShot3d()')
  return R
}

/** The hole's static world: ground, rails, bumpers and cup, with the handles of what a ball
 *  knocks into (rails, walls, bumpers) and of each bumper. Exported for tests. */
export function buildWorld(hole: Hole, physics: Physics) {
  const R = rapier()
  const world = new R.World({ x: 0, y: -G * M, z: 0 })
  world.timestep = physics.step
  const fixed = world.createRigidBody(R.RigidBodyDesc.fixed())
  const add = (c: ColliderDesc) => world.createCollider(c.setFriction(0), fixed)
  // A ball bounces 0.9 off a ball (Average); Min keeps the ground and cup dead, Multiply undoes the ball's 0.9 on rails
  const dead = (c: ColliderDesc) => add(c.setRestitution(0).setRestitutionCombineRule(R.CoefficientCombineRule.Min))
  const bouncy = (c: ColliderDesc, r: number) =>
    add(c.setRestitution(r / BALL_BOUNCE).setRestitutionCombineRule(R.CoefficientCombineRule.Multiply))
  const solid = new Set<number>()
  const bumpers = new Map<number, Bumper>()

  // The felt and the cup as one mesh, so the rim is a real edge the ball rolls over
  const felt = groundMesh(hole)
  const cup = cupMesh(hole)
  const vertices = new Float32Array(felt.positions.length + cup.positions.length)
  vertices.set(felt.positions)
  vertices.set(cup.positions, felt.positions.length)
  for (let k = 0; k < vertices.length; k++) vertices[k] *= M
  const indices = new Uint32Array(felt.indices.length + cup.indices.length)
  indices.set(felt.indices)
  indices.set(
    cup.indices.map(i => i + felt.positions.length / 3),
    felt.indices.length,
  )
  // Smooths over the seams between triangles (merging the rim's shared points), or the ball catches on them and hops
  dead(R.ColliderDesc.trimesh(vertices, indices, R.TriMeshFlags.FIX_INTERNAL_EDGES))

  /** A block along the segment ab (mm), from below the ground to well above it all along. */
  const block = (a: Pt, b: Pt, thick: number, restitution: number) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (len === 0) return
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0])
    // Turn about y so the block's x runs along ab (course y is Rapier's z, hence the minus)
    const q = { x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }
    const n = Math.ceil(len / GRID)
    const hs = Array.from({ length: n + 1 }, (_, i) => heightAt(hole, [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]))
    const [lo, hi] = [Math.min(...hs) - RAIL_HEIGHT, Math.max(...hs) + RAIL_REACH]
    const c = bouncy(
      R.ColliderDesc.cuboid(((len + thick) / 2) * M, ((hi - lo) / 2) * M, (thick / 2) * M)
        .setTranslation(mid[0] * M, ((hi + lo) / 2) * M, mid[1] * M)
        .setRotation(q),
      restitution,
    )
    solid.add(c.handle)
  }
  const ring = (pts: readonly Pt[], closed: boolean) => (closed ? [...pts, pts[0]] : pts)
  const rails = ring(hole.outline, true)
  for (let i = 1; i < rails.length; i++) block(rails[i - 1], rails[i], physics.wallThickness, physics.wallRestitution)
  for (const w of hole.walls) {
    const pts = ring(w.points, w.closed ?? false)
    for (let i = 1; i < pts.length; i++)
      block(pts[i - 1], pts[i], w.thickness ?? physics.wallThickness, w.restitution ?? physics.wallRestitution)
  }
  for (const b of hole.bumpers) {
    const c = bouncy(
      R.ColliderDesc.cylinder(RAIL_HEIGHT * M, b.r * M).setTranslation(b.at[0] * M, heightAt(hole, b.at) * M, b.at[1] * M),
      b.restitution ?? physics.bumperRestitution,
    )
    solid.add(c.handle)
    bumpers.set(c.handle, b)
  }

  return { world, solid, bumpers }
}

/** A ball on the move during a shot: the putted ball (id -1) or another player's (ball contact). */
type Rolling = {
  id: number
  body: RigidBody
  collider: Collider
  start: Pt
  path: PathPt[]
  holed: boolean
  /** Left the course: it goes back to where the shot found it. */
  out: boolean
  /** Steps it has been slower than restSpeed on the ground. */
  still: number
  /** At rest: held without gravity (so it can't creep down a gentle slope) until a ball knocks it. */
  resting: boolean
  /** Bumpers (with a kick) it just hit, to kick off once it moves away. */
  kicks: Bumper[]
}

/** Plays a putt in 3D. `path` points carry the ball centre's height. `others` are other players'
 *  balls on the hole: the putt can knock them, and the result lists those it moved, on the same
 *  60 Hz timeline as `path`. */
export function simulateShot3d(hole: Hole, physics: Physics, start: Pt, shot: Shot, others: readonly OtherBall[] = []): ShotResult {
  const R = rapier()
  const { world, solid, bumpers } = buildWorld(hole, physics)
  const events = new R.EventQueue(true)
  try {
    const floor = heightAt(hole, hole.cup.at) - CUP_DEPTH
    const [cx, cy] = hole.cup.at
    const balls: Rolling[] = [{ id: -1, at: start }, ...others].map(o => {
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(o.at[0] * M, (heightAt(hole, o.at) + BALL_R + 0.5) * M, o.at[1] * M)
          .setCcdEnabled(true),
      )
      const collider = world.createCollider(
        R.ColliderDesc.ball(BALL_R * M)
          .setFriction(0)
          .setRestitution(BALL_BOUNCE)
          .setMass(0.045)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body,
      )
      return {
        id: o.id,
        body,
        collider,
        start: o.at,
        path: [],
        holed: false,
        out: false,
        still: 0,
        resting: false,
        kicks: [],
      }
    })
    const own = balls[0]
    const byCollider = new Map(balls.map(b => [b.collider.handle, b]))
    // Constant friction: a ball slides v² / 2a, so the speed for `power × maxRoll` is a square root
    const speed0 = Math.sqrt(2 * physics.friction * shot.power * physics.maxRoll) * M
    own.body.setLinvel({ x: shot.dir[0] * speed0, y: 0, z: shot.dir[1] * speed0 }, true)

    const dt = physics.step
    const sampleEvery = Math.max(1, Math.round(1 / 60 / dt))
    const at = (b: Rolling): [number, number, number] => {
      const t = b.body.translation()
      return [t.x / M, t.z / M, t.y / M]
    }
    /** How steep the ground is at p, as the push gravity gives it (mm/s²). */
    const pull = (p: Pt) => {
      const e = 2
      const gx = (heightAt(hole, [p[0] + e, p[1]]) - heightAt(hole, [p[0] - e, p[1]])) / (2 * e)
      const gy = (heightAt(hole, [p[0], p[1] + e]) - heightAt(hole, [p[0], p[1] - e])) / (2 * e)
      return G * Math.hypot(gx, gy)
    }
    /** Friction and the cup for one ball before a step; false when it's in the cup or at rest. */
    const roll = (b: Rolling, sample: boolean): boolean => {
      const [x, y, z] = at(b)
      if (sample) b.path.push([x, y, z])
      const v = b.body.linvel()
      const speed = Math.hypot(v.x, v.y, v.z) / M
      if (b.resting) {
        if (speed < physics.restSpeed) {
          if (speed > 0) b.body.setLinvel({ x: 0, y: 0, z: 0 }, true) // too soft a touch to move it
          return false
        }
        b.resting = false // knocked
        b.body.setGravityScale(1, true)
      }
      const dc = Math.hypot(x - cx, y - cy)
      // Over the hole's middle, nothing under it but the cup's floor
      const under = dc < hole.cup.r - BALL_R ? floor : heightAt(hole, [x, y])
      if (dc < hole.cup.r && z < floor + BALL_R + 1) {
        b.holed = true // on the cup's floor
        if (!sample) b.path.push([x, y, z])
        world.removeRigidBody(b.body)
        return false
      }
      // Out of bounds: off the course or fallen through it, the ball goes back to where it was
      if (z < Math.min(under, floor) - CUP_DEPTH || !pointInPolygon([x, y], hole.outline)) {
        b.out = true
        world.removeRigidBody(b.body)
        return false
      }
      if (z - BALL_R - under >= 2) {
        b.still = 0
        return true
      }
      b.still = speed < physics.restSpeed ? b.still + 1 : 0
      // Rests where gravity can't beat friction, or once it's stayed still: a kink or a rail holds it
      // on a steep slope. Never with its middle over the hole: it tips in
      if (b.still > 0 && dc >= hole.cup.r && (pull([x, y]) <= physics.friction || b.still * dt >= STILL)) {
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        b.body.setGravityScale(0, true)
        b.resting = true
        b.kicks = [] // guards against a stale kick firing when it's knocked later
        return false
      }
      // The felt slows it; over the hole it's on the bare rim
      let w = v
      if (speed > 0 && dc >= hole.cup.r) {
        const slow = Math.min(speed, physics.friction * dt) / speed
        b.body.setLinvel((w = { x: v.x * (1 - slow), y: v.y * (1 - slow), z: v.z * (1 - slow) }), true)
      }
      // It rolls (contacts are frictionless, so this only turns it): Rapier keeps a contact that
      // hasn't turned, and a ball that never turns slides on past a triangle's edge, over the hole
      b.body.setAngvel({ x: w.z / (BALL_R * M), y: 0, z: -w.x / (BALL_R * M) }, true)
      return true
    }

    // When the putted ball knocks into a rail, wall, bumper or ball, in path samples
    const hits: number[] = []
    const steps = Math.ceil(physics.maxTime / dt)
    for (let i = 0; i < steps; i++) {
      let moving = false
      for (const b of balls) if (!b.holed && !b.out && roll(b, i % sampleEvery === 0)) moving = true
      if (!moving) break
      world.step(events)
      events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return
        for (const [h, other] of [
          [h1, h2],
          [h2, h1],
        ]) {
          const b = byCollider.get(h)
          if (!b) continue
          if (b === own && (solid.has(other) || byCollider.has(other))) hits.push((i + 1) / sampleEvery)
          const bumper = bumpers.get(other)
          if (bumper?.kick && !b.kicks.includes(bumper)) b.kicks.push(bumper)
        }
      })
      // Kick off a bumper once Rapier has bounced the ball away from it, along the normal
      for (const b of balls) {
        if (b.holed || b.out) continue
        b.kicks = b.kicks.filter(k => {
          const t = b.body.translation()
          const dx = t.x / M - k.at[0]
          const dy = t.z / M - k.at[1]
          const d = Math.hypot(dx, dy)
          const v = b.body.linvel()
          if (d === 0 || v.x * dx + v.z * dy <= 0) return true
          const kick = (k.kick ?? 0) * M
          b.body.setLinvel({ x: v.x + (dx / d) * kick, y: v.y, z: v.z + (dy / d) * kick }, true)
          return false
        })
      }
    }

    const done = balls.map(b => {
      // One out of bounds goes back to its start
      const end: PathPt = b.holed ? b.path[b.path.length - 1] : b.out ? [...b.start, heightAt(hole, b.start) + BALL_R] : at(b)
      if (!b.holed) b.path.push(end)
      const rest: Pt = [end[0], end[1]]
      return { id: b.id, path: b.path, rest, holed: b.holed, moved: b.holed || Math.hypot(rest[0] - b.start[0], rest[1] - b.start[1]) > 1 }
    })
    const [mine, ...moved] = done
    const result: ShotResult = { path: mine.path, rest: mine.rest, holed: mine.holed, hits }
    if (others.length > 0) result.others = moved.filter(b => b.moved).map(({ id, path, rest, holed }) => ({ id, path, rest, holed }))
    return result
  } finally {
    events.free()
    world.free()
  }
}
