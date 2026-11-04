// "What the coach detects" (Coach-Mistakes): the checks this version runs, grouped as the leg
// review tags visits. The rules live in shared/coach/grade.ts, notes.ts and review.ts; keep these in step.
import {
  BRILLIANT_CHANCE,
  BUST_DART_LOST,
  DART_COSTLY_AT,
  DART_GOOD_FROM,
  DART_PLAIN_ABOVE,
  FINISH_SCALE,
  MISS_CLOSE_MAX,
  MISS_CLOSE_ZERO_MM,
  NEAR_MISS_MM,
  SCORING_SCALE,
  VERY_LOW,
} from '$shared/coach/grade'
import { NOTE_THRESHOLD } from '$shared/coach/notes'
import { LATE_DROP, LATE_DROP_VISITS, LONG_FINISH } from '$shared/coach/review'
import { VISIT_GRADES, type VisitGrade } from '$shared/coach'
import { BRILLIANT_TIER, tierOf } from '$shared/coach/tiers'
import { bandText, scaleText } from './numbers'

/** A check's label: a visit grade, or tip (Info: worth knowing, not graded) */
export type CheckLabel = VisitGrade | 'tip'
/** Where a check's facts come from: the segments hit, or the checkout model's chances */
export type CheckSource = 'scores' | 'model'
export type Check = { name: string; labels: CheckLabel[]; source: CheckSource; when: string; example: string; says: string }
export type CheckGroup = { title: string; scope: string; checks: Check[] }

export const SOURCES: Record<CheckSource, { label: string; text: string }> = {
  scores: { label: 'Scores', text: 'From the segments your darts hit' },
  model: { label: 'Model', text: "From the checkout model: each aim's chance to finish" },
}

const MEANING: Record<VisitGrade, string> = {
  brilliant: 'the fewest darts, when that was hard',
  excellent: 'a big gain',
  great: 'a strong outcome',
  good: 'did the job',
  ok: 'about what was expected',
  inaccuracy: 'a small slip',
  weak: 'cost you',
  bad: 'clearly cost points or the leg',
}

/** One legend entry per class, best first, with its bands: `finish` in checkout-chance points
 *  (Setup and Doubling), `scoring` against your average; null for Brilliant, which a rule gives */
export type GradeLegend = { label: VisitGrade; text: string; finish: string | null; scoring: string | null }
export const GRADE_LEGEND: GradeLegend[] = VISIT_GRADES.map(g => ({
  label: g,
  text: MEANING[g],
  finish: g === 'brilliant' ? null : bandText(FINISH_SCALE, g),
  scoring: g === 'brilliant' ? null : bandText(SCORING_SCALE, g),
}))

const notePoints = Math.round(NOTE_THRESHOLD * 100)

