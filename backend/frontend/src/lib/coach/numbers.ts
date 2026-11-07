// The numbers behind a visit's grade (VisitNumbers: the sandbox, and Coach-Leg with
// coach.debug.enabled): what each dart left, how the grade was worked out, the grouping.
import type { GradeRule, ReviewVisit, VisitGrade } from '$shared/coach'
import { VERY_LOW, type ScaleBand } from '$shared/coach/grade'
import { BRILLIANT_TIER, tierOf } from '$shared/coach/tiers'
import { GRADE_STYLE } from './tone'

/** "a semi-pro": who the Brilliant chance is measured for */
const REFERENCE = tierOf(BRILLIANT_TIER).as

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

/** Points with their sign, to `digits` decimals: "+12", "−25", "0"; "+12.3", "0.0" */
export function signedPoints(v: number, digits = 0): string {
  const n = Math.abs(v).toFixed(digits)
  return Number(n) === 0 ? n : `${v > 0 ? '+' : '−'}${n}`
}
/** Millimetres or points to one decimal, never "-0.0" */
export const one = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)

/** A grade's band on a complete scale (best first, Bad's `from` null): "+20 to +60", "+60 or
 *  more", "below −20" */
export function bandText(scale: readonly ScaleBand[], grade: VisitGrade): string {
  const i = scale.findIndex(b => b.grade === grade)
  const bound = (b: ScaleBand | undefined) => (b?.from == null ? null : signedPoints(b.from))
  const [lo, hi] = [bound(scale[i]), bound(scale[i - 1])]
  return lo === null ? `below ${hi}` : hi === null ? `${lo} or more` : `${lo} to ${hi}`
}

/** "Excellent +60 or more, Great +20 to +60, …, Bad below −20": every class of a scale */
export const scaleText = (scale: readonly ScaleBand[]) =>
  scale.map(b => `${GRADE_STYLE[b.grade].label} ${bandText(scale, b.grade)}`).join(', ')

/** A grade scale drawn as a bar, in % of its width: each class's stretch, the bounds between them
 *  (`ticks`, lowest first) and where the visit's points fall (`marker`, kept on the bar) */
export type GradeScale = {
  bands: { grade: VisitGrade; left: number; width: number }[]
  ticks: { label: string; left: number }[]
  marker: number
}
/** How a visit's grade was worked out (VisitNumbers): the sum's parts, the result and its band,
 *  the scale, and the rule that overrode or capped the value */
export type GradeWorking = { parts: string[]; result: string; scale: GradeScale; rule: string | null }

/** How far the bar runs past the outermost bounds, in points */
const SCALE_MARGIN = 20

function scaleOf(scale: readonly ScaleBand[], points: number): GradeScale {
  const bounds = scale.flatMap(b => (b.from === null ? [] : [b.from]))
  const max = bounds[0] + SCALE_MARGIN
  const min = bounds[bounds.length - 1] - SCALE_MARGIN
  const at = (p: number) => ((Math.min(max, Math.max(min, p)) - min) / (max - min)) * 100
  return {
    bands: scale.map((b, i) => {
      const left = at(b.from ?? min)
      return { grade: b.grade, left, width: at(scale[i - 1]?.from ?? max) - left }
    }),
    ticks: bounds.toReversed().map(t => ({ label: signedPoints(t), left: at(t) })),
    marker: at(points),
  }
}

/** The line for the rule that overrode or capped the value; `chance` the fewest-darts path's (%,
 *  the fixed reference level's) */
const RULE_TEXT: Record<NonNullable<GradeRule>, (chance: number) => string> = {
  brilliant: chance => `Brilliant: fewest darts, a ${Math.round(chance)}% chance for ${REFERENCE}`,
  fewest: chance => `Excellent floor: fewest darts (${Math.round(chance)}% for ${REFERENCE})`,
  note: () => 'Bad: a strategy note — value ignored',
  veryLow: () => `Under ${VERY_LOW} scored: capped at Weak`,
  spill: () => 'Two or more darts spilled into 1 or 5: capped at Inaccuracy',
}

/** The working behind a visit's grade, as the server sent it (grade.ts VisitValue). Setup and
 *  Doubling: the start's checkout chance, each walked dart's Δ and closeness, a bust's penalty for
 *  the darts it cost, their sum on the checkout-chance scale. Scoring: scored + grouping +
 *  closeness = rating, against the average. */
export function gradeWorking(v: Pick<ReviewVisit, 'left' | 'bust' | 'darts' | 'value'>): GradeWorking {
  const { points, scoring, terms, band, bands, rule } = v.value
  const parts =
    scoring === null
      ? [
          `Start: ${v.left} left, ${one(v.value.startChance ?? 0)}% to check out`,
          ...terms.flatMap((t, i) => {
            const name = v.darts[i].name
            const lost = 2 - i
            return [
              `${name}: Δ ${signedPoints(t.delta, 1)}${t.closeness === null ? '' : `, closeness +${one(t.closeness)}`}`,
              ...(t.penalty > 0 ? [`${name} bust: ${lost} dart${lost > 1 ? 's' : ''} not thrown −${one(t.penalty)}`] : []),
            ]
          }),
        ]
      : [
          `Scored ${scoring.scored} + grouping ${one(scoring.grouping)} + closeness ${one(scoring.closeness)} = rating ${one(scoring.rating)}`,
          `Your average: ${one(scoring.average)}`,
        ]
  const sum = scoring === null ? `Σ ${signedPoints(points, 1)}` : `Rating − average = ${signedPoints(points, 1)}`
  const bust = v.bust && rule === null ? ' (a bust: valued back on the start)' : ''
  return {
    parts,
    result: `${sum} → ${GRADE_STYLE[band].label} (${bandText(bands, band)})${bust}`,
    scale: scaleOf(bands, points),
    rule: rule === null ? null : RULE_TEXT[rule](v.value.fewestChance ?? 0),
  }
}

/** "Grouping 6 mm (target: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75": how the visit's placed
 *  darts sat together against the spread expected of the tier they're graded as, the spread and offset
 *  only when they shared a target, the rating only on a visit graded on the scoring scale
 *  (the only grade it feeds); null without a grouping. */
export function groupingLine(v: Pick<ReviewVisit, 'darts' | 'grouping'> & { value: Pick<ReviewVisit['value'], 'scoring'> }): string | null {
  const g = v.grouping
  if (!g) return null
  const target = v.darts.find(d => d.coords && d.class.target)?.class.target?.label
  return [
    g.spreadMm === null ? null : `Grouping ${Math.round(g.spreadMm)} mm (target: ~${Math.round(g.expectedSpreadMm)} mm)`,
    g.offsetMm === null ? null : `${Math.round(g.offsetMm)} mm off ${target}`,
    `edge ${Math.round(g.edgeMm)} mm`,
    v.value.scoring ? `rating ${Math.round(g.rating)}` : null,
  ]
    .filter(p => p !== null)
    .join(' · ')
}
