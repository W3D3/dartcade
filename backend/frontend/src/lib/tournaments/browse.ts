// The Browse tab (Tournaments, Tournaments-Phone boards): its filters, the words each row and the
// detail panel show, and the requests behind Register and Withdraw.
import { api, type Tournament, type TournamentSummary } from '$lib/api'
import { LOCALE } from '$lib/fmt'
import { gameTitle } from '$shared/gameNames'
import type { RegistrationState } from '$shared/tournaments/registration'

type Listed = Pick<TournamentSummary, 'kind' | 'status' | 'teamSize' | 'gameId' | 'name' | 'owner'>

export type KindFilter = 'all' | 'official' | 'community'
export const CHIPS = ['open', 'solo', 'teams', 'x01', 'cricket', 'minigolf'] as const
export type Chip = (typeof CHIPS)[number]
export const CHIP_LABELS: Record<Chip, string> = {
  open: 'Open now',
  solo: 'Solo',
  teams: 'Teams',
  x01: 'X01',
  cricket: 'Cricket',
  minigolf: 'Minigolf',
}

export interface BrowseFilter {
  kind: KindFilter
  chips: ReadonlySet<Chip>
  query: string
}

/** Chips in one group widen the match (Solo or Teams), groups narrow it (Teams and X01). */
const GROUPS: readonly (readonly [Chip[], (t: Listed, c: Chip) => boolean])[] = [
  [['open'], t => t.status === 'open'],
  [['solo', 'teams'], (t, c) => (c === 'solo') === (t.teamSize === 1)],
  [['x01', 'cricket', 'minigolf'], (t, c) => t.gameId === c],
]

export function matches(t: Listed, f: BrowseFilter): boolean {
  if (f.kind !== 'all' && t.kind !== f.kind) return false
  for (const [chips, test] of GROUPS) {
    const on = chips.filter(c => f.chips.has(c))
    if (on.length > 0 && !on.some(c => test(t, c))) return false
  }
  const q = f.query.trim().toLocaleLowerCase()
  return q === '' || [t.name, t.owner?.name ?? ''].some(s => s.toLocaleLowerCase().includes(q))
}

/** The When box: "Sat", "Nov", "15", "20:00"; null when an organizer starts it. */
export function whenParts(iso: string | null): { weekday: string; month: string; day: string; time: string } | null {
  if (iso === null) return null
  const d = new Date(iso)
  return {
    weekday: d.toLocaleDateString(LOCALE, { weekday: 'short' }),
    month: d.toLocaleDateString(LOCALE, { month: 'short' }),
    day: String(d.getDate()),
    time: d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }),
  }
}

/** "Sun 16 Nov · 19:00". */
export const fullWhen = (iso: string): string => {
  const d = new Date(iso)
  return `${d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`
}

const FORMAT_SHORT: Record<TournamentSummary['format'], string> = {
  single_elimination: 'Single elim.',
  double_elimination: 'Double elim.',
  round_robin: 'Round robin',
  groups_knockout: 'Groups + KO',
}
const FORMAT_LONG: Record<TournamentSummary['format'], string> = {
  single_elimination: 'single elimination',
  double_elimination: 'double elimination',
  round_robin: 'round robin',
  groups_knockout: 'groups + knockout',
}

export const entryLabel = (teamSize: number): string => (teamSize === 1 ? 'Solo' : `Teams of ${teamSize}`)
export const formatLine = (t: Pick<TournamentSummary, 'format' | 'maxEntries'>): string => `${FORMAT_SHORT[t.format]} · ${t.maxEntries}`
export const formatLong = (t: Pick<TournamentSummary, 'format' | 'maxEntries' | 'teamSize'>): string =>
  `${entryLabel(t.teamSize)} · ${FORMAT_LONG[t.format]} · ${t.maxEntries} ${t.teamSize === 1 ? 'players' : 'teams'}`

