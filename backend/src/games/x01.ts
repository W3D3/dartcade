import type { GameModule, BoardEvent, Player, Dart, DartDetectedData, ConfigFieldMeta } from '../session/types.js'
import { initBullOff, onBullOffDart, onBullOffTakeout } from '../session/bullOff.js'
import type { BullOffState } from '../session/bullOff.js'

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
  phase: 'bulloff' | 'game' | 'finished'
  bullOff: BullOffState
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

function opensPlayer(dart: Dart, inMode: 'straight' | 'double' | 'master'): boolean {
  if (inMode === 'straight') return true
  if (inMode === 'double') return dart.segment.multiplier === 2
  return dart.segment.multiplier === 2 || dart.segment.multiplier === 3
}

function validFinish(dart: Dart, outMode: 'straight' | 'double' | 'master'): boolean {
  if (outMode === 'straight') return true
  if (outMode === 'double') return dart.segment.multiplier === 2
  return dart.segment.multiplier === 2 || dart.segment.multiplier === 3
}

function freshLeg(cfg: X01Config, playerCount: number, firstPlayer: number): Partial<X01State> {
  return {
    scores: Array(playerCount).fill(cfg.startScore),
    opened: Array(playerCount).fill(cfg.inMode === 'straight'),
    bustThisVisit: false,
    visitOpenedScores: Array(playerCount).fill(cfg.startScore),
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

export const x01Module: GameModule<X01State, X01Config> = {
  id: 'x01',
  defaultConfig: {
    startScore: 501, inMode: 'straight', outMode: 'double',
    bullOff: 'off', bullValue: '25_50', maxRounds: 50, firstTo: 3,
  },
  configMeta,

  init(cfg: X01Config, players: Player[]): X01State {
    const n = players.length
    const phase: X01State['phase'] = cfg.bullOff === 'off' ? 'game' : 'bulloff'
    return {
      cfg, phase,
      scores: Array(n).fill(cfg.startScore),
      legs: Array(n).fill(0),
      opened: Array(n).fill(cfg.inMode === 'straight'),
      bullOff: initBullOff({ mode: cfg.bullOff, playerCount: n }),
      currentPlayer: 0, round: 1,
      bustThisVisit: false,
      visitOpenedScores: Array(n).fill(cfg.startScore),
      winner: null, playerCount: n,
    }
  },

  getCurrentPlayer(s: X01State): number {
    return s.phase === 'bulloff' ? s.bullOff.currentPlayer : s.currentPlayer
  },

  onBoardEvent(s: X01State, e: BoardEvent): { state: X01State } {
    switch (e.kind) {
      case 'visit.opened': {
        return { state: { ...s, bustThisVisit: false, visitOpenedScores: [...s.scores] } }
      }

      case 'dart.detected': {
        const data = e.data as DartDetectedData
        const dart = data.dart as Dart
        const cp = s.currentPlayer

        if (s.phase === 'bulloff') {
          // Use segment number (25=outer bull, 50=inner bull) not score — inner bull scores 50 not 100
          const bullOff = onBullOffDart(s.bullOff, dart.segment.number)
          return { state: { ...s, bullOff } }
        }

        if (s.bustThisVisit) return { state: s }

        if (!s.opened[cp]) {
          const opens = opensPlayer(dart, s.cfg.inMode)
          if (!opens) return { state: s }
          const opened = s.opened.map((o, i) => i === cp ? true : o)
          const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
          const newScore = s.scores[cp] - dartScore
          if (newScore < 0 || (newScore === 0 && !validFinish(dart, s.cfg.outMode))) {
            return { state: { ...s, opened, bustThisVisit: true, scores: s.scores.map((sc, i) => i === cp ? s.visitOpenedScores[cp] : sc) } }
          }
          return { state: { ...s, opened, scores: s.scores.map((sc, i) => i === cp ? newScore : sc) } }
        }

        const dartScore = effectiveDartScore(dart, s.cfg.bullValue)
        const newScore = s.scores[cp] - dartScore

        if (newScore < 0 || (newScore === 0 && !validFinish(dart, s.cfg.outMode))) {
          return { state: { ...s, scores: s.scores.map((sc, i) => i === cp ? s.visitOpenedScores[cp] : sc), bustThisVisit: true } }
        }

        return { state: { ...s, scores: s.scores.map((sc, i) => i === cp ? newScore : sc) } }
      }

      case 'takeout.finished': {
        const cp = s.currentPlayer

        if (s.phase === 'bulloff') {
          const result = onBullOffTakeout(s.bullOff)
          if (!result.done) {
            return { state: { ...s, bullOff: result.state, currentPlayer: result.state.currentPlayer } }
          }
          if (result.winner === null) {
            // rethrow
            return { state: { ...s, bullOff: result.state } }
          }
          return { state: { ...s, bullOff: result.state, phase: 'game', ...freshLeg(s.cfg, s.playerCount, result.winner) } }
        }

        // Leg win
        if (s.scores[cp] === 0) {
          const legs = s.legs.map((l, i) => i === cp ? l + 1 : l)
          if (legs[cp] >= s.cfg.firstTo) {
            return { state: { ...s, legs, winner: cp, phase: 'finished' } }
          }
          return { state: { ...s, legs, ...freshLeg(s.cfg, s.playerCount, cp) } }
        }

        const nextPlayer = (cp + 1) % s.playerCount
        const round = nextPlayer === 0 ? s.round + 1 : s.round

        if (nextPlayer === 0 && round > s.cfg.maxRounds) {
          const minScore = Math.min(...s.scores)
          const winner = s.scores.indexOf(minScore)
          return { state: { ...s, currentPlayer: nextPlayer, round, winner, phase: 'finished' } }
        }

        return { state: { ...s, currentPlayer: nextPlayer, round, bustThisVisit: false } }
      }

      case 'visit.cleared': {
        const nextPlayer = (s.currentPlayer + 1) % s.playerCount
        const round = nextPlayer === 0 ? s.round + 1 : s.round

        if (nextPlayer === 0 && round > s.cfg.maxRounds) {
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

  view(s: X01State, _players: Player[]) {
    return {
      scores: s.scores, legs: s.legs, firstTo: s.cfg.firstTo,
      currentPlayer: s.currentPlayer, round: s.round, phase: s.phase,
      winner: s.winner, opened: s.opened,
      config: { outMode: s.cfg.outMode, startScore: s.cfg.startScore, inMode: s.cfg.inMode },
    }
  },
}
