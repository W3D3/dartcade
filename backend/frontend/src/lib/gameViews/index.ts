// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
import { gameState } from '../gameState.js'
import { p121Meta } from '../p121/view.js'
import { hiloMeta } from '../hilo/view.js'
import { x01Meta, atcMeta, minigolfMeta } from './meta.js'

export interface GameView {
  title: string
  /** For tight labels, e.g. "ATC matches". */
  shortTitle: string
  meta: (snapshot: Snapshot) => string
}

const titles: Partial<Record<string, string>> = {
  x01: 'X01',
  atc: 'Around the Clock',
  minigolf: 'Minigolf',
  p121: '121 CHECKOUT',
  hilo: 'Higher Lower',
}
const shortTitles: Partial<Record<string, string>> = { atc: 'ATC', p121: '121' }

export function getGameView(gameId: string): GameView {
  return {
    title: titles[gameId] ?? 'Game',
    shortTitle: shortTitles[gameId] ?? titles[gameId] ?? 'Game',
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
