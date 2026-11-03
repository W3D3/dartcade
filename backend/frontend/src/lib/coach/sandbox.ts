// The admin Coach sandbox (#/admin/coach): a made-up visit from a score, an optional opponent and
// up to three darts, reviewed the way the coach reviews a real leg.
import { segmentAt } from '$shared/board'
import { reviewLeg, type ReviewVisit } from '$shared/coach'
import { AIMS, type Aim } from '$shared/coach/aims'
import { evaluator, nextVisit } from '$shared/coach/model'
import { dartPoints, walkVisit, type CoachDart, type CoachLeg, type CoachVisit } from '$shared/coach/walk'

export type SandboxInput = {
  /** The score left when the visit starts, 2–501 */
  start: number
  /** The opponent's score left; null: solo */
  opponent: number | null
  /** Your 3-dart average, for the scoring grades; null: the visit's own */
  average: number | null
}

export type AimChance = { aim: Aim; label: string; chance: number }

export type SandboxResult = {
  /** Null before the first dart */
  visit: ReviewVisit | null
  /** The score before the next dart */
  left: number
  /** No more darts: three thrown, a bust or a checkout */
  done: boolean
  /** The next dart's best aims with their checkout chance; empty when done */
  next: AimChance[]
}

const LABEL = /^(?:([SDT])([1-9]|1\d|20)|(BULL)|(25)|(MISS))$/

/** A typed dart (S20, T19, D16, Bull, 25, Miss; any case), without a position; null when it isn't one. */
export function dartFromLabel(raw: string): CoachDart | null {
  const m = LABEL.exec(raw.trim().toUpperCase())
  if (!m) return null
  if (m[3]) return { segment: { name: 'Bull', number: 50, multiplier: 1 }, coords: null }
  if (m[4]) return { segment: { name: '25', number: 25, multiplier: 1 }, coords: null }
  if (m[5]) return { segment: { name: 'Miss', number: 0, multiplier: 0 }, coords: null }
  const multiplier = m[1] === 'S' ? 1 : m[1] === 'D' ? 2 : 3
  return { segment: { name: `${m[1]}${m[2]}`, number: Number(m[2]), multiplier }, coords: null }
}

/** A dart where the board was clicked (board units, y up). */
export function dartAt(p: { x: number; y: number }): CoachDart {
  const { name, number, multiplier } = segmentAt(p.x, p.y)
  return { segment: { name, number, multiplier }, coords: p }
}

/** The visit as the game stores it, a bust scoring nothing. */
function visitOf(start: number, darts: readonly CoachDart[]): CoachVisit {
  if (walkVisit(start, darts).some(s => s.bust)) return { seat: 0, darts, scored: 0, remaining: start, bust: true }
  const scored = darts.reduce((sum, d) => sum + dartPoints(d), 0)
  return { seat: 0, darts, scored, remaining: start - scored, bust: false }
}

/** The leg the coach reviews: the opponent's (empty) visit on their score first, then yours. */
export function sandboxLeg(input: SandboxInput, darts: readonly CoachDart[]): CoachLeg {
  const mine = visitOf(input.start, darts)
  const visits = input.opponent === null ? [mine] : [{ seat: 1, darts: [], scored: 0, remaining: input.opponent, bust: false }, mine]
  return { leg: 0, visits }
}

/** The next dart's `top` best aims from `left` with `darts` darts left in a visit that started on
 *  `start`, by their chance to check out this visit or (weighted by w) the next; none that can't. */
export function bestAims(start: number, left: number, darts: number, w: number, top: number): { aim: Aim; chance: number }[] {
  const { values } = evaluator(start, w)(left, darts)
  // Outer and inner single share a label: keep the better of the two
  const best = new Map<string, { aim: Aim; chance: number }>()
  for (const [i, v] of values.entries()) {
    const seen = best.get(AIMS[i].label)
    if (!seen || v > seen.chance) best.set(AIMS[i].label, { aim: AIMS[i], chance: v })
  }
  return [...best.values()]
    .filter(a => a.chance > 0)
    .sort((a, b) => b.chance - a.chance)
    .slice(0, top)
}

/** How many of the best aims to show for the next dart */
const TOP = 5

export function sandbox(input: SandboxInput, darts: readonly CoachDart[]): SandboxResult {
  const leg = sandboxLeg(input, darts)
  const visit =
    reviewLeg([leg], 0, 0, { startScore: input.start, average: input.average, opponentName: () => 'Opponent' })?.visits[0] ?? null
  const left = visit ? (visit.darts.at(-1)?.left ?? input.start) : input.start
  const done = visit !== null && (visit.bust || visit.then === 0 || darts.length >= 3)
  if (done) return { visit, left, done, next: [] }

  const w = input.opponent === null ? 1 : 1 - nextVisit(input.opponent)
  const next = bestAims(input.start, left, 3 - darts.length, w, TOP).map(a => ({ ...a, label: a.aim.label }))
  return { visit, left, done, next }
}
