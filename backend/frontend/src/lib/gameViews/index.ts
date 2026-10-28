// Per-game header text. Panels, rows and slots are picked by game id in GameDisplay.
import type { Snapshot } from '../api/game-ws'
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

/** The header's line next to the title. */
function meta(s: Snapshot): string {
  switch (s.gameId) {
    case 'x01':
      return x01Meta(s.game, s.players.length)
    case 'atc':
      return atcMeta(s.game, s.players.length)
    case 'minigolf':
      return minigolfMeta(s.game)
    case 'p121':
      return p121Meta(s.game, s.game.currentPlayer)
    case 'hilo':
      return hiloMeta(s.game, s.players.length)
    default: {
      // A new game id fails to compile here until it has a line; one from a newer server gets none
      const _unknown: never = s
      return ''
    }
  }
}

export function getGameView(gameId: string): GameView {
  const names = isGameId(gameId) ? GAME_NAMES[gameId] : null
  return {
    title: names?.title ?? 'Game',
    shortTitle: names?.short ?? 'Game',
    meta,
  }
}
