import type { GameModule, BoardEvent, Player, Dart, ConfigFieldMeta } from '../session/types.js'
import { withBullOff } from '../session/withBullOff.js'
import type { X01View } from '../session/views.js'
import type { Rng } from '../session/rng.js'

export type X01Config = {
  startScore: 301 | 501 | 701
  inMode:  'straight' | 'double' | 'master'
  outMode: 'straight' | 'double' | 'master'
  bullOff: 'off' | 'wdc' | 'pdc'
  bullValue: '25_50' | '50_50'
  maxRounds: number
  firstTo: number
}

export type X01State = {
  cfg: X01Config
  scores: number[]
  legs: number[]
  opened: boolean[]
  phase: 'game' | 'finished'
  /** Throwing order (player indices); a bull off sets it, else index order. */
  order: number[]
  currentPlayer: number
  round: number
  bustThisVisit: boolean
  visitOpenedScores: number[]
  winner: number | null
  playerCount: number
}

function effectiveDartScore(dart: Dart, bullValue: '25_50' | '50_50'): number {
  const { number, multiplier } = dart.segment
  if (multiplier === 0) return 0
  if (number === 25 && bullValue === '50_50') return 50
  return dart.score
}

// The bull counts as a double however it is reported (Board Manager and manual
// entry send number 50 with multiplier 1; its score is 50 either way).
const isDouble = (dart: Dart) => dart.segment.multiplier === 2 || dart.segment.number === 50

function opensPlayer(dart: Dart, inMode: 'straight' | 'double' | 'master'): boolean {
  if (inMode === 'straight') return true
  if (inMode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

function validFinish(dart: Dart, outMode: 'straight' | 'double' | 'master'): boolean {
  if (outMode === 'straight') return true
  if (outMode === 'double') return isDouble(dart)
  return isDouble(dart) || dart.segment.multiplier === 3
}

/** Nothing can finish from 1 unless any dart may finish. */
const deadEnd = (score: number, outMode: 'straight' | 'double' | 'master') => score === 1 && outMode !== 'straight'

// Next thrower in `order`; a new round starts when it wraps to the first thrower.
function nextTurn(s: X01State): { nextPlayer: number; round: number } {
  const pos = s.order.indexOf(s.currentPlayer)
  const nextPlayer = s.order[(pos + 1) % s.order.length]
  return { nextPlayer, round: nextPlayer === s.order[0] ? s.round + 1 : s.round }
}

function freshLeg(cfg: X01Config, playerCount: number, firstPlayer: number): Partial<X01State> {
  return {
    scores: Array<number>(playerCount).fill(cfg.startScore),
    opened: Array<boolean>(playerCount).fill(cfg.inMode === 'straight'),
    bustThisVisit: false,
    visitOpenedScores: Array<number>(playerCount).fill(cfg.startScore),
    currentPlayer: firstPlayer,
    round: 1,
  }
}

export const configMeta: Record<keyof X01Config, ConfigFieldMeta> = {
  startScore: {
    label: 'Start score',
    options: [
      { value: 301, label: '301' },
      { value: 501, label: '501' },
      { value: 701, label: '701' },
    ],
  },
  inMode: {
    label: 'Check-in',
    tooltip: 'How a player starts scoring. Straight: any dart. Double/Master: must hit a double or master first.',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'double',   label: 'Double'   },
      { value: 'master',   label: 'Master'   },
    ],
  },
  outMode: {
    label: 'Check-out',
    tooltip: 'How a player finishes. Straight: any dart on 0. Double: must finish on a double. Master: double or triple.',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'double',   label: 'Double'   },
      { value: 'master',   label: 'Master'   },
    ],
  },
  bullOff: {
    label: 'Bull off',
    tooltip: 'Who throws first. Off: player 1 starts. WDC/PDC: one dart each, closest to bull goes first.',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'wdc', label: 'WDC' },
      { value: 'pdc', label: 'PDC' },
    ],
  },
  bullValue: {
    label: 'Bull value',
    tooltip: 'Score of the outer bull (25). 50/50: both bulls score 50 points.',
    options: [
      { value: '25_50', label: '25 / 50' },
      { value: '50_50', label: '50 / 50' },
    ],
  },
  maxRounds: {
    label: 'Max rounds',
    tooltip: 'Maximum rounds before the lowest score wins.',
  },
  firstTo: {
    label: 'First to',
    tooltip: 'Number of legs needed to win the match.',
  },
}

