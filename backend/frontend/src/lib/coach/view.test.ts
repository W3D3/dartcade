import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '$shared/board'
import { bedPath, boardSegments, type BedRing } from '$lib/details/boardGeometry'
import type { CoachNote, ReviewVisit } from '$shared/coach'
import { NOT_COUNTED } from '$shared/coach/dartClass'
import {
  aimBed,
  bedCentre,
  betterLine,
  likelyMisses,
  coachable,
  coachFilter,
  coachFound,
  dartTone,
  defaultVisit,
  legHeading,
  legSubtitle,
  legSubtitleShort,
  legWhen,
  missLeaves,
  missTags,
  visitTiles,
  vsLine,
  whatHappened,
} from './view'

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
  const d = (name: string, left: number) => ({ name, coords: null, left, bust: false, class: NOT_COUNTED })
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

describe('leg review text', () => {
  const now = new Date(2025, 10, 5, 22, 0)
  const title = {
    opponents: ['Lena'],
    context: '501 · Friday darts · leg 3',
    finishedAt: new Date(2025, 10, 5, 21, 14).toISOString(),
    won: false,
    winnerName: 'Lena',
    winnerDarts: 21,
  }
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
  const dart = (name: string, left: number, bust = false) => ({ name, coords: null, left, bust, class: NOT_COUNTED })

  it('heads the leg and words its subtitles as drawn', () => {
    expect(legHeading(2, ['Lena'])).toBe('Leg 3 vs Lena')
    expect(legHeading(0, [])).toBe('Leg 1 · Solo')
    expect(legSubtitle(title, 18, now)).toBe('501 · double out · Friday darts · today 21:14 · lost, Lena checked out in 21 darts')
    expect(legSubtitle({ ...title, context: 'Ranked 1v1 · leg 1', won: true }, 18, now)).toBe(
      'Ranked 1v1 · double out · today 21:14 · won in 18 darts',
    )
    expect(legSubtitle({ ...title, winnerName: null, winnerDarts: null }, 18, now)).toMatch(/ · no checkout$/)
    expect(legSubtitleShort(title, 18, 71, now)).toBe('501 · today 21:14 · lost · 18 darts · avg 71.0')
    expect(legSubtitleShort({ ...title, context: 'Ranked 1v1 · leg 1' }, 18, null, now)).toBe('Ranked 1v1 · today 21:14 · lost · 18 darts')
    expect(legSubtitleShort({ ...title, winnerName: null, winnerDarts: null }, 18, null, now)).toBe(
      '501 · today 21:14 · no checkout · 18 darts',
    )
  })

  it('opens on the first Mistake, else the first noted visit, else the first', () => {
    const v = (grade: ReviewVisit['grade'], notes: CoachNote[] = []) => ({ grade, notes })
    expect(defaultVisit([v('great'), v('weak', [note({})]), v('mistake')])).toBe(2)
    expect(defaultVisit([v('great'), v('weak', [note({})])])).toBe(1)
    expect(defaultVisit([v('great'), v('ok')])).toBe(0)
  })

  it('lists what each dart left, a bust and a checkout', () => {
    expect(whatHappened({ darts: [dart('S19', 76), dart('T20', 16), dart('S1', 15)] })).toBe('S19 (76 left), T20 (16 left), S1 (15 left).')
    expect(whatHappened({ darts: [dart('S4', 8), dart('S10', 12, true)] })).toBe('S4 (8 left), S10 bust.')
    expect(whatHappened({ darts: [dart('S4', 4), dart('D2', 0)] })).toBe('S4 (4 left), D2 out.')
  })

  it('marks the busting dart, not the last, and the darts kept after it as not counted', () => {
    // 32 left: S16, T20 busts, D8 thrown after it (reviewLeg leaves it at the start)
    expect(whatHappened({ darts: [dart('S16', 16), dart('T20', 32, true), dart('D8', 32)] })).toBe(
      'S16 (16 left), T20 bust, D8 (not counted).',
    )
  })

  it('says what a miss leaves when that is a one-dart finish', () => {
    expect(missLeaves(16, 'S8')).toBe('8 = D4')
    expect(missLeaves(75, '25')).toBe('50 = Bull')
    expect(missLeaves(45, 'S20')).toBeNull()
    expect(missLeaves(51, 'Bull')).toBeNull()
    expect(missLeaves(16, 'Outside')).toBeNull()
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
