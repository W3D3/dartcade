// Execution: how the darts went where they were meant to. Scoring average until 170, busts,
// doubles, and per aim where the misses went.
import { R } from '../board.js'
import { checkoutHint } from '../checkout.js'
import { landedNumber, scoringAim } from './aim.js'
import { dartPoints, type Throw } from './walk.js'

export type DoubleStat = { target: string; darts: number; hits: number }
export type CoachStats = {
  /** 3-dart average of the darts thrown with more than 170 left; null without any */
  scoringAverage: number | null
  scoringDarts: number
  /** Visits that busted */
  busts: number
  /** Most darts first */
  doubles: DoubleStat[]
  checkouts: number
  dartsAtDouble: number
}
export type Tendency = {
  /** T20, T19, T18, T17, or D1–D20 */
  aim: string
  darts: number
  /** Darts in the aim's own number */
  on: number
  /** Darts in other numbers, most first */
  wedges: { number: number; darts: number }[]
  /** Camera darts, and of those, inside and outside the aim's ring */
  positioned: number
  inside: number
  outside: number
}

/** The double a one-dart finish needs, or null. */
const doubleFor = (left: number): string | null => checkoutHint(left, 'double', 1)?.[0] ?? null

/** A seat's execution stats from its darts (walk.ts throwsOf). */
export function executionStats(throws: readonly Throw[]): CoachStats {
  const scoring = throws.filter(t => t.left > 170)
  const points = scoring.reduce((s, t) => s + dartPoints(t.d), 0)
  const doubles = new Map<string, DoubleStat>()
  for (const t of throws) {
    const target = doubleFor(t.left)
    if (!target) continue
    const s = doubles.get(target) ?? { target, darts: 0, hits: 0 }
    s.darts++
    if (t.checkout) s.hits++
    doubles.set(target, s)
  }
  const list = [...doubles.values()].sort((a, b) => b.darts - a.darts)
  return {
    scoringAverage: scoring.length ? (points / scoring.length) * 3 : null,
    scoringDarts: scoring.length,
    busts: throws.filter(t => t.bust).length,
    doubles: list,
    checkouts: throws.filter(t => t.checkout).length,
    dartsAtDouble: list.reduce((s, d) => s + d.darts, 0),
  }
}

/** Per aim, where the darts thrown at it went. Scoring darts go to 20/19/18/17; darts on a
 *  one-dart finish to that double (the bull is left out). */
export function missTendencies(throws: readonly Throw[]): Tendency[] {
  const by = new Map<string, Tendency & { wedgeMap: Map<number, number> }>()
  const add = (aim: string, number: number, t: Throw, ring: { inner: number; outer: number }) => {
    const e = by.get(aim) ?? { aim, darts: 0, on: 0, wedges: [], positioned: 0, inside: 0, outside: 0, wedgeMap: new Map<number, number>() }
    e.darts++
    const n = landedNumber(t.d)
    if (n === number) e.on++
    else if (n !== null) e.wedgeMap.set(n, (e.wedgeMap.get(n) ?? 0) + 1)
    if (t.d.coords) {
      e.positioned++
      const r = Math.hypot(t.d.coords.x, t.d.coords.y)
      if (r < ring.inner) e.inside++
      else if (r > ring.outer) e.outside++
    }
    by.set(aim, e)
  }
  for (const t of throws) {
    if (t.left > 170) {
      const aim = scoringAim(t.d, t.visitDarts)
      if (aim) add(`T${aim}`, aim, t, { inner: R.si, outer: R.tr })
      continue
    }
    const target = doubleFor(t.left)
    if (target && target !== 'Bull') add(target, t.left / 2, t, { inner: R.so, outer: R.db })
  }
  return [...by.values()]
    .map(({ wedgeMap, ...e }) => ({
      ...e,
      wedges: [...wedgeMap].map(([number, darts]) => ({ number, darts })).sort((a, b) => b.darts - a.darts),
    }))
    .sort((a, b) => b.darts - a.darts)
}
