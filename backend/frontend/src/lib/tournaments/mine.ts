// The My tournaments tab (Tournaments-Mine, Tournaments-Mine-Phone): its filters, the words on each
// row, the tab's badge and Browse's "Up next for you".
import { api, type MyTournaments, type MyTournamentRef } from '$lib/api'
import { joinNames } from '$lib/fmt'

type Playing = MyTournaments['playing'][number]
type Organizing = MyTournaments['organizing'][number]
type Past = MyTournaments['past'][number]

export const MINE_FILTERS = ['all', 'playing', 'organizing', 'teams', 'in_person'] as const
export type MineFilter = (typeof MINE_FILTERS)[number]
export const MINE_FILTER_LABELS: Record<MineFilter, string> = {
  all: 'All',
  playing: 'Playing',
  organizing: 'Organizing',
  teams: 'Teams',
  in_person: 'In person',
}

/** The tab's list as loaded; null when it could not be (a refusal or no network). */
export async function loadMine(): Promise<MyTournaments | null> {
  try {
    return (await api.GET('/api/tournaments/mine')).data ?? null
  } catch {
    return null
  }
}

/** The tab's count: the tournaments you play in (the match being played is one of them). */
export const mineCount = (m: MyTournaments): number => m.playing.length

/** Your upcoming tournaments: the ones you play in, but the match being played has its own banner. */
export const upcomingOf = (m: MyTournaments): Playing[] => m.playing.filter(p => p.tournament.id !== m.liveMatch?.tournament.id)

const KEEP: Record<MineFilter, (t: MyTournamentRef) => boolean> = {
  all: () => true,
  playing: () => true,
  organizing: () => true,
  teams: t => t.teamSize > 1,
  in_person: t => t.access === 'in_person',
}

/** What a filter leaves: Playing keeps the ones you play in, Organizing those you run, the others narrow both. */
export function filterMine(m: MyTournaments, f: MineFilter) {
  const keep = KEEP[f]
  const asPlayer = f !== 'organizing'
  return {
    live: asPlayer && m.liveMatch && keep(m.liveMatch.tournament) ? m.liveMatch : null,
    upcoming: asPlayer ? upcomingOf(m).filter(p => keep(p.tournament)) : [],
    organizing: f !== 'playing' ? m.organizing.filter(o => keep(o.tournament)) : [],
    past: asPlayer ? m.past.filter(p => keep(p.tournament)) : [],
  }
}

export type Tone = 'plain' | 'good' | 'warn'

/** The line under an upcoming row: what is open for you (Upcoming, Up next for you). */
export function statusLine(p: Playing): { text: string; tone: Tone } {
  const t = p.tournament
  if (p.waitingFor.length > 0) return { text: `Waiting for ${joinNames(p.waitingFor)} to confirm`, tone: 'warn' }
  if (t.status === 'check_in') return { text: 'Check-in is open', tone: 'good' }
  if (t.access === 'in_person') return { text: `Claimed spot · played on ${t.owner?.name ?? 'the organizer'}'s devices`, tone: 'plain' }
  return { text: t.status === 'running' ? 'In progress' : 'Registered', tone: 'good' }
}

/** "as Double Agents", "vs Tom", "as “Chris”": who you play as or against. */
export function asLine(p: Playing): string {
  if (p.tournament.teamSize > 1) return `as ${p.entryName}`
  if (p.tournament.access === 'in_person') return `as “${p.playerName}”`
  return p.opponent ? `vs ${p.opponent}` : 'Solo'
}

/** A past row's "Played as" cell. */
export const playedAs = (p: Past): string =>
  p.tournament.teamSize > 1 ? p.entryName : p.tournament.access === 'in_person' ? `as “${p.playerName}”` : 'Solo'

/** "X01 501 · 8 players · 2 claimed" and the like: the subtitle of an organizing row. */
export function organizingLine(o: Organizing, when: string | null): string {
  const t = o.tournament
  if (t.status === 'draft') return 'Not published yet'
  const entries = t.teamSize > 1 ? 'teams' : 'players'
  const count = o.claimed !== null ? `${t.entries} ${entries} · ${o.claimed} claimed` : `${t.entries} / ${t.maxEntries} registered`
  const owner = o.role === 'organizer' ? `Organizer · owner ${t.owner?.name ?? 'gone'}` : null
  return [owner, when, count].filter(Boolean).join(' · ')
}

export const averageText = (n: number | null): string => (n === null ? '–' : n.toFixed(1))
