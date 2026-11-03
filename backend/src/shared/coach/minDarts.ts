// The fewest darts that check out a score, double out (D1–D20 or the bull): the Perfect grade's path.

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
