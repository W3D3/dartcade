// "What the coach detects" (Coach-Mistakes): the checks this version runs, grouped as the leg
// review tags visits. The rules live in shared/coach/grade.ts and review.ts; keep these in step.
import { LATE_DROP, LATE_DROP_VISITS, LONG_FINISH, LOW_BELOW, NOTE_THRESHOLD, VERY_LOW } from '$shared/coach/grade'
import type { VisitGrade } from '$shared/coach'

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

/** What each label means, in the legend's order */
export const LABELS: { label: CheckLabel; text: string }[] = [
  { label: 'mistake', text: 'clearly cost points or the leg' },
  { label: 'weak', text: 'below your level' },
  { label: 'ok', text: 'fine, nothing stood out' },
  { label: 'good', text: 'did the job' },
  { label: 'great', text: 'the best outcome' },
  { label: 'tip', text: 'worth knowing, not graded' },
]

const notePoints = Math.round(NOTE_THRESHOLD * 100)

export const CHECK_GROUPS: CheckGroup[] = [
  {
    title: 'Scoring',
    scope: 'Visits with more than 170 left.',
    checks: [
      {
        name: 'Very low visit',
        labels: ['mistake'],
        source: 'scores',
        when: `The visit scores under ${VERY_LOW}.`,
        example: 'S5 S1 S19 = 25',
        says: 'Your usual visit next to the score, so you see how far off it was.',
      },
      {
        name: 'Low visit',
        labels: ['weak'],
        source: 'scores',
        when: `The visit scores ${LOW_BELOW} or more below your average (your 30-day X01 average, or this game's without one).`,
        example: 'S20 S1 S5 = 26 · your average 60',
        says: 'One loose visit happens; a few in a row mean the rhythm went.',
      },
      {
        name: 'Spill into 1 / 5',
        labels: ['weak'],
        source: 'scores',
        when: 'Two or three darts of a visit at the 20 land in 1 or 5.',
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
        labels: ['mistake'],
        source: 'model',
        when: `A dart on a finish went at a number that gives at least ${notePoints} points less chance to check out than the best aim. The dart gets the benefit of the doubt: it was aimed at the best spot on the number it hit or on either number next to it, since a dart drifting into the next wedge is the commonest miss; a single near the middle (or one without a position) may also have been thrown at the bull or 25. Marks any visit, but only setup visits count toward the Bad setups card.`,
        example: '57 left · S20 → 37 · better S17 → 40',
        says: 'The better aim, and why: which leave its misses still give you.',
      },
      {
        name: 'Left a one-dart finish',
        labels: ['good'],
        source: 'scores',
        when: 'The visit ends on a score one dart can finish: an even number up to 40, or 50.',
        example: '95 left · S19 T20 → 16 (D8)',
        says: "That's the job of a setup visit. Otherwise the coach shows the route from what you left.",
      },
    ],
  },
  {
    title: 'Doubling',
    scope: 'Visits with at least one dart thrown on a one-dart finish.',
    checks: [
      {
        name: 'Missed double',
        labels: ['weak'],
        source: 'scores',
        when: 'Two or more darts at a double miss and the visit does not check out. One miss is OK.',
        example: '32 left · S16 · S8 → 8 left',
        says: 'Which doubles you missed. Every miss counts toward the Missed doubles card.',
      },
      {
        name: 'Tip',
        labels: ['tip'],
        source: 'model',
        when: "On a one-dart finish, the better aim was simply that double, and your opponent isn't on a finish. Not for a dart that busted. The visit keeps its grade.",
        example: '36 left · S4 → 32 · better D18',
        says: 'With a double left and nobody threatening to finish, you can go straight for it.',
      },
      {
        name: 'Missed match dart',
        labels: ['weak', 'mistake'],
        source: 'scores',
        when: 'Your last visit in a leg your opponent won had a dart at a double. A Mistake when it ended without a one-dart finish left.',
        example: '40 left · S20 · S10 · S5 → 5 · they check out',
        says: 'The darts that decide a leg: these come first in the review.',
      },
      {
        name: 'Chased down',
        labels: ['weak'],
        source: 'scores',
        when: 'From a one-dart finish of 6 or more, every dart lands in the single half of its double or misses, down to 4 or 2.',
        example: '16 left · S8 · S4 · S2 → 2',
        says: 'Each miss on the inside halves the double; aim the same way and stay calm.',
      },
      {
        name: 'Bust',
        labels: ['mistake'],
        source: 'scores',
        when: 'The visit goes below zero, leaves 1, or reaches zero without a double. It scores nothing. Not a Bust-back.',
        example: '40 left · S20 T20 → bust',
        says: 'Where it busted. Before each dart, check that its worst miss still leaves a score.',
      },
      {
        name: 'Bust-back',
        labels: ['ok'],
        source: 'model',
        when: "The busting dart was best thrown to bust: from a score that's hard to finish, back on the visit's start is worth more. The missed-doubles and match-dart checks still apply.",
        example: '20 left · S10 S7 S5 → back on 20',
        says: 'Busted on purpose to stay on 20 (D10).',
      },
      {
        name: 'Checked out',
        labels: ['great'],
        source: 'scores',
        when: 'A dart at a double finishes the leg.',
        example: '32 left · D16',
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