export const CHECK_GROUPS: CheckGroup[] = [
  {
    title: 'Scoring',
    scope: 'Visits with more than 170 left.',
    checks: [
      {
        name: 'Fewest darts',
        labels: ['brilliant', 'excellent'],
        source: 'model',
        when: `The visit keeps the fewest-darts finish: its darts plus the fewest that check out what it left are the fewest that check out its start. Brilliant when ${tierOf(BRILLIANT_TIER).as} (a ${tierOf(BRILLIANT_TIER).average} average) — the coach's fixed reference, not the tier you're graded as — keeps that path from the visit's start less than ${Math.round(BRILLIANT_CHANCE * 100)}% of the time (a checkout: the chance to check out in that many darts), else Excellent at least. Marks any visit, setups and checkouts too; a bust or a strategy note (not a tip) rules it out.`,
        example: '501 · T20 T20 T20 → 321, still on a nine-darter (about 3%): Brilliant; 40 · D20 (about 32%): Excellent',
        says: 'What is left and in how many darts (Nine-darter still on, from 501); on a checkout, the double.',
      },
      {
        name: 'Very low visit',
        labels: ['weak', 'bad'],
        source: 'scores',
        when: `The visit scores under ${VERY_LOW}: Weak at best, whatever the grouping.`,
        example: 'S5 S1 S19 = 25',
        says: 'Your usual visit next to the score, so you see how far off it was.',
      },
      {
        name: 'Rating against your average',
        labels: ['excellent', 'great', 'good', 'ok', 'inaccuracy', 'weak', 'bad'],
        source: 'scores',
        when: `The visit's rating (its score plus a bonus for a tight group and for darts close to their target) against your average (your 30-day X01 average, or this game's without one): ${scaleText(SCORING_SCALE)}.`,
        example: 'S20 S20 S1 = 41 · your average 60: −19, Weak',
        says: 'One loose visit happens; a few in a row mean the rhythm went.',
      },
      {
        name: 'Spill into 1 / 5',
        labels: ['inaccuracy'],
        source: 'scores',
        when: 'Two or three darts of a visit at the 20 land in 1 or 5: Inaccuracy at best.',
        example: 'S1 S20 S5',
        says: 'The darts drift sideways off the 20: keep the release and follow-through straight.',
      },
    ],
  },
  {
    title: 'Setup',
    scope: 'Visits from 170 or less in which no dart is thrown on a one-dart finish.',
    checks: [
      {
        name: 'Strategy note',
        labels: ['bad'],
        source: 'model',
        when: `A dart on a finish went at a number that gives at least ${notePoints} points less chance to check out than the best aim. The dart gets the benefit of the doubt: it was aimed at the best spot on the number it hit or on either number next to it, since a dart drifting into the next wedge is the commonest miss; a single near the middle (or one without a position) may also have been thrown at the bull or 25. Marks any visit Bad; the Bad setups card counts the setup visits graded Bad, for a note or by their checkout chance.`,
        example: '57 left · S20 → 37 · better S17 → 40',
        says: 'The better aim, and why: which leave its misses still give you.',
      },
      {
        name: 'Checkout chance',
        labels: ['excellent', 'great', 'good', 'ok', 'inaccuracy', 'weak', 'bad'],
        source: 'model',
        when: `Setup and doubling visits are graded by how much their darts changed your chance to check out, this visit or the next, against a player of the tier you're graded as (shown on each leg: the one your 30-day average reached, else the next one up) aiming at the best spot each time. A dart that leaves you better placed than that player would expect adds points; one that leaves you worse placed takes them away. A dart that missed its target gets up to ${MISS_CLOSE_MAX} points back the closer it landed (none from ${MISS_CLOSE_ZERO_MM} mm off). ${scaleText(FINISH_SCALE)}. Each dart is coloured by its own share: green from +${DART_GOOD_FROM} (or a hit), yellow at ${DART_PLAIN_ABOVE} or below, orange at ${DART_COSTLY_AT} or below, red the busting dart. A dart that missed its target by ${NEAR_MISS_MM} mm or less is marked Near miss.`,
        example: '121 left · S20 T17 S18 → 32 (D16): +8, Good',
        says: 'A setup: when the visit lost chance, the dart that cost the most and how much; otherwise what you left and its route (37 left is a single to double, S5 · D16). A doubling visit without a checkout: what happened to the double, then where you stand (3 darts at D4, all just outside, 5 mm on average. Still on 8.). On the last visit of a leg you lost, with a dart at a double, it starts with Missed the match dart.',
      },
    ],
  },
  {
    title: 'Doubling',
    scope: 'Visits with at least one dart thrown on a one-dart finish.',
    checks: [
      {
        name: 'Tip',
        labels: ['tip'],
        source: 'model',
        when: "On a one-dart finish, the better aim was simply that double, and your opponent isn't on a finish. Not for a dart that busted. The visit keeps its grade.",
        example: '36 left · S4 → 32 · better D18',
        says: 'With a double left and nobody threatening to finish, you can go straight for it.',
      },
      {
        name: 'Bust',
        labels: ['inaccuracy', 'weak', 'bad'],
        source: 'model',
        when: `The visit goes below zero, leaves 1, or reaches zero without a double. It scores nothing and you're back on the visit's start: graded by checkout chance like any visit, so busting back to 32 beats leaving 2, less ${BUST_DART_LOST} points for each of the visit's darts the bust kept you from throwing.`,
        example: '40 left · S20 T20 → bust',
        says: 'Which dart busted, and on what: Busted on the second dart (T20 on 20). Before each dart, check that its worst miss still leaves a score.',
      },
      {
        name: 'Bust-back',
        labels: ['ok', 'inaccuracy', 'weak'],
        source: 'model',
        when: "The busting dart was best thrown to bust: from a score that's hard to finish, back on the visit's start is worth more. Graded by checkout chance like any visit.",
        example: '20 left · S10 S7 S5 → back on 20',
        says: 'Busted on purpose with the third dart to stay on 20 (D10).',
      },
      {
        name: 'Checked out',
        labels: ['excellent', 'great', 'good'],
        source: 'model',
        when: 'A dart at a double finishes the leg. Graded by checkout chance: Good from a finish you would likely have taken anyway, Great or Excellent from a harder one.',
        example: '81 left · T19 S12 D6',
        says: 'Which double took the leg.',
      },
    ],
  },
  {
    title: 'Leg patterns',
    scope: "The whole leg: shown in the coach's take, not on a visit.",
    checks: [
      {
        name: 'Long finish',
        labels: ['tip'],
        source: 'scores',
        when: `You won, but more than ${LONG_FINISH} darts went by from first having 170 or less to the checkout.`,
        example: 'On 170 or less after 12 darts, out after 24',
        says: 'How many darts the finish took. The visits show whether setups or doubles cost them.',
      },
      {
        name: 'Lost on a finish',
        labels: ['tip'],
        source: 'scores',
        when: 'Your opponent checked out while you were left on a score two darts can finish.',
        example: 'You on 32, they check out 40',
        says: 'That you were on a finish and still lost.',
      },
      {
        name: 'Late-leg drop',
        labels: ['tip'],
        source: 'scores',
        when: `Scoring visits 4 and later average ${LATE_DROP} or more below visits 1–3, in a leg with at least ${LATE_DROP_VISITS} scoring visits.`,
        example: 'Visits 1–3: 85 · 4–7: 52',
        says: 'That your scoring dropped after visit 3: keep the same rhythm as the score gets low.',
      },
    ],
  },
]