/** The game pill: "X01 501", "Cricket", "Cricket · cut-throat". */
export function gamePill(gameId: string, config: Record<string, unknown>): string {
  if (gameId === 'x01' && typeof config.startScore === 'number') return `X01 ${config.startScore}`
  if (gameId === 'cricket' && config.mode === 'cutthroat') return 'Cricket · cut-throat'
  return gameTitle(gameId)
}

/** The detail panel's game line: "X01 501 · double out · first to 3". */
export function gameLine(gameId: string, config: Record<string, unknown>, firstTo: number): string {
  const out = gameId === 'x01' && typeof config.outMode === 'string' ? [`${config.outMode} out`] : []
  return [gamePill(gameId, config), ...out, `first to ${firstTo}`].join(' · ')
}

const ACCESS_LABEL: Record<TournamentSummary['access'], string> = {
  public: 'public',
  friends: 'friends',
  invite: 'invite link',
  in_person: 'in person',
}

/** "by Lena · friends"; "Official" for Dartcade's own. */
export const byLine = (t: Pick<TournamentSummary, 'kind' | 'owner' | 'access'>): string =>
  t.kind === 'official' ? 'Official' : `by ${t.owner?.name ?? 'a former player'} · ${ACCESS_LABEL[t.access]}`

/** The players column: "27 / 32" and "5 spots left" or "Full". */
export function spots(t: Pick<TournamentSummary, 'entries' | 'maxEntries'>): { left: string; full: boolean; percent: number } {
  const left = t.maxEntries - t.entries
  return {
    left: left <= 0 ? 'Full' : left === 1 ? '1 spot left' : `${left} spots left`,
    full: left <= 0,
    percent: Math.min(100, Math.round((t.entries / t.maxEntries) * 100)),
  }
}

/** Why Register is not there, as the row's caption and the phone row's status line. */
export const REGISTRATION_NOTE: Record<RegistrationState, string> = {
  open: 'Open · tap to register',
  registered: 'Registered',
  full: 'Full',
  closed: 'Registration closed',
  board_needed: 'Paired board needed',
  team: 'A captain registers the team',
  in_person: 'Added by the organizers',
}

/** "Lena, Max and 2 friends are in". */
export function friendsInLine(names: readonly string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} is in`
  if (names.length === 2) return `${names[0]} and ${names[1]} are in`
  const rest = names.length - 2
  return `${names[0]}, ${names[1]} and ${rest} ${rest === 1 ? 'friend' : 'friends'} are in`
}

/** The answer to a request: the tournament, or what to say instead. */
export type Outcome = { tournament: Tournament } | { error: string }

const REFUSAL: Partial<Record<string, string>> = {
  full: 'Every spot is taken.',
  'registration closed': 'Registration has closed.',
  'paired board needed': 'Pair a board first: this tournament is played on your own board.',
}

async function outcome(call: Promise<{ data?: Tournament; error?: { error: string }; response: Response }>): Promise<Outcome> {
  try {
    const res = await call
    if (res.data) return { tournament: res.data }
    if (res.response.status === 404) return { error: 'This tournament is gone, or you cannot see it.' }
    return { error: REFUSAL[res.error?.error ?? ''] ?? res.error?.error ?? 'Something went wrong. Try again.' }
  } catch {
    return { error: 'Something went wrong. Try again.' }
  }
}

/** The Browse list; null when it could not be loaded (a refusal or no network). */
export async function loadBrowse(): Promise<TournamentSummary[] | null> {
  try {
    return (await api.GET('/api/tournaments')).data?.tournaments ?? null
  } catch {
    return null
  }
}
export const loadTournament = (id: string) => outcome(api.GET('/api/tournaments/{id}', { params: { path: { id } } }))
export const loadByCode = (code: string) => outcome(api.GET('/api/tournaments/code/{code}', { params: { path: { code } } }))
/** `code`: the invite link it was opened by, which an invite link's tournament needs. */
export const register = (id: string, code?: string) =>
  outcome(api.POST('/api/tournaments/{id}/registration', { params: { path: { id }, query: { code } } }))
export const withdraw = (id: string) => outcome(api.DELETE('/api/tournaments/{id}/registration', { params: { path: { id } } }))
