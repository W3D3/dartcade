// The Coach page's leg list (Coach-Review): its filters, each leg's title, when it finished and what
// the coach found in it.
import type { CoachLegRow } from '$lib/api'
import { calendarDaysAgo, weekday } from '$lib/fmt'
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
/** The filters' ids, for readParam (`filter=lost`) */
export const COACH_FILTER_IDS: readonly CoachFilter[] = COACH_FILTERS.map(f => f.id)

/** The leg list's desktop grid: When, Leg, Result, Darts, Avg, Coach found, Review */
export const LEG_COLUMNS = 'lg:grid-cols-[110px_minmax(0,1.4fr)_70px_70px_64px_minmax(0,1.4fr)_150px]'

/** Whether the Coach list asks the server again for reviews it is still building: only while some
 *  are pending and no request (the first load, Show more, the last ask) is still running. */
export const shouldRefresh = (pending: number, busy: boolean): boolean => pending > 0 && !busy

/** Whether a refresh fetches one more page: until it has the `shown` rows the user had open, as far
 *  as the list goes, so asking again doesn't fold what Show more opened back to the first page. */
export const needsAnotherPage = (fetched: number, shown: number, next: string | null): boolean => next !== null && fetched < shown

const counted = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** A leg row's "Coach found" pills: missed doubles red (Bad), bad setups and low visits orange (Weak); a clean leg only its lime pill */
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
  const ago = calendarDaysAgo(d, now)
  return ago >= 2 && ago <= 6 ? weekday(d) : day
}
