// The double ring of a dartboard as arcs, for charts that colour each double: where each number's
// double sits (d3's angles: radians, 0 at twelve o'clock, clockwise) and how full its colour is.
import { SEGS } from '$shared/board'

const SLICE = (2 * Math.PI) / SEGS.length

export type RingSlice = { number: number; startAngle: number; endAngle: number; mid: number }

/** The twenty numbers in board order from the 20, each with its slice of the ring. */
export const RING: RingSlice[] = SEGS.map((number, i) => ({
  number,
  startAngle: (i - 0.5) * SLICE,
  endAngle: (i + 0.5) * SLICE,
  mid: i * SLICE,
}))

/** A point at `radius` and d3 angle `angle`, from the centre, in SVG coordinates (y down). */
export const polar = (radius: number, angle: number): [number, number] => [radius * Math.sin(angle), -radius * Math.cos(angle)]

/** How full a rate's colour is, 0–1: `full` (0.55 by default) and above is the whole colour. */
export const rateFill = (rate: number, full = 0.55): number => Math.max(0, Math.min(1, rate / full))
