// The details page's frame for any game mode: which layout, the sides (seats or teams), the
// result headline and the meta line under the title.
import type { GameDetail, GameSeat } from '../api'
import { profileId, rulesLine } from '../history.js'
import { MONTHS, pad2 } from '../fmt.js'
import { atcResult } from './atc.js'
import { isGameId, type GameId } from '$shared/gameNames'

/** A player on a side, and whose profile their name opens (null: none to open). */
export type DetailMember = { name: string; userId: string | null }

export type DetailSide = {
  index: number
  name: string
  /** Whose profile the side's name opens; null for a guest, a bot or a team */
  userId: string | null
  avatar: GameSeat['avatar']
  placement: number
  values: Record<string, number>
  me: boolean
  guest: boolean
  /** A bot seat: its difficulty; null for a member, a guest or a team */
  bot: { level: number } | null
  members: DetailMember[]
  /** Gave up the game (a team: any of its players did) */
  forfeited: boolean
}

/** Guards the shape the page relies on, so an older backend (no `stats` block, say) fails loudly
 *  instead of a TypeError once rendering starts reading into it. */
export function isGameDetail(x: unknown): x is GameDetail {
  if (typeof x !== 'object' || x === null || !('game' in x) || !('detail' in x) || !('stats' in x)) return false
  const { game, detail, stats } = x
  if (typeof game !== 'object' || game === null || !('mode' in game) || !('players' in game)) return false
  if (typeof game.mode !== 'string' || !Array.isArray(game.players)) return false
  if (typeof detail !== 'object' || detail === null || !('mode' in detail) || typeof detail.mode !== 'string') return false
  if (typeof stats !== 'object' || stats === null || !('rows' in stats) || !('seats' in stats)) return false
  return Array.isArray(stats.rows) && Array.isArray(stats.seats)
}

export function layoutOf(d: GameDetail): 'duel' | 'teams' | 'party' {
  if ((d.stats.teams?.length ?? 0) === 2) return 'teams'
  return d.game.players.length >= 3 ? 'party' : 'duel'
}

const valuesOf = (list: GameDetail['stats']['seats'] | undefined, index: number) => list?.find(v => v.index === index)?.values ?? {}

export function detailSides(d: GameDetail): DetailSide[] {
  const players = [...d.game.players].sort((a, b) => a.seat - b.seat)
  const teams = d.detail.mode === 'x01' ? d.detail.teams : undefined
  if (layoutOf(d) === 'teams' && teams) {
    return teams.map((t, i) => {
      const members = t.seats.map(s => players.find(p => p.seat === s)).filter(p => p !== undefined)
      return {
        index: i,
        name: t.name,
        userId: null,
        avatar: { kind: 'none' },
        placement: members[0]?.placement ?? i + 1,
        values: valuesOf(d.stats.teams, i),
        me: t.seats.includes(d.game.mySeat ?? -1),
        guest: false,
        bot: null,
        members: members.map(p => ({ name: p.name, userId: profileId(p) })),
        forfeited: members.some(p => p.forfeited),
      }
    })
  }
  return players.map(p => ({
    index: p.seat,
    name: p.name,
    userId: profileId(p),
    avatar: p.avatar,
    placement: p.placement,
    values: valuesOf(d.stats.seats, p.seat),
    me: p.seat === d.game.mySeat,
    guest: p.userId === null && p.seat !== d.game.mySeat,
    bot: p.bot,
    members: [{ name: p.name, userId: profileId(p) }],
    forfeited: p.forfeited,
  }))
}

type Headline = { big: string; caption: string }
const NO_HEADLINE: Headline = { big: '', caption: '' }

// Legs won per side, for the modes played in legs
function legsHeadline(d: GameDetail, sides: DetailSide[]): Headline {
  const firstTo = typeof d.game.config.firstTo === 'number' ? d.game.config.firstTo : null
  const legs = sides.map(s => (Object.hasOwn(s.values, 'legsWon') ? s.values.legsWon : 0))
  return { big: legs.join('–'), caption: firstTo === null ? 'Legs' : `Legs · first to ${firstTo}` }
}

/** Each mode's result card headline: the score in big type and what it counts. */
const HEADLINE = {
  x01: legsHeadline,
  cricket: legsHeadline,
  atc: (_d, sides) => {
    const winner = sides.find(s => s.placement === 1) ?? sides[0]
    return { big: '', caption: atcResult(winner.values) }
  },
  minigolf: (d, sides) => {
    if (d.detail.mode !== 'minigolf') return NO_HEADLINE
    const strokes = sides.map(s => (Object.hasOwn(s.values, 'strokes') ? s.values.strokes : 0))
    return { big: strokes.join('–'), caption: `Strokes · ${d.detail.holes.length} holes on ${d.detail.course}` }
  },
  // Their result sections carry the result: no headline
  p121: () => NO_HEADLINE,
  hilo: () => NO_HEADLINE,
} satisfies Record<GameId, (d: GameDetail, sides: DetailSide[]) => Headline>

export function headline(d: GameDetail, sides: DetailSide[]): Headline {
  return isGameId(d.game.mode) ? HEADLINE[d.game.mode](d, sides) : NO_HEADLINE
}

export function metaLine(d: GameDetail): string {
  const at = new Date(d.game.finishedAt)
  const when = `${at.getDate()} ${MONTHS[at.getMonth()]} ${at.getFullYear()}, ${pad2(at.getHours())}:${pad2(at.getMinutes())}`
  return [rulesLine(d.game), when, d.game.board?.name].filter(Boolean).join(' · ')
}

/** A malformed id (400, param validation) is as unavailable as a missing one (404) — neither
 *  retries to anything different, so both get the "isn't available" message, not a dead end. */
export function loadPhase(status: number): 'missing' | 'failed' {
  return status === 404 || status === 400 ? 'missing' : 'failed'
}

export function highlightDefault(d: GameDetail): number {
  if (d.game.mySeat !== null) return d.game.mySeat
  return d.game.players.find(p => p.placement === 1)?.seat ?? 0
}
