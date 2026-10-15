// Pure editing operations on a Hole: every op returns a new Hole, nothing here mutates the one
// it's given. They don't enforce validity (e.g. a corner may cross another edge); `holeChecks`
// ($shared/minigolf/checks) reports that, live, as the editor applies these.
import { G } from '$shared/minigolf/3d/ground'
import type { ElementRef } from '$shared/minigolf/checks'
import { distanceToSegment, edgesOf, pointInPolygon } from '$shared/minigolf/geometry'
import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
import { BOUNCE, BUMPER_R, CUP, GRID, WALL } from '$shared/minigolf/presets'
import type { Bumper, Hole, Pt, Slope, Terrain, Wall } from '$shared/minigolf/types'

/** Snaps p to the editor's grid and/or to a 45° step in direction from an anchor (distance kept).
 *  Angle snapping runs first, then grid snapping, matching how the outline and wall tools draw. */
export function snap(p: Pt, opts: { grid: boolean; angle45From?: Pt }): Pt {
  let [x, y] = p
  if (opts.angle45From) {
    const [ax, ay] = opts.angle45From
    const dist = Math.hypot(x - ax, y - ay)
    if (dist > 0) {
      const step = Math.PI / 4
      const angle = Math.round(Math.atan2(y - ay, x - ax) / step) * step
      x = ax + Math.cos(angle) * dist
      y = ay + Math.sin(angle) * dist
    }
  }
  if (opts.grid) {
    x = Math.round(x / GRID) * GRID
    y = Math.round(y / GRID) * GRID
  }
  return [x, y]
}

/** Where a dragged point goes: `orig` moved by the pointer's travel since `grab` (so an off-centre
 *  grab doesn't make it jump), then snapped. Null while the pointer hasn't gone past `threshold` mm
 *  from `grab`: a click selects, it doesn't move (or snap) anything. */
export function dragTo(orig: Pt, grab: Pt, pointer: Pt, opts: { threshold: number; grid: boolean; angle45From?: Pt }): Pt | null {
  const dx = pointer[0] - grab[0]
  const dy = pointer[1] - grab[1]
  if (Math.hypot(dx, dy) <= opts.threshold) return null
  return snap([orig[0] + dx, orig[1] + dy], opts)
}

// --- Outline corners ---

export function moveCorner(h: Hole, i: number, p: Pt): Hole {
  return { ...h, outline: h.outline.map((c, k) => (k === i ? p : c)) }
}

/** Adds a corner at the middle of the edge after `afterIndex` (wrapping past the last corner). */
export function addCorner(h: Hole, afterIndex: number): Hole {
  const { outline } = h
  const a = outline[afterIndex]
  const b = outline[(afterIndex + 1) % outline.length]
  const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  return { ...h, outline: [...outline.slice(0, afterIndex + 1), mid, ...outline.slice(afterIndex + 1)] }
}

/** Refuses below 3 corners: a hole always needs an outline. */
export function removeCorner(h: Hole, i: number): Hole {
  if (h.outline.length <= 3) return h
  return { ...h, outline: h.outline.filter((_, k) => k !== i) }
}

// --- Tee and cup ---

export function moveTee(h: Hole, p: Pt): Hole {
  return { ...h, tee: p }
}

export function moveCup(h: Hole, p: Pt): Hole {
  return { ...h, cup: { ...h.cup, at: p } }
}

export function setCupSize(h: Hole, size: 'standard' | 'beginner'): Hole {
  return { ...h, cup: { ...h.cup, r: CUP[size] } }
}

// --- Bumper and wall ---

export function addBumper(h: Hole, at: Pt, size: 'S' | 'M' | 'L', bounce: 'soft' | 'normal' | 'strong'): Hole {
  const bumper: Bumper = { at, r: BUMPER_R[size], restitution: BOUNCE[bounce] }
  return { ...h, bumpers: [...h.bumpers, bumper] }
}

