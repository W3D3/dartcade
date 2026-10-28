// Higher Lower: two bars, high and low. A visit lands above the high bar or below the low bar
// to move it; anything else (or a miss that isn't already safe high) costs a life. The last
// player with lives left wins. See docs/superpowers/specs/2026-10-17-higher-lower-design.md.
import type {
  ConfigFieldMeta,
  GameModule,
  Player,
  BoardEvent,
  CommittedVisit,
  Dart,
  HiloDetail,
  MatchStats,
  SeatResult,
  SummaryContext,
  UserAction,
} from '../session/types.js'
import type { HiloView } from '../session/views.js'
import { withBullOff } from '../session/withBullOff.js'
import { effectiveDartScore } from './outRules.js'
import { row, values } from './matchStats.js'
import { rankSeats } from './ranking.js'
import { validateOptions } from './configMeta.js'

export type HiloConfig = {
  startHigh: number
  startLow: number
  lives: number
  t1Zero: boolean
  matchExtremes: boolean
  keepBarsOnLifeLost: boolean
  bullOff: 'off' | 'wdc' | 'pdc'
}

export type HiloOutcome = 'high' | 'low' | 'between' | 'miss'

/** A committed visit: who, the round, its total, what it did, and the bars after it. */
export type HiloVisit = { seat: number; round: number; total: number; outcome: HiloOutcome; high: number; low: number }

/** The visit that just ended; the bars are the ones BEFORE it (what the life-lost banner reads off). */
export type HiloResult = { seat: number; total: number; outcome: HiloOutcome; high: number; low: number }

export type HiloState = {
  cfg: HiloConfig
  high: number
  low: number
  lives: number[]
  /** Index into `visits` of the visit that took a player's last life; null while in. */
  outAt: (number | null)[]
  visits: HiloVisit[]
  order: number[]
  turn: number
  currentPlayer: number
  round: number
  visitTotal: number
  visitDarts: number
  missed: boolean
  phase: 'game' | 'finished'
  winner: number | null
  lastResult: HiloResult | null
}

/** A total that can take any further dart (it's a miss-proof position): above the high bar,
 *  or already matching a 180 high bar with the extremes option. */
export function safeHigh(total: number, high: number, cfg: HiloConfig): boolean {
  return total > high || (cfg.matchExtremes && high === 180 && total === 180)
}

export function judge(total: number, high: number, low: number, cfg: HiloConfig): 'high' | 'low' | 'between' {
  if (safeHigh(total, high, cfg)) return 'high'
  if (total < low || (cfg.matchExtremes && low === 0 && total === 0)) return 'low'
  return 'between'
}

export function dartScore(dart: Dart, cfg: HiloConfig): number | 'miss' {
  const { number, multiplier } = dart.segment
  if (multiplier === 0) return 'miss'
  if (cfg.t1Zero && number === 1 && multiplier === 3) return 0
  return effectiveDartScore(dart, '25_50')
}

/** Negative: `a` ranks ahead of `b`. In before out; among the in, more lives first; among the
 *  out, the later outAt first. No seat-index fallback. */
export function compareSeats(s: HiloState, a: number, b: number): number {
  const aIn = s.lives[a] > 0
  const bIn = s.lives[b] > 0
  if (aIn !== bIn) return aIn ? -1 : 1
  if (aIn) return s.lives[b] - s.lives[a]
  return (s.outAt[b] ?? 0) - (s.outAt[a] ?? 0)
}

/** 1-based placement per seat: in before out, more lives first, later out first (see compareSeats). */
export function placementsOf(s: HiloState): number[] {
  return rankSeats(s.lives.length, s.winner, (a, b) => compareSeats(s, a, b))
}

const visitsOf = (visits: HiloVisit[], seat: number) => visits.filter(v => v.seat === seat)
const highestSet = (visits: HiloVisit[]): number | undefined => {
  const hs = visits.filter(v => v.outcome === 'high').map(v => v.total)
  return hs.length ? Math.max(...hs) : undefined
}
const lowestSet = (visits: HiloVisit[]): number | undefined => {
  const ls = visits.filter(v => v.outcome === 'low').map(v => v.total)
  return ls.length ? Math.min(...ls) : undefined
}

const MATCH_STATS_ROWS = [
  row('visitsSurvived', 'Visits survived', 'ratio', 'higher', { of: 'visits' }),
  row('highestSet', 'Highest set', 'integer', 'higher', { compact: true }),
  row('lowestSet', 'Lowest set', 'integer', 'lower', { compact: true }),
  row('livesLost', 'Lives lost', 'integer', 'lower'),
]

