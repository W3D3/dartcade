// Minigolf in 3D: Rapier (its deterministic build) with real gravity on the ground from ground.ts
// as a heightfield, rails and bumpers as solid blocks and a real hole for the cup. Rolling
// friction is ours, as in 2D: the ball slides without spinning and loses `friction` mm/s² while
// it's on the ground. Rapier works in metres; everything going in and out is mm.
import RAPIER, { type Collider, type ColliderDesc, type RigidBody } from '@dimforge/rapier3d-deterministic-compat'
import type { Physics } from '../physics.js'
import { pointInPolygon } from '../geometry.js'
import { BALL_R, type Bumper, type Hole, type OtherBall, type PathPt, type Pt, type Shot, type ShotResult } from '../types.js'
import { CUP_DEPTH, G, heightAt, heightGrid } from './ground.js'

const M = 1 / 1000
/** The heightfield's grid, mm. */
const GRID = 20
const RAIL_HEIGHT = 70
/** Rails stop a ball this far above the highest ground along them, mm: drawn low, they never let one fly out. */
const RAIL_REACH = 1000
/** Ball on ball bounce, as golf balls do (and as in 2D). */
const BALL_BOUNCE = 0.9
/** How far a ball may sink into the felt before it's put back on it, mm: deeper than the
 *  heightfield ever sits below heightAt (9 mm at the Mesa's cliffs). */
