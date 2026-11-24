// The Activity page's Games played subpage (`#/admin/activity/games`): the filters, how they live in the
// URL hash (so a view can be shared or bookmarked) and the request they make (schema/api-v1.yaml, listAdminActivityGames).
import { api, type AdminActivityGames } from '$lib/api'
import { DAY_MS } from '$shared/time'

export type { AdminActivityGames }

export type Side = 'in' | 'out'
export type Choice = { id: string; side: Side }

export const PLAYER_BUCKETS = [
  { id: 'any', label: 'Any', min: undefined, max: undefined },
  { id: '1', label: '1', min: 1, max: 1 },
  { id: '2', label: '2', min: 2, max: 2 },
  { id: '3-4', label: '3–4', min: 3, max: 4 },
  { id: '5+', label: '5+', min: 5, max: undefined },
] as const
export type PlayerBucket = (typeof PLAYER_BUCKETS)[number]['id']

export const KINDS = [
  { id: 'any', label: 'All games' },
  { id: 'ranked', label: 'Ranked' },
  { id: 'unranked', label: 'Unranked' },
  { id: 'tournament', label: 'Tournament' },
  { id: 'lobby', label: 'Lobby' },
  { id: 'local', label: 'Local (no lobby)' },
] as const
export type Kind = (typeof KINDS)[number]['id']

export const STATUSES = [
  { id: 'finished', label: 'Finished' },
  { id: 'aborted', label: 'Aborted' },
  { id: 'all', label: 'Finished and aborted' },
] as const
export type Status = (typeof STATUSES)[number]['id']

export const RANGES = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
] as const
export type Range = (typeof RANGES)[number]['id']

/** The country filter's "no country" entry. */
export const NO_COUNTRY = 'none'

export type GamesFilters = {
  users: Choice[]
  countries: Choice[]
  countryMatch: 'any' | 'all'
  players: PlayerBucket
  modes: string[]
  kind: Kind
  status: Status
  range: Range
  /** yyyy-mm-dd (UTC), for the custom range. */
  from: string
  to: string
  invalidated: boolean
  page: number
}

export const DEFAULT_FILTERS: GamesFilters = {
  users: [],
  countries: [],
  countryMatch: 'any',
  players: 'any',
  modes: [],
  kind: 'any',
  status: 'finished',
  range: '30',
  from: '',
  to: '',
  invalidated: false,
  page: 1,
}

const oneOf = <T extends string>(options: readonly { id: T }[], v: string | null, fallback: T): T =>
  options.find(o => o.id === v)?.id ?? fallback

const picksFrom = (v: string | null): Choice[] =>
  (v ?? '')
    .split(',')
    .flatMap(x => (/^[io]:.+/.test(x) ? [{ id: x.slice(2), side: x[0] === 'i' ? ('in' as const) : ('out' as const) }] : []))
const picksTo = (picks: Choice[]): string => picks.map(p => `${p.side === 'in' ? 'i' : 'o'}:${p.id}`).join(',')

const isDate = (s: string | null): s is string => s !== null && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))

