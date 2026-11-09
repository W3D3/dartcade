import type { P121Game } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<P121Game, 'seats'>

/** A seat checks out its target: its count of made tries goes up. */
export function p121Triggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  return after.seats.flatMap((s, seat) => (s.made > (before.seats[seat]?.made ?? s.made) ? [{ kind: 'p121.made' as const, seat }] : []))
}
