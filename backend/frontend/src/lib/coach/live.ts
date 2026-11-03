// The live coach on the solo X01 match screen (coach.live.enabled): the next dart's best aims, the
// open visit's darts as the coach classes them, and the last finished visit's grade, by the model of
// the player's coaching level (LiveCoach.svelte loads only that level's table).
import type { Dart } from '$lib/api/game-ws'
import type { VisitGrade, VisitTag } from '$shared/coach'
import type { Aim } from '$shared/coach/aims'
import { AIMS } from '$shared/coach/aims'
import type { CoachModel } from '$shared/coach/model'
import { coachDart } from '$shared/coach/walk'
import { sandbox } from './sandbox'
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

/** The points a dart at the aim scores where it's aimed: two for a wire (either number). */
export function aimPoints(a: Aim): number[] {
  if (a.id === 'Bull') return [50]
  if (a.id === '25') return [25]
  const m = /^(T|D|SO|SI|W)(\d+)(?:-(\d+))?$/.exec(a.id)
  if (!m) return []
  const n = Number(m[2])
  return m[1] === 'T' ? [3 * n] : m[1] === 'D' ? [2 * n] : m[1] === 'W' ? [n, Number(m[3])] : [n]
}

/** "leaves 40", "leaves 37 or 40", "checks out" (a double or the bull to 0), "busts". */
function leaves(left: number, a: Aim): string {
  const out = (p: number) => {
    const after = left - p
    const double = a.id === 'Bull' || a.id.startsWith('D')
    return after === 0 && double ? 'checks out' : after < 2 ? 'busts' : `leaves ${after}`
  }
  const each = [...new Set(aimPoints(a).map(out))]
  return each.length === 1 ? each[0] : `${each[0]} or ${each[1].replace(/^leaves /, '')}`
}

// The model's points a dart at each aim, best first, one per label (the same for any score)
function scoringAims({ landing }: CoachModel): LiveAim[] {
  const seen = new Set<string>()
  return landing
    .map((o, i) => ({ a: AIMS[i], points: o.reduce((s, [, p, , chance]) => s + p * chance, 0) }))
    .sort((x, y) => y.points - x.points)
    .filter(({ a }) => !seen.has(a.label) && !!seen.add(a.label))
    .slice(0, TOP)
    .map(({ a, points }) => ({ label: a.label, aimId: a.id, detail: `${points.toFixed(1)} a dart` }))
}

/** The coach on the open visit: `start` is the score when it started, `average` the player's
 *  (null: the visit's own, as the coach does without one), `model` their coaching level's. Solo:
 *  no opponent, w = 1. */
export function liveCoach(model: CoachModel, start: number, darts: readonly Dart[], average: number | null): LiveCoach {
  const r = sandbox({ start, opponent: null, average }, darts.map(coachDart), model)
  const scoring = r.left > 170
  const aims = r.done
    ? []
    : scoring
      ? scoringAims(model)
      : r.next
          .slice(0, TOP)
          .map(n => ({ label: n.label, aimId: n.aim.id, detail: `${Math.round(n.chance * 100)}% · ${leaves(r.left, n.aim)}` }))
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
