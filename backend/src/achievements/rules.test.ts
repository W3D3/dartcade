import { describe, it, expect } from 'vitest'
import type { ChallengeGame, Checkout, Seg, Visit } from '../progression/challenges.js'
import { ACHIEVEMENTS, tierOf, xpForTiers } from '../shared/achievements.js'
import { achievementDeltas, biggestTierFirst } from './rules.js'

const T20: Seg = { n: 20, m: 3 }
const BULL: Seg = { n: 25, m: 2 }
const D = (n: number): Seg => ({ n, m: 2 })
const visit = (scored: number, segs: Seg[] = [], bust = false): Visit => ({ leg: 0, segs, scored, bust })
const checkout = (value: number, last: Seg, prev?: Seg): Checkout => ({ last, value, darts: 9, startScore: 501, ...(prev && { prev }) })
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

describe('achievementDeltas', () => {
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
    expect(Object.fromEntries(achievementDeltas(game(over)))).toEqual(expected)
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