/** X01 without a bull off; `x01Module` below adds it. */
export const x01Game: GameModule<X01State, X01Config, X01View, 'x01'> = {
  id: 'x01',
  defaultConfig: {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  },
  configMeta,

  init(cfg: X01Config, players: Player[], _rng?: Rng): X01State {
    const n = players.length
    return {
      cfg, phase: 'game',
      scores: Array<number>(n).fill(cfg.startScore),
      legs: Array<number>(n).fill(0),
      opened: Array<boolean>(n).fill(cfg.inMode === 'straight'),
      order: players.map((_, i) => i),
      currentPlayer: 0, round: 1,
      bustThisVisit: false,
      visitOpenedScores: Array<number>(n).fill(cfg.startScore),
      winner: null, playerCount: n,
    }
  },

  getCurrentPlayer(s: X01State): number {
    return s.currentPlayer
  },

  onBoardEvent(s: X01State, e: BoardEvent): { state: X01State } {
    switch (e.kind) {
      case 'visit.opened': {
        return { state: { ...s, bustThisVisit: false, visitOpenedScores: [...s.scores] } }
      }

      case 'dart.detected': {
        const dart = e.data.dart
        const cp = s.currentPlayer

        if (s.bustThisVisit) return { state: s }
        if (s.scores[cp] === 0) return { state: s }

        if (!s.opened[cp]) {
          const opens = opensPlayer(dart, s.cfg.inMode)
          if (!opens) return { state: s }
          const opened = s.opened.map((o, i) => i === cp ? true : o)
          const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
          const newScore = s.scores[cp] - dartScore
          if (newScore < 0 || deadEnd(newScore, s.cfg.outMode) || (newScore === 0 && !validFinish(dart, s.cfg.outMode))) {
            return { state: { ...s, opened, bustThisVisit: true, scores: s.scores.map((sc, i) => i === cp ? s.visitOpenedScores[cp] : sc) } }
          }
          return { state: { ...s, opened, scores: s.scores.map((sc, i) => i === cp ? newScore : sc) } }
        }

        const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
        const newScore = s.scores[cp] - dartScore

        if (newScore < 0 || deadEnd(newScore, s.cfg.outMode) || (newScore === 0 && !validFinish(dart, s.cfg.outMode))) {
          return { state: { ...s, scores: s.scores.map((sc, i) => i === cp ? s.visitOpenedScores[cp] : sc), bustThisVisit: true } }
        }

        return { state: { ...s, scores: s.scores.map((sc, i) => i === cp ? newScore : sc) } }
      }

      case 'takeout.finished': {
        const cp = s.currentPlayer

        // Leg win
        if (s.scores[cp] === 0) {
          const legs = s.legs.map((l, i) => i === cp ? l + 1 : l)
          if (legs[cp] >= s.cfg.firstTo) {
            return { state: { ...s, legs, winner: cp, phase: 'finished' } }
          }
          return { state: { ...s, legs, ...freshLeg(s.cfg, s.playerCount, cp) } }
        }

        const { nextPlayer, round } = nextTurn(s)

        if (round > s.cfg.maxRounds) {
          const minScore = Math.min(...s.scores)
          const winner = s.scores.indexOf(minScore)
          return { state: { ...s, currentPlayer: nextPlayer, round, winner, phase: 'finished' } }
        }

        return { state: { ...s, currentPlayer: nextPlayer, round, bustThisVisit: false } }
      }

      case 'visit.cleared': {
        const { nextPlayer, round } = nextTurn(s)

        if (round > s.cfg.maxRounds) {
          const minScore = Math.min(...s.scores)
          const winner = s.scores.indexOf(minScore)
          return { state: { ...s, currentPlayer: nextPlayer, round, winner, phase: 'finished' } }
        }

        return { state: { ...s, currentPlayer: nextPlayer, round, bustThisVisit: false } }
      }

      default:
        return { state: s }
    }
  },

  onUserAction(s: X01State): { state: X01State } {
    return { state: s }
  },

  view(s: X01State): X01View {
    return {
      scores: s.scores, legs: s.legs, firstTo: s.cfg.firstTo,
      currentPlayer: s.currentPlayer, round: s.round, phase: s.phase,
      winner: s.winner, opened: s.opened, bustThisVisit: s.bustThisVisit,
      config: { outMode: s.cfg.outMode, startScore: s.cfg.startScore, inMode: s.cfg.inMode },
      visitLocked: s.bustThisVisit || s.scores[s.currentPlayer] === 0,
    }
  },
}

/** X01 with an optional bull off deciding the throwing order. */
export const x01Module = withBullOff(x01Game, {
  applyStartOrder: (s, order) => ({ ...s, order, currentPlayer: order[0] }),
})
