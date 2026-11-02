// Which finished games the coach reviews and whose darts it shows; how its tiles, pills and board
// draw a visit.
import type { GameSummary } from '$lib/api'
import type { BedRing } from '$lib/details/boardGeometry'
import { HALF, R, SEGS } from '$shared/board'
import type { ReviewVisit, VisitGrade } from '$shared/coach'
import { AIMS, type Aim } from '$shared/coach/aims'
import { coachable as coachableGame } from '$shared/coach/coachable'

/** The coach reviews the game (shared/coach/coachable.ts) */
export const coachable = (game: Pick<GameSummary, 'mode' | 'config'>): boolean => coachableGame(game.mode, game.config)

/** The seats the coach can review: the humans, in seat order. */
export const coachSeats = (game: Pick<GameSummary, 'players'>): number[] =>
  game.players
    .filter(p => !p.bot)
    .map(p => p.seat)
    .sort((a, b) => a - b)

/** Your seat if you played, else the first human seat; null without one. */
export function defaultCoachSeat(game: Pick<GameSummary, 'players' | 'mySeat'>): number | null {
  const seats = coachSeats(game)
  return game.mySeat !== null && seats.includes(game.mySeat) ? game.mySeat : (seats[0] ?? null)
}

/** The other players' names, comma-separated; "Solo" without one (practice, or you're not a seat). */
export function opponents(game: Pick<GameSummary, 'players' | 'mySeat'>): string {
  const names = game.players.filter(p => p.seat !== game.mySeat).map(p => p.name)
  return names.length ? names.join(', ') : 'Solo'
}

/** The legs the game had: every seat's legs won. */
export const legsPlayed = (game: Pick<GameSummary, 'players'>): number =>
  game.players.reduce((n, p) => n + (Object.hasOwn(p.stats, 'legsWon') ? p.stats.legsWon : 0), 0)

/** How a dart tile looks (Coach-Leg): a treble, double or bull green, a single plain, a single or
 *  25 thrown at a one-dart finish red (a missed double), off the board dashed. */
export type DartTone = 'hit' | 'single' | 'missed' | 'miss'

/** `before`: the score left before the dart */
export function dartTone(name: string, before: number): DartTone {
  if (name === 'Miss') return 'miss'
  if (/^[TD]\d/.test(name) || name === 'Bull') return 'hit'
  const onDouble = before === 50 || (before <= 40 && before % 2 === 0)
  return onDouble ? 'missed' : 'single'
}

/** A visit's darts with their tones; each dart's score before it is the previous dart's `left`. */
export const visitTiles = (v: Pick<ReviewVisit, 'left' | 'darts'>): { name: string; tone: DartTone }[] =>
  v.darts.map((d, i) => ({ name: d.name, tone: dartTone(d.name, i === 0 ? v.left : v.darts[i - 1].left) }))

/** A grade pill's label and classes (Coach-Leg: Great filled lime, the rest tinted). Tip is a note
 *  that leaves the grade alone, in the blue Info style. */
export const GRADE_PILL: Record<VisitGrade | 'tip', { label: string; cls: string }> = {
  great: { label: 'Great', cls: 'bg-accent text-accent-fg' },
  good: { label: 'Good', cls: 'bg-good/15 text-good' },
  ok: { label: 'OK', cls: 'bg-text-dim/15 text-text-dim' },
  weak: { label: 'Weak', cls: 'bg-gold/15 text-gold' },
  mistake: { label: 'Mistake', cls: 'bg-live/15 text-live' },
  tip: { label: 'Tip', cls: 'bg-ice/15 text-ice' },
}

/** The centre of a segment's bed in board units (y up), a single's outer bed; null off the board. */
export function bedCentre(name: string): { x: number; y: number } | null {
  const id = /^S\d/.test(name) ? `SO${name.slice(1)}` : name
  const aim = aimById(id)
  return aim ? { x: aim.x, y: aim.y } : null
}

const AIM_AT: Record<string, Aim> = Object.fromEntries(AIMS.map(a => [a.id, a]))
const aimById = (id: string): Aim | undefined => AIM_AT[id]
/** An AIMS id's kind: T, D, SO, SI or W (T20, D20, SO20, SI20, W20-1); Bull and 25 stay as they are */
const kindOf = (aimId: string) => aimId.replace(/[\d-]/g, '') || aimId
const WHOLE_TURN = 2 * Math.PI
const AIM_RING: Record<string, [r0: number, r1: number]> = {
  T: [R.si, R.tr],
  D: [R.so, R.db],
  SO: [R.tr, R.so],
  SI: [R.bull25, R.si],
  W: [R.tr, R.so],
  Bull: [0, R.bull50],
  '25': [R.bull50, R.bull25],
}

/** The bed an aim (AIMS id) sits in: a wire's is the two outer-single halves either side of it,
 *  the bulls' a whole ring. */
export function aimBed(aimId: string): BedRing | null {
  const aim = aimById(aimId)
  if (!aim) return null
  const [r0, r1] = AIM_RING[kindOf(aimId)]
  if (aim.numbers[0] === 25) return { r0, r1, from: 0, to: WHOLE_TURN }
  const a = Math.atan2(aim.y, aim.x)
  return { r0, r1, from: a - HALF, to: a + HALF }
}

/** A labelled spot on the board, in board units */
export type BoardTag = { label: string; x: number; y: number }
/** Where an Outside tag sits: past the numbers ring */
const OUTSIDE_R = 1.2

/** Where a dart at an aim (AIMS id) most likely lands instead: a treble's own single and its
 *  neighbours', a double's inside single and outside, a single's neighbours, the other bull, a
 *  wire's two numbers. */
export function likelyMisses(aimId: string): BoardTag[] {
  const aim = aimById(aimId)
  if (!aim) return []
  const tag = (label: string, id: string): BoardTag => ({ label, x: AIM_AT[id].x, y: AIM_AT[id].y })
  const kind = kindOf(aimId)
  if (kind === 'Bull') return [tag('25', '25')]
  if (kind === '25') return [tag('Bull', 'Bull')]
  if (kind === 'W') return aim.numbers.map(n => tag(`S${n}`, `SO${n}`))
  const n = aim.numbers[0]
  const i = SEGS.indexOf(n)
  const neighbours = (ring: 'SO' | 'SI') => [SEGS[(i + 19) % 20], SEGS[(i + 1) % 20]].map(m => tag(`S${m}`, `${ring}${m}`))
  if (kind === 'T') return [tag(`S${n}`, `SO${n}`), ...neighbours('SO')]
  if (kind === 'D') {
    const r = Math.hypot(aim.x, aim.y)
    return [tag(`S${n}`, `SO${n}`), { label: 'Outside', x: (aim.x / r) * OUTSIDE_R, y: (aim.y / r) * OUTSIDE_R }]
  }
  return neighbours(kind === 'SI' ? 'SI' : 'SO')
}
