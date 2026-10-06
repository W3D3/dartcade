// A bot's aim: where it throws at (pickTarget) and where the dart actually lands (throwAt),
// given its accuracy. See docs/superpowers/specs/2026-10-06-dart-bots-design.md.
import { checkoutHint } from '../shared/checkout.js'
import { R, SEGS, segAngle, segmentAt, type Segment } from '../shared/board.js'
import type { Rng } from '../session/rng.js'

type OutMode = 'straight' | 'double' | 'master'
type Point = { x: number; y: number }

const TREBLE_20: Point = (() => {
  const r = (R.si + R.tr) / 2
  const a = segAngle(0) // SEGS[0] === 20
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
})()

/** The bull, board-unit origin — where a bull-off throw aims (Task 9's scheduler uses this
 *  directly for a bull-off seat, instead of pickTarget's X01 scoring/checkout logic). */
export const BULL: Point = { x: 0, y: 0 }

/** Board-unit coordinates for the first dart of a checkout label (T20, D12, 25, Bull, …). */
function pointFor(label: string): Point {
  if (label === 'Bull') return { x: 0, y: 0 }
  if (label === '25') {
    const r = (R.bull50 + R.bull25) / 2
    return { x: r, y: 0 }
  }
  const mult = label[0] === 'T' ? 3 : label[0] === 'D' ? 2 : 1
  const num = parseInt(label.slice(1), 10)
  const si = SEGS.indexOf(num)
  const a = segAngle(si)
  const r = mult === 3 ? (R.si + R.tr) / 2 : mult === 2 ? (R.so + R.db) / 2 : (R.tr + R.so) / 2
  return { x: r * Math.cos(a), y: r * Math.sin(a) }
}

/** D20, the conventional target while a bot hasn't opened yet under double-in. */
const DOUBLE_20: Point = pointFor('D20')

/** Where the bot aims: the live checkout suggestion's first dart once one's reachable with the
 *  darts left, otherwise treble 20 — unless the player hasn't opened yet under double-in, in
 *  which case nothing counts until a double lands, so it aims at D20 instead (under master-in a
 *  treble already counts, so T20 needs no special case). `inOpts` is omitted by calibration and
 *  existing tests, which only ever model straight-in 501 (no opening requirement, so the
 *  distinction never applies to them). */
export function pickTarget(remaining: number, dartsLeft: number, outMode: OutMode, inOpts?: { opened: boolean; inMode: OutMode }): Point {
  if (inOpts && !inOpts.opened && inOpts.inMode === 'double') return DOUBLE_20
  const hint = checkoutHint(remaining, outMode, dartsLeft)
  return hint ? pointFor(hint[0]) : TREBLE_20
}

/** Box-Muller: two independent standard-normal samples from two uniform draws. */
function gaussianPair(rng: Rng): [number, number] {
  const u1 = Math.max(rng(), Number.EPSILON) // avoid log(0)
  const u2 = rng()
  const r = Math.sqrt(-2 * Math.log(u1))
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)]
}

/** A dart thrown at `target`, landing with a 2D Gaussian miss of standard deviation `sigma`
 *  (board units) in each axis, resolved to the segment it hits. Draws exactly two values from
 *  `rng` (one Gaussian pair covers both axes). */
export function throwAt(target: Point, sigma: number, rng: Rng): Segment {
  const [z0, z1] = gaussianPair(rng)
  const dx = z0 * sigma
  const dy = z1 * sigma
  return segmentAt(target.x + dx, target.y + dy)
}
