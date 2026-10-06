// The dartboard's geometry: radii (board units, r = 1 at the outer double wire), the 20
// segments in board order, and resolving a point to the segment under it. Shared by the
// frontend's drawn board and dart-correction UI, and the backend's bot accuracy model.

export type Bed = 'Outside' | 'Single' | 'SingleInner' | 'SingleOuter' | 'Triple' | 'Double'
export type Segment = { name: string; number: number; bed: Bed; multiplier: 0 | 1 | 2 | 3 }

export const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.0 } as const
export const SEGS: readonly number[] = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
export const HALF = Math.PI / 20

/** The board angle (y up, 0 at +y) of segment index `i`'s centre (0 = the 20). */
export function segAngle(i: number): number {
  return Math.PI / 2 - i * 2 * HALF
}

const RING_BED: Record<string, { bed: Segment['bed']; multiplier: Segment['multiplier'] }> = {
  si: { bed: 'SingleOuter', multiplier: 1 },
  tr: { bed: 'Triple', multiplier: 3 },
  so: { bed: 'SingleOuter', multiplier: 1 },
  db: { bed: 'Double', multiplier: 2 },
}

/** The segment at a point in board units (y up, r = 1 at the outer double wire). */
export function segmentAt(x: number, y: number): Segment {
  const r = Math.hypot(x, y)
  if (r <= R.bull50) return { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }
  if (r <= R.bull25) return { name: '25', number: 25, bed: 'Single', multiplier: 1 }
  // Sector 0 (20) is centred on +y; sectors run clockwise
  const cw = (Math.PI / 2 - Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI)
  const num = SEGS[Math.round(cw / (2 * HALF)) % 20]
  // Just off the board: a near miss next to that number
  if (r > R.db) return { name: `M${num}`, number: num, bed: 'Outside', multiplier: 0 }
  const ring = r <= R.si ? 'si' : r <= R.tr ? 'tr' : r <= R.so ? 'so' : 'db'
  const { bed, multiplier } = RING_BED[ring]
  const name = multiplier === 3 ? `T${num}` : multiplier === 2 ? `D${num}` : `S${num}`
  return { name, number: num, bed, multiplier }
}
