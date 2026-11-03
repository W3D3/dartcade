import { describe, it, expect } from 'vitest'
import { R, segmentAt } from '$shared/board'
import { bedPath, boardSegments, type BedRing } from '$lib/details/boardGeometry'
import type { CoachNote, ReviewVisit } from '$shared/coach'
import { NOT_COUNTED, type DartClass } from '$shared/coach/dartClass'
import {
  aimBed,
  bedCentre,
  betterLine,
  likelyMisses,
  coachable,
  coachFilter,
  coachFound,
  dartLabel,
  dartTone,
  defaultVisit,
  groupingLine,
  groupingPill,
  legGroupingLine,
  legHeading,
  legSubtitle,
  legSubtitleShort,
  legWhen,
  missLeaves,
  missTags,
  visitTiles,
  vsLine,
  whatHappened,
  signedPoints,
  valueLine,
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
  const d = (name: string, left: number) => ({ name, coords: null, left, bust: false, class: NOT_COUNTED, delta: null, closeness: null })
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
  const dart = (name: string, left: number, bust = false) => ({
    name,
    coords: null,
    left,
    bust,
    class: NOT_COUNTED,
    delta: null,
    closeness: null,
  })

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

  it("lists each dart's change in checkout chance and the near-miss credit", () => {
    const valued = (name: string, delta: number, closeness: number | null = null) => ({ ...dart(name, 0), delta, closeness })
    expect(valueLine({ darts: [valued('S20', -4.4), valued('T17', 10.8), valued('S18', 1.5)] })).toBe('S20 −4 · T17 +11 · S18 +2')
    expect(valueLine({ darts: [valued('M16', -3.9, 4.5), valued('M16', -6, 4.5), dart('D8', 32)] })).toBe(
      'M16 −4 · M16 −6 · near misses +9',
    )
    expect(valueLine({ darts: [dart('T20', 441)] })).toBeNull()
    expect(signedPoints(0.4)).toBe('0')
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

describe('dartLabel', () => {
  const cls = (c: Partial<DartClass>): DartClass => ({ ...NOT_COUNTED, ...c })
  const at = (label: string, aimId = label) => ({ target: { aimId, label } })
  /** The miss from the edge of the target's bed, the labels' numbers */
  const off = (edgeMm: number, edgeRadialMm: number, edgeTangentialMm: number) => ({
    distanceMm: edgeMm + 10,
    edgeMm,
    edgeRadialMm,
    edgeTangentialMm,
  })

  it.each<[string, Partial<DartClass>, string]>([
    ['a treble hit', { kind: 'scoringHit', hit: true, ...at('T20'), ...off(2, 1, 1) }, 'T20 ✓'],
    ['a single on scoring', { kind: 'scoringSingle', ...at('T20'), detail: 'outer', ...off(20, 18, 4) }, 'Single 20'],
    [
      'a scoring miss, low and left',
      { kind: 'scoringMiss', ...at('T20'), ...off(14, -10, -9), wedgesOff: -1 },
      'Miss T20 · 14 mm inside, towards 5',
    ],
    [
      'a scoring miss, the larger part first',
      { kind: 'scoringMiss', ...at('T19'), ...off(30, 5, 29) },
      'Miss T19 · 30 mm towards 7, outside',
    ],
    ['a miss on the lower half, clockwise', { kind: 'scoringMiss', ...at('T3'), ...off(20, -6, 19) }, 'Miss T3 · 20 mm towards 19, inside'],
    ['a miss on the lower half, anticlockwise', { kind: 'route', ...at('T3'), ...off(20, 15, -12) }, 'Miss T3 · 20 mm outside, towards 17'],
    ['a miss of the 5 wrapping to the 20', { kind: 'scoringMiss', ...at('T5'), ...off(18, 0, 18) }, 'Miss T5 · 18 mm towards 20'],
    ['a miss of the 20 wrapping to the 5', { kind: 'scoringMiss', ...at('T20'), ...off(18, 0, -18) }, 'Miss T20 · 18 mm towards 5'],
    ['a miss of the 20, clockwise', { kind: 'scoringMiss', ...at('T20'), ...off(18, 0, 18) }, 'Miss T20 · 18 mm towards 1'],
    [
      "a wire miss names the wire's own numbers",
      { kind: 'route', ...at('20/1', 'W20-1'), ...off(25, 0, -25) },
      'Miss 20/1 · 25 mm towards 20',
    ],
    [
      'a scoring miss, parts of half a millimetre or less dropped',
      { kind: 'scoringMiss', ...at('T20'), ...off(22, 0.5, -22) },
      'Miss T20 · 22 mm towards 5',
    ],
    [
      'a miss just past the treble wire reads from the edge, not the 17 mm to its middle',
      {
        kind: 'scoringMiss',
        ...at('T20'),
        distanceMm: 16.7,
        radialMm: 0,
        tangentialMm: 16.7,
        edgeMm: 0.6,
        edgeRadialMm: 0,
        edgeTangentialMm: 0.6,
      },
      'Miss T20 · 1 mm towards 1',
    ],
    ['a small miss on both sides', { kind: 'scoringMiss', ...at('T20'), ...off(2.2, -1.4, 1.7) }, 'Miss T20 · 2 mm towards 1, inside'],
    [
      'a scoring miss without a camera position',
      { kind: 'scoringMiss', ...at('T20'), ...off(40, -40, 2), estimated: true },
      'Miss T20 · est.',
    ],
    ['a route hit', { kind: 'route', hit: true, ...at('S20', 'SO20'), plannedLeave: 40, actualLeave: 40 }, 'Aimed S20 ✓'],
    ['a route miss', { kind: 'route', ...at('T19'), ...off(12, 0, -12) }, 'Miss T19 · 12 mm towards 3'],
    ['a split hit', { kind: 'split', hit: true, ...at('S6', 'SO6'), plannedLeave: 32, actualLeave: 32 }, 'Split → D16 ✓'],
    ['a split miss', { kind: 'split', ...at('S6', 'SO6'), plannedLeave: 32, actualLeave: 25 }, 'Split → D16 ✗'],
    ['a split to the bull', { kind: 'split', hit: true, ...at('S10', 'SO10'), plannedLeave: 50, actualLeave: 50 }, 'Split → Bull ✓'],
    ['a double hit', { kind: 'double', hit: true, ...at('D16'), plannedLeave: 0, actualLeave: 0 }, 'D16 ✓'],
    ['a double inside', { kind: 'double', ...at('D16'), detail: 'inside', ...off(15, -15, 0) }, 'D16 inside'],
    ['a double outside', { kind: 'double', ...at('D16'), detail: 'outside', ...off(9, 9, 1) }, 'D16 outside'],
    ['a typed miss at a double', { kind: 'double', ...at('D16'), detail: 'outside', estimated: true }, 'D16 outside · est.'],
    ['a typed single at a double', { kind: 'double', ...at('D16'), detail: 'inside', ...off(15, -15, 0), estimated: true }, 'D16 inside'],
    ['a double wide', { kind: 'double', ...at('D16'), detail: 'wide', ...off(52, 0, 52) }, 'D16 wide · 52 mm towards 8'],
    [
      'a double wide and inside',
      { kind: 'double', ...at('D16'), detail: 'wide', ...off(50, -20, -45) },
      'D16 wide · 50 mm towards 7, inside',
    ],
    [
      'a double wide without a camera position',
      { kind: 'double', ...at('D16'), detail: 'wide', ...off(50, 0, 50), estimated: true },
      'D16 wide · est.',
    ],
    ['a bull hit', { kind: 'bull', hit: true, ...at('Bull') }, 'Bull ✓'],
    ['the 25 for the bull', { kind: 'bull', ...at('Bull'), detail: 'sb', ...off(11, 11, 0) }, '25 (aimed Bull)'],
    ['the bull for the 25', { kind: 'bull', ...at('25'), detail: 'db', ...off(11, -11, 0) }, 'Bull (aimed 25)'],
    ['a bull miss into a single', { kind: 'bull', ...at('Bull'), ...off(31.4, 31.4, 0) }, 'Miss Bull · 31 mm'],
    ['a bust-back that busted', { kind: 'bustBack', hit: true, plannedLeave: 57, actualLeave: 57 }, 'Bust-back ✓'],
    ["a bust-back that didn't", { kind: 'bustBack', ...at('T20'), plannedLeave: 57, actualLeave: 3 }, 'Bust-back missed'],
    ['a bust', { kind: 'bust', ...at('D16') }, 'Bust'],
    ['a wild dart', { kind: 'wild' }, 'Wild'],
    ['a dart after the bust', {}, 'Not counted'],
  ])('%s', (_, c, label) => {
    expect(dartLabel(cls(c))).toBe(label)
  })
})

describe('groupingLine', () => {
  const t20 = { ...NOT_COUNTED, kind: 'scoringSingle' as const, target: { aimId: 'T20', label: 'T20' } }
  const darts = [
    { name: 'S20', coords: null, left: 481, bust: false, class: t20, delta: null, closeness: null },
    { name: 'S20', coords: { x: 0, y: 0.7 }, left: 461, bust: false, class: t20, delta: null, closeness: null },
  ]
  const g = { darts: 2, spreadMm: 6.4, offsetMm: 2.2, edgeMm: 1.4, rating: 75.3, expectedSpreadMm: 8.6, comment: null }

  it("words a visit's grouping, its target from a placed dart", () => {
    expect(groupingLine({ darts, tag: 'scoring', grouping: g })).toBe('Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm · rating 75')
    expect(groupingLine({ darts, tag: 'setup', grouping: g })).toBe('Grouping 6 mm (yours: ~9 mm) · 2 mm off T20 · edge 1 mm')
  })
  it('leaves the spread out without a shared target, and is null without a grouping', () => {
    expect(groupingLine({ darts, tag: 'scoring', grouping: { ...g, spreadMm: null, offsetMm: null } })).toBe('edge 1 mm · rating 75')
    expect(groupingLine({ darts, tag: 'scoring', grouping: null })).toBeNull()
  })
  it("adds the leg's grouping to the scoring line, nothing without one", () => {
    expect(legGroupingLine({ spreadMm: 12.2, edgeMm: 3.6 })).toBe(' · grouping 12 mm · edge 4 mm')
    expect(legGroupingLine({ spreadMm: null, edgeMm: 3.6 })).toBe(' · edge 4 mm')
    expect(legGroupingLine({ spreadMm: null, edgeMm: null })).toBe('')
  })
})

describe('groupingPill', () => {
  it("pills the server's comment: Great and Good in the grade tones, Scattered weak, null without one", () => {
    expect(groupingPill({ comment: { level: 'great', text: 'Great grouping' } })).toEqual({
      label: 'Great grouping',
      cls: 'bg-accent text-accent-fg',
    })
    expect(groupingPill({ comment: { level: 'good', text: 'Good grouping' } })).toEqual({
      label: 'Good grouping',
      cls: 'bg-good/15 text-good',
    })
    expect(groupingPill({ comment: { level: 'scattered', text: 'Scattered' } })).toEqual({
      label: 'Scattered',
      cls: 'bg-gold/15 text-gold',
    })
    expect(groupingPill({ comment: null })).toBeNull()
    expect(groupingPill(null)).toBeNull()
  })
})
