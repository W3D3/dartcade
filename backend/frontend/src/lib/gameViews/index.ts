// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
import { gameState } from '../gameState.js'
import { GAME_NAMES, isGameId } from '$shared/gameNames'
import { p121Meta } from '../p121/view.js'
import { hiloMeta } from '../hilo/view.js'
import { x01Meta, atcMeta, minigolfMeta } from './meta.js'

export interface GameView {
  title: string
  /** For tight labels, e.g. "ATC matches". */
  shortTitle: string
  meta: (snapshot: Snapshot) => string
}

export function getGameView(gameId: string): GameView {
  const names = isGameId(gameId) ? GAME_NAMES[gameId] : null
  return {
    title: names?.title ?? 'Game',
    shortTitle: names?.short ?? 'Game',
    meta: s => {
      // An unknown game (newer backend) gets no meta line rather than a crash
      const { x01, atc, minigolf, p121, hilo } = gameState(s)
      if (minigolf) return minigolfMeta(minigolf)
      if (p121) return p121Meta(p121, p121.currentPlayer)
      if (hilo) return hiloMeta(hilo, s.players.length)
      return x01 ? x01Meta(x01, s.players.length) : atc ? atcMeta(atc, s.players.length) : ''
    },
  }
}
