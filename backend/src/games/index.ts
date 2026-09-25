import { atcModule } from './atc.js'
import type { GameModule } from '../session/types.js'

export const games: Record<string, GameModule<unknown, unknown>> = {
  atc: atcModule as GameModule<unknown, unknown>,
}