export function addWall(h: Hole, from: Pt, to: Pt, thickness: 'thin' | 'normal'): Hole {
  const wall: Wall = { points: [from, to], thickness: WALL[thickness] }
  return { ...h, walls: [...h.walls, wall] }
}

// --- Terrain shapes ---

/** A radial slope: a hill (heightMm > 0) pushes away from `center` out to `radius`, a dip (< 0) pulls towards it. */
export function addRadial(h: Hole, center: Pt, radius: number, heightMm: number): Hole {
  return { ...h, slopes: [...h.slopes, { radial: { center, radius, strength: (heightMm * G) / radius } }] }
}

/** A bump slope: a ridge from `from` to `to`, falling away on both sides out to `width`. */
export function addRidge(h: Hole, from: Pt, to: Pt, width: number, heightMm: number): Hole {
  return { ...h, slopes: [...h.slopes, { bump: { from, to, width, strength: (heightMm * G) / width } }] }
}

const RAMP_EDGE_INDEX = { W: 0, N: 1, E: 2, S: 3 } as const

/** A mesa's edges with `rampSide` 600 mm (a long, gentle slope down) and the other three 60 mm
 *  (a near-cliff), so the plateau stands in flat felt without a step. */
export function plateauEdges(rampSide: 'N' | 'E' | 'S' | 'W'): [number, number, number, number] {
  const edges: [number, number, number, number] = [60, 60, 60, 60]
  edges[RAMP_EDGE_INDEX[rampSide]] = 600
  return edges
}

/** A mesa from `from` to `to`, ramping down on `rampSide` (see `plateauEdges`). */
export function addPlateau(h: Hole, from: Pt, to: Pt, heightMm: number, rampSide: 'N' | 'E' | 'S' | 'W'): Hole {
  const terrain: Terrain = { mesa: { from, to, height: heightMm, edges: plateauEdges(rampSide) } }
  return { ...h, terrain: [...(h.terrain ?? []), terrain] }
}

// --- Change one element's fields (the Properties panel) ---

export function updateBumper(h: Hole, i: number, patch: Partial<Bumper>): Hole {
  return { ...h, bumpers: h.bumpers.map((b, k) => (k === i ? { ...b, ...patch } : b)) }
}

export function updateWall(h: Hole, i: number, patch: Partial<Wall>): Hole {
  return { ...h, walls: h.walls.map((w, k) => (k === i ? { ...w, ...patch } : w)) }
}

export function updateSlope(h: Hole, i: number, slope: Slope): Hole {
  return { ...h, slopes: h.slopes.map((s, k) => (k === i ? slope : s)) }
}

/** A hill's height or a dip's depth (mm, the Properties field) set to `mm`. Only a positive
 *  `mm` counts: at 0 the slope's sign, and with it hill or dip, would be lost. */
export function setRadialHeight(h: Hole, i: number, mm: number): Hole {
  const s = h.slopes.at(i)
  if (!s || !('radial' in s) || !Number.isFinite(mm) || mm <= 0) return h
  const sign = s.radial.strength < 0 ? -1 : 1
  return updateSlope(h, i, { radial: { ...s.radial, strength: (sign * mm * G) / s.radial.radius } })
}

export function updateTerrain(h: Hole, i: number, terrain: Terrain): Hole {
  return { ...h, terrain: (h.terrain ?? []).map((t, k) => (k === i ? terrain : t)) }
}

// --- Move/remove/duplicate any element by ref ---

const shiftBy =
  (delta: Pt) =>
  (p: Pt): Pt => [p[0] + delta[0], p[1] + delta[1]]

function movedSlope(s: Slope, shift: (p: Pt) => Pt): Slope {
  return 'radial' in s
    ? { radial: { ...s.radial, center: shift(s.radial.center) } }
    : { bump: { ...s.bump, from: shift(s.bump.from), to: shift(s.bump.to) } }
}

function movedTerrain(t: Terrain, shift: (p: Pt) => Pt): Terrain {
  return { mesa: { ...t.mesa, from: shift(t.mesa.from), to: shift(t.mesa.to) } }
}

