// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
import { gameState } from '../gameState.js'
import { x01Meta, atcMeta } from './meta.js'

export interface GameView {
  title: string
  meta: (snapshot: Snapshot) => string
}

const titles: Partial<Record<string, string>> = { x01: 'X01', atc: 'Around the Clock' }

export function getGameView(gameId: string): GameView {
  return {
    title: titles[gameId] ?? 'Game',
    meta: s => {
      // An unknown game (newer backend) gets no meta line rather than a crash
      const { x01, atc } = gameState(s)
      return x01 ? x01Meta(x01, s.players.length) : atc ? atcMeta(atc, s.players.length) : ''
    },
  }
}
