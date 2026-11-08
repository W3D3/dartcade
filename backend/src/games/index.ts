import { atcModule } from './atc.js'
import { cricketModule } from './cricket.js'
import { hiloModule } from './hilo.js'
import { minigolfModule } from './minigolf.js'
import { shotWork } from './minigolfInputWork.js'
import { p121Module } from './p121.js'
import { x01Module } from './x01.js'
import type { AnyGameModule } from '../session/types.js'

/** Minigolf as it is played: its 3D shots run in the worker pool. Attached here, not in minigolf.ts, which the SPA's tests import and which must not pull in the pool. */
const minigolfGame: AnyGameModule = { ...minigolfModule, inputWork: shotWork }

/** Every game, in the order the setup screen lists them. */
export const gameList: AnyGameModule[] = [atcModule, x01Module, p121Module, minigolfGame, hiloModule, cricketModule]

/** Games by id; a lookup of an unknown id gives undefined. */
export const games: Partial<Record<string, AnyGameModule>> = Object.fromEntries(gameList.map(m => [m.id, m]))

/** Whether this game can seat a bot: its module defines `botTarget` (see session/types.ts).
 *  An unknown id (including no game picked yet) can't, same as any other game that doesn't. */
export function supportsBots(gameId: string): boolean {
  return games[gameId]?.botTarget !== undefined
}
