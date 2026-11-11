import { describe, expect, it } from 'vitest'
import { advance, roundName, roundRobin, seedEntries, singleElimination, standings, type Match } from './bracket.js'

const field = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`)
const seedOf = (entry: string) => Number(entry.slice(1))

/** Plays every open match until none is left; the better seed wins first to `firstTo`. */
function playOut(start: Match[]): Match[] {
  let matches = start
  for (;;) {
    const open = matches.find(m => !m.result && m.sides.every(s => s.entry !== null))
    if (!open) return matches
    const [a, b] = open.sides.map(s => seedOf(s.entry!))
    const winner = a < b ? 0 : 1
    const legs: [number, number] = winner === 0 ? [open.firstTo, 0] : [0, open.firstTo]
    matches = advance(matches, open.key, { outcome: 'played', winner, legs })
  }
}

describe('seedEntries', () => {
  const entries = [
    { id: 'a', rating: 1200 },
    { id: 'b', rating: null },
    { id: 'c', rating: 1500 },
    { id: 'd', rating: 1200 },
    { id: 'e', rating: null },
  ]

  it('seeds by rating, highest first; ties keep their order and unrated go last', () => {
    expect(seedEntries(entries, { by: 'rating' })).toEqual(['c', 'a', 'd', 'b', 'e'])
  })

  it('shuffles the same way for the same seed', () => {
    const one = seedEntries(entries, { by: 'random', seed: 42 })
    expect(seedEntries(entries, { by: 'random', seed: 42 })).toEqual(one)
    expect([...one].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    const seeds = [1, 2, 3, 4, 5].map(seed => seedEntries(entries, { by: 'random', seed }).join())
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  it('takes a manual order that lists every entry once', () => {
    expect(seedEntries(entries, { by: 'manual', order: ['e', 'd', 'c', 'b', 'a'] })).toEqual(['e', 'd', 'c', 'b', 'a'])
    expect(() => seedEntries(entries, { by: 'manual', order: ['e', 'd', 'c', 'b'] })).toThrow()
    expect(() => seedEntries(entries, { by: 'manual', order: ['e', 'd', 'c', 'b', 'b'] })).toThrow()
    expect(() => seedEntries(entries, { by: 'manual', order: ['e', 'd', 'c', 'b', 'x'] })).toThrow()
  })

  it('refuses duplicate entries', () => {
    expect(() =>
      seedEntries(
        [
          { id: 'a', rating: null },
          { id: 'a', rating: null },
        ],
        { by: 'rating' },
      ),
    ).toThrow()
  })
})

describe('singleElimination', () => {
  it('draws 1 v 8, 4 v 5, 2 v 7, 3 v 6 for eight entries', () => {
    const round1 = singleElimination(field(8), { firstTo: 3 }).filter(m => m.round === 1)
    expect(round1.map(m => m.sides.map(s => s.entry))).toEqual([
      ['e1', 'e8'],
      ['e4', 'e5'],
      ['e2', 'e7'],
      ['e3', 'e6'],
    ])
    expect(round1.every(m => m.result === null)).toBe(true)
  })

  it.each([5, 8, 13, 64])('builds a full bracket for %i entries and plays it to one champion', n => {
    const size = 2 ** Math.ceil(Math.log2(n))
    const rounds = Math.log2(size)
    const draw = singleElimination(field(n), { firstTo: 2 })

    for (let round = 1; round <= rounds; round++) {
      expect(draw.filter(m => m.round === round)).toHaveLength(size / 2 ** round)
    }
    // Every entry is drawn once, into round 1.
    const drawn = draw.flatMap(m => (m.round === 1 ? m.sides.map(s => s.entry) : [])).filter(e => e !== null)
    expect(drawn.sort()).toEqual(field(n).sort())
    // Later rounds are filled only through their sources.
    for (const m of draw.filter(m => m.round > 1)) {
      expect(m.sides.map(s => s.source)).toEqual([`R${m.round - 1}M${2 * m.index - 1}`, `R${m.round - 1}M${2 * m.index}`])
    }

    const final = playOut(draw)
    expect(final.every(m => m.result !== null)).toBe(true)
    const last = final.find(m => m.round === rounds)!
    expect(last.sides[last.result!.winner].entry).toBe('e1')
    // Seeds 1 and 2 only meet in the final.
    expect(last.sides.map(s => s.entry)).toEqual(['e1', 'e2'])
  })

  it.each([5, 13])('gives the byes of %i entries to the top seeds and moves them on at once', n => {
    const size = 2 ** Math.ceil(Math.log2(n))
    const draw = singleElimination(field(n), { firstTo: 3 })
    const byes = draw.filter(m => m.result?.outcome === 'bye')
    expect(byes).toHaveLength(size - n)
    const through = byes.map(m => m.sides[m.result!.winner].entry!)
    expect(through.map(seedOf).sort((a, b) => a - b)).toEqual(Array.from({ length: size - n }, (_, i) => i + 1))
    for (const bye of byes) {
      const next = draw.find(m => m.sides.some(s => s.source === bye.key))!
      expect(next.sides.find(s => s.source === bye.key)!.entry).toBe(bye.sides[bye.result!.winner].entry)
    }
    expect(draw.filter(m => m.round === 1 && !m.result)).toHaveLength(n - size / 2)
  })

  it('needs two entries', () => {
    expect(() => singleElimination(['e1'], { firstTo: 1 })).toThrow()
  })
})

describe('longer final', () => {
  const lengths = (draw: Match[]) => draw.map(m => [m.round, m.firstTo])

  it('sets first_to on the final only', () => {
    const draw = singleElimination(field(16), { firstTo: 2, final: { firstTo: 5, semis: false } })
    expect(new Set(lengths(draw).map(([r, f]) => `${r}:${f}`))).toEqual(new Set(['1:2', '2:2', '3:2', '4:5']))
  })

  it('sets it on the semi-finals too when asked', () => {
    const draw = singleElimination(field(16), { firstTo: 2, final: { firstTo: 5, semis: true } })
    expect(new Set(lengths(draw).map(([r, f]) => `${r}:${f}`))).toEqual(new Set(['1:2', '2:2', '3:5', '4:5']))
  })

  it('leaves every match at the normal length without it', () => {
    expect(singleElimination(field(13), { firstTo: 3 }).every(m => m.firstTo === 3)).toBe(true)
  })
})

describe('advance', () => {
  const draw = singleElimination(field(8), { firstTo: 3 })

  it('moves the winner into the match its result feeds', () => {
    const after = advance(draw, 'R1M2', { outcome: 'played', winner: 1, legs: [2, 3] })
    expect(after.find(m => m.key === 'R1M2')!.result).toEqual({ outcome: 'played', winner: 1, legs: [2, 3] })
    expect(after.find(m => m.key === 'R2M1')!.sides.map(s => s.entry)).toEqual([null, 'e5'])
    // The input is left as it was.
    expect(draw.find(m => m.key === 'R1M2')!.result).toBeNull()
  })

  it('moves a walkover winner on without legs', () => {
    const after = advance(draw, 'R1M1', { outcome: 'walkover', winner: 0 })
    expect(after.find(m => m.key === 'R2M1')!.sides[0].entry).toBe('e1')
  })

  it('refuses a match that is decided, waiting, unknown, or legs that do not finish it', () => {
    const once = advance(draw, 'R1M1', { outcome: 'walkover', winner: 0 })
    expect(() => advance(once, 'R1M1', { outcome: 'walkover', winner: 1 })).toThrow(/already decided/)
    expect(() => advance(draw, 'R2M1', { outcome: 'walkover', winner: 0 })).toThrow(/waiting/)
    expect(() => advance(draw, 'R9M9', { outcome: 'walkover', winner: 0 })).toThrow(/no match/)
    for (const legs of [
      [3, 3],
      [2, 1],
      [4, 0],
      [3, -1],
      [3, 1.5],
    ] as [number, number][]) {
      expect(() => advance(draw, 'R1M1', { outcome: 'played', winner: 0, legs })).toThrow(/first to 3/)
    }
  })
})

describe('roundRobin', () => {
  it.each([2, 5, 8, 13])('pairs every two of %i entries exactly once', n => {
    const matches = roundRobin(field(n), 2)
    const pairs = matches.map(m =>
      m.sides
        .map(s => s.entry)
        .sort()
        .join('-'),
    )
    expect(pairs).toHaveLength((n * (n - 1)) / 2)
    expect(new Set(pairs).size).toBe(pairs.length)
    expect(matches.every(m => m.firstTo === 2 && m.result === null)).toBe(true)

    const rounds = n % 2 === 0 ? n - 1 : n
    expect(Math.max(...matches.map(m => m.round))).toBe(rounds)
    for (let round = 1; round <= rounds; round++) {
      const playing = matches.filter(m => m.round === round).flatMap(m => m.sides.map(s => s.entry))
      expect(new Set(playing).size).toBe(playing.length)
      expect(playing).toHaveLength(n - (n % 2))
    }
  })
})

describe('standings', () => {
  let n = 0
  const match = (a: string, b: string, legs: [number, number]): Match => ({
    key: `M${++n}`,
    round: 1,
    index: n,
    firstTo: 3,
    sides: [
      { entry: a, source: null },
      { entry: b, source: null },
    ],
    result: { outcome: 'played', winner: legs[0] > legs[1] ? 0 : 1, legs },
  })
  const order = (matches: Match[], entries: string[], averages?: Map<string, number>) =>
    standings(matches, entries, averages).map(s => s.entry)

  it('counts matches and legs', () => {
    const rows = standings([match('a', 'b', [3, 1]), match('b', 'c', [3, 2])], ['a', 'b', 'c'])
    expect(rows).toEqual([
      { entry: 'a', played: 1, won: 1, lost: 0, legsWon: 3, legsLost: 1 },
      { entry: 'b', played: 2, won: 1, lost: 1, legsWon: 4, legsLost: 5 },
      { entry: 'c', played: 1, won: 0, lost: 1, legsWon: 2, legsLost: 3 },
    ])
  })

  it('ranks by match wins first', () => {
    // b: one win, 3–8. c: no win, 6–9.
    const matches = [
      match('a', 'b', [3, 0]),
      match('d', 'b', [3, 0]),
      match('b', 'c', [3, 2]),
      match('a', 'c', [3, 2]),
      match('d', 'c', [3, 2]),
    ]
    const table = order(matches, ['c', 'b', 'a', 'd'])
    expect(table.indexOf('b')).toBeLessThan(table.indexOf('c'))
  })

  it('then leg difference, then legs won', () => {
    // a and b: one win each. a +1 (4–3), b 0 (5–5).
    const diff = order(
      [match('a', 'c', [3, 0]), match('a', 'd', [1, 3]), match('b', 'c', [3, 2]), match('b', 'd', [2, 3])],
      ['b', 'a', 'c', 'd'],
    )
    expect(diff.indexOf('a')).toBeLessThan(diff.indexOf('b'))
    // a and b: one win, difference 0 each; b won more legs (4 to 3).
    const legs = order(
      [match('a', 'c', [3, 0]), match('a', 'd', [0, 3]), match('b', 'c', [3, 1]), match('b', 'd', [1, 3])],
      ['a', 'b', 'c', 'd'],
    )
    expect(legs.indexOf('b')).toBeLessThan(legs.indexOf('a'))
  })

  it('then the wins among the tied entries', () => {
    // a and b: two wins, 7–5 each; a beat b.
    const matches = [
      match('a', 'b', [3, 1]),
      match('a', 'c', [1, 3]),
      match('a', 'd', [3, 1]),
      match('b', 'c', [3, 1]),
      match('b', 'd', [3, 1]),
      match('c', 'd', [1, 3]),
    ]
    expect(order(matches, ['b', 'a', 'c', 'd']).slice(0, 2)).toEqual(['a', 'b'])
  })

  it('then the 3-dart average, then the seed order, whatever order the matches come in', () => {
    // A three-way circle: one win, 4–4 and one head-to-head win each.
    const circle = [match('a', 'b', [3, 1]), match('b', 'c', [3, 1]), match('c', 'a', [3, 1])]
    const averages = new Map([
      ['a', 51.2],
      ['b', 64.8],
      ['c', 58],
    ])
    expect(order(circle, ['a', 'b', 'c'], averages)).toEqual(['b', 'c', 'a'])
    expect(order(circle, ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
    expect(order([...circle].reverse(), ['c', 'a', 'b'])).toEqual(['c', 'a', 'b'])
  })

  it('counts a walkover as a win without legs and leaves open matches out', () => {
    const [first, second] = roundRobin(['a', 'b', 'c', 'd'], 3)
    const matches = advance([first, second], first.key, { outcome: 'walkover', winner: 1 })
    const rows = standings(matches, ['a', 'b', 'c', 'd'])
    const winner = first.sides[1].entry!
    expect(rows[0]).toEqual({ entry: winner, played: 1, won: 1, lost: 0, legsWon: 0, legsLost: 0 })
    expect(rows.reduce((sum, r) => sum + r.played, 0)).toBe(2)
  })

  it('refuses a match with an entry that is not in the table', () => {
    expect(() => standings([match('a', 'x', [3, 0])], ['a'])).toThrow()
  })
})

describe('roundName', () => {
  it('names the last three rounds and numbers the rest', () => {
    expect(Array.from({ length: 6 }, (_, i) => roundName(i + 1, 6))).toEqual([
      { name: 'Round 1', short: 'R1' },
      { name: 'Round 2', short: 'R2' },
      { name: 'Round 3', short: 'R3' },
      { name: 'Quarter-finals', short: 'QF' },
      { name: 'Semi-finals', short: 'SF' },
      { name: 'Final', short: 'Final' },
    ])
    expect(roundName(1, 1).name).toBe('Final')
  })
})
