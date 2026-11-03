// The coach's tones (Coach-Leg, Coach-Review, Coach-Mistakes): one palette for every pill, dart
// tile, skill letter and count, and what each grade and grouping comment wears.
import type { SkillGrade, VisitGrade } from '$shared/coach'
import type { DartTone } from './dart'
import type { Grouping, GroupingLevel } from '$shared/coach/grouping'

/** Each tone's text colour: what text-only uses (counts, letters, legends) wear */
export const TONE_TEXT = {
  halo: 'text-accent-fg',
  solid: 'text-accent-fg',
  lime: 'text-accent',
  good: 'text-good',
  dim: 'text-text-dim',
  plain: 'text-ink-2',
  weak: 'text-gold',
  bad: 'text-live',
  info: 'text-ice',
} as const
export type PillTone = keyof typeof TONE_TEXT

const TONE_BG: Record<PillTone, string> = {
  halo: 'bg-accent ring-[3px] ring-accent/35',
  solid: 'bg-accent',
  lime: 'bg-accent-tint',
  good: 'bg-good/15',
  dim: 'bg-text-dim/15',
  plain: 'bg-surface-paused',
  weak: 'bg-gold/15',
  bad: 'bg-live/15',
  info: 'bg-ice/15',
}

/** A tone's fill and text: filled lime with a halo (Perfect), filled lime (Great), the rest tinted */
export const pillTone = (t: PillTone): string => `${TONE_BG[t]} ${TONE_TEXT[t]}`

export type PillView = { label: string; tone: PillTone }

/** A dart tile in its band's pill colours (Good green beside the Good pill); a miss only the Bad text */
export const TILE_TONE: Record<DartTone, string> = {
  good: pillTone('good'),
  plain: pillTone('plain'),
  weak: pillTone('weak'),
  costly: pillTone('bad'),
  miss: `bg-transparent ${TONE_TEXT.bad}`,
}

/** A skill's A–D letter: A and B lime, C weak, D bad; a skill the leg didn't test dim */
export const SKILL_TONE: Record<NonNullable<SkillGrade['grade']> | 'none', PillTone> = {
  A: 'lime',
  B: 'lime',
  C: 'weak',
  D: 'bad',
  none: 'dim',
}

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
