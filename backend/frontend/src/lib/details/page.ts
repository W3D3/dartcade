// The details page's frame for any game mode: which layout, the sides (seats or teams), the
// result headline and the meta line under the title.
import type { GameDetail } from '../api'
import { rulesLine } from '../history.js'
import { MONTHS, pad2 } from '../fmt.js'
import { atcResult } from './atc.js'

export type DetailSide = {
  index: number
  name: string
  placement: number
  values: Record<string, number>
  me: boolean
  guest: boolean
  /** A bot seat: its difficulty; null for a member, a guest or a team */
  bot: { level: number } | null
  members: string[]
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
        placement: members[0]?.placement ?? i + 1,
        values: valuesOf(d.stats.teams, i),
        me: t.seats.includes(d.game.mySeat ?? -1),
        guest: false,
        bot: null,
        members: members.map(p => p.name),
        forfeited: members.some(p => p.forfeited),
      }
    })
  }
  return players.map(p => ({
    index: p.seat,
    name: p.name,
    placement: p.placement,
    values: valuesOf(d.stats.seats, p.seat),
    me: p.seat === d.game.mySeat,
    guest: p.userId === null && p.seat !== d.game.mySeat,
    bot: p.bot,
    members: [p.name],
    forfeited: p.forfeited,
  }))
}

export function headline(d: GameDetail, sides: DetailSide[]): { big: string; caption: string } {
  if (d.game.mode === 'x01') {
    const firstTo = typeof d.game.config.firstTo === 'number' ? d.game.config.firstTo : null
    const legs = sides.map(s => (Object.hasOwn(s.values, 'legsWon') ? s.values.legsWon : 0))
    return { big: legs.join('–'), caption: firstTo === null ? 'Legs' : `Legs · first to ${firstTo}` }
  }
  if (d.game.mode === 'atc') {
    const winner = sides.find(s => s.placement === 1) ?? sides[0]
    return { big: '', caption: atcResult(winner.values) }
  }
  return { big: '', caption: '' }
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
