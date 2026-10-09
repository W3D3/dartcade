// Your dart is the putter: the angle around the bull is the direction, the distance the power.
// Arithmetic and sqrt only, no trig. Board coords: r = 1 at the outer double wire, y up.
import { R } from '../board.js'
import type { Physics } from './physics.js'
import type { Pt, Shot } from './types.js'

/** Power for a dart at distance r from the bull: the softest putt at the centre, 1 at the double wire. */
export function powerAt(r: number, physics: Physics): number {
  const t = Math.min(1, Math.max(0, r))
  const curved = physics.powerCurve === 'ease-in' ? t * t : t
  return physics.minPutt + (1 - physics.minPutt) * curved
}

/** The putt a dart makes, or null for a miss (off the board, or a bounce-out without coords).
 *  Either bull ring putts straight at the cup. */
export function shotFromDart(coords: { x: number; y: number } | null, ball: Pt, cup: Pt, physics: Physics): Shot | null {
  if (!coords) return null
  const r = Math.sqrt(coords.x * coords.x + coords.y * coords.y)
  if (r > 1) return null
  const power = powerAt(r, physics)
  if (r <= R.bull25) {
    const dx = cup[0] - ball[0]
    const dy = cup[1] - ball[1]
    const len = Math.sqrt(dx * dx + dy * dy)
    return { dir: len === 0 ? [0, -1] : [dx / len, dy / len], power }
  }
  // Board y points up, course y down
  return { dir: [coords.x / r, -coords.y / r], power }
}
