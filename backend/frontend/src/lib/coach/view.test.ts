import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '$shared/board'
import { bedPath, boardSegments, type BedRing } from '$lib/details/boardGeometry'
import {
  aimBed,
  bedCentre,
  likelyMisses,
  coachable,
  coachSeats,
  dartTone,
  defaultCoachSeat,
  legsPlayed,
  opponents,
  visitTiles,
} from './view'

const x01 = (config: Record<string, unknown>) => ({ mode: 'x01', config })
const seat = (n: number, bot = false) => ({
  seat: n,
  name: `P${n}`,
  userId: bot ? null : `u${n}`,
  avatar: { kind: 'none' as const },
  throwPosition: n,
  bot: bot ? { level: 1 } : null,
  placement: n + 1,
  stats: {},
  forfeited: false,
})

describe('coachable', () => {
  it('takes X01, straight in, double out, bull 25/50, singles', () => {
    expect(coachable(x01({ startScore: 501, inMode: 'straight', outMode: 'double', bullValue: '25_50', format: 'singles' }))).toBe(true)
  })

  it('takes an old game whose config lacks the newer keys', () => {
    expect(coachable(x01({ startScore: 501 }))).toBe(true)
  })

  it.each([
    ['straight out', { outMode: 'straight' }],
    ['master out', { outMode: 'master' }],
    ['double in', { inMode: 'double' }],
    ['bull 50/50', { bullValue: '50_50' }],
    ['teams', { format: 'teams' }],
  ])('leaves out %s', (_l, config) => {
    expect(coachable(x01(config))).toBe(false)
  })

  it('leaves out other modes', () => {
    expect(coachable({ mode: 'atc', config: {} })).toBe(false)
  })
})

describe('seats', () => {
  it('lists humans only, and defaults to your seat', () => {
    const game = { players: [seat(0, true), seat(1), seat(2)], mySeat: 2 }
    expect(coachSeats(game)).toEqual([1, 2])
    expect(defaultCoachSeat(game)).toBe(2)
  })

  it("defaults to the first human for a spectator, or when you're not a human seat", () => {
    expect(defaultCoachSeat({ players: [seat(0, true), seat(1)], mySeat: null })).toBe(1)
    expect(defaultCoachSeat({ players: [seat(0, true)], mySeat: null })).toBeNull()
  })
})

describe('opponents', () => {
  it('names the other seats', () => {
    expect(opponents({ players: [seat(0), seat(1)], mySeat: 0 })).toBe('P1')
  })

  it('is Solo without another seat, or when none of the seats is yours', () => {
    expect(opponents({ players: [seat(0)], mySeat: 0 })).toBe('Solo')
    expect(opponents({ players: [seat(0), seat(1)], mySeat: null })).toBe('P0, P1')
  })
})

describe('legsPlayed', () => {
  it("adds up every seat's legs won, a seat without the stat counting none", () => {
    expect(legsPlayed({ players: [{ ...seat(0), stats: { legsWon: 3 } }, { ...seat(1), stats: { legsWon: 1 } }, seat(2)] })).toBe(4)
  })
})

describe('visitTiles', () => {
  const d = (name: string, left: number) => ({ name, coords: null, left, bust: false })
  it('greens trebles, reds a single thrown at a double, dashes a miss', () => {
    // Coach-Leg visits 4 and 6: 180 → T20 S5 S20, then 15 → S7 S4 Miss
    expect(visitTiles({ left: 180, darts: [d('T20', 120), d('S5', 115), d('S20', 95)] }).map(t => t.tone)).toEqual([
      'hit',
      'single',
      'single',
    ])
    expect(visitTiles({ left: 15, darts: [d('S7', 8), d('S4', 4), d('Miss', 4)] }).map(t => t.tone)).toEqual(['single', 'missed', 'miss'])
  })
  it('reds a 25 on 50 but not a single on an odd score', () => {
    expect(dartTone('25', 50)).toBe('missed')
    expect(dartTone('S3', 33)).toBe('single')
    expect(dartTone('D16', 32)).toBe('hit')
  })
})

describe('bedCentre', () => {
  it('sits in the named bed', () => {
    for (const name of ['T20', 'D3', 'S11', 'Bull', '25']) {
      const c = bedCentre(name)!
      expect(segmentAt(c.x, c.y).name, name).toBe(name)
    }
  })
  it('has none off the board', () => {
    expect(bedCentre('Miss')).toBeNull()
  })
})

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
