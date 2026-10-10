// One putt on one hole, run to the end in a single call. nape-js resolves the contacts (rails,
// walls, bumpers); rolling friction, slopes, bumper kicks and the cup are ours, applied each step.
// Pure: a fresh Space per call, freed before returning, so the same input gives the same output.
import { Body, BodyType, Circle, Material, Polygon, Space, Vec2 } from '@newkrok/nape-js'
import { pointInPolygon } from './geometry.js'
import type { Physics } from './physics.js'
import { BALL_R, type Hole, type OtherBall, type Pt, type Shot, type ShotResult } from './types.js'

/** Ball on ball bounce, as golf balls do. */
const BALL_BOUNCE = 0.9
/** nape takes the mean of both materials' elasticity (negative values work too): a surface gets
 *  what makes the mean with the ball's come out at `restitution`. */
const surface = (restitution: number) => new Material(2 * restitution - BALL_BOUNCE, 0, 0, 1, 0)

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
  // nape slows every body a little by default; rolling friction is ours
  space.worldLinearDrag = 0
  space.worldAngularDrag = 0
  const rails = new Body(BodyType.STATIC)
  addPolyline(rails, hole.outline, true, physics.wallThickness, surface(physics.wallRestitution))
  for (const w of hole.walls)
    addPolyline(rails, w.points, !!w.closed, physics.wallThickness, surface(w.restitution ?? physics.wallRestitution))
  for (const b of hole.bumpers)
    rails.shapes.add(new Circle(b.r, new Vec2(b.at[0], b.at[1]), surface(b.restitution ?? physics.bumperRestitution)))
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

/** A ball on the move during a shot: the putted ball (id -1) or another player's (ball contact). */
type Rolling = { id: number; body: Body; start: Pt; path: Pt[]; holed: boolean; kicked: Set<number> }

function addBall(space: Space, at: Pt): Body {
  const body = new Body(BodyType.DYNAMIC, new Vec2(at[0], at[1]))
  body.shapes.add(new Circle(BALL_R, undefined, new Material(BALL_BOUNCE, 0, 0, 1, 0)))
  body.isBullet = true
  body.allowRotation = false
  body.space = space
  return body
}

/** Friction, slopes and the cup for one ball before a step; false when it's in the cup or at rest. */
function roll(b: Rolling, hole: Hole, physics: Physics): boolean {
  const pos: Pt = [b.body.position.x, b.body.position.y]
  let vx = b.body.velocity.x
  let vy = b.body.velocity.y
  let speed = Math.sqrt(vx * vx + vy * vy)

  const dc = Math.sqrt((pos[0] - hole.cup.at[0]) ** 2 + (pos[1] - hole.cup.at[1]) ** 2)
  if (dc < hole.cup.r && speed < physics.captureSpeed) {
    b.holed = true
    b.body.space = null
    return false
  }

  const [sx, sy] = slopeForce(hole, pos)
  const slope = Math.sqrt(sx * sx + sy * sy)
  if (speed < physics.restSpeed && slope <= physics.friction) {
    if (speed > 0) b.body.velocity = new Vec2(0, 0)
    return false
  }

  const dt = physics.step
  vx += sx * dt
  vy += sy * dt
  speed = Math.sqrt(vx * vx + vy * vy)
  if (speed > 0) {
    const slow = Math.min(speed, physics.friction * dt) / speed
    vx -= vx * slow
    vy -= vy * slow
  }
  b.body.velocity = new Vec2(vx, vy)
  return true
}

/** Kicks a ball off each bumper it just bounced off, once per hit. */
function kick(b: Rolling, hole: Hole, dt: number): void {
  const body = b.body
  hole.bumpers.forEach((bumper, k) => {
    const dx = body.position.x - bumper.at[0]
    const dy = body.position.y - bumper.at[1]
    const d = Math.sqrt(dx * dx + dy * dy)
    // Touching, or just pushed off it this step
    const reach = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) * dt * 2 + 2
    if (d >= bumper.r + BALL_R + reach) {
      b.kicked.delete(k)
      return
    }
    // After nape has bounced the ball (it's moving away from the bumper)
    const away = d > 0 && body.velocity.x * dx + body.velocity.y * dy > 0
    if (away && !b.kicked.has(k)) {
      b.kicked.add(k)
      if (bumper.kick) body.velocity = new Vec2(body.velocity.x + (dx / d) * bumper.kick, body.velocity.y + (dy / d) * bumper.kick)
    }
  })
}

/** Play `shot` from `ball` to the end: every ball at rest or in the cup, or out of time. `others`
 *  are other players' balls on the hole (ball contact): the putt can knock them, and the result
 *  lists those it moved, on the same 60 Hz timeline as `path`. */
export function simulateShot(hole: Hole, physics: Physics, ball: Pt, shot: Shot, others: readonly OtherBall[] = []): ShotResult {
  const space = buildSpace(hole, physics)
  const balls: Rolling[] = [{ id: -1, at: ball }, ...others].map(o => ({
    id: o.id,
    body: addBall(space, o.at),
    start: o.at,
    path: [o.at],
    holed: false,
    kicked: new Set<number>(),
  }))
  // Constant friction: a ball rolls v² / 2a, so the speed for `power × maxRoll` is a square root
  const speed0 = Math.sqrt(2 * physics.friction * shot.power * physics.maxRoll)
  balls[0].body.velocity = new Vec2(shot.dir[0] * speed0, shot.dir[1] * speed0)

  const dt = physics.step
  const sampleEvery = Math.max(1, Math.round(1 / 60 / dt))
  const maxSteps = Math.ceil(physics.maxTime / dt)

  for (let i = 1; i <= maxSteps; i++) {
    let moving = false
    for (const b of balls) if (!b.holed && roll(b, hole, physics)) moving = true
    if (!moving) break
    space.step(dt, 10, 10)
    for (const b of balls) if (!b.holed) kick(b, hole, dt)
    if (i % sampleEvery === 0) for (const b of balls) if (!b.holed) b.path.push([b.body.position.x, b.body.position.y])
  }

  const done = balls.map(b => {
    const rest: Pt = b.holed ? hole.cup.at : [b.body.position.x, b.body.position.y]
    const last = b.path[b.path.length - 1]
    if (last[0] !== rest[0] || last[1] !== rest[1]) b.path.push(rest)
    return { id: b.id, path: b.path, rest, holed: b.holed, moved: b.holed || Math.hypot(rest[0] - b.start[0], rest[1] - b.start[1]) > 0.5 }
  })
  space.clear()
  const [own, ...rest] = done
  const result: ShotResult = { path: own.path, rest: own.rest, holed: own.holed }
  if (others.length > 0) result.others = rest.filter(b => b.moved).map(({ id, path, rest: at, holed }) => ({ id, path, rest: at, holed }))
  return result
}
