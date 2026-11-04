import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '$shared/board'
import { bedPath, boardSegments, type BedRing } from '$lib/details/boardGeometry'
import type { CoachNote } from '$shared/coach'
import { NOT_COUNTED } from '$shared/coach/dartClass'
import { aimBed, betterLine, edgeLineEnd, likelyMisses, missLeaves, missTags } from './board'

/** The segment just inside each end of a bed, halfway through its ring */
const ends = (b: BedRing) => {
  const r = (b.r0 + b.r1) / 2
  return [b.from + 0.01, b.to - 0.01].map(a => segmentAt(r * Math.cos(a), r * Math.sin(a)).name)
}

describe('aimBed', () => {
  it('tells the outer single from the inner one', () => {
    expect(aimBed('SO17')).toMatchObject({ r0: R.tr, r1: R.so })
    expect(aimBed('SI17')).toMatchObject({ r0: R.bull25, r1: R.si })
    expect(ends(aimBed('SO17')!)).toEqual(['S17', 'S17'])
    expect(ends(aimBed('T20')!)).toEqual(['T20', 'T20'])
    expect(ends(aimBed('D8')!)).toEqual(['D8', 'D8'])
  })
  it("covers a wire's two outer-single halves", () => {
    const b = aimBed('W20-1')!
    expect(b).toMatchObject({ r0: R.tr, r1: R.so })
    expect(ends(b)).toEqual(['S1', 'S20'])
  })
  it('rings the bulls whole', () => {
    expect(aimBed('Bull')).toEqual({ r0: 0, r1: R.bull50, from: 0, to: 2 * Math.PI })
    expect(aimBed('25')).toEqual({ r0: R.bull50, r1: R.bull25, from: 0, to: 2 * Math.PI })
    expect(aimBed('X1')).toBeNull()
  })
})

describe('bedPath', () => {
  it("draws a number's bed as the board does", () => {
    // boardSegments: per number its inner single, treble, outer single, double
    expect(bedPath(aimBed('T20')!)).toBe(boardSegments()[1].d)
  })
  it('draws the 25 as two circles (evenodd leaves the bull out), the bull as one', () => {
    const ring = bedPath(aimBed('25')!)
    expect(ring.match(/M/g)).toHaveLength(2)
    expect(ring).toContain(`A${R.bull25 * 170} `)
    expect(ring).toContain(`A${R.bull50 * 170} `)
    expect(bedPath(aimBed('Bull')!).match(/M/g)).toHaveLength(1)
  })
})

describe('likelyMisses', () => {
  const labels = (id: string) => likelyMisses(id).map(m => m.label)
  it('names the beds around each aim', () => {
    expect(labels('T20')).toEqual(['S20', 'S5', 'S1'])
    expect(labels('D16')).toEqual(['S16', 'Outside'])
    expect(labels('SO19')).toEqual(['S3', 'S7'])
    expect(labels('SI19')).toEqual(['S3', 'S7'])
    expect(labels('Bull')).toEqual(['25'])
    expect(labels('25')).toEqual(['Bull'])
    expect(labels('W20-1')).toEqual(['S20', 'S1'])
  })
  it('puts each tag in its bed, Outside off the board', () => {
    for (const id of ['T20', 'SI19', 'W20-1']) for (const m of likelyMisses(id)) expect(segmentAt(m.x, m.y).name).toBe(m.label)
    const out = likelyMisses('D16')[1]
    expect(segmentAt(out.x, out.y).bed).toBe('Outside')
  })
})

describe('the better aim', () => {
  const note = (n: Partial<CoachNote>): CoachNote => ({
    leg: 2,
    visit: 8,
    dart: 2,
    left: 16,
    darts: 1,
    thrown: 'S1',
    better: 'D8',
    betterAimId: 'D8',
    cost: 0.3,
    reason: null,
    book: ['D8'],
    tip: false,
    ...n,
  })

  it('says what a miss leaves when that is a one-dart finish', () => {
    expect(missLeaves(16, 8)).toBe('8 = D4')
    expect(missLeaves(75, 25)).toBe('50 = Bull')
    expect(missLeaves(45, 20)).toBeNull()
    expect(missLeaves(51, 50)).toBeNull()
    expect(missLeaves(16, 0)).toBeNull()
  })

  it('words the better aim with what its misses leave, and tags them on the board', () => {
    expect(betterLine(note({}))).toBe('with 16 left and 1 dart, throw at D8 (blue). A miss into S8 still leaves 8 = D4.')
    expect(missTags(note({})).map(t => t.label)).toEqual(['S8 · 8 = D4', 'Outside'])
    expect(betterLine(note({ left: 37, darts: 2, better: 'S12', betterAimId: 'SO12' }))).toBe(
      'with 37 left and 2 darts, throw at S12 (blue). A miss into S9 still leaves 28 = D14. A miss into S5 still leaves 32 = D16.',
    )
    expect(betterLine(note({ left: 47, darts: 2, better: 'S20', betterAimId: 'SO20' }))).toBe(
      'with 47 left and 2 darts, throw at S20 (blue).',
    )
  })
})

describe('edgeLineEnd', () => {
  const miss = { mm: 20, radialMm: 20, tangentialMm: 0, edgeMm: 8, edgeRadialMm: 8, edgeTangentialMm: 0, wedgesOff: 0 }
  const missed = (coords: { x: number; y: number } | null, hit = false) => ({
    coords,
    class: { ...NOT_COUNTED, kind: 'double' as const, detail: null, hit, target: { aimId: 'D20', label: 'D20' }, miss: hit ? null : miss },
  })
  it("ends on the target bed's nearest point, not its middle", () => {
    // Straight out past D20: the outer double wire on the 20's centre line
    const end = edgeLineEnd(missed({ x: 0, y: 1.05 }))
    expect(end?.x).toBeCloseTo(0, 9)
    expect(end?.y).toBeCloseTo(R.db, 9)
  })
  it('draws none for a hit or a dart without a position', () => {
    expect(edgeLineEnd(missed({ x: 0, y: 0.98 }, true))).toBeNull()
    expect(edgeLineEnd(missed(null))).toBeNull()
  })
})
