// The snapshot's game, narrowed by game id (the generated Snapshot type is a union on gameId).
import type { AtcGame, MinigolfGame, Snapshot, X01Game } from './api/game-ws'

export type GameState =
  | { x01: X01Game; atc: null; minigolf: null }
  | { x01: null; atc: AtcGame; minigolf: null }
  | { x01: null; atc: null; minigolf: MinigolfGame }
  | { x01: null; atc: null; minigolf: null }

export function gameState(snapshot: Snapshot | null): GameState {
  if (snapshot?.gameId === 'x01') return { x01: snapshot.game, atc: null, minigolf: null }
  if (snapshot?.gameId === 'atc') return { x01: null, atc: snapshot.game, minigolf: null }
  if (snapshot?.gameId === 'minigolf') return { x01: null, atc: null, minigolf: snapshot.game }
  return { x01: null, atc: null, minigolf: null }
}
