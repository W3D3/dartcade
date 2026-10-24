import type { MinigolfGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<MinigolfGame, 'holeIdx' | 'balls' | 'lastHole' | 'config'>

export function minigolfTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  if (before.holeIdx === after.holeIdx) {
    return after.balls.flatMap((b, seat) =>
      b.status === 'holed' && before.balls[seat]?.status !== 'holed' ? [{ kind: 'golf.sunk' as const, seat, strokes: b.strokes }] : [],
    )
  }
  // The stroke that ends a hole also advances holeIdx and resets `balls` to the next hole's
  // fresh tee-off, in the same snapshot (minigolf.ts's endHole/freshBalls), so the last sink
  // of a hole can't be read from `after.balls` — read it from the finished hole's scores instead.
  const lh = after.lastHole
  if (after.holeIdx !== before.holeIdx + 1 || lh === null || lh.index !== before.holeIdx) return []
  return before.balls.flatMap((b, seat) => {
    if (b.status === 'holed') return [] // already flashed when it happened, mid-hole
    const strokes = lh.scores[seat]
    return strokes <= after.config.maxStrokes ? [{ kind: 'golf.sunk' as const, seat, strokes }] : []
  })
}
