// Shanghai: round n aims at the number n, and only that number scores (single n, double 2n, treble
// 3n). A single, a double and a treble of it in one visit is a Shanghai and, when the option is on,
// ends the game at once. Otherwise the highest total after the last round wins; a tie plays bull-only
// sudden-death rounds between the tied seats (or, by option, shares the place).
import type {
  BoardEvent,
  CommittedVisit,
  ConfigFieldMeta,
  GameModule,
  MatchStats,
  Player,
  SeatResult,
  ShanghaiDetail,
  SummaryContext,
} from '../session/types.js'
import type { ShanghaiView } from '../session/views.js'
import { withBullOff } from '../session/withBullOff.js'
import { BULL_OFF_OPTION } from './commonOptions.js'
import { isShanghai, dartResult, roundTargets, targetOf, type Hits } from '../shared/shanghai.js'
import { validateOptions } from './configMeta.js'
import { row, values } from './matchStats.js'
import { rankSeats } from './ranking.js'
import { nextTurn, upNext } from './turns.js'

/** Sudden-death bull rounds played before a tie is left shared. */
export const MAX_EXTRA_ROUNDS = 5

export type ShanghaiConfig = {
  start: number
  end: number
  bullRound: boolean
  shanghaiWins: boolean
  tieBreak: 'bull' | 'shared'
  bullOff: 'off' | 'wdc' | 'pdc'
}

const NO_HITS: Hits = { single: false, double: false, treble: false }

export type ShanghaiVisit = { seat: number; round: number; target: number; score: number; hits: Hits }

export type ShanghaiState = {
  cfg: ShanghaiConfig
  scores: number[]
  visits: ShanghaiVisit[]
  order: number[]
  turn: number
  currentPlayer: number
  /** 1-based; past the regular rounds it counts the sudden-death bull rounds. */
  round: number
  hits: Hits
  visitScore: number
  /** Seats still playing the sudden-death rounds; null before them. */
  contenders: number[] | null
  phase: 'game' | 'finished'
  winner: number | null
  /** The seat that ended the game with a Shanghai. */
  shanghai: number | null
}

const regularRounds = (cfg: ShanghaiConfig) => roundTargets(cfg).length

/** 1-based placements: the winner first, then by total (equal totals share a place). */
export function placementsOf(s: ShanghaiState): number[] {
  return rankSeats(s.scores.length, s.winner, (a, b) => s.scores[b] - s.scores[a])
}

const visitsOf = (s: ShanghaiState, seat: number) => s.visits.filter(v => v.seat === seat)

// The open visit becomes a ShanghaiVisit (the seat's total already counts its darts).
function endVisit(s: ShanghaiState): ShanghaiState {
  const visit: ShanghaiVisit = {
    seat: s.currentPlayer,
    round: s.round,
    target: targetOf(s.cfg, s.round),
    score: s.visitScore,
    hits: s.hits,
  }
  return { ...s, visits: [...s.visits, visit] }
}

// Rotates to the next seat in the round; when everyone has thrown, ends the round: a leader wins, a
// tie plays on (bull rounds) or is shared, and the last regular round without a tie ends the game.
function advance(s: ShanghaiState): ShanghaiState {
  const next = nextTurn(s.order, s.turn, seat => s.contenders === null || s.contenders.includes(seat))
  if (!next) return s
  const base = { ...s, turn: next.turn, currentPlayer: next.seat, hits: NO_HITS, visitScore: 0 }
  if (!next.wrapped) return base
  if (s.round < regularRounds(s.cfg)) return { ...base, round: s.round + 1 }

  const pool = s.contenders ?? s.scores.map((_, i) => i)
  const best = Math.max(...pool.map(i => s.scores[i]))
  const leaders = pool.filter(i => s.scores[i] === best)
  const extra = s.round - regularRounds(s.cfg)
  if (leaders.length === 1) return { ...base, phase: 'finished', winner: leaders[0] }
  if (s.cfg.tieBreak === 'shared' || extra >= MAX_EXTRA_ROUNDS) return { ...base, phase: 'finished' }
  const first = s.order.findIndex(seat => leaders.includes(seat))
  return { ...base, round: s.round + 1, contenders: leaders, turn: first, currentPlayer: s.order[first] }
}

const finishVisit = (s: ShanghaiState): ShanghaiState => advance(endVisit(s))

const MATCH_STATS_ROWS = [
  row('total', 'Points', 'integer', 'higher'),
  row('bestRound', 'Best round', 'integer', 'higher', { compact: true }),
  row('shanghais', 'Shanghais', 'integer', 'higher', { compact: true }),
  row('misses', 'Rounds without a point', 'integer', 'lower'),
]

export const configMeta: Record<keyof ShanghaiConfig, ConfigFieldMeta> = {
  start: { label: 'First round', tooltip: 'The number the first round aims at.' },
  end: { label: 'Last round', tooltip: 'The number the last round aims at.' },
  bullRound: {
    label: 'Bull round at the end',
    tooltip: 'One more round on the bull: single bull 25, double bull 50. A Shanghai is not possible there.',
    options: [
      { value: false, label: 'Off' },
      { value: true, label: 'On' },
    ],
  },
  shanghaiWins: {
    label: 'Shanghai wins instantly',
    tooltip:
      'A single, double and treble of the round’s number in one visit wins the game on the spot, whatever the score. Off, the visit only scores.',
    options: [
      { value: true, label: 'On' },
      { value: false, label: 'Off' },
    ],
  },
  tieBreak: {
    label: 'Tie break',
    tooltip: 'Players level on points after the last round throw bull-only rounds until one leads (up to five), or share the place.',
    options: [
      { value: 'bull', label: 'Bull rounds' },
      { value: 'shared', label: 'Shared place' },
    ],
  },
  bullOff: BULL_OFF_OPTION,
}

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n)

