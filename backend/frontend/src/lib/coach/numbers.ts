// The numbers behind a visit's grade (VisitNumbers: the sandbox, and Coach-Leg with
// coach.debug.enabled): what each dart left, how the grade was worked out, the grouping.
import type { GradeRule, ReviewVisit, VisitGrade } from '$shared/coach'
import { bandOf, bustPenalty, FINISH_BANDS, SCORING_BANDS, VERY_LOW, type GradeBands } from '$shared/coach/grade'
import { bandText } from './checks'
import { GRADE_PILL } from './tone'

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

/** One class's stretch of a grade scale, in points */
export type ScaleBand = { grade: VisitGrade; from: number; to: number }
/** A grade scale drawn as a bar: its bands from `min` to `max`, the bounds between them
 *  (`ticks`) and where the visit's points fall (`marker`, kept on the bar) */
export type GradeScale = { min: number; max: number; bands: ScaleBand[]; ticks: number[]; marker: number }
/** How a visit's grade was worked out (VisitNumbers): the sum's parts, the result and its band,
 *  the scale, and the rule that overrode or capped the value */
export type GradeWorking = { parts: string[]; result: string; scale: GradeScale; rule: string | null }

/** How far the bar runs past the outermost bounds, in points */
const SCALE_MARGIN = 20
const one = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1)
const signedOne = (v: number) => (Math.abs(v) < 0.05 ? '0.0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`)

function scaleOf(bands: GradeBands, points: number): GradeScale {
  const ticks = bands.map(b => b.from).reverse()
  const min = ticks[0] - SCALE_MARGIN
  const max = ticks[ticks.length - 1] + SCALE_MARGIN
  const rows: ScaleBand[] = [{ grade: 'bad', from: min, to: ticks[0] }]
  for (const [i, b] of [...bands].reverse().entries()) rows.push({ grade: b.grade, from: b.from, to: ticks[i + 1] ?? max })
  return { min, max, bands: rows, ticks, marker: Math.min(max, Math.max(min, points)) }
}

const RULE_TEXT: Record<NonNullable<GradeRule>, string> = {
  perfect: 'Perfect: fewest darts — value ignored',
  note: 'Bad: a strategy note — value ignored',
  veryLow: `Under ${VERY_LOW} scored: capped at Weak`,
  spill: 'Two or more darts spilled into 1 or 5: capped at Inaccuracy',
}

/** The working behind a visit's grade. Setup and Doubling: the start's checkout chance, each
 *  walked dart's Δ and closeness, a bust's penalty for the darts it cost, their sum on the checkout-chance scale. Scoring: scored + grouping
 *  + closeness = rating, against the average. */
export function gradeWorking(v: Pick<ReviewVisit, 'tag' | 'left' | 'bust' | 'darts' | 'value'>): GradeWorking {
  const { points, scoring, rule } = v.value
  const finish = scoring === null
  const bands = finish ? FINISH_BANDS : SCORING_BANDS
  const band = bandOf(points, bands)
  const parts = finish
    ? [
        `Start: ${v.left} left, ${one(v.value.startChance ?? 0)}% to check out`,
        ...v.darts.flatMap((d, i) =>
          d.delta === null
            ? []
            : [
                `${d.name}: Δ ${signedOne(d.delta)}${d.closeness === null ? '' : `, closeness +${one(d.closeness)}`}`,
                ...(d.bust && i < 2 ? [`${d.name} bust: ${i === 1 ? '1 dart' : '2 darts'} not thrown −${one(bustPenalty(i))}`] : []),
              ],
        ),
      ]
    : [
        `Scored ${scoring.scored} + grouping ${one(scoring.grouping)} + closeness ${one(scoring.closeness)} = rating ${one(scoring.rating)}`,
        `Your average: ${one(scoring.average)}`,
      ]
  const sum = finish ? `Σ ${signedOne(points)}` : `Rating − average = ${signedOne(points)}`
  const bust = v.bust && rule === null ? ' (a bust: valued back on the start)' : ''
  return {
    parts,
    result: `${sum} → ${GRADE_PILL[band].label} (${bandText(bands, band)})${bust}`,
    scale: scaleOf(bands, points),
    rule: rule === null ? null : RULE_TEXT[rule],
  }
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
