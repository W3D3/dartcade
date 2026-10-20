// Admin game list: every game on the platform, for investigating (schema/api-v1.yaml, tag admin).
import { api, type AdminGameSummary } from '$lib/api'

export type { AdminGameSummary }

export type GameStatus = 'finished' | 'aborted' | 'active' | 'all'
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
  if (g.status === 'aborted') return 'Aborted'
  if (g.status === 'active') return 'In progress'
  const winners = g.players.filter(p => p.placement === 1)
  if (winners.length === 0) return 'Finished'
  return g.players.length === 1 ? 'Finished' : `${winners.map(w => w.name).join(' & ')} won`
}
