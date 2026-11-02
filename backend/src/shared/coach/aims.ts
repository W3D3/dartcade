// The points the coach considers aiming at: per number its treble, double, outer and inner single,
// the wire to its clockwise neighbour; and the bull and 25. Board units, as in ../board.ts.
import { HALF, R, SEGS, segAngle } from '../board.js'

export type Aim = {
  /** Unique: T20, D20, SO20 (outer single), SI20 (inner single), W20-1 (wire), Bull, 25 */
  id: string
  /** What a player reads: T20, D20, S20, 20/1, Bull, 25 */
  label: string
  /** The numbers a dart around this aim lands in: one, two for a wire, 25 for the bull and 25 */
  numbers: readonly number[]
  x: number
  y: number
}

/** One way a dart can land: the segment's name (Miss off the board), its points, whether it is a
 *  double (the bull is), and its chance. */
export type Outcome = readonly [name: string, points: number, double: boolean, p: number]

const at = (r: number, angle: number) => ({ x: r * Math.cos(angle), y: r * Math.sin(angle) })

export const AIMS: readonly Aim[] = [
  ...SEGS.flatMap((n, i): Aim[] => {
    const a = segAngle(i)
    const next = SEGS[(i + 1) % 20]
    return [
      { id: `T${n}`, label: `T${n}`, numbers: [n], ...at((R.si + R.tr) / 2, a) },
      { id: `D${n}`, label: `D${n}`, numbers: [n], ...at((R.so + R.db) / 2, a) },
      { id: `SO${n}`, label: `S${n}`, numbers: [n], ...at((R.tr + R.so) / 2, a) },
      { id: `SI${n}`, label: `S${n}`, numbers: [n], ...at((R.bull25 + R.si) / 2, a) },
      // Segments run clockwise, so the next one is half a segment further clockwise
      { id: `W${n}-${next}`, label: `${n}/${next}`, numbers: [n, next], ...at((R.tr + R.so) / 2, a - HALF) },
    ]
  }),
  { id: 'Bull', label: 'Bull', numbers: [25], x: 0, y: 0 },
  { id: '25', label: '25', numbers: [25], ...at((R.bull50 + R.bull25) / 2, Math.PI / 2) },
]
