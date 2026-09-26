import ATCPlayerStats from './atc.svelte'
import FallbackPlayerStats from './fallback.svelte'

export interface GameView {
  /** Returns segment numbers (1–20) to highlight on the dartboard. Empty = no dimming. */
  getBoardHighlights: (game: Record<string, unknown>, playerIndex: number) => number[]
  /** Returns display data for a player card. */
  getPlayerDisplay: (game: Record<string, unknown>, playerIndex: number) => {
    remaining: number
    dartsLeft: number
  }
}

const atcView: GameView = {
  getBoardHighlights: (game, i) => {
    const targets = game.targets as number[] | undefined
    const t = targets?.[i] ?? 0
    return t >= 1 && t <= 20 ? [t] : []
  },
  getPlayerDisplay: (_game, _playerIndex) => ({ remaining: 0, dartsLeft: 3 }),
}

export const gameViews: Record<string, GameView> = {
  atc: atcView,
}

const fallbackView: GameView = {
  getBoardHighlights: () => [],
  getPlayerDisplay: (_game, _playerIndex) => ({ remaining: 0, dartsLeft: 3 }),
}

/** Always returns a view — falls back to debug view for unknown gameIds */
export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? fallbackView
}
