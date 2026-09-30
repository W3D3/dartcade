// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import { x01Meta, atcMeta } from './meta.js'

export interface GameView {
  title: string
  meta: (game: Record<string, unknown>, playerCount: number) => string
}

export const gameViews: Record<string, GameView> = {
  atc: { title: 'Around the Clock', meta: atcMeta },
  x01: { title: 'X01', meta: x01Meta },
}

const fallbackView: GameView = { title: 'Game', meta: () => '' }

export function getGameView(gameId: string): GameView {
  return gameViews[gameId] ?? fallbackView
}
