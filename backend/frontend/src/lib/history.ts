// Formatting for the History page: one finished game per row, plus the stat tiles.
import { z } from 'zod'
import type { GameSeat, GameStats, GameSummary } from './api'
import { rulesOf } from './gameViews/rules.js'
import { isGameId, type GameId } from '$shared/gameNames'
import { dayMonth, ordinal, startOfDay } from './fmt.js'

const DAY_MS = 86_400_000
/** "Today" / "Yesterday" / "24 Sep", and the time, in the viewer's time zone. */
export function formatWhen(iso: string, now: Date): { day: string; time: string } {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS)
  const day = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : dayMonth(d)
  return { day, time }
}

/** The rules the game was played with; empty for a mode this frontend doesn't know. */
export function rulesLine(game: GameSummary): string {
  return rulesOf(game.mode, game.config, game.players.length)
}

const mine = (game: GameSummary): GameSeat | undefined => game.players.find(p => p.seat === game.mySeat)
const others = (game: GameSummary): GameSeat[] => game.players.filter(p => p.seat !== game.mySeat)
const stat = (p: GameSeat, key: string): number | undefined => (Object.hasOwn(p.stats, key) ? p.stats[key] : undefined)

/** Whose profile a seat opens: its account; null for a guest, a bot, or an account the API hid. */
export const profileId = (p: Pick<GameSeat, 'userId' | 'bot'>): string | null => (p.bot ? null : p.userId)

export type PlayerBadge = {
  n: number
  name: string
  me: boolean
  userId: string | null
  avatar: GameSeat['avatar']
  guest: boolean
  bot: GameSeat['bot']
}

/** Everyone who played, in the order they threw (seat order for older games), numbered from 1. */
export function playerBadges(game: GameSummary): PlayerBadge[] {
  return [...game.players]
    .sort((a, b) => (a.throwPosition ?? a.seat) - (b.throwPosition ?? b.seat))
    .map((p, i) => ({
      n: i + 1,
      name: p.name,
      me: p.seat === game.mySeat,
      userId: profileId(p),
      avatar: p.avatar,
      guest: p.userId === null && p.bot === null,
      bot: p.bot,
    }))
}

/** "Won 3–1" / "Lost" for two players, "2nd of 4" for more, "Finished" solo. */
export function resultLabel(game: GameSummary): { text: string; won: boolean } {
  const me = mine(game)
  const n = game.players.length
  if (!me) return { text: '', won: false }
  if (n === 1) return { text: 'Finished', won: false }
  const won = me.placement === 1
  if (n > 2) return { text: `${ordinal(me.placement)} of ${n}`, won }
  const other = others(game).at(0)
  const legs = game.mode === 'x01' && other ? ` ${stat(me, 'legsWon') ?? 0}–${stat(other, 'legsWon') ?? 0}` : ''
  return { text: `${won ? 'Won' : 'Lost'}${legs}`, won }
}

type ListStat = { value: string; label: string } | null
const value = (v: number | undefined, label: string): ListStat => (v === undefined ? null : { value: String(v), label })

/** Each mode's one number in the list, from your seat's stats. */
const LIST_STAT = {
  x01: me => {
    const avg = stat(me, 'average')
    return avg === undefined ? null : { value: avg.toFixed(1), label: '3-dart avg' }
  },
  atc: me => value(stat(me, 'dartsThrown'), 'darts to finish'),
  p121: me => value(stat(me, 'highestMade'), 'highest made'),
  hilo: me => {
    const livesLeft = stat(me, 'livesLeft')
    return value(livesLeft, livesLeft === 1 ? 'life left' : 'lives left')
  },
  minigolf: me => value(stat(me, 'strokes'), 'strokes'),
  cricket: me => {
    const mpr = stat(me, 'mpr')
    return mpr === undefined ? null : { value: mpr.toFixed(1), label: 'MPR' }
  },
} satisfies Record<GameId, (me: GameSeat) => ListStat>

/** The one number the list shows per game mode. */
export function historyStat(game: GameSummary): ListStat {
  const me = mine(game)
  return me && isGameId(game.mode) ? LIST_STAT[game.mode](me) : null
}

export type Tile = { label: string; value: string; note: string | null; trend: 'up' | 'down' | null }

const NONE = '–'
const modeStats = (s: GameStats, mode: string) => (Object.hasOwn(s.modes, mode) ? s.modes[mode] : undefined)
const modeStat = (s: GameStats, mode: string, key: string) => {
  const m = modeStats(s, mode)
  return m && Object.hasOwn(m.stats, key) ? m.stats[key] : undefined
}
const plain = (label: string, value: string, note: string | null = null): Tile => ({ label, value, note, trend: null })
const won = (wins: number, contested: number): Tile =>
  contested > 0 ? plain('Won', String(wins), `${Math.round((wins / contested) * 100)}%`) : plain('Won', NONE)
