export type BullOffMode = 'off' | 'wdc' | 'pdc'

export type BullOffConfig = {
  mode: BullOffMode
  playerCount: number
}

export type BullOffState = {
  active: boolean
  darts: (number | null)[]
  currentPlayer: number
  playerCount: number
}

export type BullOffTakeoutResult = {
  state: BullOffState
  done: boolean
  winner: number | null  // null = rethrow
}

export function initBullOff(cfg: BullOffConfig): BullOffState {
  return {
    active: cfg.mode !== 'off',
    darts: Array(cfg.playerCount).fill(null),
    currentPlayer: 0,
    playerCount: cfg.playerCount,
  }
}

/** Call on dart.detected during bull off phase. Only the first dart per player counts. */
export function onBullOffDart(s: BullOffState, dartScore: number): BullOffState {
  if (s.darts[s.currentPlayer] !== null) return s  // already recorded
  const darts = s.darts.map((d, i) => i === s.currentPlayer ? dartScore : d)
  return { ...s, darts }
}

/** Call on takeout.finished during bull off phase. */
export function onBullOffTakeout(s: BullOffState): BullOffTakeoutResult {
  const allThrown = s.currentPlayer >= s.playerCount - 1

  if (!allThrown) {
    return { state: { ...s, currentPlayer: s.currentPlayer + 1 }, done: false, winner: null }
  }

  // Only 25 (outer bull) and 50 (inner bull) count — outside darts never win regardless of score
  const bullScores = s.darts.map(d => (d === 25 || d === 50) ? d : 0)
  const maxScore = Math.max(...bullScores)
  const topPlayers = bullScores.reduce<number[]>((acc, sc, i) => sc === maxScore ? [...acc, i] : acc, [])
  const winner = maxScore > 0 && topPlayers.length === 1 ? topPlayers[0] : null

  const nextState: BullOffState = winner !== null
    ? { ...s }
    : { ...s, darts: Array(s.playerCount).fill(null), currentPlayer: 0 }

  return { state: nextState, done: true, winner }
}
