// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
import { x01Meta, atcMeta } from './meta.js'

export interface GameView {
  title: string
  meta: (snapshot: Snapshot) => string
}

const titles: Partial<Record<string, string>> = { x01: 'X01', atc: 'Around the Clock' }

export function getGameView(gameId: string): GameView {
  return {
    title: titles[gameId] ?? 'Game',
    meta: s => (s.gameId === 'x01' ? x01Meta(s.game, s.players.length) : atcMeta(s.game, s.players.length)),
  }
}
