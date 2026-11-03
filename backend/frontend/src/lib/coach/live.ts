// The live coach on the solo X01 match screen (coach.live.enabled): the next dart's best aims, the
// open visit's darts as the coach classes them, and the last finished visit's grade, by the model of
// the player's coaching level (LiveCoach.svelte loads only that level's table).
import type { Dart } from '$lib/api/game-ws'
import type { VisitGrade, VisitTag } from '$shared/coach'
import { aimPoints, isDoubleAim, type Aim } from '$shared/coach/aims'
import type { CoachModel } from '$shared/coach/model'
import { coachOpenVisit, scoringAims } from '$shared/coach/openVisit'
import { afterDart, coachDart } from '$shared/coach/walk'
import { signedPoints, visitTiles, type DartTileView } from './view'

export type LiveAim = { label: string; aimId: string; detail: string }
export type LiveRow = DartTileView & { delta: string | null; close: string | null }
export type LiveGrade = { grade: VisitGrade; tag: VisitTag; text: string; tip: boolean; darts: string }
export type LiveCoach = {
  /** The score before the next dart */
  left: number
  /** Over 170: the scoring aims (points a dart); else the checkout aims (chance) */
  scoring: boolean
  /** The next dart's best aims; empty once the visit is done */
  aims: LiveAim[]
  /** The open visit's darts */
  rows: LiveRow[]
  /** The visit's grade once it is done (three darts, a bust or a checkout); else null */
  graded: LiveGrade | null
}

const TOP = 3

/** "leaves 40", "leaves 37 or 40", "checks out" (a double or the bull to 0), "busts". */
function leaves(left: number, a: Aim): string {
  const out = (p: number) => {
    const after = afterDart(left, p, isDoubleAim(a))
    return after === 'out' ? 'checks out' : after === 'bust' ? 'busts' : `leaves ${after}`
  }
  const each = [...new Set(aimPoints(a).map(out))]
  return each.length === 1 ? each[0] : `${each[0]} or ${each[1].replace(/^leaves /, '')}`
}

/** The coach on the open visit: `start` is the score when it started, `average` the player's
 *  (null: the visit's own, as the coach does without one), `model` their coaching level's. Solo:
 *  no opponent, w = 1. */
export function liveCoach(model: CoachModel, start: number, darts: readonly Dart[], average: number | null): LiveCoach {
  const r = coachOpenVisit({ start, opponent: null, average }, darts.map(coachDart), model, TOP)
  const scoring = r.left > 170
  const aims = r.done
    ? []
    : scoring
      ? scoringAims(model, TOP).map(({ aim, points }) => ({ label: aim.label, aimId: aim.id, detail: `${points.toFixed(1)} a dart` }))
      : r.next.map(n => ({ label: n.aim.label, aimId: n.aim.id, detail: `${Math.round(n.chance * 100)}% · ${leaves(r.left, n.aim)}` }))
  const v = r.visit
  const tiles = v ? visitTiles(v) : []
  const rows = (v?.darts ?? []).map((d, i) => ({
    ...tiles[i],
    delta: d.delta === null ? null : signedPoints(d.delta),
    close: d.closeness === null || Math.round(d.closeness) === 0 ? null : `+${Math.round(d.closeness)}`,
  }))
  const graded = r.done && v ? { grade: v.grade, tag: v.tag, text: v.text, tip: v.tip, darts: v.darts.map(d => d.name).join(' ') } : null
  return { left: r.left, scoring, aims, rows, graded }
}

/** The grade to show: the open visit's once it's done, the last one's while the next has no dart
 *  yet, none once it has. */
export function keepGrade(prev: LiveGrade | null, live: LiveCoach): LiveGrade | null {
  return live.graded ?? (live.rows.length === 0 ? prev : null)
}

export type LiveAverage = { value: number | null; line: string }

/** The average the coach grades against: your 30-day X01 average (the profile's), else this
 *  game's so far, else none (a scoring visit is then measured against itself). */
export function liveAverage(profile: number | null | undefined, points: number, darts: number): LiveAverage {
  if (profile != null) return { value: profile, line: `Graded against your 30-day average, ${profile.toFixed(1)}.` }
  if (darts > 0) {
    const game = (points / darts) * 3
    return { value: game, line: `Graded against this game's average, ${game.toFixed(1)}.` }
  }
  return { value: null, line: 'No average yet: a scoring visit is graded on its own.' }
}
