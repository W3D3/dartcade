// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
import { gameState } from '../gameState.js'
import { x01Meta, atcMeta, minigolfMeta } from './meta.js'

export interface GameView {
  title: string
  /** For tight labels, e.g. "ATC matches". */
  shortTitle: string
  meta: (snapshot: Snapshot) => string
}

const titles: Partial<Record<string, string>> = { x01: 'X01', atc: 'Around the Clock', minigolf: 'Minigolf' }
const shortTitles: Partial<Record<string, string>> = { atc: 'ATC' }

export function getGameView(gameId: string): GameView {
  return {
    title: titles[gameId] ?? 'Game',
    shortTitle: shortTitles[gameId] ?? titles[gameId] ?? 'Game',
    meta: s => {
      // An unknown game (newer backend) gets no meta line rather than a crash
      const { x01, atc, minigolf } = gameState(s)
      if (minigolf) return minigolfMeta(minigolf)
      return x01 ? x01Meta(x01, s.players.length) : atc ? atcMeta(atc, s.players.length) : ''
    },
  }
}
