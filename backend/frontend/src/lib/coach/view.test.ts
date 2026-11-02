import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '$shared/board'
import { bedPath, boardSegments, type BedRing } from '$lib/details/boardGeometry'
import { aimBed, bedCentre, likelyMisses, coachable, coachFilter, coachFound, dartTone, legWhen, visitTiles, vsLine } from './view'

const x01 = (config: Record<string, unknown>) => ({ mode: 'x01', config })

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

describe('vsLine', () => {
  it('names the opponents, or Solo without one', () => {
    expect(vsLine(['Lena'])).toBe('vs Lena')
    expect(vsLine(['Max', 'Sophie'])).toBe('vs Max, Sophie')
    expect(vsLine([])).toBe('Solo')
  })
})

describe('coachFilter', () => {
  it('reads the filter from the querystring', () => {
    expect(coachFilter('filter=lost')).toBe('lost')
    expect(coachFilter('x=1&filter=missedDoubles')).toBe('missedDoubles')
  })

  it('falls back to all legs when missing or unknown', () => {
    expect(coachFilter(undefined)).toBe('all')
    expect(coachFilter('')).toBe('all')
    expect(coachFilter('filter=nope')).toBe('all')
  })
})

describe('legWhen', () => {
  // Wednesday 5 Nov 2025, evening
  const now = new Date(2025, 10, 5, 22, 0)
  const at = (day: number, h = 21, m = 14) => new Date(2025, 10, day, h, m).toISOString()

  it('gives the time today, then Yesterday', () => {
    expect(legWhen(at(5), now)).toBe('Today 21:14')
    expect(legWhen(at(4), now)).toBe('Yesterday')
  })

  it('gives the weekday from 2 to 6 days ago, the date beyond', () => {
    expect(legWhen(at(3), now)).toBe('Mon')
    expect(legWhen(new Date(2025, 9, 30, 21, 0).toISOString(), now)).toBe('Thu')
    expect(legWhen(new Date(2025, 9, 29, 21, 0).toISOString(), now)).toBe('29 Oct')
  })
})

describe('coachFound', () => {
  const row = { missedDoubles: 0, badSetups: 0, lowVisits: 0, clean: false }

  it('pills missed doubles red, then bad setups and low visits yellow, with singulars', () => {
    expect(coachFound({ ...row, missedDoubles: 2, badSetups: 1, lowVisits: 4 })).toEqual([
      { text: '2 missed doubles', tone: 'red' },
      { text: '1 bad setup', tone: 'yellow' },
      { text: '4 low visits', tone: 'yellow' },
    ])
    expect(coachFound({ ...row, missedDoubles: 1, lowVisits: 1 })).toEqual([
      { text: '1 missed double', tone: 'red' },
      { text: '1 low visit', tone: 'yellow' },
    ])
  })

  it('shows a clean leg as its green pill alone, even with a lone missed double', () => {
    expect(coachFound({ ...row, clean: true })).toEqual([{ text: 'Clean leg', tone: 'green' }])
    expect(coachFound({ ...row, missedDoubles: 1, clean: true })).toEqual([{ text: 'Clean leg', tone: 'green' }])
  })

  it('is empty with nothing found', () => {
    expect(coachFound(row)).toEqual([])
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
