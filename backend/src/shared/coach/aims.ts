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

/** The radial band of each aim kind's bed (an AIMS id without its numbers: T, D, SO, SI, W; Bull
 *  and 25 as they are). A wire's band is the outer single's either side of it. */
export const AIM_RINGS: Readonly<Record<string, readonly [r0: number, r1: number]>> = {
  T: [R.si, R.tr],
  D: [R.so, R.db],
  SO: [R.tr, R.so],
  SI: [R.bull25, R.si],
  W: [R.tr, R.so],
  Bull: [0, R.bull50],
  '25': [R.bull50, R.bull25],
}
/** An AIMS id's kind, the key of AIM_RINGS: T20 → T, W20-1 → W, Bull and 25 as they are */
export const aimKind = (aimId: string): string => aimId.replace(/[\d-]/g, '') || aimId

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

const INDEX = new Map(AIMS.map((a, i) => [a.id, i]))
/** An aim's index in AIMS by its id; -1 for none */
export const aimIndex = (id: string): number => INDEX.get(id) ?? -1
export const aimById = (id: string): Aim | undefined => AIMS[aimIndex(id)]

/** `n`'s two neighbours on the board; none for 25 */
export function neighbours(n: number): number[] {
  const i = SEGS.indexOf(n)
  return i < 0 ? [] : [SEGS[(i + 19) % 20], SEGS[(i + 1) % 20]]
}

/** The aims (AIMS indexes, in AIMS order) a dart around which lands in any of `numbers`: for a
 *  number its treble, double, singles and both wires; the bull and 25 for 25. */
export const aimsOn = (numbers: readonly number[]): number[] =>
  AIMS.flatMap((a, i) => (a.numbers.some(m => numbers.includes(m)) ? [i] : []))

/** The aim at the centre of a segment's bed (by its name: T20, S20 (its outer single), Bull); null
 *  off the board. */
export const bedAim = (name: string): Aim | null => aimById(/^S\d/.test(name) ? `SO${name.slice(1)}` : name) ?? null

/** What a dart in the aim's bed scores: both numbers' for a wire */
export function aimPoints(a: Aim): number[] {
  const kind = aimKind(a.id)
  if (kind === 'Bull') return [50]
  const m = kind === 'T' ? 3 : kind === 'D' ? 2 : 1
  return a.numbers.map(n => n * m)
}
/** A dart in the aim's bed is a double: the doubles and the bull */
export const isDoubleAim = (a: Aim): boolean => a.id === 'Bull' || aimKind(a.id) === 'D'

/** The direct one-dart out for `left`: `D${left/2}` for an even score up to 40, `Bull` for 50.
 *  Null when `left` has no one-dart out (odd, or outside that range). */
export function directOutId(left: number): string | null {
  if (left === 50) return 'Bull'
  return left % 2 === 0 && left >= 2 && left <= 40 ? `D${left / 2}` : null
}

/** The score can be checked out with one dart: an even score up to 40, or 50 */
export const oneDartFinish = (left: number): boolean => directOutId(left) !== null
