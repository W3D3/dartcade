// The "Score left" setting: the big score counts down after every dart, or holds at the
// visit's start until the visit is over: the third dart, a bust or checkout, or else the
// takeout / next player. The server decides every number; this only picks
// when the big score shows it.

export type ScoreUpdates = 'dart' | 'visit'

export function shownScore(o: {
  mode: ScoreUpdates
  /** The snapshot's score left (the team's in a team game). */
  score: number
  /** This seat (or team) is throwing the open visit. */
  thrower: boolean
  /** The visit is over: a bust or a checkout (the snapshot's visitLocked). */
  locked: boolean
  /** The open visit's darts. */
  darts: { score: number }[]
  /** The score when the visit began, when known (null after a reload mid-visit). */
  start: number | null
}): number {
  const over = o.locked || o.darts.length >= 3
  if (o.mode === 'dart' || !o.thrower || over || o.darts.length === 0) return o.score
  return o.start ?? o.score + o.darts.reduce((a, d) => a + d.score, 0)
}
