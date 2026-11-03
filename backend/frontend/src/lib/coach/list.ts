// The Coach page's leg list (Coach-Review): its filters, each leg's title, when it finished and what
// the coach found in it.
import type { CoachLegRow } from '$lib/api'
import { startOfDay } from '$lib/fmt'
import { formatWhen } from '$lib/history'
import type { PillView } from './tone'

/** A leg's title: "vs Lena", "vs Max, Sophie", or "Solo" without an opponent. */
export const vsLine = (opponents: readonly string[]): string => (opponents.length ? `vs ${opponents.join(', ')}` : 'Solo')

/** The Coach page's leg filters, as the API names them */
export const COACH_FILTERS = [
  { id: 'all', label: 'All legs' },
  { id: 'lost', label: 'Lost' },
  { id: 'ranked', label: 'Ranked' },
  { id: 'missedDoubles', label: 'Missed doubles' },
  { id: 'badSetups', label: 'Bad setups' },
  { id: 'lowVisits', label: 'Low visits' },
] as const
export type CoachFilter = (typeof COACH_FILTERS)[number]['id']

/** The Coach page's filter from its querystring (`filter=lost`); All legs when missing or unknown. */
export function coachFilter(querystring: string | undefined): CoachFilter {
  const f = new URLSearchParams(querystring ?? '').get('filter')
  return COACH_FILTERS.find(x => x.id === f)?.id ?? 'all'
}

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A leg row's "Coach found" pills: missed doubles red, bad setups and low visits yellow; a clean leg only its green pill */
export function coachFound(row: Pick<CoachLegRow, 'missedDoubles' | 'badSetups' | 'lowVisits' | 'clean'>): PillView[] {
  if (row.clean) return [{ label: 'Clean leg', tone: 'lime' }]
  const pills: PillView[] = []
  if (row.missedDoubles > 0) pills.push({ label: counted(row.missedDoubles, 'missed double'), tone: 'bad' })
  if (row.badSetups > 0) pills.push({ label: counted(row.badSetups, 'bad setup'), tone: 'weak' })
  if (row.lowVisits > 0) pills.push({ label: counted(row.lowVisits, 'low visit'), tone: 'weak' })
  return pills
}

/** When a leg finished (Coach-Review): "Today 21:14", "Yesterday", the weekday ("Mon") within the
 *  week, the date beyond it. */
export function legWhen(iso: string, now: Date): string {
  const { day, time } = formatWhen(iso, now)
  if (day === 'Today') return `Today ${time}`
  const d = new Date(iso)
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  return ago >= 2 && ago <= 6 ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : day
}
