// Admin game list: every game on the platform, for admins and moderators to investigate and invalidate (schema/api-v1.yaml, tag admin).
import { api, type AdminGameSummary, type QueuedSearch } from '$lib/api'

export type { AdminGameSummary }

/** How a moderator invalidated a game; null while it counts. */
export type Invalidation = AdminGameSummary['invalidated']

export type GameStatus = 'finished' | 'aborted' | 'active' | 'invalidated' | 'all'
export type GameFilters = {
  status: GameStatus
  mode: string | null
  player: string
  ranked: boolean
  /** yyyy-mm-dd from a date input, in the viewer's time zone; blank for no limit. */
  from: string
  to: string
}

export const DEFAULT_FILTERS: GameFilters = { status: 'finished', mode: null, player: '', ranked: false, from: '', to: '' }

export const STATUS_OPTIONS: { id: GameStatus; label: string }[] = [
  { id: 'finished', label: 'Finished' },
  { id: 'all', label: 'All' },
  { id: 'aborted', label: 'Aborted' },
  { id: 'active', label: 'Active' },
  { id: 'invalidated', label: 'Invalidated' },
]

const DAY_MS = 86_400_000

/** Midnight (local) at the start of a yyyy-mm-dd date; null if it isn't one. */
function startOfDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return isNaN(d.getTime()) ? null : d
}

/** The query for `GET /api/admin/games`: blank filters left out, `to` made inclusive of its day. */
export function filterQuery(f: GameFilters, cursor: string | null) {
  const from = startOfDate(f.from)
  const to = startOfDate(f.to)
  const player = f.player.trim()
  return {
    status: f.status,
    ...(f.mode !== null && { mode: f.mode }),
    ...(player !== '' && { player }),
    ...(f.ranked && { ranked: true }),
    ...(from && { from: from.toISOString() }),
    ...(to && { to: new Date(to.getTime() + DAY_MS).toISOString() }),
    ...(cursor !== null && { cursor }),
  }
}

/** A page of games. Throws on a failed request. */
export async function loadGames(f: GameFilters, cursor: string | null): Promise<{ games: AdminGameSummary[]; nextCursor: string | null }> {
  const res = await api.GET('/api/admin/games', { params: { query: filterQuery(f, cursor) } })
  if (!res.data) throw new Error(res.error.error)
  return res.data
}

/** Who won: the first placed seat's name (a team game lists every seat in that place); a game without a result says why. */
export function outcome(g: AdminGameSummary): string {
  if (g.voided) return 'Voided'
  if (g.status === 'aborted') return 'Aborted'
  if (g.status === 'active') return 'In progress'
  const winners = g.players.filter(p => p.placement === 1)
  if (winners.length === 0) return 'Finished'
  return g.players.length === 1 ? 'Finished' : `${winners.map(w => w.name).join(' & ')} won`
}

/** What invalidating a game warns about; the same text on the list and the details page. */
export const INVALIDATE_WARNING =
  'The game stays for moderators, but no longer counts in stats, best values or ratings. Its players still see it in their history, marked as invalidated. If it was ranked, the ratings it counted in are recalculated without it.'

/** Longest reason the server takes. */
export const REASON_MAX = 500

/** Invalidates a game, with an optional reason. On a refusal (not finished, already invalidated, gone), the message to show. */
export async function invalidateGame(id: string, reason: string): Promise<{ recalculated: string[] } | { error: string }> {
  const res = await api.POST('/api/admin/games/{id}/invalidate', { params: { path: { id } }, body: { reason: reason.trim() } })
  return res.data ?? { error: res.error.error }
}

/** What deleting a game warns about (admins only); the same text on the list and the details page. */
export const DELETE_WARNING =
  'The game, its darts and its stats are removed for good, invalidated or not, and cannot be restored. If it was ranked, the ratings it counted in are recalculated without it. Invalidate it instead to keep it for moderators.'

/** Deletes a game for good. On a refusal (in progress, already gone), the message to show. */
export async function deleteGame(id: string): Promise<{ recalculated: string[] } | { error: string }> {
  const res = await api.DELETE('/api/admin/games/{id}', { params: { path: { id } } })
  return res.data ?? { error: res.error.error }
}

/** What restoring a game says; the same text on the list and the details page. */
export const RESTORE_WARNING =
  "The game counts again in its players' history, stats and best values. If it was ranked, the ratings are recalculated with it."

/** Takes an invalidation back. On a refusal (not invalidated, gone), the message to show. */
export async function restoreGame(id: string): Promise<{ recalculated: string[] } | { error: string }> {
  const res = await api.POST('/api/admin/games/{id}/restore', { params: { path: { id } } })
  return res.data ?? { error: res.error.error }
}

/** "by Mo on 2 Oct 2026: Board was misreading": who, when and (if given) why; the account may be gone. */
export function invalidationText(i: NonNullable<Invalidation>): string {
  const when = new Date(i.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const who = i.by ? ` by ${i.by.name}` : ''
  return `Invalidated${who} on ${when}${i.reason ? `: ${i.reason}` : ''}`
}

/** What voiding a running ranked game warns about. */
export const VOID_WARNING =
  'The game ends now with no result and nobody’s rating moves. It is not a forfeit and is never rated. Its players are told a moderator voided it.'

/** Voids a running ranked game, with an optional reason. On a refusal (not running, not ranked), the message to show. */
export async function voidGame(id: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const res = await api.POST('/api/admin/games/{id}/void', { params: { path: { id } }, body: { reason: reason.trim() } })
  return res.error ? { error: res.error.error } : { ok: true }
}

export type { QueuedSearch }

/** The searches waiting in the ranked queue, longest first. Null: the request failed. */
export async function loadQueue(): Promise<QueuedSearch[] | null> {
  const res = await api.GET('/api/admin/ranked/queue')
  return res.data?.searches ?? null
}

/** Takes a user out of the queue (their duo too), with an optional reason. On a refusal (not queued), the message to show. */
export async function removeFromQueue(userId: string, reason: string): Promise<{ ok: true } | { error: string }> {
  const res = await api.POST('/api/admin/ranked/queue/{userId}/remove', { params: { path: { userId } }, body: { reason: reason.trim() } })
  return res.error ? { error: res.error.error } : { ok: true }
}

/** "1:05" for a wait of 65 seconds. */
export function waitText(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
