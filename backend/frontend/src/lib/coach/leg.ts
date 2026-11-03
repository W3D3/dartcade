// The leg review's heading (Coach-Leg): the title, its subtitles, the coaching level, the visit it
// opens on and the scoring skill's grouping.
import type { CoachLegTitle } from '$lib/api'
import { LEVEL_AVERAGE } from '$shared/botLevels'
import type { LegReview, ReviewVisit } from '$shared/coach'
import { legWhen, vsLine } from './list'

/** "Leg 3 vs Lena", "Leg 1 · Solo"; `leg` is 0-based */
export const legHeading = (leg: number, opponents: readonly string[]): string =>
  `Leg ${leg + 1}${opponents.length ? ` ${vsLine(opponents)}` : ' · Solo'}`

/** The leg's context without its "· leg N" (the heading has it): "501 · Friday darts", "Ranked 1v1" */
const contextHead = (context: string) => context.replace(/ · leg \d+$/, '')
/** "today 21:14", "yesterday", "Mon", "2 Nov" */
const legWhenLower = (iso: string, now: Date) => legWhen(iso, now).replace(/^(Today|Yesterday)/, s => s.toLowerCase())

/** Desktop: "501 · double out · Friday darts · today 21:14 · lost, Lena checked out in 21 darts" */
export function legSubtitle(title: CoachLegTitle, darts: number, now: Date): string {
  const [first, ...rest] = contextHead(title.context).split(' · ')
  const result = title.won
    ? `won in ${darts} darts`
    : title.winnerName === null
      ? 'no checkout'
      : `lost, ${title.winnerName} checked out${title.winnerDarts === null ? '' : ` in ${title.winnerDarts} darts`}`
  // Every coached leg is double out: coachable() takes no other out mode
  return [first, 'double out', ...rest, legWhenLower(title.finishedAt, now), result].join(' · ')
}

/** Phone: "501 · today 21:14 · lost · 21 darts · avg 71.0" (the context's first part only); "no
 *  checkout" when nobody checked out */
export function legSubtitleShort(title: CoachLegTitle, darts: number, average: number | null, now: Date): string {
  const parts = [
    contextHead(title.context).split(' · ')[0],
    legWhenLower(title.finishedAt, now),
    title.won ? 'won' : title.winnerName === null ? 'no checkout' : 'lost',
    `${darts} darts`,
  ]
  return [...parts, ...(average === null ? [] : [`avg ${average.toFixed(1)}`])].join(' · ')
}

/** "Coached as a 46 average": the level whose model judged the leg (model.ts coachLevel) */
export const coachedAs = (level: number): string => `Coached as a ${LEVEL_AVERAGE[level - 1]} average`

/** The visit the page opens on (an index): the first Mistake, else the first with a note, else the first. */
export function defaultVisit(visits: readonly Pick<ReviewVisit, 'grade' | 'notes'>[]): number {
  const i = visits.findIndex(v => v.grade === 'mistake')
  return Math.max(i >= 0 ? i : visits.findIndex(v => v.notes.length > 0), 0)
}

/** The scoring skill's grouping: " · grouping 12 mm · edge 4 mm", empty without a placed group */
export function legGroupingLine(g: LegReview['grouping']): string {
  return [
    g.spreadMm === null ? '' : ` · grouping ${Math.round(g.spreadMm)} mm`,
    g.edgeMm === null ? '' : ` · edge ${Math.round(g.edgeMm)} mm`,
  ].join('')
}
