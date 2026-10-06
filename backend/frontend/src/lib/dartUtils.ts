import type { Segment } from './api/game-ws'
import { R, SEGS } from '$shared/board.js'

export type { Segment }

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
  const si = (SEGS as readonly number[]).indexOf(num)
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
  // A missed dart has no neighbours: offer the usual targets
  if (num === 0) return ['S20', 'T20', 'D20', 'S19', 'T19', '25', 'Bull']
  if (num === 25) {
    add('Bull')
    add('25')
    add('S20')
    add('S3')
    add('S6')
    add('S11')
    return [...out.slice(0, 6), 'Miss']
  }
  const i = (SEGS as readonly number[]).indexOf(num)
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
    const a = Math.PI / 2 - (SEGS as readonly number[]).indexOf(s) * (Math.PI / 10) + (n > 1 && step < 0.17 ? (k % 2 ? 0.08 : -0.08) : 0)
    return { x: off * Math.cos(a), y: -off * Math.sin(a) }
  })
}
