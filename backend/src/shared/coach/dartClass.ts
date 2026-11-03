// What each dart of a coached leg most likely was: its target, its category and how far it missed.
// It describes what probably happened; the strategy notes (notes.ts) keep the benefit of the doubt.
import { HALF, R, SEGS } from '../board.js'
import { CHECKOUTS } from '../checkoutTable.js'
import { AIM_RINGS, AIMS, aimKind, directOutId, oneDartFinish, type Aim } from './aims.js'
import { landedNumber } from './aim.js'
import type { Evaluation } from './model.js'
import { dartPoints, type Throw } from './walk.js'

// --- Constants, to be tuned with the admin sandbox ---
/** An amateur's spread, for guessing targets only (the strategy model keeps the reference player's):
 *  20 mm in board units. Narrower, and a wedge-wide miss loses to any aim on the number it landed in. */
const SIGMA_ATTR = 20 / 170
/** Finish prior exp((v − best) / TAU): how sharply the evaluator's better aims are preferred */
const TAU = 0.01
/** The checkout table's first darts and T16 get at least this prior */
const MIN_PRIOR = Math.exp(-3)
/** The aims on the number a dart landed in get at least this prior: low enough that a dart about a
 *  wedge off a good aim still reads as its miss, high enough that one further off isn't wild */
const LANDED_PRIOR = Math.exp(-6)
/** A dart more than this many wedges from its picked target has no target */
const WILD_WEDGES = 2
/** The evaluator's best aims that are candidates on a finish */
const TOP_K = 5
const SCORING_PRIOR: Readonly<Record<string, number>> = { T20: 1, T19: 0.6, T18: 0.3, T17: 0.3 }
/** r = 1 is the outer double wire, 170 mm from the centre */
const MM_PER_UNIT = 170

export type DartKind =
  | 'scoringHit'
  | 'scoringSingle'
  | 'scoringMiss'
  | 'route'
  | 'split'
  | 'double'
  | 'bull'
  | 'bustBack'
  | 'bust'
  | 'wild'
  | 'notCounted'

export type DartClass = {
  kind: DartKind
  /** The dart landed in its target's bed, or did what it was meant to */
  hit: boolean
  target: { aimId: string; label: string } | null
  /** scoringSingle: inner | outer; double: inside | outside | wide; bull: sb (25 for the Bull) | db (Bull for the 25) */
  detail: string | null
  distanceMm: number | null
  /** + outside (away from the bull), − inside (towards it) */
  radialMm: number | null
  /** + clockwise (towards the next number in SEGS), − anticlockwise */
  tangentialMm: number | null
  /** The distance to the nearest point of the target's bed, 0 inside it (a wire, which has no
   *  bed: distanceMm). The miss a player means: 1 mm past the treble wire, not 16 mm off its middle */
  edgeMm: number | null
  /** That nearest point to the dart, the same signs as radialMm and tangentialMm; 0 when not off that way */
  edgeRadialMm: number | null
  edgeTangentialMm: number | null
  /** The landed number's signed wedge distance from the target's, + clockwise */
  wedgesOff: number | null
  /** No camera coords: placed at the centre of the bed it landed in */
  estimated: boolean
  /** route, split, double, bull, bustBack: what the target would have left, and what the dart left */
  plannedLeave: number | null
  actualLeave: number | null
}

const NONE: DartClass = {
  kind: 'wild',
  hit: false,
  target: null,
  detail: null,
  distanceMm: null,
  radialMm: null,
  tangentialMm: null,
  edgeMm: null,
  edgeRadialMm: null,
  edgeTangentialMm: null,
  wedgesOff: null,
  estimated: false,
  plannedLeave: null,
  actualLeave: null,
}

/** A dart thrown after a bust in its visit: the walk (walk.ts) leaves it out, it scores nothing. */
export const NOT_COUNTED: DartClass = { ...NONE, kind: 'notCounted' }

const AIM_INDEX = new Map(AIMS.map((a, i) => [a.id, i]))
const aimAt = (id: string): number => AIM_INDEX.get(id) ?? -1

/** The aim at the centre of a typed dart's bed (the outer single for a single); null for a miss. */
function bedCentre(seg: Throw['d']['segment']): Aim | null {
  const { number: n, multiplier: m } = seg
  const id = n === 50 ? 'Bull' : n === 25 ? '25' : m === 3 ? `T${n}` : m === 2 ? `D${n}` : m === 1 ? `SO${n}` : null
  return id === null ? null : (AIMS[aimAt(id)] ?? null)
}

