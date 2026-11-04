// The live coach on the solo X01 match screen (coach.live.enabled): the next dart's best aims, the
// open visit's darts as the coach classes them, and the last finished visit's grade, by the model of
// the player's coaching level (LiveCoach.svelte loads only that level's table).
import type { Dart } from '$lib/api/game-ws'
import type { ReviewVisit } from '$shared/coach'
import { aimPoints, isDoubleAim, type Aim } from '$shared/coach/aims'
import type { CoachModel } from '$shared/coach/model'
import { coachOpenVisit, scoringAims } from '$shared/coach/openVisit'
import { afterDart, coachDart } from '$shared/coach/walk'

export type LiveAim = { label: string; aimId: string; detail: string }
export type LiveCoach = {
  /** The score before the next dart */
  left: number
  /** Over 170: the scoring aims (points a dart); else the checkout aims (chance) */
  scoring: boolean
  /** The next dart's best aims; empty once the visit is done */
  aims: LiveAim[]
  /** The open visit as the coach reviews it; null before a dart */
  visit: ReviewVisit | null
  /** The visit is over (three darts, a bust or a checkout): its grade is final */
  done: boolean
}

const TOP = 3

/** "leaves 40", "leaves 37 or 40", "checks out" (a double or the bull to 0), "busts". */
function leaves(left: number, a: Aim): string {
  const word = (x: number | 'out' | 'bust') => (x === 'out' ? 'checks out' : x === 'bust' ? 'busts' : String(x))
  const each = [...new Set(aimPoints(a).map(p => afterDart(left, p, isDoubleAim(a))))]
  const head = typeof each[0] === 'number' ? `leaves ${each[0]}` : word(each[0])
  return each.length === 1 ? head : `${head} or ${word(each[1])}`
}

/** The coach on the open visit: `start` is the score when it started, `average` the player's
 *  (null: the visit's own, as the coach does without one), `model` their coaching level's,
 *  `referenceModel` the fixed reference level's (model.ts DEFAULT_COACH_LEVEL), for the
 *  fewest-darts path's chance. Solo: no opponent, w = 1. */
export function liveCoach(
  model: CoachModel,
  referenceModel: CoachModel,
  start: number,
  darts: readonly Dart[],
  average: number | null,
): LiveCoach {
  const r = coachOpenVisit({ start, opponent: null, average }, darts.map(coachDart), { model, reference: referenceModel.landing }, TOP)
  const scoring = r.left > 170
  const aims = r.done
    ? []
    : scoring
      ? scoringAims(model, TOP).map(({ aim, points }) => ({ label: aim.label, aimId: aim.id, detail: `${points.toFixed(1)} a dart` }))
      : r.next.map(n => ({ label: n.aim.label, aimId: n.aim.id, detail: `${Math.round(n.chance * 100)}% · ${leaves(r.left, n.aim)}` }))
  return { left: r.left, scoring, aims, visit: r.visit, done: r.done }
}

/** The graded visit to show: the open one once it's done, the last finished one (`last`) while
 *  the next has no dart yet, none once it has. */
export function shownVisit(last: ReviewVisit | null, live: LiveCoach): ReviewVisit | null {
  return live.done ? live.visit : live.visit ? null : last
}

export type LiveAverage = { value: number | null; line: string }

/** The average the coach grades against, as a stored review does: your 30-day X01 average
 *  (GET /api/coach/average), else this game's so far, else none (a scoring visit is then
 *  measured against itself). */
export function liveAverage(thirtyDay: number | null | undefined, points: number, darts: number): LiveAverage {
  if (thirtyDay != null) return { value: thirtyDay, line: `Graded against your 30-day average, ${thirtyDay.toFixed(1)}.` }
  if (darts > 0) {
    const game = (points / darts) * 3
    return { value: game, line: `Graded against this game's average, ${game.toFixed(1)}.` }
  }
  return { value: null, line: 'No average yet: a scoring visit is graded on its own.' }
}
