// The snapshot's game, narrowed by game id (the generated Snapshot type is a union on gameId).
import type { AtcGame, MinigolfGame, P121Game, Snapshot, X01Game } from './api/game-ws'

export type GameState =
  | { x01: X01Game; atc: null; minigolf: null; p121: null }
  | { x01: null; atc: AtcGame; minigolf: null; p121: null }
  | { x01: null; atc: null; minigolf: MinigolfGame; p121: null }
  | { x01: null; atc: null; minigolf: null; p121: P121Game }
  | { x01: null; atc: null; minigolf: null; p121: null }

export function gameState(snapshot: Snapshot | null): GameState {
  if (snapshot?.gameId === 'x01') return { x01: snapshot.game, atc: null, minigolf: null, p121: null }
  if (snapshot?.gameId === 'atc') return { x01: null, atc: snapshot.game, minigolf: null, p121: null }
  if (snapshot?.gameId === 'minigolf') return { x01: null, atc: null, minigolf: snapshot.game, p121: null }
  if (snapshot?.gameId === 'p121') return { x01: null, atc: null, minigolf: null, p121: snapshot.game }
  return { x01: null, atc: null, minigolf: null, p121: null }
}
