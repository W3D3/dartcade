// The coach's tones (Coach-Leg, Coach-Review, Coach-Mistakes): one palette for every pill, dart
// tile, skill letter and count, and what each grade and grouping comment wears. The grades' colours
// are the --color-grade-* tokens (app.css), after chess.com's move classes.
import type { SkillGrade, VisitGrade } from '$shared/coach'
import type { DartTone } from './dart'
import type { Grouping, GroupingLevel } from '$shared/coach/grouping'

/** Each tone's text colour: what text-only uses (counts, letters, legends) wear */
export const TONE_TEXT = {
  brilliant: 'text-grade-brilliant-text',
  excellent: 'text-grade-excellent-text',
  great: 'text-grade-great-text',
  good: 'text-grade-good-text',
  ok: 'text-grade-ok-text',
  inaccuracy: 'text-grade-inaccuracy-text',
  weak: 'text-grade-weak-text',
  bad: 'text-grade-bad-text',
  lime: 'text-accent',
  plain: 'text-ink-2',
  info: 'text-ice',
} as const satisfies Record<VisitGrade | 'lime' | 'plain' | 'info', string>
export type PillTone = keyof typeof TONE_TEXT

/** A tone's pill: Brilliant filled with a halo and Excellent filled (dark text), the rest tinted */
const TONE_PILL: Record<PillTone, string> = {
  brilliant: 'bg-grade-brilliant text-accent-fg ring-[3px] ring-grade-brilliant/35',
  excellent: 'bg-grade-excellent text-accent-fg',
  great: `bg-grade-great/20 ${TONE_TEXT.great}`,
  good: `bg-grade-good/18 ${TONE_TEXT.good}`,
  ok: `bg-grade-ok/18 ${TONE_TEXT.ok}`,
  inaccuracy: `bg-grade-inaccuracy/18 ${TONE_TEXT.inaccuracy}`,
  weak: `bg-grade-weak/18 ${TONE_TEXT.weak}`,
  bad: `bg-grade-bad/20 ${TONE_TEXT.bad}`,
  lime: `bg-accent-tint ${TONE_TEXT.lime}`,
  plain: `bg-surface-paused ${TONE_TEXT.plain}`,
  info: `bg-ice/15 ${TONE_TEXT.info}`,
}

/** A tone's fill and text */
export const pillTone = (t: PillTone): string => TONE_PILL[t]

export type PillView = { label: string; tone: PillTone }

/** A dart tile in the grade palette, so tiles and pills agree: good green (Excellent's), even grey
 *  (OK's), a slight loss yellow (Inaccuracy's), costly orange (Weak's), a bust red (Bad's); a miss
 *  without a grade only the Bad text */
export const TILE_TONE: Record<DartTone, string> = {
  good: `bg-grade-excellent/20 ${TONE_TEXT.excellent}`,
  plain: pillTone('ok'),
  weak: pillTone('inaccuracy'),
  costly: pillTone('weak'),
  bust: pillTone('bad'),
  miss: `bg-transparent ${TONE_TEXT.bad}`,
}

/** A skill's A–D letter in the grade palette: A Excellent, B Good, C Weak, D Bad; untested OK grey */
export const SKILL_TONE: Record<NonNullable<SkillGrade['grade']> | 'none', PillTone> = {
  A: 'excellent',
  B: 'good',
  C: 'weak',
  D: 'bad',
  none: 'ok',
}

/** Each grade's style: its word, its pill's tone, its stretch of the debug view's scale bar. Tip
 *  is a note that leaves the grade alone, in the blue Info style. */
export const GRADE_STYLE: Record<VisitGrade | 'tip', PillView & { fill: string }> = {
  brilliant: { label: 'Brilliant', tone: 'brilliant', fill: 'bg-grade-brilliant' },
  excellent: { label: 'Excellent', tone: 'excellent', fill: 'bg-grade-excellent' },
  great: { label: 'Great', tone: 'great', fill: 'bg-grade-great' },
  good: { label: 'Good', tone: 'good', fill: 'bg-grade-good' },
  ok: { label: 'OK', tone: 'ok', fill: 'bg-grade-ok' },
  inaccuracy: { label: 'Inaccuracy', tone: 'inaccuracy', fill: 'bg-grade-inaccuracy' },
  weak: { label: 'Weak', tone: 'weak', fill: 'bg-grade-weak' },
  bad: { label: 'Bad', tone: 'bad', fill: 'bg-grade-bad' },
  tip: { label: 'Tip', tone: 'info', fill: 'bg-ice' },
}

/** A grouping comment's icon colour: Great and Good in the grade greens, Scattered Inaccuracy yellow */
const GROUPING_TONE: Record<GroupingLevel, PillTone> = { great: 'excellent', good: 'good', scattered: 'inaccuracy' }

/** A visit's grouping comment for its outlined, informational pill; null without one worth saying
 *  (groupingComment, shared/coach/grouping.ts, judged on the server against the player's average). */
export function groupingPill(g: Pick<Grouping, 'comment'> | null): PillView | null {
  const c = g?.comment
  return c ? { label: c.text, tone: GROUPING_TONE[c.level] } : null
}
