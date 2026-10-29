// Pure view helpers for Cricket, fed by the CricketGame snapshot; see
// docs/superpowers/specs/2026-10-25-cricket-design.md.
import type { CricketGame } from '../api/game-ws'
import { cricketRules } from '../gameViews/meta.js'
import { plural } from '../fmt.js'

/** "2 players · Cut-throat · First to 3 · Round 4". */
export function cricketMeta(game: CricketGame, players: number): string {
  return `${plural(players, 'player')} · ${cricketRules(game.config)} · Round ${game.round}`
}
