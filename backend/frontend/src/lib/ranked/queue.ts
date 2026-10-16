// The ranked queue on the frontend: what the searching panel and the match-found prompt show
// (MM-Searching, MM-Duo, MM-Found, MM-Found-Duo boards), and the requests that change the search.
// The search itself lives on the server and comes in on /ws/me.
import { api } from '$lib/api'
import type { MatchmakingMatch, MatchmakingSearch } from '$lib/api/lobby-ws'
import { fmtRp } from './view'

export type RankedMode = MatchmakingSearch['mode']
export type FirstTo = MatchmakingSearch['firstTo']

/** "501 · Double out · First to 2 legs". */
export const formatLine = (firstTo: number): string => `501 · Double out · First to ${firstTo} legs`

/** "1:05": minutes and seconds, never negative. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export type SearchView = {
  title: string
  format: string
  /** "±75 RP". */
  range: string
  /** How long it has searched: "0:42". */
  elapsed: string
  /** "212 players searching", "38 duos searching". */
  searching: string
  /** The range bar: the band's inset from either end, in %, and its labels; null while placing (the rating is hidden). */
  bar: { inset: number; low: string; you: string; high: string } | null
  /** "Christoph & Lena" for a duo. */
  players: string
}

export function searchView(s: MatchmakingSearch, now: number): SearchView {
  const duo = s.mode === '2v2'
  const count = s.searching
  const unit = duo ? (count === 1 ? 'duo' : 'duos') : count === 1 ? 'player' : 'players'
  // The band starts at a bit over half the bar (±75) and fills it as the range widens
  const half = Math.min(45, 28 * Math.sqrt(s.range / 75))
  return {
    title: duo ? 'Searching · Duo 2v2' : 'Searching · Solo 1v1',
    format: formatLine(s.firstTo),
    range: `±${s.range} RP`,
    elapsed: clock((now - Date.parse(s.since)) / 1000),
    searching: `${count} ${unit} searching`,
    bar:
      s.rating === null
        ? null
        : {
            inset: Math.round((50 - half) * 10) / 10,
            low: fmtRp(s.rating - s.range),
            you: `${duo ? 'Your duo' : 'You'} · ${fmtRp(s.rating)}`,
            high: fmtRp(s.rating + s.range),
          },
    players: s.players.join(' & '),
  }
}

/** Seconds left to accept a found match. */
export const secondsLeft = (m: Pick<MatchmakingMatch, 'expiresAt'>, now: number): number =>
  Math.max(0, Math.ceil((Date.parse(m.expiresAt) - now) / 1000))

/** "Everyone has to accept · 2 of 4 so far"; for 1v1 null (the design shows no count). */
export function acceptedLine(m: MatchmakingMatch): string | null {
  const all = [...m.yours, ...m.theirs]
  if (all.length <= 2) return null
  return `Everyone has to accept · ${all.filter(s => s.accepted).length} of ${all.length} so far`
}

/** You accepted and wait for the others. */
export const youAccepted = (m: MatchmakingMatch): boolean => m.yours.some(s => s.you && s.accepted)

/** Paused after a declined match: "1:42" left, or null. */
export function pausedFor(pausedUntil: string | null, now: number): string | null {
  if (pausedUntil === null) return null
  const left = (Date.parse(pausedUntil) - now) / 1000
  return left > 0 ? clock(left) : null
}

// Each request answers with an error message to show, or null when it went through

export async function startSearch(mode: RankedMode, firstTo: FirstTo): Promise<string | null> {
  const { error } = await api.POST('/api/matchmaking/search', { body: { mode, firstTo } })
  return error ? error.error : null
}

export async function cancelSearch(): Promise<string | null> {
  const { error } = await api.DELETE('/api/matchmaking/search')
  return error ? error.error : null
}

export async function acceptMatch(matchId: string): Promise<string | null> {
  const { error } = await api.POST('/api/matchmaking/matches/{matchId}/accept', { params: { path: { matchId } } })
  return error ? error.error : null
}

export async function declineMatch(matchId: string): Promise<string | null> {
  const { error } = await api.POST('/api/matchmaking/matches/{matchId}/decline', { params: { path: { matchId } } })
  return error ? error.error : null
}
