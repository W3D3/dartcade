import { atcModule } from './atc.js'
import { x01Module } from './x01.js'
import type { AnyGameModule } from '../session/types.js'

/** Every game, in the order the setup screen lists them. */
export const gameList: AnyGameModule[] = [atcModule, x01Module]

/** Games by id; a lookup of an unknown id gives undefined. */
export const games: Partial<Record<string, AnyGameModule>> = Object.fromEntries(gameList.map(m => [m.id, m]))

/** Whether this game can seat a bot: its module defines `botTarget` (see session/types.ts).
 *  An unknown id (including no game picked yet) can't, same as any other game that doesn't. */
export function supportsBots(gameId: string): boolean {
  return games[gameId]?.botTarget !== undefined
}
