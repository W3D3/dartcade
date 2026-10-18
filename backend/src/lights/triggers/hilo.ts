import type { HiloGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<HiloGame, 'seats'>

export function hiloTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  return after.seats.flatMap((s, seat) =>
    s.lives < (before.seats[seat]?.lives ?? s.lives) ? [{ kind: 'hilo.lifeLost' as const, seat }] : [],
  )
}
