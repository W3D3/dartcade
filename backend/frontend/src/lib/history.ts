// Formatting for the History page: one finished game per row, plus the stat tiles.
import { z } from 'zod'
import type { GameSeat, GameStats, GameSummary } from './api'
import { atcRules, x01Rules } from './gameViews/meta.js'

const DAY_MS = 86_400_000
const ModeSchema = z.enum(['straight', 'double', 'master'])
const X01ConfigSchema = z.object({ startScore: z.number(), inMode: ModeSchema, outMode: ModeSchema, firstTo: z.number() })
const AtcConfigSchema = z.object({ order: z.enum(['asc', 'desc', 'random']), finishOn: z.enum(['twenty', 'single_bull', 'bull']), multiplierAdvances: z.boolean() })

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
// Fixed 3-letter abbreviations: Intl's "short" month can render "Sept" depending on ICU data/locale.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Today" / "Yesterday" / "24 Sep", and the time, in the viewer's time zone. */
export function formatWhen(iso: string, now: Date): { day: string; time: string } {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  const ago = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS)
  const day = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return { day, time }
}

/** The rules the game was played with; empty for a mode this frontend doesn't know. */
export function rulesLine(game: GameSummary): string {
  const n = game.players.length
  if (game.mode === 'x01') {
    const c = X01ConfigSchema.safeParse(game.config)
    return c.success ? x01Rules(c.data, n) : ''
  }
  if (game.mode === 'atc') {
    const c = AtcConfigSchema.safeParse(game.config)
    return c.success ? atcRules(c.data, n) : ''
  }
  return ''
}

const mine = (game: GameSummary): GameSeat | undefined => game.players.find(p => p.seat === game.mySeat)
const others = (game: GameSummary): GameSeat[] => game.players.filter(p => p.seat !== game.mySeat)
const stat = (p: GameSeat, key: string): number | undefined => Object.hasOwn(p.stats, key) ? p.stats[key] : undefined

/** Everyone who played, in seat order; `me` marks the viewer's own seat. */
export function playerNames(game: GameSummary): { name: string; me: boolean }[] {
  return game.players.map(p => ({ name: p.name, me: p.seat === game.mySeat }))
}

const ordinal = (n: number) => {
  const tens = n % 100, ones = n % 10
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'
  return `${n}${suffix}`
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

/** The one number the list shows per game mode. */
export function historyStat(game: GameSummary): { value: string; label: string } | null {
  const me = mine(game)
  if (!me) return null
  if (game.mode === 'x01') {
    const avg = stat(me, 'average')
    return avg === undefined ? null : { value: avg.toFixed(1), label: '3-dart avg' }
  }
  if (game.mode === 'atc') {
    const darts = stat(me, 'dartsThrown')
    return darts === undefined ? null : { value: String(darts), label: 'darts to finish' }
  }
  return null
}

export type Tile = { label: string; value: string; note: string | null; trend: 'up' | 'down' | null }

const modeStat = (s: GameStats, mode: string, key: string) => {
  const m = Object.hasOwn(s.modes, mode) ? s.modes[mode] : undefined
  return m && Object.hasOwn(m.stats, key) ? m.stats[key] : undefined
}

/** The four tiles above the list (design: History). "–" where there's nothing yet. */
export function statTiles(s: GameStats): Tile[] {
  const avg = modeStat(s, 'x01', 'average')
  const atc = modeStat(s, 'atc', 'dartsThrown')
  const delta = avg && avg.previousAvg !== null ? avg.avg - avg.previousAvg : null
  return [
    { label: `Matches · ${s.days} days`, value: String(s.matches), note: null, trend: null },
    s.contested > 0
      ? { label: 'Won', value: String(s.wins), note: `${Math.round(s.wins / s.contested * 100)}%`, trend: null }
      : { label: 'Won', value: '–', note: null, trend: null },
    {
      label: 'X01 3-dart average',
      value: avg ? avg.avg.toFixed(1) : '–',
      note: delta === null ? null : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs previous ${s.days} days`,
      trend: delta === null ? null : delta >= 0 ? 'up' : 'down',
    },
    { label: 'Around the Clock best', value: atc ? String(atc.min) : '–', note: atc ? 'darts' : null, trend: null },
  ]
}
