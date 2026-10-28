// The snapshot's game, narrowed by game id (the generated Snapshot type is a union on gameId).
import type { Snapshot } from './api/game-ws'
import type { GameId } from '$shared/gameNames'

/** Each game id's game state, from the snapshot union. */
export type Games = { [S in Snapshot as S['gameId']]: S['game'] }

/** The snapshot's game under its id, null under every other (all null without a snapshot). */
export type GameState = { [K in keyof Games]: Games[K] | null }

// The server's game ids and the shared names must match both ways, or every per-game table misses one
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const _sameIds: Same<Snapshot['gameId'], GameId> = true

export function gameState(s: Snapshot | null): GameState {
  return {
    x01: s?.gameId === 'x01' ? s.game : null,
    atc: s?.gameId === 'atc' ? s.game : null,
    minigolf: s?.gameId === 'minigolf' ? s.game : null,
    p121: s?.gameId === 'p121' ? s.game : null,
    hilo: s?.gameId === 'hilo' ? s.game : null,
  }
}
