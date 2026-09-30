// The snapshot's game, narrowed by game id (the generated Snapshot type is a union on gameId).
import type { AtcGame, Snapshot, X01Game } from './api/game-ws'

export type GameState = { x01: X01Game; atc: null } | { x01: null; atc: AtcGame } | { x01: null; atc: null }

export function gameState(snapshot: Snapshot | null): GameState {
  if (snapshot?.gameId === 'x01') return { x01: snapshot.game, atc: null }
  if (snapshot?.gameId === 'atc') return { x01: null, atc: snapshot.game }
  return { x01: null, atc: null }
}