/** The filters a hash query string holds; anything unknown or malformed falls back to its default. */
export function parseFilters(qs: string | undefined): GamesFilters {
  const p = new URLSearchParams(qs)
  const page = Number(p.get('page'))
  const from = p.get('from')
  const to = p.get('to')
  return {
    users: picksFrom(p.get('users')),
    countries: picksFrom(p.get('countries')),
    countryMatch: p.get('match') === 'all' ? 'all' : 'any',
    players: oneOf(PLAYER_BUCKETS, p.get('players'), 'any'),
    modes: (p.get('modes') ?? '').split(',').filter(m => m !== ''),
    kind: oneOf(KINDS, p.get('kind'), 'any'),
    status: oneOf(STATUSES, p.get('status'), 'finished'),
    range: oneOf(RANGES, p.get('range'), '30'),
    from: isDate(from) ? from : '',
    to: isDate(to) ? to : '',
    invalidated: p.get('invalidated') === '1',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The query string for a set of filters, defaults left out. */
export function filtersToQuery(f: GamesFilters): string {
  const p = new URLSearchParams()
  const d = DEFAULT_FILTERS
  if (f.users.length > 0) p.set('users', picksTo(f.users))
  if (f.countries.length > 0) p.set('countries', picksTo(f.countries))
  if (f.countryMatch !== d.countryMatch) p.set('match', f.countryMatch)
  if (f.players !== d.players) p.set('players', f.players)
  if (f.modes.length > 0) p.set('modes', f.modes.join(','))
  if (f.kind !== d.kind) p.set('kind', f.kind)
  if (f.status !== d.status) p.set('status', f.status)
  if (f.range !== d.range) p.set('range', f.range)
  if (f.range === 'custom') {
    if (f.from) p.set('from', f.from)
    if (f.to) p.set('to', f.to)
  }
  if (f.invalidated) p.set('invalidated', '1')
  if (f.page > 1) p.set('page', String(f.page))
  return p.toString()
}

/** Whether any filter but the page is off its default. */
export const isFiltered = (f: GamesFilters): boolean => filtersToQuery({ ...f, page: 1 }) !== ''

/** The start (inclusive) and end (exclusive) of the range, UTC; a preset counts back from today's UTC day. */
export function rangeBounds(f: GamesFilters, now: number): { from?: Date; to?: Date } {
  if (f.range === 'all') return {}
  if (f.range === 'custom') {
    return {
      ...(f.from && { from: new Date(`${f.from}T00:00:00Z`) }),
      ...(f.to && { to: new Date(Date.parse(`${f.to}T00:00:00Z`) + DAY_MS) }),
    }
  }
  const today = Math.floor(now / DAY_MS) * DAY_MS
  return { from: new Date(today - (Number(f.range) - 1) * DAY_MS), to: new Date(today + DAY_MS) }
}

const ids = (picks: Choice[], side: Side): string | undefined => {
  const hit = picks.filter(p => p.side === side).map(p => p.id)
  return hit.length > 0 ? hit.join(',') : undefined
}

/** The query of `GET /api/admin/activity/games` (and its CSV) for these filters; blank ones are left out. */
export function apiQuery(f: GamesFilters, now: number) {
  const { from, to } = rangeBounds(f, now)
  const bucket = PLAYER_BUCKETS.find(b => b.id === f.players)
  return {
    usersIn: ids(f.users, 'in'),
    usersOut: ids(f.users, 'out'),
    countriesIn: ids(f.countries, 'in'),
    countriesOut: ids(f.countries, 'out'),
    countryMatch: f.countryMatch,
    minPlayers: bucket?.min,
    maxPlayers: bucket?.max,
    modes: f.modes.length > 0 ? f.modes.join(',') : undefined,
    kind: f.kind,
    status: f.status,
    from: from?.toISOString(),
    to: to?.toISOString(),
    includeInvalidated: f.invalidated,
  }
}

/** The CSV download's address: the same filters, no page. */
export function csvHref(f: GamesFilters, now: number): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(apiQuery(f, now))) if (v !== undefined && v !== '') p.set(k, String(v))
  return `/api/admin/activity/games.csv?${p}`
}

/** One page of games with the chart's counts. Throws on a failed request. */
export async function loadGames(f: GamesFilters, now: number): Promise<AdminActivityGames> {
  const res = await api.GET('/api/admin/activity/games', { params: { query: { ...apiQuery(f, now), page: f.page } } })
  if (!res.data) throw new Error(res.error.error)
  return res.data
}

/** "12 Nov" for a yyyy-mm-dd day. */
export const dayLabel = (day: string): string =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** How many pages `total` games take. */
export const pageCount = (total: number, pageSize: number): number => Math.max(1, Math.ceil(total / pageSize))

/** Who won, as the table says it: the first place's names, or why there is no winner. */
export function outcomeText(g: AdminActivityGames['games'][number]): string {
  if (g.status === 'aborted') return 'Aborted'
  const winners = g.players.filter(p => p.placement === 1)
  return winners.length === 0 || g.players.length === 1 ? 'Finished' : `${winners.map(w => w.name).join(' & ')} won`
}
