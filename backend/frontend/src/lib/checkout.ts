// Checkout suggestions: which darts finish the score left.
// Double out (the usual game) follows the pros' table in checkoutTable.ts from 170 down to 41,
// and the usual ladder below that; straight and master out are computed.
import { CHECKOUTS } from './checkoutTable.js'

type OutMode = 'straight' | 'double' | 'master'

/** A player's checkout preferences (to be set in Settings). */
export type CheckoutPrefs = {
  /** The double they like to finish on (1–20, or 25 for the bull): where the table offers a route
   *  ending on it, that one; and set up below 41. null: the table's first route. */
  favouriteDouble: number | null
}

export const DEFAULT_CHECKOUT_PREFS: CheckoutPrefs = { favouriteDouble: null }

/** The darts to finish `remaining` with the darts left in the visit, or null when it can't be done. */
export function checkoutHint(
  remaining: number,
  outMode: OutMode = 'double',
  dartsLeft = 3,
  prefs: CheckoutPrefs = DEFAULT_CHECKOUT_PREFS,
): string[] | null {
  if (remaining < 1 || remaining > 170 || dartsLeft < 1) return null
  const n = Math.min(dartsLeft, 3)
  return outMode === 'double' ? doubleOutHint(remaining, n, prefs) : computedHint(remaining, outMode, n)
}

const finishingLabel = (d: number) => (d === 25 ? 'Bull' : `D${d}`)

/** One dart that finishes it on a double (or the bull), if any. */
const directDouble = (remaining: number) =>
  remaining === 50 ? 'Bull' : remaining % 2 === 0 && remaining <= 40 ? `D${remaining / 2}` : null

function doubleOutHint(remaining: number, n: number, prefs: CheckoutPrefs): string[] | null {
  const direct = directDouble(remaining)
  if (n === 1) return direct ? [direct] : null

  const entry = remaining in CHECKOUTS ? CHECKOUTS[remaining] : null
  if (entry) {
    const fav = prefs.favouriteDouble === null ? null : finishingLabel(prefs.favouriteDouble)
    // The favourite double's route first, then the table's order
    const routes =
      fav === null ? entry.routes : [...entry.routes.filter(r => r.at(-1) === fav), ...entry.routes.filter(r => r.at(-1) !== fav)]
    if (n >= 3) return routes[0]
    return entry.twoDarts ?? routes.find(r => r.length <= 2) ?? computedHint(remaining, 'double', 2)
  }
  // Above 40 and not in the table: no three-dart finish (169, 168, 166, …)
  if (remaining > 40) return null
  if (direct) return [direct]
  // An odd score: a single to leave a double, the favourite first, then halving down from D16
  const ladder = [...(prefs.favouriteDouble !== null && prefs.favouriteDouble <= 20 ? [prefs.favouriteDouble] : []), 16, 8, 4, 2, 1]
  for (const d of ladder) {
    const single = remaining - 2 * d
    if (single >= 1 && single <= 20) return [`S${single}`, `D${d}`]
  }
  return null
}

// Straight and master out (and a double-out fallback): the easiest finishing dart, after the
// fewest darts that set it up.
function computedHint(remaining: number, outMode: OutMode, n: number): string[] | null {
  // Valid finishing darts; the easiest dart wins a total (a single before a double before a triple)
  const finishMap = new Map<number, string>()
  const add = (v: number, l: string) => {
    if (!finishMap.has(v)) finishMap.set(v, l)
  }
  if (outMode === 'straight') {
    for (let k = 20; k >= 1; k--) add(k, `S${k}`)
    add(25, '25')
  }
  for (let k = 20; k >= 1; k--) add(2 * k, `D${k}`)
  add(50, 'Bull')
  if (outMode !== 'double') for (let k = 20; k >= 1; k--) add(3 * k, `T${k}`)

  // 1-dart finish
  const one = finishMap.get(remaining)
  if (n >= 1 && one) return [one]

  // Scoring darts (preferred order: triples high→low skipping T1, then singles, then bull)
  // T1 omitted: S3 scores the same and is always the saner suggestion
  const scoring: { l: string; v: number }[] = []
  for (let k = 20; k >= 2; k--) scoring.push({ l: `T${k}`, v: 3 * k })
  for (let k = 20; k >= 1; k--) scoring.push({ l: `S${k}`, v: k })
  scoring.push({ l: '25', v: 25 }, { l: 'Bull', v: 50 })

  // 2-dart finish
  if (n >= 2) {
    for (const d of scoring) {
      const rest = remaining - d.v
      const fin = finishMap.get(rest)
      if (rest >= 1 && fin) return [d.l, fin]
    }
  }

  // 3-dart finish
  if (n >= 3) {
    for (const d1 of scoring) {
      const r1 = remaining - d1.v
      if (r1 < 2) continue
      for (const d2 of scoring) {
        const r2 = r1 - d2.v
        const fin = finishMap.get(r2)
        if (r2 >= 1 && fin) return [d1.l, d2.l, fin]
      }
    }
  }

  return null
}
