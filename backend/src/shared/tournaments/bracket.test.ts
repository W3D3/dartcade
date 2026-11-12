import { describe, expect, it } from 'vitest'
import { seededRng } from '../rng.js'
import {
  advance,
  doubleElimination,
  fillKnockout,
  groupsKnockout,
  roundName,
  roundRobin,
  seedEntries,
  singleElimination,
  snakeGroups,
  standings,
  type Match,
  type Side,
} from './bracket.js'

const field = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`)
const seedOf = (entry: string) => Number(entry.slice(1))

const betterSeed = (m: Match): 0 | 1 => (seedOf(m.sides[0].entry!) < seedOf(m.sides[1].entry!) ? 0 : 1)

/** Plays every open match in draw order until none is left; `pick` names the winner, first to `firstTo`. */
function playOut(start: Match[], pick: (m: Match) => 0 | 1 = betterSeed): Match[] {
  let matches = start
  for (;;) {
    const open = matches.find(m => !m.result && m.sides.every(s => s.entry !== null))
    if (!open) return matches
    const winner = pick(open)
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
      expect(m.sides.map(s => s.source)).toEqual([
        { from: 'winner', match: `R${m.round - 1}M${2 * m.index - 1}` },
        { from: 'winner', match: `R${m.round - 1}M${2 * m.index}` },
      ])
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
      const fromBye = (s: Side) => s.source?.from === 'winner' && s.source.match === bye.key
      const next = draw.find(m => m.sides.some(fromBye))!
      expect(next.sides.find(fromBye)!.entry).toBe(bye.sides[bye.result!.winner].entry)
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
    bracket: 'main',
    group: null,
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

const get = (matches: readonly Match[], key: string) => matches.find(m => m.key === key)!
const sources = (m: Match) => m.sides.map(s => s.source)
const winnerOf = (match: string) => ({ from: 'winner', match })
const loserOf = (match: string) => ({ from: 'loser', match })
const winner = (m: Match) => m.sides[m.result!.winner].entry
const loser = (m: Match) => m.sides[1 - m.result!.winner].entry

/** Every played match in the order it was played: advance keeps the draw's order, so replay it. */
function playLog(start: Match[], pick: (m: Match) => 0 | 1): Match[] {
  const log: Match[] = []
  playOut(start, m => {
    const w = pick(m)
    log.push({ ...m, result: { outcome: 'walkover', winner: w } })
    return w
  })
  return log
}

describe('doubleElimination', () => {
  it('drops the losers of eight entries into the lower bracket and meets in the grand final', () => {
    const draw = doubleElimination(field(8), { firstTo: 2 })
    expect(draw.filter(m => m.bracket === 'main').map(m => m.key)).toEqual(['R1M1', 'R1M2', 'R1M3', 'R1M4', 'R2M1', 'R2M2', 'R3M1'])
    const lower = Object.fromEntries(draw.filter(m => m.bracket === 'lower').map(m => [m.key, sources(m)]))
    expect(lower).toEqual({
      L1M1: [loserOf('R1M1'), loserOf('R1M2')],
      L1M2: [loserOf('R1M3'), loserOf('R1M4')],
      // Reversed: the loser of the top half's semi-final meets the bottom half's survivor.
      L2M1: [winnerOf('L1M1'), loserOf('R2M2')],
      L2M2: [winnerOf('L1M2'), loserOf('R2M1')],
      L3M1: [winnerOf('L2M1'), winnerOf('L2M2')],
      L4M1: [winnerOf('L3M1'), loserOf('R3M1')],
    })
    expect(sources(get(draw, 'GF1'))).toEqual([winnerOf('R3M1'), winnerOf('L4M1')])
    expect(sources(get(draw, 'GF2'))).toEqual([loserOf('GF1'), winnerOf('GF1')])
    expect(draw.every(m => m.result === null && m.group === null)).toBe(true)
  })

  it('sends every winners-bracket loser of sixteen entries down once, and every lower winner on once', () => {
    const draw = doubleElimination(field(16), { firstTo: 2 })
    const fed = draw.flatMap(m => m.sides.flatMap(s => (s.source?.from === 'group' || !s.source ? [] : [s.source])))
    const count = (from: string, match: string) => fed.filter(s => s.from === from && s.match === match).length
    const lower = draw.filter(m => m.bracket === 'lower')
    expect(lower.map(m => m.round)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 5, 6])
    for (const m of draw.filter(m => m.bracket === 'main')) {
      expect(count('loser', m.key)).toBe(1)
      expect(lower.some(l => l.sides.some(s => s.source?.from === 'loser' && s.source.match === m.key))).toBe(true)
    }
    for (const m of lower) expect(count('winner', m.key)).toBe(1)
    // Even lower rounds take the next winners' round's losers, the whole round once.
    for (const [round, from] of [
      [2, 2],
      [4, 3],
      [6, 4],
    ]) {
      const dropped = lower
        .filter(m => m.round === round)
        .map(m => m.sides[1].source)
        .map(s => (s?.from === 'loser' ? s.match : ''))
      expect(dropped.sort()).toEqual(draw.filter(m => m.bracket === 'main' && m.round === from).map(m => m.key))
    }
  })

  it.each([5, 8, 13, 16, 32])('lets every one of %i entries lose twice before it is out, and no more', n => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = seededRng(seed)
      const log = playLog(doubleElimination(field(n), { firstTo: 1 }), () => (rng() < 0.5 ? 0 : 1))
      const losses = new Map<string, number>()
      for (const m of log) {
        for (const s of m.sides) expect(losses.get(s.entry!) ?? 0).toBeLessThan(2)
        losses.set(loser(m)!, (losses.get(loser(m)!) ?? 0) + 1)
      }
      const champion = winner(log[log.length - 1])!
      expect(losses.get(champion) ?? 0).toBeLessThan(2)
      expect(
        field(n)
          .filter(e => e !== champion)
          .every(e => losses.get(e) === 2),
      ).toBe(true)
    }
  })

  it('ends after the grand final when the winners-bracket champion takes it', () => {
    const draw = playOut(doubleElimination(field(8), { firstTo: 1 }))
    expect(draw.some(m => m.key === 'GF2')).toBe(false)
    expect(get(draw, 'GF1').sides.map(s => s.entry)).toEqual(['e1', 'e2'])
    expect(winner(get(draw, 'GF1'))).toBe('e1')
    expect(draw.every(m => m.result)).toBe(true)
  })

  it('plays the reset when the lower-bracket champion takes the grand final', () => {
    const draw = playOut(doubleElimination(field(8), { firstTo: 1 }), m => (m.key === 'GF1' ? 1 : betterSeed(m)))
    expect(get(draw, 'GF2').sides.map(s => s.entry)).toEqual(['e1', 'e2'])
    expect(draw.every(m => m.result)).toBe(true)
  })

  it('gives byes to the top seeds and lets nobody stand in the lower bracket', () => {
    const draw = doubleElimination(field(5), { firstTo: 1 })
    expect(draw.filter(m => m.bracket === 'main' && m.result?.outcome === 'bye').map(winner)).toEqual(['e1', 'e2', 'e3'])
    // Both of its feeders were byes: nobody goes through, and the next match is a bye too.
    expect(get(draw, 'L1M2').result?.outcome).toBe('bye')
    expect(winner(get(draw, 'L1M2'))).toBeNull()
    expect(playOut(draw).every(m => m.result)).toBe(true)
  })

  it('makes the grand final longer, and with semis the two brackets’ finals', () => {
    const lengths = (draw: Match[]) => Object.fromEntries(draw.filter(m => m.firstTo !== 2).map(m => [m.key, m.firstTo]))
    expect(lengths(doubleElimination(field(8), { firstTo: 2, final: { firstTo: 5, semis: false } }))).toEqual({ GF1: 5, GF2: 5 })
    expect(lengths(doubleElimination(field(8), { firstTo: 2, final: { firstTo: 5, semis: true } }))).toEqual({
      R3M1: 5,
      L4M1: 5,
      GF1: 5,
      GF2: 5,
    })
  })

  it('needs three entries', () => {
    expect(() => doubleElimination(field(2), { firstTo: 1 })).toThrow()
  })
})

describe('groupsKnockout', () => {
  /** Plays the groups (better seed wins), fills the knockout, then plays it. */
  const finish = (draw: Match[], groups: string[][]) => playOut(fillKnockout(playOut(draw), groups))
  const knockout = (draw: Match[]) => draw.filter(m => m.bracket === 'main')

  it('snake-seeds the groups', () => {
    expect(snakeGroups(field(16), 4)).toEqual([
      ['e1', 'e8', 'e9', 'e16'],
      ['e2', 'e7', 'e10', 'e15'],
      ['e3', 'e6', 'e11', 'e14'],
      ['e4', 'e5', 'e12', 'e13'],
    ])
    expect(snakeGroups(field(6), 3)).toEqual([
      ['e1', 'e4', 'e5'],
      ['e2', 'e3', 'e6'],
    ])
    expect(snakeGroups(field(7), 4).map(g => g.length)).toEqual([3, 4])
  })

  it('draws six teams into two groups of three, the top two of each crossing into the semi-finals', () => {
    const draw = groupsKnockout(field(6), { size: 3, through: 2 }, { firstTo: 2 })
    for (const group of [1, 2]) {
      const matches = draw.filter(m => m.group === group)
      expect(matches.every(m => m.bracket === 'group' && m.key.startsWith(`G${group}R`))).toBe(true)
      expect(matches).toHaveLength(3)
    }
    expect(knockout(draw).map(m => [m.key, sources(m)])).toEqual([
      [
        'R1M1',
        [
          { from: 'group', group: 1, place: 1 },
          { from: 'group', group: 2, place: 2 },
        ],
      ],
      [
        'R1M2',
        [
          { from: 'group', group: 2, place: 1 },
          { from: 'group', group: 1, place: 2 },
        ],
      ],
      ['R2M1', [winnerOf('R1M1'), winnerOf('R1M2')]],
    ])

    const final = finish(draw, snakeGroups(field(6), 3))
    expect(knockout(final)[0].sides.map(s => s.entry)).toEqual(['e1', 'e3'])
    expect(knockout(final)[1].sides.map(s => s.entry)).toEqual(['e2', 'e4'])
    expect(winner(knockout(final)[2])).toBe('e1')
  })

  it('draws sixteen into four groups of four, the winners into a knockout of four', () => {
    const draw = groupsKnockout(field(16), { size: 4, through: 1 }, { firstTo: 2, final: { firstTo: 3, semis: true } })
    expect(draw.filter(m => m.bracket === 'group')).toHaveLength(4 * 6)
    expect(draw.filter(m => m.bracket === 'group').every(m => m.firstTo === 2)).toBe(true)
    const final = finish(draw, snakeGroups(field(16), 4))
    expect(knockout(final).map(m => [m.key, m.firstTo, m.sides.map(s => s.entry)])).toEqual([
      ['R1M1', 3, ['e1', 'e4']],
      ['R1M2', 3, ['e2', 'e3']],
      ['R2M1', 3, ['e1', 'e2']],
    ])
  })

  it('keeps the knockout waiting until every group match is decided', () => {
    const groups = snakeGroups(field(16), 4)
    const draw = groupsKnockout(field(16), { size: 4, through: 1 }, { firstTo: 2 })
    const keys = draw.filter(m => m.bracket === 'group').map(m => m.key)
    let matches = draw
    for (const key of keys) {
      const waiting = fillKnockout(matches, groups)
      expect(knockout(waiting).every(m => !m.result && m.sides.every(s => s.entry === null))).toBe(true)
      expect(() => advance(waiting, 'R1M1', { outcome: 'walkover', winner: 0 })).toThrow(/waiting/)
      matches = advance(matches, key, { outcome: 'walkover', winner: betterSeed(get(matches, key)) })
    }
    const filled = fillKnockout(matches, groups)
    expect(
      knockout(filled)
        .filter(m => m.round === 1)
        .every(m => m.sides.every(s => s.entry !== null)),
    ).toBe(true)
    expect(fillKnockout(filled, groups)).toEqual(filled)
  })

  it('ranks a group tied all round by the 3-dart average', () => {
    const groups = snakeGroups(field(6), 3)
    expect(groups[0]).toEqual(['e1', 'e4', 'e5'])
    let draw = groupsKnockout(field(6), { size: 3, through: 1 }, { firstTo: 1 })
    // Group 1 goes round in a circle (e1 beats e4 beats e5 beats e1): every tie-break before the average is level.
    const beats = (a: string, b: string) => (groups[0].indexOf(b) - groups[0].indexOf(a) + 3) % 3 === 1
    for (const m of draw.filter(m => m.bracket === 'group')) {
      const [a, b] = m.sides.map(s => s.entry!)
      const w = m.group === 1 ? (beats(a, b) ? 0 : 1) : betterSeed(m)
      draw = advance(draw, m.key, { outcome: 'played', winner: w, legs: w === 0 ? [1, 0] : [0, 1] })
    }
    expect(get(fillKnockout(draw, groups), 'R1M1').sides.map(s => s.entry)).toEqual(['e1', 'e2'])
    const filled = fillKnockout(draw, groups, new Map([['e5', 60]]))
    expect(get(filled, 'R1M1').sides.map(s => s.entry)).toEqual(['e5', 'e2'])
  })

  it.each([2, 3, 4, 5, 6, 8])('keeps the two of one group apart in a knockout of %i groups', groups => {
    const draw = groupsKnockout(field(groups * 4), { size: 4, through: 2 }, { firstTo: 1 })
    const round1 = knockout(draw).filter(m => m.round === 1)
    for (const m of round1) {
      const from = m.sides.map(s => (s.source?.from === 'group' ? s.source.group : null)).filter(g => g !== null)
      expect(new Set(from).size).toBe(from.length)
    }
    // Byes, if any, go to group winners.
    for (const m of round1.filter(m => m.result?.outcome === 'bye')) {
      expect(m.sides.find(s => s.source)?.source).toMatchObject({ place: 1 })
    }
    // Both halves of the bracket hold one entry of each group whenever there are two halves to fill.
    if (groups % 2 === 0 && groups > 1) {
      const half = round1.length / 2
      const groupsIn = (ms: Match[]) =>
        ms.flatMap(m => m.sides.flatMap(s => (s.source?.from === 'group' ? [s.source.group] : []))).sort((a, b) => a - b)
      expect(groupsIn(round1.slice(0, half))).toEqual(Array.from({ length: groups }, (_, i) => i + 1))
    }
    expect(finish(draw, snakeGroups(field(groups * 4), 4)).every(m => m.result)).toBe(true)
  })

  it('refuses groups too small for how many go through, or a single group', () => {
    expect(() => groupsKnockout(field(4), { size: 3, through: 2 }, { firstTo: 1 })).toThrow(/more entries/)
    expect(() => groupsKnockout(field(3), { size: 3, through: 1 }, { firstTo: 1 })).toThrow(/two entries/)
  })
})
