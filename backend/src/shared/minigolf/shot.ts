// Your dart is the putter: the angle around the bull is the direction, the distance the power.
// Arithmetic and sqrt only (aim assist takes the cosine of its window, a constant). Board coords:
// r = 1 at the outer double wire, y up.
import { R } from '../board.js'
import type { Physics } from './physics.js'
import { lineClear } from './geometry.js'
import type { Hole, Pt, Shot } from './types.js'

/** Power for a dart at distance r from the bull: the softest putt at the centre, 1 at the double wire. */
export function powerAt(r: number, physics: Physics): number {
  const t = Math.min(1, Math.max(0, r))
  const curved = t ** physics.powerExponent
  return physics.minPutt + (1 - physics.minPutt) * curved
}

/**
 * Aim assist: near the cup, a direction within `physics.assistAngle` of a clear line to it is
 * pulled onto it, fully in the inner half of the window and less towards its edge. It fades out
 * from half `physics.assistRange` to the range itself, so only short putts get help. Without a
 * clear line (a dogleg, a bumper in the way) the direction is left alone, so bank shots stay yours.
 */
export function assistDir(dir: Pt, ball: Pt, hole: Hole, physics: Physics): Pt {
  const dx = hole.cup.at[0] - ball[0]
  const dy = hole.cup.at[1] - ball[1]
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0 || len >= physics.assistRange || physics.assistAngle <= 0) return dir
  const cup: Pt = [dx / len, dy / len]
  const cosWindow = Math.cos((physics.assistAngle * Math.PI) / 180)
  const cos = dir[0] * cup[0] + dir[1] * cup[1]
  if (cos < cosWindow || !lineClear(hole, ball, hole.cup.at)) return dir
  const near = Math.min(1, (2 * (physics.assistRange - len)) / physics.assistRange)
  const w = near * Math.min(1, (2 * (cos - cosWindow)) / (1 - cosWindow))
  const x = dir[0] + w * (cup[0] - dir[0])
  const y = dir[1] + w * (cup[1] - dir[1])
  const n = Math.sqrt(x * x + y * y)
  return [x / n, y / n]
}

/** The putt a dart makes, or null for a miss (off the board, or a bounce-out without coords).
 *  Either bull ring putts straight at the cup. With `assist`, the hole for aim assist. */
export function shotFromDart(
  coords: { x: number; y: number } | null,
  ball: Pt,
  cup: Pt,
  physics: Physics,
  assist: Hole | null = null,
): Shot | null {
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
  const dir: Pt = [coords.x / r, -coords.y / r]
  return { dir: assist ? assistDir(dir, ball, assist, physics) : dir, power }
}
