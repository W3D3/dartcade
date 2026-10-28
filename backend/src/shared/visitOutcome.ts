// How a visit ended, read from the previous and the new snapshot of a score-based game: the caller
// turns it into words (frontend lib/caller/calls.ts), the lights into a trigger (lights/triggers/x01.ts).
// A visit has one outcome, once it's over: three darts, or locked early (a bust, a checkout).

/** What both readers need of a game: X01's own fields; other score-based modes are read into them. */
export type VisitGame = {
  currentPlayer: number
  phase: string
  bustThisVisit: boolean
  visitLocked: boolean
  currentVisitDarts: readonly unknown[]
  totalVisits: readonly number[]
  legs?: readonly number[]
  firstTo?: number
  teams?: readonly { seats: readonly number[]; legs: number }[]
}
/** A score counting down to 0 (X01, 121 Checkout): the visit is what it took off, 0 is a checkout. */
export type CountdownGame = VisitGame & { scores: readonly number[]; visitStartScores: readonly number[] }
/** A visit total counting up (Higher Lower): no checkout. */
export type TallyGame = VisitGame & { visitTotal: number }
export type OutcomeGame = CountdownGame | TallyGame

export type VisitOutcome =
  | { kind: 'visit'; seat: number; total: number }
  | { kind: 'bust'; seat: number }
  /** `match`: this checkout wins the match; `leg`: the leg it won (1-based), null in a game without legs. */
  | { kind: 'checkout'; seat: number; match: boolean; leg: number | null }

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0)

export const visitOver = (locked: boolean, darts: number): boolean => locked || darts >= 3
export const isOver = (g: VisitGame): boolean => visitOver(g.visitLocked, g.currentVisitDarts.length)
/** Whether `after` committed a visit `before` didn't have (the takeout). */
export const committed = (before: VisitGame, after: VisitGame): boolean => sum(after.totalVisits) > sum(before.totalVisits)

export const legsPlayed = (g: VisitGame): number => (g.teams ? sum(g.teams.map(t => t.legs)) : sum(g.legs ?? []))
/** The legs won so far by a seat's team (or the seat itself, outside a team game). */
export const legsOf = (g: VisitGame, seat: number): number => {
  const teamLegs = g.teams?.find(t => t.seats.includes(seat))?.legs
  return teamLegs !== undefined ? teamLegs : g.legs?.[seat] || 0
}
// What the visit took off the score, not the dart faces: darts before a double/master in score nothing.
export const visitTotal = (g: OutcomeGame): number =>
  'visitTotal' in g ? g.visitTotal : (g.visitStartScores[g.currentPlayer] ?? 0) - g.scores[g.currentPlayer]

/** How the current player's visit ended, read while it's over (before the takeout commits it). */
export function visitEnd(g: OutcomeGame): VisitOutcome {
  const seat = g.currentPlayer
  if (g.bustThisVisit) return { kind: 'bust', seat }
  if ('scores' in g && g.visitLocked && g.scores[seat] === 0) {
    // Legs count up at the takeout, so g still has the old count: this is the leg just won
    if (g.firstTo === undefined) return { kind: 'checkout', seat, match: false, leg: null }
    return { kind: 'checkout', seat, match: legsOf(g, seat) + 1 >= g.firstTo, leg: legsPlayed(g) + 1 }
  }
  return { kind: 'visit', seat, total: visitTotal(g) }
}

/** The outcome a step from `before` to `after` reveals, once per visit: when its last dart lands, or at the
 *  takeout of a visit that wasn't over yet (the next player's dart or a skip). Null for every other step. */
export function visitOutcome(before: OutcomeGame | null, after: OutcomeGame): VisitOutcome | null {
  if (before === null || before.phase !== 'game' || isOver(before)) return null
  if (committed(before, after)) return { kind: 'visit', seat: before.currentPlayer, total: visitTotal(before) }
  if (after.currentPlayer === before.currentPlayer && isOver(after)) return visitEnd(after)
  return null
}