// Judges the open visit, applies it (moves a bar or costs a life), pushes the HiloVisit and
// records lastResult (the bars before it). Doesn't advance the turn — see advance().
function endVisit(s: HiloState): HiloState {
  const cp = s.currentPlayer
  const safe = safeHigh(s.visitTotal, s.high, s.cfg)
  const outcome: HiloOutcome = s.missed || (s.visitDarts < 3 && !safe) ? 'miss' : judge(s.visitTotal, s.high, s.low, s.cfg)

  let high = s.high
  let low = s.low
  let lives = s.lives
  let outAt = s.outAt
  if (outcome === 'high') {
    high = s.visitTotal
  } else if (outcome === 'low') {
    low = s.visitTotal
  } else {
    lives = s.lives.map((l, i) => (i === cp ? l - 1 : l))
    if (lives[cp] === 0) outAt = s.outAt.map((o, i) => (i === cp ? s.visits.length : o))
    // Back to the starting numbers on a life lost, unless the option keeps them where they are
    if (!s.cfg.keepBarsOnLifeLost) {
      high = s.cfg.startHigh
      low = s.cfg.startLow
    }
  }

  const visit: HiloVisit = { seat: cp, round: s.round, total: s.visitTotal, outcome, high, low }
  const lastResult: HiloResult = { seat: cp, total: s.visitTotal, outcome, high: s.high, low: s.low }
  return { ...s, high, low, lives, outAt, visits: [...s.visits, visit], lastResult }
}

// The next seat in `order` with lives left; ends the game once fewer than 2 do. A turn index
// that wraps past the end of `order` counts a new round.
function advance(s: HiloState): HiloState {
  const stillIn = s.lives.filter(l => l > 0).length
  if (stillIn < 2) {
    const winner = s.lives.findIndex(l => l > 0)
    return { ...s, phase: 'finished', winner: winner === -1 ? null : winner }
  }
  const n = s.order.length
  for (let i = 1; i <= n; i++) {
    const turn = (s.turn + i) % n
    const seat = s.order[turn]
    if (s.lives[seat] > 0) {
      const round = s.turn + i >= n ? s.round + 1 : s.round
      return { ...s, turn, currentPlayer: seat, round, visitTotal: 0, visitDarts: 0, missed: false }
    }
  }
  return s // unreachable: stillIn >= 2 guarantees a next seat
}

// Who throws after the open visit, by the same rotation advance() would apply if it
// committed right now; null once the game is over, or when this visit would end it.
function upNext(s: HiloState): number | null {
  if (s.phase === 'finished') return null
  const after = advance(endVisit(s))
  return after.phase === 'finished' ? null : after.currentPlayer
}

