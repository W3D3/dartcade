import { atcModule } from './atc.js'
import { x01Module } from './x01.js'
import type { AnyGameModule } from '../session/types.js'

/** Every game, in the order the setup screen lists them. */
export const gameList: AnyGameModule[] = [atcModule, x01Module]

/** Games by id; a lookup of an unknown id gives undefined. */
export const games: Partial<Record<string, AnyGameModule>> = Object.fromEntries(gameList.map(m => [m.id, m]))
