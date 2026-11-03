// The coach's pill tones (Coach-Leg, Coach-Review, Coach-Mistakes): one palette for every pill, and
// what each grade and grouping comment wears.
import type { VisitGrade } from '$shared/coach'
import type { Grouping, GroupingLevel } from '$shared/coach/grouping'

/** Filled lime with a halo (Perfect), filled lime (Great), the rest tinted */
export const PILL_TONE = {
  halo: 'bg-accent text-accent-fg ring-[3px] ring-accent/35',
  solid: 'bg-accent text-accent-fg',
  lime: 'bg-accent-tint text-accent',
  good: 'bg-good/15 text-good',
  dim: 'bg-text-dim/15 text-text-dim',
  plain: 'bg-surface-paused text-ink-2',
  weak: 'bg-gold/15 text-gold',
  bad: 'bg-live/15 text-live',
  info: 'bg-ice/15 text-ice',
} as const
export type PillTone = keyof typeof PILL_TONE

export type PillView = { label: string; tone: PillTone }

/** A visit's grade pill. Tip is a note that leaves the grade alone, in the blue Info style. */
export const GRADE_PILL: Record<VisitGrade | 'tip', PillView> = {
  perfect: { label: 'Perfect', tone: 'halo' },
  great: { label: 'Great', tone: 'solid' },
  good: { label: 'Good', tone: 'good' },
  ok: { label: 'OK', tone: 'dim' },
  weak: { label: 'Weak', tone: 'weak' },
  mistake: { label: 'Bad', tone: 'bad' },
  tip: { label: 'Tip', tone: 'info' },
}

/** A grouping comment in the grade pill's tones: Great filled lime, Good green, Scattered weak */
const GROUPING_TONE: Record<GroupingLevel, PillTone> = { great: 'solid', good: 'good', scattered: 'weak' }

/** A visit's grouping comment as a pill; null without one worth saying (groupingComment,
 *  shared/coach/grouping.ts, judged on the server against the player's average). */
export function groupingPill(g: Pick<Grouping, 'comment'> | null): PillView | null {
  const c = g?.comment
  return c ? { label: c.text, tone: GROUPING_TONE[c.level] } : null
}