const period = (days: number) => (days === 30 ? 'last month' : `previous ${days} days`)

/**
 * The tiles above the list (design: History). "All" shows your overall numbers; a game
 * mode shows only that mode's, so the tiles change with the filter. "–" where there's
 * nothing yet.
 */
export function statTiles(s: GameStats, mode: string | null, title: (mode: string) => string): Tile[] {
  if (mode === null) {
    const darts = Object.values(s.modes).reduce((sum, m) => sum + (Object.hasOwn(m.stats, 'dartsThrown') ? m.stats.dartsThrown.sum : 0), 0)
    const most = Object.entries(s.modes)
      .sort(([, a], [, b]) => b.matches - a.matches)
      .at(0)
    return [
      plain(`Matches · ${s.days} days`, String(s.matches)),
      won(s.wins, s.contested),
      plain('Darts thrown', s.matches > 0 ? darts.toLocaleString('en-GB') : NONE),
      most
        ? plain('Most played', title(most[0]), `${most[1].matches} ${most[1].matches === 1 ? 'match' : 'matches'}`)
        : plain('Most played', NONE),
    ]
  }
  const m = modeStats(s, mode)
  const head = [plain(`${title(mode)} matches · ${s.days} days`, String(m?.matches ?? 0)), won(m?.wins ?? 0, m?.contested ?? 0)]
  return isGameId(mode) ? [...head, ...MODE_TILES[mode](s)] : head
}

/** Each mode's own tiles after its matches and wins. */
const MODE_TILES = {
  x01: s => {
    const avg = modeStat(s, 'x01', 'average')
    const checkout = modeStat(s, 'x01', 'bestCheckout')
    const delta = avg && avg.previousAvg !== null ? avg.avg - avg.previousAvg : null
    return [
      {
        label: '3-dart average',
        value: avg ? avg.avg.toFixed(1) : NONE,
        note: delta === null ? null : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs ${period(s.days)}`,
        trend: delta === null ? null : delta >= 0 ? 'up' : 'down',
      },
      plain('Best checkout', checkout ? String(checkout.max) : NONE),
    ]
  },
  atc: s => {
    const finish = modeStat(s, 'atc', 'dartsToFinish')
    return [
      plain('Best finish', finish ? String(finish.min) : NONE, finish ? 'darts' : null),
      plain('Average finish', finish ? String(Math.round(finish.avg)) : NONE, finish ? 'darts' : null),
    ]
  },
  p121: s => {
    const high = modeStat(s, 'p121', 'highestMade')
    const checkouts = modeStat(s, 'p121', 'checkouts')
    return [plain('Highest made', high ? String(high.max) : NONE), plain('Checkouts', checkouts ? String(checkouts.sum) : NONE)]
  },
  hilo: s => {
    const high = modeStat(s, 'hilo', 'highestSet')
    const low = modeStat(s, 'hilo', 'lowestSet')
    return [plain('Highest set', high ? String(high.max) : NONE), plain('Lowest set', low ? String(low.min) : NONE)]
  },
  minigolf: s => {
    const strokes = modeStat(s, 'minigolf', 'strokes')
    const aces = modeStat(s, 'minigolf', 'holesInOne')
    return [
      plain('Best round', strokes ? String(strokes.min) : NONE, strokes ? 'strokes' : null),
      plain('Holes in one', aces ? String(aces.sum) : NONE),
    ]
  },
  cricket: s => {
    const mpr = modeStat(s, 'cricket', 'mpr')
    const marks = modeStat(s, 'cricket', 'marksScored')
    return [plain('MPR', mpr ? mpr.avg.toFixed(1) : NONE), plain('Marks scored', marks ? String(marks.sum) : NONE)]
  },
} satisfies Record<GameId, (s: GameStats) => Tile[]>

const COLUMNS_KEY = 'dartcade_history_columns_v1'
const ColumnSizingSchema = z.record(z.string(), z.number().positive())

/** The column widths this device resized the matches table to, or {} (none saved, or it doesn't parse). */
export function loadColumnSizing(storage: Pick<Storage, 'getItem'> | null): Record<string, number> {
  try {
    const parsed = ColumnSizingSchema.safeParse(JSON.parse(storage?.getItem(COLUMNS_KEY) ?? 'null'))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export function saveColumnSizing(storage: Pick<Storage, 'setItem' | 'removeItem'> | null, sizing: Record<string, number>): void {
  try {
    if (Object.keys(sizing).length === 0) storage?.removeItem(COLUMNS_KEY)
    else storage?.setItem(COLUMNS_KEY, JSON.stringify(sizing))
  } catch {
    // Storage full or blocked: the widths just don't persist
  }
}
