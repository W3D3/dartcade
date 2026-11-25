import { describe, it, expect } from 'vitest'
import type { ChallengeGame, Checkout, Seg, Visit } from '../progression/challenges.js'
import { ACHIEVEMENTS, crossings, tierOf, xpForTiers } from '../shared/achievements.js'
import { achievementHits, biggestTierFirst } from './rules.js'

const T20: Seg = { n: 20, m: 3 }
const BULL: Seg = { n: 25, m: 2 }
const D = (n: number): Seg => ({ n, m: 2 })
let visitNo = 0
const visit = (scored: number, segs: Seg[] = [], bust = false, leg = 0): Visit => ({ visit: visitNo++, leg, segs, scored, bust })
const checkout = (value: number, last: Seg, prev?: Seg): Checkout => ({
  last,
  value,
  darts: 9,
  startScore: 501,
  visit: 0,
  dart: 2,
  ...(prev && { prev }),
})
const game = (over: Partial<ChallengeGame>): ChallengeGame => ({
  id: 'g',
  mode: 'x01',
  qualifies: true,
  won: true,
  boardDarts: 30,
  visits: [],
  checkouts: [],
  legResults: [],
  maxDeficit: 0,
  average: null,
  ...over,
})

describe('achievementHits', () => {
  const cases: [string, Partial<ChallengeGame>, Record<string, number>][] = [
    ['two 180s', { visits: [visit(180, [T20, T20, T20]), visit(180, [T20, T20, T20]), visit(60)] }, { 'x01.180': 2, 'x01.tonPlus': 2 }],
    ['a bust of 180 does not count', { visits: [visit(180, [T20, T20, T20], true)] }, {}],
    ['170 out on the bull', { checkouts: [checkout(170, BULL, T20)] }, { 'x01.bigFish': 1, 'x01.tonPlusOut': 1, 'x01.bullFinish': 1 }],
    [
      '26 and bullseyes',
      {
        visits: [
          visit(26, [
            { n: 20, m: 1 },
            { n: 5, m: 1 },
            { n: 1, m: 1 },
          ]),
          visit(100, [BULL, BULL, { n: 0, m: 0 }]),
        ],
      },
      { 'x01.bedAndBreakfast': 1, 'x01.bullseye': 2, 'x01.tonPlus': 1 },
    ],
    ['D16 D20 out', { checkouts: [checkout(72, D(20), D(16))] }, { 'x01.doubleTheDoubles': 1 }],
    ['a double after a single is not two doubles', { checkouts: [checkout(41, D(20), { n: 1, m: 1 })] }, {}],
    ['a leg won on D1', { checkouts: [checkout(2, D(1), { n: 1, m: 1 })] }, { 'x01.madhouse': 1 }],
    ['a game that does not qualify', { qualifies: false, visits: [visit(180)] }, {}],
    ['another mode', { mode: 'atc', visits: [visit(180)] }, {}],
    [
      '121 counts checkouts and bulls',
      { mode: 'p121', checkouts: [checkout(121, BULL, T20)], visits: [visit(0, [BULL])] },
      { 'x01.tonPlusOut': 1, 'x01.bullFinish': 1, 'x01.bullseye': 1 },
    ],
    ['121 has no visit scores: no 180, ton or 26', { mode: 'p121', visits: [visit(180, [T20, T20, T20]), visit(26)] }, {}],
  ]
  it.each(cases)('%s', (_name, over, expected) => {
    expect(Object.fromEntries([...achievementHits(game(over))].map(([id, hits]) => [id, hits.length]))).toEqual(expected)
  })

  it('names the visit of each hit: its leg, the player’s visit number in the leg, its darts and the dart that counted', () => {
    const miss = { n: 0, m: 0 }
    const visits = [visit(60, [T20, miss, miss], false, 0), visit(180, [T20, T20, T20], false, 1), visit(50, [miss, BULL, miss], false, 1)]
    const hits = achievementHits(game({ visits }))
    expect(hits.get('x01.180')).toEqual([
      { visit: visits[1].visit, leg: 1, legVisit: 1, darts: [T20, T20, T20].map(s => ({ number: s.n, multiplier: s.m })), dart: null },
    ])
    expect(hits.get('x01.bullseye')).toEqual([expect.objectContaining({ visit: visits[2].visit, leg: 1, legVisit: 2, dart: 1 })])
  })

  it('has no leg in a game without legs (121)', () => {
    const v = visit(0, [BULL])
    expect(achievementHits(game({ mode: 'p121', visits: [v] })).get('x01.bullseye')).toEqual([
      { visit: v.visit, leg: null, legVisit: 1, darts: [{ number: 25, multiplier: 2 }], dart: 0 },
    ])
  })
})

describe('catalogue', () => {
  it('has rising thresholds and a unique id each', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length)
    for (const a of ACHIEVEMENTS) expect([...a.thresholds].sort((x, y) => x - y)).toEqual([...a.thresholds])
  })
  it('turns a count into a tier and the XP of the tiers crossed', () => {
    const t = { thresholds: [1, 5, 10, 20, 100] }
    expect([0, 1, 4, 5, 19, 20, 500].map(c => tierOf(t, c))).toEqual([0, 1, 1, 2, 3, 4, 5])
    expect(xpForTiers(0, 2)).toBe(250)
    expect(xpForTiers(2, 2)).toBe(0)
  })
  it('gives each tier crossed the add that reached it', () => {
    const t = { thresholds: [1, 5, 10, 20, 100] }
    expect(crossings(t, 3, ['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toEqual([
      { tier: 2, by: 'b' },
      { tier: 3, by: 'g' },
    ])
    expect(crossings(t, 5, ['a'])).toEqual([])
    expect(crossings(t, 0, ['a'])).toEqual([{ tier: 1, by: 'a' }])
  })
})

describe('biggestTierFirst', () => {
  it('puts the highest tier first and keeps the catalogue order between equals', () => {
    const list = [
      { id: 'a', tier: 1 },
      { id: 'b', tier: 3 },
      { id: 'c', tier: 1 },
      { id: 'd', tier: 2 },
    ]
    expect(biggestTierFirst(list).map(u => u.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})