const SUNK = 12
// Groups (membership << 16 | filter) let a ball over the cup pass the ground, and one that hasn't
// dropped pass the cup's walls (their tops give it ghost knocks); a contact hook doubles a step's cost
const GROUND = 0x0002_ffff
const CUP_WALL = 0x0004_ffff
const DROPPED = 0x0001_fffd
const OVER_CUP = 0x0001_fff9
const ON_FELT = 0x0001_fffb

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

  const g = heightGrid(hole, GRID)
  // Rapier: (nrows+1) x (ncols+1) heights, rows along z, stored column by column
  const hf = new Float32Array((g.ny + 1) * (g.nx + 1))
  for (let i = 0; i <= g.nx; i++) for (let j = 0; j <= g.ny; j++) hf[i * (g.ny + 1) + j] = g.heights[j * (g.nx + 1) + i] * M
  dead(
    // Smooth over the seams between triangles, or the ball catches on them and hops
    R.ColliderDesc.heightfield(g.ny, g.nx, hf, { x: g.nx * GRID * M, y: 1, z: g.ny * GRID * M }, R.HeightFieldFlags.FIX_INTERNAL_EDGES)
      .setTranslation((g.x0 + (g.nx * GRID) / 2) * M, 0, (g.y0 + (g.ny * GRID) / 2) * M)
      .setCollisionGroups(GROUND),
  )

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
    for (let i = 1; i < pts.length; i++) block(pts[i - 1], pts[i], physics.wallThickness, w.restitution ?? physics.wallRestitution)
  }
  for (const b of hole.bumpers) {
    const c = bouncy(
      R.ColliderDesc.cylinder(RAIL_HEIGHT * M, b.r * M).setTranslation(b.at[0] * M, heightAt(hole, b.at) * M, b.at[1] * M),
      b.restitution ?? physics.bumperRestitution,
    )
    solid.add(c.handle)
    bumpers.set(c.handle, b)
  }

  // The cup: a floor and a ring of thin walls under the hole in the ground, up to the felt so the
  // far edge catches a ball that has dropped at all
  const cupH = heightAt(hole, hole.cup.at)
  const [cx, cy] = hole.cup.at
  dead(R.ColliderDesc.cuboid(hole.cup.r * 1.5 * M, 5 * M, hole.cup.r * 1.5 * M).setTranslation(cx * M, (cupH - CUP_DEPTH) * M, cy * M))
  const SIDES = 24
  for (let k = 0; k < SIDES; k++) {
    const a = (k / SIDES) * 2 * Math.PI
    const b = ((k + 1) / SIDES) * 2 * Math.PI
    const r = hole.cup.r + 3
    const p = (t: number): Pt => [cx + Math.cos(t) * r, cy + Math.sin(t) * r]
    const [pa, pb] = [p(a), p(b)]
    const mid: Pt = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]
    const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0])
    const [top, bottom] = [heightAt(hole, mid), cupH - CUP_DEPTH]
    dead(
      R.ColliderDesc.cuboid((Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / 2 + 2) * M, ((top - bottom) / 2) * M, 3 * M)
        .setTranslation(mid[0] * M, ((top + bottom) / 2) * M, mid[1] * M)
        .setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) })
        .setCollisionGroups(CUP_WALL),
    )
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
  /** At rest: held without gravity (so it can't creep down a gentle slope) until a ball knocks it. */
  resting: boolean
  overCup: boolean
  group: number
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
    const cupH = heightAt(hole, hole.cup.at)
    const [cx, cy] = hole.cup.at
    const balls: Rolling[] = [{ id: -1, at: start }, ...others].map(o => {
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(o.at[0] * M, (heightAt(hole, o.at) + BALL_R + 0.5) * M, o.at[1] * M)
          .setCcdEnabled(true)
          .lockRotations(),
      )
      const collider = world.createCollider(
        R.ColliderDesc.ball(BALL_R * M)
          .setFriction(0)
          .setRestitution(BALL_BOUNCE)
          .setMass(0.045)
          .setCollisionGroups(ON_FELT)
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
        resting: false,
        overCup: false,
        group: ON_FELT,
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
      let v = b.body.linvel()
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
      const inCup = dc < hole.cup.r
      // The ground has no hole: over the cup the ball passes through it, down into the cup. A ball
      // that dipped in stays off the ground until it's back up at the felt, or the ground would
      // shove it up and over the edge; till then the cup's wall decides
      const ground = heightAt(hole, [x, y])
      const low = z < ground + BALL_R - 1
      const overCup = inCup || (b.overCup && low)
      const group = overCup ? (low ? DROPPED : OVER_CUP) : ON_FELT
      if (group !== b.group) b.collider.setCollisionGroups(group)
      b.overCup = overCup
      b.group = group
      if (inCup && z < cupH - BALL_R * 2) {
        b.holed = true
        if (!sample) b.path.push([x, y, z])
        world.removeRigidBody(b.body)
        return false
      }
      // Out of bounds: off the course or fallen through it, the ball goes back to where it was
      if (!overCup && (z < ground - CUP_DEPTH || !pointInPolygon([x, y], hole.outline))) {
        b.out = true
        world.removeRigidBody(b.body)
        return false
      }
      if (!overCup && z < ground + BALL_R - SUNK) {
        // The felt is solid: Rapier's internal-edge fix drops contacts at a steep crease (the Mesa's cliff foot) and a ball sinks
        b.body.setTranslation({ x: x * M, y: (ground + BALL_R) * M, z: y * M }, true)
        if (v.y < 0) b.body.setLinvel((v = { ...v, y: 0 }), true)
      }
      if (overCup || z - BALL_R - ground >= 2) return true
      // The rounded lip: within half a ball of the rim the felt falls toward the cup, so a ball never stops hanging over it
      const onLip = dc < hole.cup.r + BALL_R / 2
      if (speed < physics.restSpeed && !onLip && pull([x, y]) <= physics.friction) {
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        b.body.setGravityScale(0, true)
        b.resting = true
        b.kicks = [] // guards against a stale kick firing when it's knocked later
        return false
      }
      if (speed > 0) {
        const slow = Math.min(speed, physics.friction * dt) / speed
        b.body.setLinvel({ x: v.x * (1 - slow), y: v.y * (1 - slow), z: v.z * (1 - slow) }, true)
      }
      if (onLip) {
        // Twice friction: a ball stopping there rolls in at a walk, one passing by barely curls
        const lip = (2 * physics.friction * dt * M) / dc
        const w = b.body.linvel()
        b.body.setLinvel({ x: w.x + (cx - x) * lip, y: w.y, z: w.z + (cy - y) * lip }, true)
      }
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