/** `outline` addresses a corner index; `tee`/`cup` their single point. */
export function moveElement(h: Hole, ref: ElementRef, delta: Pt): Hole {
  const shift = shiftBy(delta)
  switch (ref.kind) {
    case 'outline':
      return moveCorner(h, ref.index, shift(h.outline[ref.index]))
    case 'tee':
      return moveTee(h, shift(h.tee))
    case 'cup':
      return moveCup(h, shift(h.cup.at))
    case 'bumper':
      return { ...h, bumpers: h.bumpers.map((b, i) => (i === ref.index ? { ...b, at: shift(b.at) } : b)) }
    case 'wall':
      return { ...h, walls: h.walls.map((w, i) => (i === ref.index ? { ...w, points: w.points.map(shift) } : w)) }
    case 'slope':
      return { ...h, slopes: h.slopes.map((s, i) => (i === ref.index ? movedSlope(s, shift) : s)) }
    case 'terrain':
      return { ...h, terrain: (h.terrain ?? []).map((t, i) => (i === ref.index ? movedTerrain(t, shift) : t)) }
    case 'circle':
      return h.shape
        ? { ...h, shape: { ...h.shape, circles: h.shape.circles.map((c, i) => (i === ref.index ? { ...c, center: shift(c.center) } : c)) } }
        : h
  }
}

/** A hole always has one tee and one cup, so those refs (and the outline, addressed by corner
 *  index) are refused here; use `removeCorner` for the outline. */
export function removeElement(h: Hole, ref: ElementRef): Hole {
  switch (ref.kind) {
    case 'outline':
      return removeCorner(h, ref.index)
    case 'tee':
    case 'cup':
      return h
    case 'bumper':
      return { ...h, bumpers: h.bumpers.filter((_, i) => i !== ref.index) }
    case 'wall':
      return { ...h, walls: h.walls.filter((_, i) => i !== ref.index) }
    case 'slope':
      return { ...h, slopes: h.slopes.filter((_, i) => i !== ref.index) }
    case 'terrain':
      return { ...h, terrain: (h.terrain ?? []).filter((_, i) => i !== ref.index) }
    case 'circle':
      return h.shape ? { ...h, shape: { ...h.shape, circles: h.shape.circles.filter((_, i) => i !== ref.index) } } : h
  }
}

/** Only bumpers, walls and terrain shapes duplicate; the outline, tee and cup are singular. */
export function duplicateElement(h: Hole, ref: ElementRef, offset: Pt): Hole {
  const shift = shiftBy(offset)
  switch (ref.kind) {
    case 'bumper': {
      const b = h.bumpers[ref.index]
      return { ...h, bumpers: [...h.bumpers, { ...b, at: shift(b.at) }] }
    }
    case 'wall': {
      const w = h.walls[ref.index]
      return { ...h, walls: [...h.walls, { ...w, points: w.points.map(shift) }] }
    }
    case 'slope': {
      const s = h.slopes[ref.index]
      return { ...h, slopes: [...h.slopes, movedSlope(s, shift)] }
    }
    case 'terrain': {
      const t = (h.terrain ?? [])[ref.index]
      return { ...h, terrain: [...(h.terrain ?? []), movedTerrain(t, shift)] }
    }
    default:
      return h
  }
}

// --- The Elements list ---

/** The preset name matching `value`, or a fallback when it was set outside the editor's presets. */
function nameOf(presets: Record<string, number>, value: number, fallback: (v: number) => string): string {
  const found = Object.entries(presets).find(([, v]) => v === value)
  return found ? found[0] : fallback(value)
}

const RAMP_WORD = ['west', 'north', 'east', 'south'] as const

