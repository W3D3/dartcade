import type { DungeonGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<DungeonGame, 'outcome' | 'trace' | 'battle'>

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * A new resolution trace is a visit landing: a kill if it brought an enemy to 0, else a hit if it did
 * damage. When the enemies act (the round goes up), each hero their turn damaged is hurt. The run's
 * end is Victory or Defeat, never the shared game.won (a lost run has a `winner` too, see triggersFor).
 */
export function dungeonTriggers(before: V | null, after: V): Trigger[] {
  if (after.outcome !== null)
    return before?.outcome === null ? [{ kind: after.outcome === 'victory' ? 'dungeon.victory' : 'dungeon.defeat' }] : []
  if (before === null) return []
  const out: Trigger[] = []
  const trace = after.trace
  if (trace && !same(before.trace, trace)) {
    if (trace.enemies.some(e => e.hpBefore > 0 && e.hpAfter === 0)) out.push({ kind: 'dungeon.kill', seat: trace.seat })
    else if (trace.total > 0) out.push({ kind: 'dungeon.hit', seat: trace.seat })
  }
  const turn = after.battle?.lastEnemyTurn
  // By the round, not the log: a one-attack enemy logs the same turn every round
  if (turn && after.battle?.round !== before.battle?.round) {
    const hurt = new Set(turn.attacks.flatMap(a => a.hits.filter(h => h.damage > 0).map(h => h.seat)))
    for (const seat of [...hurt].sort((a, b) => a - b)) out.push({ kind: 'dungeon.hurt', seat })
  }
  return out
}
