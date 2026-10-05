import type { Segment } from './api/game-ws'

export type { Segment }
const SEGS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]
const R = { bull50: 0.037, bull25: 0.094, si: 0.582, tr: 0.629, so: 0.953, db: 1.0 }

const MULT: Record<string, 1 | 2 | 3> = { S: 1, D: 2, T: 3 }

export function parseLabel(label: string): { mult: 0 | 1 | 2 | 3; num: number; score: number } {
  if (label === 'Miss') return { mult: 0, num: 0, score: 0 }
  if (label === 'Bull') return { mult: 2, num: 25, score: 50 }
  if (label === '25') return { mult: 1, num: 25, score: 25 }
  const mult = MULT[label[0]] ?? 1
  const num = parseInt(label.slice(1), 10)
  return { mult, num, score: mult * num }
}

/** SVG-space coords (y increases downward, r=1 at double wire). */
export function labelPos(label: string): { x: number; y: number } | null {
  if (label === 'Miss') return null
  if (label === 'Bull') return { x: 0, y: 0 }
  if (label === '25') return { x: 0, y: -(R.bull50 + R.bull25) / 2 }
  const { mult, num } = parseLabel(label)
  const si = SEGS.indexOf(num)
  if (si < 0) return null
  const angle = Math.PI / 2 - si * (Math.PI / 10)
  const r = mult === 3 ? (R.si + R.tr) / 2 : mult === 2 ? (R.so + R.db) / 2 : (R.tr + R.so) / 2
  return { x: r * Math.cos(angle), y: -(r * Math.sin(angle)) }
}

export function nearbyPicks(label: string): string[] {
  const { num } = parseLabel(label)
  const out: string[] = []
  const add = (l: string) => {
    if (l !== label && !out.includes(l)) out.push(l)
  }
  if (num === 25) {
    add('Bull')
    add('25')
    add('S20')
    add('S3')
    add('S6')
    add('S11')
    return [...out.slice(0, 6), 'Miss']
  }
  const i = SEGS.indexOf(num)
  const L = SEGS[(i + 19) % 20],
    Ri = SEGS[(i + 1) % 20]
  const ring = label[0]
  ;['S', 'T', 'D'].forEach(k => add(`${k}${num}`))
  add(`${ring}${L}`)
  add(`${ring}${Ri}`)
  add(`S${L}`)
  add(`S${Ri}`)
  return [...out.slice(0, 6), 'Miss']
}

type OutMode = 'straight' | 'double' | 'master'

export function checkoutHint(remaining: number, outMode: OutMode = 'double', dartsLeft = 3): string[] | null {
  if (remaining < 1 || remaining > 170) return null
  const n = Math.min(dartsLeft, 3)

  // Valid finishing darts
  const finishMap = new Map<number, string>()
  if (outMode === 'straight') {
    for (let k = 20; k >= 1; k--) {
      finishMap.set(3 * k, `T${k}`)
      finishMap.set(2 * k, `D${k}`)
      finishMap.set(k, `S${k}`)
    }
    finishMap.set(50, 'Bull')
    finishMap.set(25, '25')
  } else if (outMode === 'master') {
    for (let k = 20; k >= 1; k--) {
      finishMap.set(3 * k, `T${k}`)
      finishMap.set(2 * k, `D${k}`)
    }
    finishMap.set(50, 'Bull')
  } else {
    // double out
    for (let k = 20; k >= 1; k--) finishMap.set(2 * k, `D${k}`)
    finishMap.set(50, 'Bull')
  }

  // 1-dart finish
  const one = finishMap.get(remaining)
  if (n >= 1 && one) return [one]

  // Scoring darts (preferred order: triples high→low skipping T1, then singles, then bull)
  // T1 omitted: S3 scores the same and is always the saner suggestion
  const scoring: { l: string; v: number }[] = []
  for (let k = 20; k >= 2; k--) scoring.push({ l: `T${k}`, v: 3 * k })
  for (let k = 20; k >= 1; k--) scoring.push({ l: `S${k}`, v: k })
  scoring.push({ l: '25', v: 25 }, { l: 'Bull', v: 50 })

  // 2-dart finish
  if (n >= 2) {
    for (const d of scoring) {
      const rest = remaining - d.v
      const fin = finishMap.get(rest)
      if (rest >= 1 && fin) return [d.l, fin]
    }
  }

  // 3-dart finish
  if (n >= 3) {
    for (const d1 of scoring) {
      const r1 = remaining - d1.v
      if (r1 < 2) continue
      for (const d2 of scoring) {
        const r2 = r1 - d2.v
        const fin = finishMap.get(r2)
        if (r2 >= 1 && fin) return [d1.l, d2.l, fin]
      }
    }
  }

  return null
}

/** A picker label (T20, D5, S3, 25, Bull, Miss) as the segment Board Manager would report. */
export function labelToSegment(label: string): Segment {
  if (label === 'Bull') return { name: 'Bull', number: 50, bed: 'Double', multiplier: 1 }
  if (label === '25') return { name: '25', number: 25, bed: 'Single', multiplier: 1 }
  if (label === 'Miss') return { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }
  const { mult, num } = parseLabel(label)
  return { name: label, number: num, bed: mult === 3 ? 'Triple' : mult === 2 ? 'Double' : 'SingleOuter', multiplier: mult }
}

/** Board positions (SVG coords, y down) for player markers on segments; markers on the
 *  same segment are spread along the wedge (bull: sideways), squeezed to stay on the board. */
export function markerPositions(segments: number[]): { x: number; y: number }[] {
  const mid = (R.tr + R.so) / 2
  const seen = new Map<number, number>()
  const total = new Map<number, number>()
  segments.forEach(s => total.set(s, (total.get(s) ?? 0) + 1))
  return segments.map(s => {
    const n = total.get(s) ?? 1
    const k = seen.get(s) ?? 0
    seen.set(s, k + 1)
    // Up to 0.18 apart, but never past r 0.95 (the double ring)
    const step = n > 1 ? Math.min(0.18, 0.6 / (n - 1)) : 0
    const centre = s === 25 || s === 50 ? 0 : Math.min(mid, 0.95 - (step * (n - 1)) / 2)
    const off = centre + (k - (n - 1) / 2) * step
    if (s === 25 || s === 50) return { x: off, y: 0 }
    // Crowded: zigzag a few degrees across the wedge so neighbours overlap less
    const a = Math.PI / 2 - SEGS.indexOf(s) * (Math.PI / 10) + (n > 1 && step < 0.17 ? (k % 2 ? 0.08 : -0.08) : 0)
    return { x: off * Math.cos(a), y: -off * Math.sin(a) }
  })
}
