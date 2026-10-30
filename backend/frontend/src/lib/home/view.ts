// What the Home page says, as plain text from the data it loads (Home board: Your form, Ranked,
// Friends' lobbies, Friend activity, Jump back in). Design: docs/superpowers/specs/2026-10-27-home-page-design.md
import type { GameStats, GameSummary } from '$lib/api'
import type { components } from '$lib/api/schema'
import { GAME_MODES } from '$lib/gameModes'
import { dayMonth, plural, startOfDay } from '$lib/fmt'
import { playerBadges, resultLabel } from '$lib/history'
import type { RankedGame, RankedRating } from '$lib/ranked/view'
import { nextStage, rank } from '$shared/ranked.js'

export type HomeEvent = components['schemas']['HomeEvent']
export type HomeLobby = components['schemas']['HomeLobbies']['lobbies'][number]

const NONE = '–'
const DAY_MS = 86_400_000

/** "Good morning" from 05:00, "Good afternoon" from 12:00, "Good evening" from 18:00 until 05:00. */
export function greeting(now: Date): string {
  const h = now.getHours()
  return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'
}

/** "Friday, 16 October". */
export function longDate(now: Date): string {
  return `${now.toLocaleDateString('en-GB', { weekday: 'long' })}, ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
}

export type Trend = { dir: 'up' | 'down' | 'flat'; delta: number }

/** How far an average moved against the period before, to one decimal; absent without both. */
export function trend(avg: number | null, previous: number | null): Trend | null {
  if (avg === null || previous === null) return null
  const delta = Math.round((avg - previous) * 10) / 10
  return { dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', delta: Math.abs(delta) }
}

export type FormView = {
  avg: string
  trend: Trend | null
  /** The average of each day with a game, oldest first; `day` is the UTC midnight in ms. */
  byDay: { day: number; avg: number }[]
  checkout: string
  bestCheckout: string
  games: string
}

/** Your form: the X01 numbers of the stats period (30 days) and how many games you played in all modes. */
export function formForm(stats: GameStats): FormView {
  const x01 = Object.hasOwn(stats.modes, 'x01') ? stats.modes.x01.stats : {}
  const stat = (key: string) => (Object.hasOwn(x01, key) ? x01[key] : undefined)
  const avg = stat('average')
  const hits = stat('checkoutHits')?.sum ?? 0
  const tries = stat('checkoutAttempts')?.sum ?? 0
  const best = stat('bestCheckout')
  return {
    avg: avg ? avg.avg.toFixed(1) : NONE,
    trend: avg ? trend(avg.avg, avg.previousAvg) : null,
    byDay: (avg?.byDay ?? []).map(d => ({ day: Date.parse(d.day), avg: d.avg })),
    // Games from before the tries were stored have none: a dash, not 0%
    checkout: tries > 0 ? `${Math.round((hits / tries) * 100)}%` : NONE,
    bestCheckout: best ? String(best.max) : NONE,
    games: String(stats.matches),
  }
}

/** The last five ranked games as W and L, newest first (the API sends them newest first). */
export function lastFive(games: readonly RankedGame[]): ('W' | 'L')[] {
  return games.slice(0, 5).map(g => (g.won ? 'W' : 'L'))
}

/** Where you are in your stage: 0–100, what is missing to the next and the stage's RP range. Absent while placing and at the top. */
export function rankProgress(r: RankedRating): { pct: number; line: string; range: string } | null {
  if (r.rankIndex === null || r.rating === null) return null
  const held = rank(r.rankIndex)
  const next = nextStage(r.rankIndex, r.rating)
  if (!next) return null
  const pct = Math.round(((r.rating - held.min) / (next.rank.min - held.min)) * 100)
  return { pct: Math.max(0, Math.min(100, pct)), line: `${next.missing} RP to ${next.rank.name}`, range: `${held.min}–${next.rank.min}` }
}

/** What a friend did, after their name: "hit a 180 in X01". */
export function activityText(e: HomeEvent): string {
  switch (e.kind) {
    case 'one_eighty':
      return e.payload.count === 1 ? 'hit a 180 in X01' : `hit ${e.payload.count} 180s in X01`
    case 'ton_out':
      return `checked out ${e.payload.best} in X01${e.payload.count > 1 ? ` (${e.payload.count} ton-plus outs)` : ''}`
    case 'rank_up':
      return `reached ${rank(e.payload.rankIndex).name} in ranked`
  }
}

/** "just now", "2 min", "1 h" (same day), "yesterday", "3 d", then "10 Oct". */
export function relativeTime(then: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min`
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS)
  if (days <= 0) return `${Math.floor(minutes / 60)} h`
  if (days === 1) return 'yesterday'
  return days < 7 ? `${days} d` : dayMonth(then)
}

const modeName = (id: string): string => GAME_MODES.find(m => m.id === id)?.name ?? id

/** "X01 · 501 · 3 people · 2 boards"; what a lobby does not have is left out. */
export function lobbyLine(l: Pick<HomeLobby, 'mode' | 'startScore' | 'people' | 'boards'>): string {
  return [l.mode && modeName(l.mode), l.startScore, plural(l.people, 'person', 'people'), l.boards > 0 && plural(l.boards, 'board')]
    .filter(Boolean)
    .join(' · ')
}

/** A finished game as Jump back in lists it: "X01" over "vs Guest 1 · Won 3–1 · yesterday". */
export function recentRow(game: GameSummary, now: Date): { id: string; title: string; line: string } {
  const others = playerBadges(game).filter(b => !b.me)
  return {
    id: game.id,
    title: modeName(game.mode),
    line: [
      others.length > 0 ? `vs ${others.map(b => b.name).join(', ')}` : 'Solo',
      resultLabel(game).text,
      relativeTime(new Date(game.finishedAt), now),
    ]
      .filter(Boolean)
      .join(' · '),
  }
}
