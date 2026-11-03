// The board around a visit (Coach-Leg, the sandbox): where an aim sits and its bed, where a dart at
// the better aim likely lands instead, and the Better line that words it.
import type { BedRing } from '$lib/details/boardGeometry'
import { HALF, SEGS } from '$shared/board'
import { checkoutHint } from '$shared/checkout.js'
import type { CoachNote } from '$shared/coach'
import { AIM_RINGS, AIMS, aimById, aimIndex, aimKind, aimPoints } from '$shared/coach/aims'

/** An aim's point (AIMS id) in board units; null for an unknown id */
export const aimPoint = (aimId: string): { x: number; y: number } | null => {
  const a = aimById(aimId)
  return a ? { x: a.x, y: a.y } : null
}
const WHOLE_TURN = 2 * Math.PI

/** The bed an aim (AIMS id) sits in: a wire's is the two outer-single halves either side of it,
 *  the bulls' a whole ring. */
export function aimBed(aimId: string): BedRing | null {
  const aim = aimById(aimId)
  if (!aim) return null
  const [r0, r1] = AIM_RINGS[aimKind(aimId)]
  if (aim.numbers[0] === 25) return { r0, r1, from: 0, to: WHOLE_TURN }
  const a = Math.atan2(aim.y, aim.x)
  return { r0, r1, from: a - HALF, to: a + HALF }
}

/** A labelled spot on the board, in board units */
export type BoardTag = { label: string; x: number; y: number }
/** A likely miss: its tag and what a dart there scores (0 off the board) */
export type MissTag = BoardTag & { points: number }
/** Where an Outside tag sits: past the numbers ring */
const OUTSIDE_R = 1.2

/** Where a dart at an aim (AIMS id) most likely lands instead: a treble's own single and its
 *  neighbours', a double's inside single and outside, a single's neighbours, the other bull, a
 *  wire's two numbers. */
export function likelyMisses(aimId: string): MissTag[] {
  const aim = aimById(aimId)
  if (!aim) return []
  const tag = (label: string, id: string): MissTag => {
    const a = AIMS[aimIndex(id)]
    return { label, x: a.x, y: a.y, points: aimPoints(a)[0] }
  }
  const kind = aimKind(aimId)
  if (kind === 'Bull') return [tag('25', '25')]
  if (kind === '25') return [tag('Bull', 'Bull')]
  if (kind === 'W') return aim.numbers.map(n => tag(`S${n}`, `SO${n}`))
  const n = aim.numbers[0]
  const i = SEGS.indexOf(n)
  const neighbours = (ring: 'SO' | 'SI') => [SEGS[(i + 19) % 20], SEGS[(i + 1) % 20]].map(m => tag(`S${m}`, `${ring}${m}`))
  if (kind === 'T') return [tag(`S${n}`, `SO${n}`), ...neighbours('SO')]
  if (kind === 'D') {
    const r = Math.hypot(aim.x, aim.y)
    return [tag(`S${n}`, `SO${n}`), { label: 'Outside', x: (aim.x / r) * OUTSIDE_R, y: (aim.y / r) * OUTSIDE_R, points: 0 }]
  }
  return neighbours(kind === 'SI' ? 'SI' : 'SO')
}

/** What a dart scoring `points` (a likelyMisses tag's) leaves from `left`, with its one-dart
 *  finish: "8 = D4"; null when that's no one-dart finish or the miss scores nothing. */
export function missLeaves(left: number, points: number): string | null {
  const after = left - points
  const out = points > 0 && after >= 2 ? checkoutHint(after, 'double', 1) : null
  return out ? `${after} = ${out[0]}` : null
}

/** The better aim's likely misses as board tags, those leaving a finish with it: "S8 · 8 = D4" */
export const missTags = (note: Pick<CoachNote, 'left' | 'betterAimId'>): BoardTag[] =>
  likelyMisses(note.betterAimId).map(({ points, ...m }) => {
    const leaves = missLeaves(note.left, points)
    return leaves ? { ...m, label: `${m.label} · ${leaves}` } : m
  })

/** What follows "Better:" or "Tip:": "with 16 left and 1 dart, throw at D8 (blue). A miss into S8
 *  still leaves 8 = D4." */
export function betterLine(note: Pick<CoachNote, 'left' | 'darts' | 'better' | 'betterAimId'>): string {
  const misses = likelyMisses(note.betterAimId).flatMap(m => {
    const leaves = missLeaves(note.left, m.points)
    return leaves ? [` A miss into ${m.label} still leaves ${leaves}.`] : []
  })
  const darts = `${note.darts} dart${note.darts === 1 ? '' : 's'}`
  return `with ${note.left} left and ${darts}, throw at ${note.better} (blue).${misses.join('')}`
}
