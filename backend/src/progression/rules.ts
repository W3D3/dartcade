// What one finished game pays one account: a pure function of the game's facts and what the
// account already earned that day. The service (service.ts) loads the facts and writes the rows.
import { MANUAL_GAME_FACTOR, MANUAL_GAMES_PER_DAY, XP, dailyGameFactor } from '../shared/progression.js'

export type XpKind = 'dart' | 'game' | 'win' | 'ranked' | 'highlight' | 'daily' | 'challenge' | 'milestone'

/** One ledger row to write; `sourceType` + the game id keep it unique per account. */
export type Award = { kind: XpKind; sourceType: string; amount: number; meta: Record<string, unknown> }

/** The account's own seat in a finished game, and who it played. */
export type PlayerGame = {
  gameId: string
  ranked: boolean
  placement: number
  forfeited: boolean
  stats: Partial<Record<string, number>>
  /** Seats on another placement: a human on another account, or a bot. Your own guests are left out. */
  opponents: ('human' | 'bot')[]
  /** The seat's darts in the game itself (not the bull off): all, board-detected, and visits of three T20. */
  darts: { total: number; camera: number; oneEighties: number }
  /** The account's best of this mode's personal-best stat before this game; null without one. */
  previousBest: number | null
  /** Replaying old games: game, win and dart XP only. */
  backfill?: boolean
}

/** What the account earned earlier the same local day. */
export type DayTally = { games: number; manualGames: number; dartXp: number }

/** The stat a mode keeps a personal best of, and which way is better. */
export const PERSONAL_BESTS: Partial<Record<string, { key: string; higher: boolean }>> = {
  x01: { key: 'average', higher: true },
  atc: { key: 'dartsToFinish', higher: false },
}

/** Fewer than half the darts came from the board: entered by hand, or no bridge. */
export const isManual = (g: PlayerGame): boolean => !g.ranked && g.darts.camera * 2 < g.darts.total

/** A game that pays game XP (and counts for the day and the streak): enough darts, not forfeited. */
export const qualifies = (g: PlayerGame): boolean => !g.forfeited && g.darts.total >= XP.minDarts

export function gameAwards(g: PlayerGame, day: DayTally): Award[] {
  const awards: Award[] = []
  const add = (kind: XpKind, sourceType: string, amount: number, meta: Record<string, unknown> = {}) =>
    awards.push({ kind, sourceType, amount: Math.round(amount), meta })
  const manual = isManual(g)

  const dartXp = manual ? 0 : Math.max(0, Math.min(g.darts.camera * XP.dart, XP.dartDailyCap - day.dartXp))
  if (dartXp > 0) add('dart', 'game', dartXp, { darts: g.darts.camera })
  if (!qualifies(g)) return awards

  // Past the day's manual games nothing more is paid, but the row still counts the game
  const overManual = manual && day.manualGames >= MANUAL_GAMES_PER_DAY
  const factor = overManual ? 0 : dailyGameFactor(day.games + 1)
  add('game', 'game', XP.game * factor * (manual ? MANUAL_GAME_FACTOR : 1), { manual })

  const won = g.placement === 1 && g.opponents.length > 0
  if (won) {
    const win = g.opponents.includes('human') ? XP.winHuman : XP.winBot
    if (factor > 0) add('win', 'game', win * factor, { vs: g.opponents.includes('human') ? 'human' : 'bot' })
  }
  if (g.backfill) return awards

  if (g.ranked) add('ranked', 'game', XP.ranked + (won ? XP.rankedWin : 0), { won })
  if (manual) return awards
  if (g.darts.oneEighties > 0) add('highlight', 'game:180', XP.oneEighty * g.darts.oneEighties, { count: g.darts.oneEighties })
  if ((g.stats.bestCheckout ?? 0) >= XP.checkoutMin) add('highlight', 'game:checkout', XP.checkout, { checkout: g.stats.bestCheckout })
  const pb = PERSONAL_BESTS[g.gameId]
  const value = pb ? g.stats[pb.key] : undefined
  if (pb && value !== undefined && g.previousBest !== null && (pb.higher ? value > g.previousBest : value < g.previousBest)) {
    add('highlight', 'game:best', XP.personalBest, { mode: g.gameId, value })
  }
  return awards
}
