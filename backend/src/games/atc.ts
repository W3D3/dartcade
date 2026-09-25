import type { GameModule, BoardEvent, Player, Dart } from '../session/types.js'
import type { DartDetectedData } from '../session/types.js'

export type ATCConfig = {
  throwAgainOnAllHit: boolean
  finishOn: 'twenty' | 'single_bull' | 'bull'
  multiplierAdvances: boolean
}

export type ATCState = {
  targets: number[]
  currentPlayer: number
  allHitThisVisit: boolean
  winner: number | null
  cfg: ATCConfig
  playerCount: number
}

function finishTarget(cfg: ATCConfig): number {
  return cfg.finishOn === 'twenty' ? 20
    : cfg.finishOn === 'single_bull' ? 21
    : 22
}

function hitsTarget(target: number, dart: Dart): boolean {
  const { number, bed, multiplier } = dart.segment
  if (multiplier === 0) return false // outside/bounce-out/near-miss
  if (target >= 1 && target <= 20) return number === target
  if (target === 21) return number === 25 || number === 50   // single_bull: any bull
  if (target === 22) return number === 50 && bed === 'Double' // bull: D50 only
  return false
}

function advance(target: number, dart: Dart, cfg: ATCConfig): number {
  if (!hitsTarget(target, dart)) return target

  // Bull checkpoints: one hit wins regardless of multiplier
  if (target === 21 || target === 22) return target + 1

  const adv = cfg.multiplierAdvances ? dart.segment.multiplier : 1

  if (target < 20 && cfg.finishOn !== 'twenty') {
    // Bull is required — cap advance at 20
    return Math.min(target + adv, 20)
  }

  if (target === 20) {
    if (cfg.finishOn === 'twenty') return 21           // win state
    if (cfg.finishOn === 'single_bull') return 21      // bull checkpoint
    return 22                                          // double-bull checkpoint
  }

  // finishOn === 'twenty', target < 20
  return Math.min(target + adv, 21) // cap at win state
}

export const atcModule: GameModule<ATCState, ATCConfig> = {
  id: 'atc',
  defaultConfig: { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false },

  init(cfg: ATCConfig, players: Player[]): ATCState {
    return {
      targets: players.map(() => 1),
      currentPlayer: 0,
      allHitThisVisit: false,
      winner: null,
      cfg,
      playerCount: players.length,
    }
  },

  onBoardEvent(s: ATCState, e: BoardEvent) {
    switch (e.kind) {
      case 'visit.opened':
        return { state: { ...s, allHitThisVisit: true } }

      case 'dart.detected': {
        const data = e.data as DartDetectedData
        const prev = s.targets[s.currentPlayer]
        const next = advance(prev, data.dart as Dart, s.cfg)
        const hit = next > prev
        const targets = s.targets.map((t, i) => i === s.currentPlayer ? next : t)
        const winner = next > finishTarget(s.cfg) ? s.currentPlayer : s.winner
        return {
          state: { ...s, targets, allHitThisVisit: s.allHitThisVisit && hit, winner },
        }
      }

      case 'takeout.finished': {
        if (s.winner !== null) return { state: s }
        const stay = s.cfg.throwAgainOnAllHit && s.allHitThisVisit
        const nextPlayer = stay ? s.currentPlayer : (s.currentPlayer + 1) % s.playerCount
        return { state: { ...s, currentPlayer: nextPlayer, allHitThisVisit: false } }
      }

      case 'visit.cleared':
        return {
          state: { ...s, currentPlayer: (s.currentPlayer + 1) % s.playerCount, allHitThisVisit: false },
        }

      default:
        return { state: s }
    }
  },

  onUserAction(s: ATCState) {
    return { state: s } // structural actions handled by engine
  },

  view(s: ATCState, _players: Player[]) {
    return { targets: s.targets, currentPlayer: s.currentPlayer, winner: s.winner }
  },
}
