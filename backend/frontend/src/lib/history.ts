// Formatting for the History page: one finished game per row, plus the stat tiles.
import { z } from 'zod'
import type { GameSeat, GameStats, GameSummary } from './api'
import { atcRules, minigolfRules, x01Rules } from './gameViews/meta.js'
import { COURSES } from '$shared/minigolf/courses/index'
import { dayMonth, ordinal, startOfDay } from './fmt.js'

const DAY_MS = 86_400_000
const ModeSchema = z.enum(['straight', 'double', 'master'])
const X01ConfigSchema = z.object({ startScore: z.number(), inMode: ModeSchema, outMode: ModeSchema, firstTo: z.number() })
const AtcConfigSchema = z.object({
  order: z.enum(['asc', 'desc', 'random']),
  finishOn: z.enum(['twenty', 'single_bull', 'bull']),
  multiplierAdvances: z.boolean(),
})
const MinigolfConfigSchema = z.object({ course: z.string(), tries: z.number(), ballContact: z.boolean() })

/** A minigolf config's course: its name and hole count ("Mixed course": 9 of all holes). */
export function minigolfCourse(id: string): { name: string; holes: number } {
  const course = COURSES.find(c => c.id === id)
  if (course) return { name: course.name, holes: course.holes.length }
  return {
    name: 'Mixed course',
    holes: Math.min(
      9,
      COURSES.reduce((n, c) => n + c.holes.length, 0),
    ),
  }
}

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
  const n = game.players.length
  if (game.mode === 'x01') {
    const c = X01ConfigSchema.safeParse(game.config)
    return c.success ? x01Rules(c.data, n) : ''
  }
  if (game.mode === 'atc') {
    const c = AtcConfigSchema.safeParse(game.config)
    return c.success ? atcRules(c.data, n) : ''
  }
  if (game.mode === 'minigolf') {
    const c = MinigolfConfigSchema.safeParse(game.config)
    if (!c.success) return ''
    const course = minigolfCourse(c.data.course)
    return minigolfRules(c.data, course.name, course.holes, n)
  }
  return ''
}

const mine = (game: GameSummary): GameSeat | undefined => game.players.find(p => p.seat === game.mySeat)
const others = (game: GameSummary): GameSeat[] => game.players.filter(p => p.seat !== game.mySeat)
const stat = (p: GameSeat, key: string): number | undefined => (Object.hasOwn(p.stats, key) ? p.stats[key] : undefined)

/** Everyone who played, in the order they threw (seat order for older games), numbered from 1. */
export function playerBadges(game: GameSummary): { n: number; name: string; me: boolean }[] {
  return [...game.players]
    .sort((a, b) => (a.throwPosition ?? a.seat) - (b.throwPosition ?? b.seat))
    .map((p, i) => ({ n: i + 1, name: p.name, me: p.seat === game.mySeat }))
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
  if (game.mode === 'minigolf') {
    const strokes = stat(me, 'strokes')
    return strokes === undefined ? null : { value: String(strokes), label: 'strokes' }
  }
  return null
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
  if (mode === 'x01') {
    const avg = modeStat(s, 'x01', 'average')
    const checkout = modeStat(s, 'x01', 'bestCheckout')
    const delta = avg && avg.previousAvg !== null ? avg.avg - avg.previousAvg : null
    return [
      ...head,
      {
        label: '3-dart average',
        value: avg ? avg.avg.toFixed(1) : NONE,
        note: delta === null ? null : `${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta).toFixed(1)} vs ${period(s.days)}`,
        trend: delta === null ? null : delta >= 0 ? 'up' : 'down',
      },
      plain('Best checkout', checkout ? String(checkout.max) : NONE),
    ]
  }
  if (mode === 'atc') {
    const finish = modeStat(s, 'atc', 'dartsToFinish')
    return [
      ...head,
      plain('Best finish', finish ? String(finish.min) : NONE, finish ? 'darts' : null),
      plain('Average finish', finish ? String(Math.round(finish.avg)) : NONE, finish ? 'darts' : null),
    ]
  }
  if (mode === 'minigolf') {
    const strokes = modeStat(s, 'minigolf', 'strokes')
    const aces = modeStat(s, 'minigolf', 'holesInOne')
    return [
      ...head,
      plain('Best round', strokes ? String(strokes.min) : NONE, strokes ? 'strokes' : null),
      plain('Holes in one', aces ? String(aces.sum) : NONE),
    ]
  }
  return head
}