export function elementsOf(h: Hole): { ref: ElementRef; label: string; detail: string }[] {
  const items: { ref: ElementRef; label: string; detail: string }[] = []

  h.bumpers.forEach((b, i) => {
    const size = nameOf(BUMPER_R, b.r, v => `r ${Math.round(v)} mm`)
    const bounce = nameOf(BOUNCE, b.restitution ?? DEFAULT_PHYSICS.bumperRestitution, v => `b ${v}`)
    items.push({ ref: { kind: 'bumper', index: i }, label: `Bumper ${i + 1}`, detail: `${size} · ${bounce}` })
  })

  h.walls.forEach((w, i) => {
    const thickness = nameOf(WALL, w.thickness ?? DEFAULT_PHYSICS.wallThickness, v => `t ${Math.round(v)} mm`)
    items.push({ ref: { kind: 'wall', index: i }, label: `Wall ${i + 1}`, detail: thickness })
  })

  h.slopes.forEach((s, i) => {
    const ref: ElementRef = { kind: 'slope', index: i }
    if ('radial' in s) {
      const heightMm = Math.round((s.radial.strength * s.radial.radius) / G)
      items.push(heightMm < 0 ? { ref, label: 'Dip', detail: `${-heightMm} mm` } : { ref, label: 'Hill', detail: `${heightMm} mm` })
    } else {
      const heightMm = Math.round((s.bump.strength * s.bump.width) / G)
      items.push({ ref, label: 'Ridge', detail: `${heightMm} mm` })
    }
  })

  ;(h.terrain ?? []).forEach((t, i) => {
    const [left, top, right, bottom] = t.mesa.edges
    const rampIndex = [left, top, right, bottom].indexOf(Math.max(left, top, right, bottom))
    items.push({ ref: { kind: 'terrain', index: i }, label: 'Plateau', detail: `ramp ${RAMP_WORD[rampIndex]}` })
  })

  return items
}

// --- Picking ---

/** Half the tee box's side, mm (HoleView draws it 140 mm across). */
const TEE_HALF = 70

/** The element under p, topmost first: tee, cup, bumpers, walls, then the ground's shapes.
 *  `slack` (mm) widens every target so thin things stay clickable; `groundOnly` looks through to
 *  the terrain shapes (Flatten). The outline isn't picked here: its corners have their own handles. */
export function hitTest(h: Hole, p: Pt, slack = 20, groundOnly = false): ElementRef | null {
  const near = (q: Pt, r: number) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r + slack
  if (groundOnly) return hitGround(h, p, slack, near)
  if (Math.abs(p[0] - h.tee[0]) <= TEE_HALF + slack && Math.abs(p[1] - h.tee[1]) <= TEE_HALF + slack) return { kind: 'tee', index: 0 }
  if (near(h.cup.at, h.cup.r)) return { kind: 'cup', index: 0 }
  for (let i = h.bumpers.length - 1; i >= 0; i--) if (near(h.bumpers[i].at, h.bumpers[i].r)) return { kind: 'bumper', index: i }
  for (let i = h.walls.length - 1; i >= 0; i--) {
    const w = h.walls[i]
    const half = (w.thickness ?? DEFAULT_PHYSICS.wallThickness) / 2 + slack
    if (edgesOf(w.points, !!w.closed).some(([a, b]) => distanceToSegment(p, a, b) <= half)) return { kind: 'wall', index: i }
    if (w.closed && pointInPolygon(p, w.points)) return { kind: 'wall', index: i }
  }
  return hitGround(h, p, slack, near)
}

function hitGround(h: Hole, p: Pt, slack: number, near: (q: Pt, r: number) => boolean): ElementRef | null {
  for (let i = h.slopes.length - 1; i >= 0; i--) {
    const s = h.slopes[i]
    const hit = 'radial' in s ? near(s.radial.center, s.radial.radius) : distanceToSegment(p, s.bump.from, s.bump.to) <= s.bump.width
    if (hit) return { kind: 'slope', index: i }
  }
  const terrain = h.terrain ?? []
  for (let i = terrain.length - 1; i >= 0; i--) {
    const { from, to } = terrain[i].mesa
    const inside = (v: number, a: number, b: number) => v >= Math.min(a, b) - slack && v <= Math.max(a, b) + slack
    if (inside(p[0], from[0], to[0]) && inside(p[1], from[1], to[1])) return { kind: 'terrain', index: i }
  }
  return null
}