export const shanghaiGame: GameModule<ShanghaiState, ShanghaiConfig, ShanghaiView, 'shanghai', ShanghaiDetail> = {
  id: 'shanghai',
  version: 1,
  scoreBased: true,
  defaultConfig: { start: 1, end: 7, bullRound: false, shanghaiWins: true, tieBreak: 'bull', bullOff: 'off' },
  configMeta,

  validate(cfg: ShanghaiConfig): string | null {
    if (!isInt(cfg.start) || !isInt(cfg.end) || cfg.start < 1 || cfg.end > 20 || cfg.start > cfg.end)
      return 'Rounds must be a range within 1-20'
    // The bull off is checked by withBullOff
    return validateOptions(cfg, configMeta, { skip: ['bullOff'] })
  },

  init(cfg: ShanghaiConfig, players: Player[]): ShanghaiState {
    return {
      cfg,
      scores: players.map(() => 0),
      visits: [],
      order: players.map((_, i) => i),
      turn: 0,
      currentPlayer: 0,
      round: 1,
      hits: NO_HITS,
      visitScore: 0,
      contenders: null,
      phase: 'game',
      winner: null,
      shanghai: null,
    }
  },

  getCurrentPlayer: s => s.currentPlayer,

  onBoardEvent(s: ShanghaiState, e: BoardEvent): { state: ShanghaiState } {
    if (s.phase === 'finished') return { state: s }
    switch (e.kind) {
      case 'visit.opened':
        return { state: { ...s, hits: NO_HITS, visitScore: 0 } }

      case 'dart.detected': {
        const { score, kind } = dartResult(e.data.dart, targetOf(s.cfg, s.round))
        if (kind === null) return { state: s }
        const hits = { ...s.hits, [kind]: true }
        const scores = s.scores.map((t, i) => (i === s.currentPlayer ? t + score : t))
        const won = s.cfg.shanghaiWins && isShanghai(hits)
        const state = { ...s, hits, scores, visitScore: s.visitScore + score }
        // The winning visit is recorded now: the game is over, so the takeout does nothing
        return { state: won ? { ...endVisit(state), phase: 'finished', winner: s.currentPlayer, shanghai: s.currentPlayer } : state }
      }

      // A Reset ends the visit like a takeout
      case 'takeout.finished':
      case 'visit.cleared':
        return { state: finishVisit(s) }

      default:
        return { state: s }
    }
  },

  onUserAction: s => ({ state: s }),

  view(s: ShanghaiState): ShanghaiView {
    const placements = placementsOf(s)
    const finished = s.phase === 'finished'
    return {
      cfg: { start: s.cfg.start, end: s.cfg.end, bullRound: s.cfg.bullRound, shanghaiWins: s.cfg.shanghaiWins, tieBreak: s.cfg.tieBreak },
      phase: s.phase,
      round: s.round,
      rounds: regularRounds(s.cfg),
      target: targetOf(s.cfg, s.round),
      currentPlayer: s.currentPlayer,
      nextPlayer: upNext(s, finishVisit),
      winner: s.winner,
      shanghai: s.shanghai,
      hits: s.hits,
      visitScore: s.visitScore,
      contenders: s.contenders,
      seats: s.scores.map((score, i) => ({
        score,
        place: finished ? placements[i] : null,
        visits: visitsOf(s, i).map(v => ({ round: v.round, target: v.target, score: v.score, shanghai: isShanghai(v.hits) })),
      })),
    }
  },

  throwOrder: s => [...s.order],

  summarize(s: ShanghaiState, ctx: SummaryContext): SeatResult[] {
    const placements = placementsOf(s)
    return s.scores.map((total, i) => {
      const mine = visitsOf(s, i)
      return {
        placement: placements[i],
        stats: {
          total,
          visits: mine.length,
          shanghais: mine.filter(v => isShanghai(v.hits)).length,
          bestRound: Math.max(0, ...mine.map(v => v.score)),
          dartsThrown: ctx.totalDarts[i] ?? 0,
        },
      }
    })
  },

  detail(_visits: CommittedVisit<ShanghaiState>[], final: ShanghaiState): ShanghaiDetail {
    const placements = placementsOf(final)
    return {
      mode: 'shanghai',
      targets: roundTargets(final.cfg),
      visits: final.visits.map(v => ({ seat: v.seat, round: v.round, target: v.target, score: v.score, ...v.hits })),
      seats: final.scores.map((total, i) => ({ place: placements[i], total, shanghai: final.shanghai === i })),
    }
  },

  matchStats(_visits: CommittedVisit<ShanghaiState>[], final: ShanghaiState): MatchStats {
    return {
      rows: MATCH_STATS_ROWS,
      seats: final.scores.map((total, i) => {
        const mine = visitsOf(final, i)
        return {
          index: i,
          values: values({
            total,
            bestRound: Math.max(0, ...mine.map(v => v.score)),
            shanghais: mine.filter(v => isShanghai(v.hits)).length,
            misses: mine.filter(v => v.score === 0).length,
          }),
        }
      }),
    }
  },
}

/** Shanghai with a bull off (off by default): what's registered in games/index.ts. */
export const shanghaiModule = withBullOff(shanghaiGame, {
  applyStartOrder: (s, order) => ({ ...s, order, turn: 0, currentPlayer: order[0] }),
})
