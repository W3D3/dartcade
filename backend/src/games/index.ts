import { atcModule } from './atc.js'
import { x01Module } from './x01.js'
import type { GameModule } from '../session/types.js'

export const games: Record<string, GameModule<unknown, unknown>> = {
  atc: atcModule as GameModule<unknown, unknown>,
  x01: x01Module as GameModule<unknown, unknown>,
}