/** The checkout table's labels (T20, D16, S9, Bull, 25) as AIMS indexes, a single as its outer bed. */
const tableAim = (label: string) => aimAt(label.startsWith('S') ? `SO${label.slice(1)}` : label)

/** Whether aim `id` can be a Finish target on `left` for a dart that didn't land in the bull: the
 *  bull aims are none, except the Bull on 50; on a one-dart finish the only double is the finishing
 *  one, so a dart near another double counts as wide of it. */
const finishTarget = (id: string, left: number) =>
  id === directOutId(left) || (id !== 'Bull' && id !== '25' && (!oneDartFinish(left) || !id.startsWith('D')))

type BustAims = { aims: Set<number>; best: boolean }

/** The aims whose likeliest outcome busts, and whether busting back to the visit's start is worth
 *  at least every other aim. */
function bustAims(e: Evaluation): BustAims {
  const aims = new Set(AIMS.flatMap((_, a) => (likeliest(e, a).after === 'bust' ? [a] : [])))
  // The visit's bust value (w · nextVisit(start)): the same for every aim that can bust
  let back = 0
  for (let a = 0; a < AIMS.length && back === 0; a++) back = e.outcomes(a).find(o => o.after === 'bust')?.value ?? 0
  const safe = e.values.filter((_, a) => !aims.has(a))
  return { aims, best: back >= Math.max(0, ...safe) }
}

/** The aims on number `n`: its treble, double, singles and both wires; the bull and 25 for 25. */
function aimsOn(n: number): number[] {
  if (n === 25) return [aimAt('Bull'), aimAt('25')]
  const i = SEGS.indexOf(n)
  const prev = SEGS[(i + 19) % 20]
  const next = SEGS[(i + 1) % 20]
  return [`T${n}`, `D${n}`, `SO${n}`, `SI${n}`, `W${n}-${next}`, `W${prev}-${n}`].map(aimAt)
}

/** Finish candidates (AIMS indexes) and their priors: the evaluator's top K, the table's first
 *  darts, T16 and the aims on the number the dart landed in. An aim whose likeliest outcome busts
 *  is one only off a one-dart finish; when busting back is the best there is, every such aim is
 *  one, at prior 1. A dart in the bull or 25 has the two bull aims only. */
export function finishCandidates(
  left: number,
  darts: number,
  e: Evaluation,
  landed: number | null,
  busts = bustAims(e),
): { a: number; prior: number }[] {
  const v = e.values
  const best = Math.max(...v)
  const prior = (a: number) => Math.exp((v[a] - best) / TAU)
  if (landed === 25) return aimsOn(25).map(a => ({ a, prior: Math.max(prior(a), LANDED_PRIOR) }))
  // The finishing double can bust (D1 on 2 likeliest lands in the S1) and still is the target
  const allowed = (a: number) =>
    finishTarget(AIMS[a].id, left) && (!oneDartFinish(left) || !busts.aims.has(a) || AIMS[a].id === directOutId(left))
  const top = v
    .map((_, i) => i)
    .filter(allowed)
    .sort((a, b) => v[b] - v[a] || a - b)
    .slice(0, TOP_K)
  const entry = left in CHECKOUTS ? CHECKOUTS[left] : null
  const firsts = [...(entry?.routes ?? []), ...(darts === 2 && entry?.twoDarts ? [entry.twoDarts] : [])].map(r => tableAim(r[0]))
  const floored = new Set([...firsts, aimAt('T16')].filter(a => a >= 0 && allowed(a)))
  const own = new Set((landed === null ? [] : aimsOn(landed)).filter(allowed))
  const backs = new Set(!oneDartFinish(left) && busts.best ? [...busts.aims].filter(allowed) : [])
  const floor = (a: number) => (floored.has(a) ? MIN_PRIOR : own.has(a) ? LANDED_PRIOR : 0)
  return [...new Set([...top, ...floored, ...own, ...backs])].map(a => ({ a, prior: backs.has(a) ? 1 : Math.max(prior(a), floor(a)) }))
}

/** `n`'s signed wedge distance from the nearest of `numbers` in SEGS order, + clockwise. */
function wedges(n: number | null, numbers: readonly number[]): number | null {
  if (n === null || n === 25 || numbers.includes(25)) return null
  const off = numbers.map(t => ((((SEGS.indexOf(n) - SEGS.indexOf(t)) % 20) + 30) % 20) - 10)
  return off.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
}

