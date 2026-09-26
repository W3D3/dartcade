import type { GameModule, BoardEvent, Player, Dart } from '../session/types.js'
import type { DartDetectedData, ConfigFieldMeta } from '../session/types.js'

export type ATCConfig = {
  throwAgainOnAllHit: boolean
  finishOn: 'twenty' | 'single_bull' | 'bull'
  multiplierAdvances: boolean
  order: 'asc' | 'desc' | 'random'
}

export type ATCState = {
  sequence: number[]   // ordered list of actual dart targets (1–20, 21=25, 22=bull)
  targets: number[]    // current target per player (actual number from sequence)
  currentPlayer: number
  allHitThisVisit: boolean
  winner: number | null
  cfg: ATCConfig
  playerCount: number
}

function shuffle(arr: number[]): number[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function buildSequence(cfg: ATCConfig): number[] {
  const nums = Array.from({ length: 20 }, (_, i) => i + 1)
  let ordered: number[]
  if (cfg.order === 'desc') {
    ordered = [...nums].reverse()
  } else if (cfg.order === 'random') {
    ordered = shuffle(nums)
  } else {
    ordered = nums
  }
  if (cfg.finishOn === 'single_bull') return [...ordered, 21]
  if (cfg.finishOn === 'bull') return [...ordered, 22]
  return ordered
}

function hitsTarget(target: number, dart: Dart): boolean {
  const { number, bed, multiplier } = dart.segment
  if (multiplier === 0) return false
  if (target >= 1 && target <= 20) return number === target
  if (target === 21) return number === 25 || number === 50
  if (target === 22) return number === 50 && bed === 'Double'
  return false
}

// Returns the new target value after advancing `steps` positions through the sequence.
// Bull checkpoints (21, 22) advance exactly 1 step; multiplier cannot skip them.
// A win is signalled by returning a value not in the sequence (> last element).
function advanceInSequence(current: number, steps: number, sequence: number[]): number {
  const idx = sequence.indexOf(current)
  if (idx === -1) return current

  const seqTarget = sequence[idx]

  // Bull checkpoints: exactly 1 step, no skipping
  if (seqTarget === 21 || seqTarget === 22) {
    return sequence[idx + 1] ?? seqTarget + 1
  }

  // Find first bull checkpoint after current position
  let bullIdx = -1
  for (let i = idx + 1; i < sequence.length; i++) {
    if (sequence[i] === 21 || sequence[i] === 22) { bullIdx = i; break }
  }

  if (bullIdx === -1) {
    // No bull ahead — can advance off the end to win
    const nextIdx = idx + steps
    if (nextIdx >= sequence.length) return sequence[sequence.length - 1] + 1
    return sequence[nextIdx]
  }

  // Bull ahead: can't skip INTO bull via multiplier.
  // If already at the last regular number (idx === bullIdx-1), hit advances to bull.
  const lastRegularIdx = bullIdx - 1
  if (idx === lastRegularIdx) return sequence[bullIdx]

  // Otherwise cap at the last regular number
  const targetIdx = Math.min(idx + steps, lastRegularIdx)
  return sequence[targetIdx]
}

export const configMeta: Record<keyof ATCConfig, ConfigFieldMeta> = {
  finishOn: {
    label: 'Finish on',
    tooltip: 'Which target ends the game after hitting all numbers.',
    options: [
      { value: 'twenty',      label: '20' },
      { value: 'single_bull', label: '25' },
      { value: 'bull',        label: 'Bull' },
    ],
  },
  order: {
    label: 'Order',
    tooltip: 'The sequence in which numbers must be hit.',
    options: [
      { value: 'asc',    label: '1→20' },
      { value: 'desc',   label: '20→1' },
      { value: 'random', label: 'Random' },
    ],
  },
  multiplierAdvances: {
    label: 'Multiplier advances',
    tooltip: 'A double or triple on the current target skips 2 or 3 numbers ahead.',
    options: [
      { value: false, label: 'Off' },
      { value: true,  label: 'On'  },
    ],
  },
  throwAgainOnAllHit: {
    label: 'Throw again on all hit',
    tooltip: 'If all 3 darts hit their target in a visit, the same player throws again.',
    options: [
      { value: false, label: 'Off' },
      { value: true,  label: 'On'  },
    ],
  },
}

export const atcModule: GameModule<ATCState, ATCConfig> = {
  id: 'atc',
  defaultConfig: { throwAgainOnAllHit: false, finishOn: 'single_bull', multiplierAdvances: false, order: 'asc' },
  configMeta,

  init(cfg: ATCConfig, players: Player[]): ATCState {
    const sequence = buildSequence(cfg)
    return {
      sequence,
      targets: players.map(() => sequence[0]),
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
        const steps = s.cfg.multiplierAdvances ? (data.dart as Dart).segment.multiplier : 1
        const hit = hitsTarget(prev, data.dart as Dart)
        if (!hit) return { state: { ...s, allHitThisVisit: false } }
        const next = advanceInSequence(prev, steps, s.sequence)
        const targets = s.targets.map((t, i) => i === s.currentPlayer ? next : t)
        const winner = !s.sequence.includes(next) ? s.currentPlayer : s.winner
        return {
          state: { ...s, targets, allHitThisVisit: s.allHitThisVisit && true, winner },
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
    return { state: s }
  },

  view(s: ATCState, _players: Player[]) {
    return { targets: s.targets, sequence: s.sequence, currentPlayer: s.currentPlayer, winner: s.winner }
  },
}
