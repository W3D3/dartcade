import { describe, it, expect } from 'vitest'
import { emptyHistory, trackVisits, threeDartAvg, type VisitHistory } from '../visitHistory.js'

type G = Record<string, unknown>
const dart = (score: number) => ({ segment: { name: 'S' + score }, score })
const x01 = (o: { scores: number[]; totalVisits: number[]; legs?: number[]; cp: number; darts?: number[]; bust?: boolean }): G => ({
  scores: o.scores, totalVisits: o.totalVisits, legs: o.legs ?? o.scores.map(() => 0), currentPlayer: o.cp,
  currentVisitDarts: (o.darts ?? []).map(dart), bustThisVisit: o.bust ?? false, totalDarts: o.scores.map(() => 0),
})
const run = (games: G[]) => games.reduce<VisitHistory>((h, g) => trackVisits(h, g as any), emptyHistory())

describe('trackVisits (X01)', () => {
  it('records scored and left when a visit is taken out', () => {
    const h = run([
      x01({ scores: [501, 501], totalVisits: [0, 0], cp: 0 }),
      x01({ scores: [441, 501], totalVisits: [0, 0], cp: 0, darts: [60] }),
      x01({ scores: [381, 501], totalVisits: [0, 0], cp: 0, darts: [60, 60] }),
      x01({ scores: [381, 501], totalVisits: [1, 0], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([{ scored: 120, left: 381, darts: 2, bust: false }])
    expect(h.all[0]).toEqual(h.leg[0])
    expect(h.leg[1]).toEqual([])
    expect(h.start[1]).toBe(501)
  })

  it('records a bust as 0 scored with the score unchanged', () => {
    const h = run([
      x01({ scores: [40, 501], totalVisits: [3, 3], cp: 0 }),
      x01({ scores: [40, 501], totalVisits: [3, 3], cp: 0, darts: [60], bust: true }),
      x01({ scores: [40, 501], totalVisits: [4, 3], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([{ scored: 0, left: 40, darts: 1, bust: true }])
  })

  it('records the checkout and starts a fresh leg board', () => {
    const h = run([
      x01({ scores: [501, 501], totalVisits: [0, 0], cp: 1 }),
      x01({ scores: [501, 441], totalVisits: [0, 0], cp: 1, darts: [60] }),
      x01({ scores: [501, 441], totalVisits: [0, 1], cp: 0 }),
      x01({ scores: [40, 441], totalVisits: [5, 5], cp: 0 }),
      x01({ scores: [0, 441], totalVisits: [5, 5], cp: 0, darts: [40] }),
      x01({ scores: [501, 501], totalVisits: [6, 5], legs: [1, 0], cp: 1 }),
    ])
    expect(h.leg).toEqual([[], []])
    expect(h.all[0].at(-1)).toEqual({ scored: 40, left: 0, darts: 1, bust: false })
    expect(h.all[1]).toEqual([{ scored: 60, left: 441, darts: 1, bust: false }])
  })

  it('skips a visit that was already under way when the page loaded', () => {
    const h = run([
      x01({ scores: [441, 501], totalVisits: [0, 0], cp: 0, darts: [60] }),
      x01({ scores: [441, 501], totalVisits: [1, 0], cp: 1 }),
    ])
    expect(h.leg[0]).toEqual([])
    expect(h.start[1]).toBe(501)
  })

  it('an undone dart resets the start of the visit', () => {
    const h = run([
      x01({ scores: [501], totalVisits: [0], cp: 0 }),
      x01({ scores: [441], totalVisits: [0], cp: 0, darts: [60] }),
      x01({ scores: [501], totalVisits: [0], cp: 0 }),
    ])
    expect(h.start[0]).toBe(501)
  })
})

describe('trackVisits dart counts', () => {
  it('an empty turn counts the three misses the server recorded', () => {
    const h = run([
      { ...x01({ scores: [121, 301], totalVisits: [1, 1], cp: 0 }), totalDarts: [3, 3] },
      { ...x01({ scores: [121, 301], totalVisits: [2, 1], cp: 1 }), totalDarts: [6, 3] },
    ])
    expect(h.all[0]).toEqual([{ scored: 0, left: 121, darts: 3, bust: false }])
  })

  it('counts darts missed between snapshots within a visit', () => {
    const h = run([
      { ...x01({ scores: [301], totalVisits: [0], cp: 0 }), totalDarts: [0] },
      { ...x01({ scores: [241], totalVisits: [0], cp: 0, darts: [60] }), totalDarts: [1] },
      { ...x01({ scores: [181], totalVisits: [0], cp: 0, darts: [60, 60] }), totalDarts: [2] },
      // reconnect: the third dart and the takeout arrive together
      { ...x01({ scores: [121], totalVisits: [1], cp: 0 }), totalDarts: [3] },
    ])
    expect(h.all[0]).toEqual([{ scored: 180, left: 121, darts: 3, bust: false }])
  })
})

describe('trackVisits after a gap (reconnect)', () => {
  it('records nothing when another player checked out while disconnected', () => {
    const h = run([
      x01({ scores: [301, 40], totalVisits: [5, 5], cp: 0 }),
      x01({ scores: [301, 301], totalVisits: [6, 6], legs: [0, 1], cp: 0 }),
    ])
    expect(h.all).toEqual([[], []])
    expect(h.leg).toEqual([[], []])
    expect(h.start[0]).toBe(301)
  })

  it('does not merge visits missed while disconnected', () => {
    const h = run([
      x01({ scores: [301], totalVisits: [0], cp: 0 }),
      x01({ scores: [200], totalVisits: [2], cp: 0 }),
    ])
    expect(h.all[0]).toEqual([])
    expect(h.start[0]).toBe(200)
  })
})

describe('trackVisits (ATC)', () => {
  it('records targets advanced per visit', () => {
    const atc = (hitCounts: number[], totalVisits: number[], cp: number, darts: number[] = []): G =>
      ({ hitCounts, totalVisits, currentPlayer: cp, currentVisitDarts: darts.map(dart), totalDarts: hitCounts.map(() => 0) })
    const h = run([
      atc([4, 2], [3, 3], 0),
      atc([6, 2], [3, 3], 0, [1, 1, 0]),
      atc([6, 2], [4, 3], 1),
    ])
    expect(h.leg[0]).toEqual([{ scored: 2, left: 0, darts: 3, bust: false }])
    expect(h.start[1]).toBe(2)
  })
})

describe('threeDartAvg', () => {
  it('is points per dart times three', () => {
    expect(threeDartAvg([{ scored: 60, left: 0, darts: 3, bust: false }, { scored: 45, left: 0, darts: 3, bust: false }])).toBe(52.5)
  })
  it('counts the darts of short visits', () => {
    expect(threeDartAvg([{ scored: 40, left: 0, darts: 1, bust: false }])).toBe(120)
  })
  it('is null without darts', () => {
    expect(threeDartAvg([])).toBeNull()
  })
})