/** The score after hitting `points` from `left`; a bust goes back to the visit's `start`. */
const leave = (left: number, points: number, double: boolean, start: number) => {
  const after = left - points
  return after === 0 && double ? 0 : after < 2 ? start : after
}

/** What hitting the aim's bed scores: a wire counts as its likeliest outcome. */
function aimPoints(a: Aim, likeliest: number): [points: number, double: boolean] {
  const n = a.numbers[0]
  if (a.id === 'Bull') return [50, true]
  if (a.id === '25') return [25, false]
  if (a.id.startsWith('T')) return [3 * n, false]
  if (a.id.startsWith('D')) return [2 * n, true]
  return a.id.startsWith('W') ? [likeliest, false] : [n, false]
}

/** Wrapped to (−π, π] */
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** The vector from the nearest point of `aim`'s bed to `p`, in board units, as radial (+ outside)
 *  and tangential (+ clockwise) parts; null for a wire, which has no bed. A bed is its radial band
 *  across its number's wedge (the bulls: a whole circle). Inside the wedge's angles the nearest
 *  point is straight in or out; past them it is on the nearer radial edge (an arc's nearest point
 *  there is that edge's end). */
export function fromBed(aim: Aim, p: { x: number; y: number }): { radial: number; tangential: number } | null {
  const kind = aimKind(aim.id)
  if (kind === 'W') return null
  const [r0, r1] = AIM_RINGS[kind]
  const r = Math.hypot(p.x, p.y)
  const theta = Math.atan2(p.y, p.x)
  const off = wrap(theta - Math.atan2(aim.y, aim.x))
  if (aim.numbers[0] === 25 || Math.abs(off) <= HALF) return { radial: r - Math.min(Math.max(r, r0), r1), tangential: 0 }
  // The edge on the dart's side; the other is further for any |off| ≤ π
  const phi = Math.atan2(aim.y, aim.x) + Math.sign(off) * HALF
  const u = { x: Math.cos(phi), y: Math.sin(phi) }
  const t = Math.min(Math.max(p.x * u.x + p.y * u.y, r0), r1)
  const v = { x: p.x - t * u.x, y: p.y - t * u.y }
  // Clockwise at phi is (sin φ, −cos φ)
  return { radial: v.x * u.x + v.y * u.y, tangential: v.x * u.y - v.y * u.x }
}

const likeliest = (e: Evaluation, a: number) => e.outcomes(a).reduce((x, y) => (y.outcome[3] > x.outcome[3] ? y : x))

const isBullAim = (a: Aim) => a.id === 'Bull' || a.id === '25'

/** One walked dart's class. `evaluation` is its visit's evaluator (model.ts) at the dart's (left,
 *  darts); null on Scoring (more than 170 left), which doesn't use it. */
export function classifyDart(t: Throw, ctx: { evaluation: Evaluation | null }): DartClass {
  const seg = t.d.segment
  const bed = t.d.coords === null ? bedCentre(seg) : null
  const pos = t.d.coords ?? bed
  const estimated = t.d.coords === null
  const scoring = t.left > 170
  const evaluation = scoring ? null : ctx.evaluation
  if (!scoring && !evaluation) throw new Error('classifyDart: a dart on a finish needs its evaluation')

  // Step 1: the target
  const landed = landedNumber(t.d)
  const busts = evaluation ? bustAims(evaluation) : null
  const cands =
    evaluation && busts
      ? finishCandidates(t.left, t.darts, evaluation, landed, busts)
      : landed === 25
        ? aimsOn(25).map(a => ({ a, prior: 1 }))
        : Object.entries(SCORING_PRIOR).map(([id, prior]) => ({ a: aimAt(id), prior }))
  // A typed miss on a one-dart finish was at the double, off the board: where, nobody knows
  const out = directOutId(t.left)
  let target: { a: number; d: number | null } | null = !pos && evaluation && out ? { a: aimAt(out), d: null } : null
  if (pos) {
    let best = { score: -1, prior: -1 }
    for (const { a, prior } of cands) {
      const d = Math.hypot(pos.x - AIMS[a].x, pos.y - AIMS[a].y)
      const score = prior * Math.exp(-(d * d) / (2 * SIGMA_ATTR * SIGMA_ATTR))
      if (score > best.score || (score === best.score && prior > best.prior)) {
        best = { score, prior }
        target = { a, d }
      }
    }
  }
  const wedgesOff = target ? wedges(landed, AIMS[target.a].numbers) : null
  if (wedgesOff !== null && Math.abs(wedgesOff) > WILD_WEDGES) target = null
  // The Bull on 50 is the only bull aim for a dart outside the bull (finishTarget). Its misses
  // spread into the inner singles; a typed single could be anywhere in its bed
  const nearMiddle = t.d.coords ? Math.hypot(t.d.coords.x, t.d.coords.y) <= R.si : landed === 25
  if (target?.d != null && isBullAim(AIMS[target.a]) && !nearMiddle) target = null

  // Step 3: miss properties, against the target's point and its bed's nearest point (a wire's point for a wire)
  const base: DartClass = { ...NONE, estimated }
  const aim = target ? AIMS[target.a] : null
  if (aim) base.target = { aimId: aim.id, label: aim.label }
  if (aim && pos && target?.d != null) {
    const r = Math.hypot(pos.x, pos.y)
    const ra = Math.hypot(aim.x, aim.y)
    // Clockwise is decreasing board angle; wrapped to (−π, π]
    const angle = Math.atan2(aim.y, aim.x) - Math.atan2(pos.y, pos.x)
    const radialMm = (r - ra) * MM_PER_UNIT
    const tangentialMm = ra * wrap(angle) * MM_PER_UNIT
    const edge = fromBed(aim, pos)
    Object.assign(base, {
      distanceMm: target.d * MM_PER_UNIT,
      radialMm,
      tangentialMm,
      edgeMm: edge ? Math.hypot(edge.radial, edge.tangential) * MM_PER_UNIT : target.d * MM_PER_UNIT,
      edgeRadialMm: edge ? edge.radial * MM_PER_UNIT : radialMm,
      edgeTangentialMm: edge ? edge.tangential * MM_PER_UNIT : tangentialMm,
      wedgesOff,
    })
  }

  // Step 2: the category
  const actualLeave = t.checkout ? 0 : t.bust ? t.start : t.left - dartPoints(t.d)
  // On a one-dart finish you go for the double: no dart there busts on purpose
  const mayBustBack = !oneDartFinish(t.left)
  if (t.bust && busts) {
    // The dart busted, so some aim (T20 at least) has a bust outcome
    return busts.best && mayBustBack
      ? { ...base, kind: 'bustBack', hit: true, plannedLeave: t.start, actualLeave }
      : { ...base, kind: 'bust' }
  }
  if (!aim || !target) return { ...base, kind: 'wild' }

  const n = aim.numbers[0]
  const inBed = aim.id.startsWith('W') ? seg.multiplier === 1 && aim.numbers.includes(seg.number) : seg.name === aim.label
  const bull = () => {
    const detail = inBed ? null : seg.number === 25 && aim.id === 'Bull' ? 'sb' : seg.number === 50 && aim.id === '25' ? 'db' : null
    return { kind: 'bull', hit: inBed, detail } as const
  }
  if (!evaluation) {
    if (isBullAim(aim)) return { ...base, ...bull() }
    if (seg.number !== n) return { ...base, kind: 'scoringMiss' }
    if (seg.multiplier === 3) return { ...base, kind: 'scoringHit', hit: true }
    if (seg.multiplier === 1) {
      const detail = t.d.coords ? (Math.hypot(t.d.coords.x, t.d.coords.y) < R.si ? 'inner' : 'outer') : null
      return { ...base, kind: 'scoringSingle', detail }
    }
    return { ...base, kind: 'scoringMiss' }
  }

  const top = likeliest(evaluation, target.a)
  if (top.after === 'bust' && mayBustBack) return { ...base, kind: 'bustBack', plannedLeave: t.start, actualLeave }
  const [points, double] = aimPoints(aim, top.outcome[1])
  const plannedLeave = leave(t.left, points, double, t.start)
  const leaves = { ...base, plannedLeave, actualLeave }

  if (isBullAim(aim)) return { ...leaves, ...bull() }
  if (aim.id === out) {
    const detail = t.checkout ? null : seg.multiplier === 0 ? 'outside' : seg.number === n ? 'inside' : 'wide'
    return { ...leaves, kind: 'double', hit: t.checkout, detail }
  }
  // A split leaves a one-dart finish from one; anything else on a finish is a route
  const split = oneDartFinish(t.left) && oneDartFinish(plannedLeave)
  return { ...leaves, kind: split ? 'split' : 'route', hit: inBed || actualLeave === plannedLeave }
}
