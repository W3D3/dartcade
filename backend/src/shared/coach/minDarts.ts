// The fewest darts that check out a score, double out (D1–D20 or the bull): the Brilliant grade's
// path, and how hard keeping it is for a coaching level.
import type { Landing } from './model.js'
import { afterDart } from './walk.js'

/** Every score one dart can make: singles, doubles, trebles, 25 and 50 */
const DART = [...new Set([25, 50, ...[1, 2, 3].flatMap(m => Array.from({ length: 20 }, (_, i) => (i + 1) * m))])]
const FINISH = [50, ...Array.from({ length: 20 }, (_, i) => (i + 1) * 2)]

/** anyDarts[m]: the fewest darts scoring exactly m with any dart; out[n]: the fewest to check out n */
const anyDarts = [0]
const out = [0, Infinity]

function grow(n: number) {
  for (let m = anyDarts.length; m <= n; m++) anyDarts.push(1 + Math.min(...DART.filter(d => d <= m).map(d => anyDarts[m - d])))
  for (let m = out.length; m <= n; m++) out.push(1 + Math.min(...FINISH.filter(d => d <= m).map(d => anyDarts[m - d])))
}
grow(501)

/** The fewest darts to check out `n`: 0 for 0, Infinity for 1. Above 501 (701 games) the tables grow. */
export function minDarts(n: number): number {
  if (n >= out.length) grow(n)
  return out[n]
}

const keepMemo = new WeakMap<Landing, Map<number, number>>()

/** The chance a player of `landing`'s level keeps the fewest-darts path from `left` for `darts`
 *  darts, aiming each dart for it: every dart must take one off minDarts (none can take more), and
 *  a checkout ends it kept. For a visit that checks out in the fewest darts this is the chance to
 *  check out from its start in that many; for 501 → 180 the chance of a visit still on a nine-darter. */
export function fewestChance(landing: Landing, left: number, darts: number): number {
  let memo = keepMemo.get(landing)
  if (!memo) keepMemo.set(landing, (memo = new Map<number, number>()))
  const known = memo
  const keep = (left: number, darts: number): number => {
    if (darts === 0) return 1
    const key = left * 4 + darts
    const hit = known.get(key)
    if (hit !== undefined) return hit
    const need = minDarts(left) - 1
    let best = 0
    for (const outcomes of landing) {
      let p = 0
      for (const [, points, double, chance] of outcomes) {
        const after = afterDart(left, points, double)
        if (after === 'out') p += chance
        else if (after !== 'bust' && minDarts(after) === need) p += chance * keep(after, darts - 1)
      }
      best = Math.max(best, p)
    }
    known.set(key, best)
    return best
  }
  return keep(left, darts)
}