export const configMeta: Record<Exclude<keyof HiloConfig, 'bullOff'>, ConfigFieldMeta> = {
  startHigh: { label: 'Start high bar', tooltip: 'The high bar a visit must clear to move it up.' },
  startLow: { label: 'Start low bar', tooltip: 'The low bar a visit must land under to move it down.' },
  lives: { label: 'Lives', tooltip: 'How many lives each player starts with.' },
  t1Zero: {
    label: 'Treble 1 counts as 0',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
  matchExtremes: {
    label: 'Match the extremes',
    tooltip: '180 beats a high bar of 180, and 0 beats a low bar of 0.',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
  keepBarsOnLifeLost: {
    label: 'Keep bars after a life lost',
    tooltip: 'Off (the default) resets the high and low bars back to their starting numbers whenever a life is lost.',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

export const hiloGame: GameModule<HiloState, HiloConfig, HiloView, 'hilo', HiloDetail> = {
  id: 'hilo',
  version: 1,
  scoreBased: true,
  defaultConfig: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true, keepBarsOnLifeLost: false, bullOff: 'off' },
  configMeta,

  validate(cfg: HiloConfig, players: Player[]): string | null {
    if (players.length < 2) return 'At least 2 players'
    if (!isInt(cfg.startHigh) || cfg.startHigh < 0 || cfg.startHigh > 180) return 'High bar must be 0-180'
    if (!isInt(cfg.startLow) || cfg.startLow < 0 || cfg.startLow > 180) return 'Low bar must be 0-180'
    if (cfg.startLow >= cfg.startHigh) return 'Low bar must be below the high bar'
    if (!isInt(cfg.lives) || cfg.lives < 1 || cfg.lives > 7) return 'Lives must be 1-7'
    // The bull off is checked by withBullOff
    return validateOptions(cfg, configMeta)
  },

  init(cfg: HiloConfig, players: Player[]): HiloState {
    const n = players.length
    return {
      cfg,
      high: cfg.startHigh,
      low: cfg.startLow,
      lives: Array.from({ length: n }, () => cfg.lives),
      outAt: Array.from({ length: n }, () => null),
      visits: [],
      order: Array.from({ length: n }, (_, i) => i),
      turn: 0,
      currentPlayer: 0,
      round: 1,
      visitTotal: 0,
      visitDarts: 0,
      missed: false,
      phase: 'game',
      winner: null,
      lastResult: null,
    }
  },

  getCurrentPlayer(s: HiloState): number {
    return s.currentPlayer
  },

  onBoardEvent(s: HiloState, e: BoardEvent): { state: HiloState } {
    switch (e.kind) {
      case 'visit.opened':
        if (s.phase === 'finished') return { state: s }
        return { state: { ...s, visitTotal: 0, visitDarts: 0, missed: false } }

      case 'dart.detected': {
        if (s.phase === 'finished' || s.missed || s.visitDarts >= 3) return { state: s }
        const score = dartScore(e.data.dart, s.cfg)
        if (score === 'miss') {
          const harmless = safeHigh(s.visitTotal, s.high, s.cfg)
          return { state: { ...s, missed: !harmless, visitDarts: s.visitDarts + 1, lastResult: null } }
        }
        return { state: { ...s, visitTotal: s.visitTotal + score, visitDarts: s.visitDarts + 1, lastResult: null } }
      }

      case 'takeout.finished':
      case 'visit.cleared':
        if (s.phase === 'finished') return { state: s }
        return { state: advance(endVisit(s)) }

      default:
        return { state: s }
    }
  },

  onUserAction(s: HiloState, _a: UserAction): { state: HiloState } {
    return { state: s }
  },

  view(s: HiloState): HiloView {
    const placements = placementsOf(s)
    const seats = s.lives.map((lives, i) => {
      const outAt = s.outAt[i]
      const out = outAt !== null
      const place = out || (s.phase === 'finished' && s.winner === i) ? placements[i] : null
      return {
        lives,
        out,
        place,
        outRound: out ? s.visits[outAt].round : null,
        visits: s.visits.filter(v => v.seat === i).map(v => ({ round: v.round, total: v.total, outcome: v.outcome })),
      }
    })
    return {
      cfg: {
        startHigh: s.cfg.startHigh,
        startLow: s.cfg.startLow,
        lives: s.cfg.lives,
        t1Zero: s.cfg.t1Zero,
        matchExtremes: s.cfg.matchExtremes,
        keepBarsOnLifeLost: s.cfg.keepBarsOnLifeLost,
      },
      phase: s.phase,
      high: s.high,
      low: s.low,
      round: s.round,
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s),
      winner: s.winner,
      visitLocked: s.missed,
      visitTotal: s.visitTotal,
      seats,
      lastResult: s.lastResult,
    }
  },

  throwOrder(s: HiloState): number[] {
    return [...s.order]
  },

  summarize(s: HiloState, ctx: SummaryContext): SeatResult[] {
    const placements = placementsOf(s)
    return s.lives.map((lives, i) => {
      const mine = visitsOf(s.visits, i)
      const outAt = s.outAt[i]
      const highest = highestSet(mine)
      const lowest = lowestSet(mine)
      return {
        placement: placements[i],
        stats: {
          livesLeft: lives,
          visits: mine.length,
          livesLostBetween: mine.filter(v => v.outcome === 'between').length,
          livesLostMiss: mine.filter(v => v.outcome === 'miss').length,
          dartsThrown: ctx.totalDarts[i] ?? 0,
          ...(highest !== undefined && { highestSet: highest }),
          ...(lowest !== undefined && { lowestSet: lowest }),
          ...(outAt !== null && { outRound: s.visits[outAt].round }),
        },
      }
    })
  },

  detail(_visits: CommittedVisit<HiloState>[], final: HiloState): HiloDetail {
    const placements = placementsOf(final)
    return {
      mode: 'hilo',
      start: { high: final.cfg.startHigh, low: final.cfg.startLow },
      visits: final.visits.map(v => ({ seat: v.seat, round: v.round, total: v.total, outcome: v.outcome, high: v.high, low: v.low })),
      seats: final.lives.map((lives, i) => {
        const outAt = final.outAt[i]
        return { place: placements[i], outRound: outAt !== null ? final.visits[outAt].round : null, livesLeft: lives }
      }),
    }
  },

  matchStats(_visits: CommittedVisit<HiloState>[], final: HiloState): MatchStats {
    return {
      rows: MATCH_STATS_ROWS,
      seats: final.lives.map((_lives, i) => {
        const mine = visitsOf(final.visits, i)
        const lost = mine.filter(v => v.outcome === 'between' || v.outcome === 'miss').length
        return {
          index: i,
          values: values({
            visitsSurvived: mine.length - lost,
            visits: mine.length,
            highestSet: highestSet(mine),
            lowestSet: lowestSet(mine),
            livesLost: lost,
          }),
        }
      }),
    }
  },
}

/** Higher Lower with a bull off (off by default): what's registered in games/index.ts. */
export const hiloModule = withBullOff(hiloGame, {
  applyStartOrder: (s, order) => ({ ...s, order, turn: 0, currentPlayer: order[0] }),
})
