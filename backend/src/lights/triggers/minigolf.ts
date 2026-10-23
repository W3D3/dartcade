import type { MinigolfGame } from '../../schema/game-ws.js'
import type { Trigger } from '../../shared/lights/index.js'

type V = Pick<MinigolfGame, 'holeIdx' | 'balls' | 'lastHole' | 'config' | 'lastStroke'>

// Mirrors the match screen's playback (frontend/src/lib/minigolf/match.ts: ROLL_DELAY_MS,
// PLAYBACK), so the golf.sunk flash lands when the ball visibly drops there, not when this
// snapshot lands (#307). Paths are sampled at 60 Hz; keep these in sync if match.ts changes.
const FPS = 60
const ROLL_DELAY_MS = 3000
const PLAYBACK = 0.6

/** How long the match screen takes to play out the stroke that sank `strokes`'s ball(s), from the
 *  snapshot landing to the roll finishing: the suspense pause, then the roll itself at the match
 *  screen's (non-slow-motion) playback speed. 0 with no stroke to go by (shouldn't happen for a
 *  real sink, but keeps this total). */
function sinkDelayMs(lastStroke: V['lastStroke']): number {
  if (!lastStroke) return 0
  const frames = Math.max(lastStroke.path.length, ...lastStroke.others.map(o => o.path.length))
  return ROLL_DELAY_MS + Math.round((frames / (FPS * PLAYBACK)) * 1000)
}

export function minigolfTriggers(before: V | null, after: V): Trigger[] {
  if (before === null) return []
  if (before.holeIdx === after.holeIdx) {
    const delayMs = sinkDelayMs(after.lastStroke)
    return after.balls.flatMap((b, seat) =>
      b.status === 'holed' && before.balls[seat]?.status !== 'holed'
        ? [{ kind: 'golf.sunk' as const, seat, strokes: b.strokes, delayMs }]
        : [],
    )
  }
  // The stroke that ends a hole also advances holeIdx and resets `balls` to the next hole's
  // fresh tee-off, in the same snapshot (minigolf.ts's endHole/freshBalls), so the last sink
  // of a hole can't be read from `after.balls` — read it from the finished hole's scores instead.
  const lh = after.lastHole
  if (after.holeIdx !== before.holeIdx + 1 || lh === null || lh.index !== before.holeIdx) return []
  const delayMs = sinkDelayMs(after.lastStroke)
  return before.balls.flatMap((b, seat) => {
    if (b.status === 'holed') return [] // already flashed when it happened, mid-hole
    const strokes = lh.scores[seat]
    return strokes <= after.config.maxStrokes ? [{ kind: 'golf.sunk' as const, seat, strokes, delayMs }] : []
  })
}
