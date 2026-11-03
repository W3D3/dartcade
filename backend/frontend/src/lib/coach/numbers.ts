// The numbers behind a visit's grade (VisitNumbers: the sandbox, and Coach-Leg with
// coach.debug.enabled): what each dart left, its change in checkout chance, the grouping.
import type { ReviewVisit } from '$shared/coach'

/** "S19 (76 left), T20 (16 left), S1 (15 left)."; the busting dart "T8 bust", a dart the game kept
 *  after it "S5 (not counted)", a checkout "D4 out" */
export function whatHappened(v: Pick<ReviewVisit, 'darts'>): string {
  const bustAt = v.darts.findIndex(d => d.bust)
  const parts = v.darts.map((d, i) =>
    d.bust
      ? `${d.name} bust`
      : bustAt >= 0 && i > bustAt
        ? `${d.name} (not counted)`
        : d.left === 0
          ? `${d.name} out`
          : `${d.name} (${d.left} left)`,
  )
  return `${parts.join(', ')}.`
}

/** Rounded checkout-chance points with their sign: "+12", "−25", "0" */
export function signedPoints(v: number): string {
  const n = Math.round(v)
  return n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`
}

/** "S20 −4 · T17 +11 · S18 +2 · near misses +3": each dart's change in checkout chance, then the
 *  near-miss credit when there is any; null on a Scoring visit */
export function valueLine(v: Pick<ReviewVisit, 'darts'>): string | null {
  const darts = v.darts.flatMap(d => (d.delta === null ? [] : [{ ...d, delta: d.delta }]))
  if (!darts.length) return null
  const close = Math.round(darts.reduce((s, d) => s + (d.closeness ?? 0), 0))
  return [...darts.map(d => `${d.name} ${signedPoints(d.delta)}`), ...(close > 0 ? [`near misses +${close}`] : [])].join(' · ')
}

/** "Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75": how the visit's placed
 *  darts sat together against the spread expected at the player's average, the spread and offset
 *  only when they shared a target, the rating only on a Scoring
 *  visit (the only grade it feeds); null without a grouping. */
export function groupingLine(v: Pick<ReviewVisit, 'darts' | 'grouping' | 'tag'>): string | null {
  const g = v.grouping
  if (!g) return null
  const target = v.darts.find(d => d.coords && d.class.target)?.class.target?.label
  return [
    g.spreadMm === null ? null : `Grouping ${Math.round(g.spreadMm)} mm (yours: ~${Math.round(g.expectedSpreadMm)} mm)`,
    g.offsetMm === null ? null : `${Math.round(g.offsetMm)} mm off ${target}`,
    `edge ${Math.round(g.edgeMm)} mm`,
    v.tag === 'scoring' ? `rating ${Math.round(g.rating)}` : null,
  ]
    .filter(p => p !== null)
    .join(' · ')
}
