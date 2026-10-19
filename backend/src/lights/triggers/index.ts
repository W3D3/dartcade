import type { Snapshot } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'
import { atcTriggers } from './atc.js'
import { commonTriggers } from './common.js'
import { hiloTriggers } from './hilo.js'
import { minigolfTriggers } from './minigolf.js'
import { x01Triggers } from './x01.js'

/** What the lights react to between two snapshots of one game; `before` null: the game is new here. */
export function triggersFor(before: Snapshot | null, after: Snapshot): Trigger[] {
  const prev = before?.gameId === after.gameId ? before : null
  const common = commonTriggers(prev?.game ?? null, after.game)
  // X01 already emits game.won on the winning dart (x01Triggers); drop the common one fired later,
  // at takeout, so Matchshot plays once.
  const filtered = after.gameId === 'x01' ? common.filter(t => t.kind !== 'game.won') : common
  return [...gameTriggers(prev, after), ...filtered]
}

function gameTriggers(before: Snapshot | null, after: Snapshot): Trigger[] {
  switch (after.gameId) {
    case 'x01':
      return x01Triggers(before?.gameId === 'x01' ? before.game : null, after.game)
    case 'atc':
      return atcTriggers(before?.gameId === 'atc' ? before.game : null, after.game)
    case 'hilo':
      return hiloTriggers(before?.gameId === 'hilo' ? before.game : null, after.game)
    case 'minigolf':
      return minigolfTriggers(before?.gameId === 'minigolf' ? before.game : null, after.game)
    case 'p121':
      return []
  }
}
