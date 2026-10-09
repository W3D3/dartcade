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

/** Play `shot` from `ball` to the end: at rest, in the cup, or out of time. */
export function simulateShot(hole: Hole, physics: Physics, ball: Pt, shot: Shot): ShotResult {
  const space = buildSpace(hole, physics)
  const body = new Body(BodyType.DYNAMIC, new Vec2(ball[0], ball[1]))
  body.shapes.add(new Circle(BALL_R, undefined, new Material(0, 0, 0, 1, 0)))
  body.isBullet = true
  body.allowRotation = false
  body.space = space
  // Constant friction: a ball rolls v² / 2a, so the speed for `power × maxRoll` is a square root
  const speed0 = Math.sqrt(2 * physics.friction * shot.power * physics.maxRoll)
  body.velocity = new Vec2(shot.dir[0] * speed0, shot.dir[1] * speed0)

  const dt = physics.step
  const sampleEvery = Math.max(1, Math.round(1 / 60 / dt))
  const maxSteps = Math.ceil(physics.maxTime / dt)
  const path: Pt[] = [ball]
  const touching = new Set<number>() // bumpers that already kicked during the current hit
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
      // Touching, or just pushed off it this step
      const reach = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) * dt * 2 + 2
      const near = d < b.r + BALL_R + reach
      if (!near) {
        touching.delete(k)
        return
      }
      // Kick once per hit, after nape has bounced the ball (it's moving away from the bumper)
      const away = d > 0 && body.velocity.x * dx + body.velocity.y * dy > 0
      if (away && !touching.has(k)) {
        touching.add(k)
        if (b.kick) body.velocity = new Vec2(body.velocity.x + (dx / d) * b.kick, body.velocity.y + (dy / d) * b.kick)
      }
    })

    if (i % sampleEvery === 0) path.push([body.position.x, body.position.y])
  }

  const rest: Pt = holed ? hole.cup.at : [body.position.x, body.position.y]
  const last = path[path.length - 1]
  if (last[0] !== rest[0] || last[1] !== rest[1]) path.push(rest)
  space.clear()
  return { path, rest, holed }
}
