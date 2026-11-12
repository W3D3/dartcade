import { describe, expect, it } from 'vitest'
import type { Match, MatchResult } from './bracket.js'
import { drawFor, finalPlaces, isComplete, replay, type Decided, type DrawSetup } from './run.js'

const settings = { firstTo: 2, longerFinal: null, groups: null }
const se: DrawSetup = { format: 'single_elimination', settings }
const seeded = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`)

/** Plays every open match with both sides known, side 0 winning 2-1, until the bracket is done. */
function playOut(setup: DrawSetup, entries: string[], pick: (m: Match) => 0 | 1 = () => 0): { decided: Decided[]; matches: Match[] } {
  const decided: Decided[] = []
  let matches = drawFor(setup, entries)
  for (;;) {
    const m = matches.find(x => !x.result && x.sides.every(s => s.entry !== null))
    if (!m) return { decided, matches }
    const winner = pick(m)
    const legs: [number, number] = winner === 0 ? [m.firstTo, 1] : [1, m.firstTo]
    const result: MatchResult = { outcome: 'played', winner, legs }
    decided.push({ bracket: m.bracket, group: m.group, round: m.round, index: m.index, result })
    matches = replay(setup, entries, decided)
  }
}

describe('replay', () => {
  it('rebuilds the same bracket from the seeds and the results in finish order', () => {
    const { decided, matches } = playOut(se, seeded(8))
    expect(isComplete(matches)).toBe(true)
    expect(replay(se, seeded(8), decided)).toEqual(matches)
    // The final is round 3, between the top two seeds when the better seed always wins
    const final = matches.find(m => m.round === 3)
    expect(final?.sides.map(s => s.entry)).toEqual(['e1', 'e2'])
  })

  it('fails on a result for a match the draw does not have', () => {
    const bad: Decided = { bracket: 'main', group: null, round: 9, index: 1, result: { outcome: 'walkover', winner: 0 } }
    expect(() => replay(se, seeded(4), [bad])).toThrow(/no match/)
  })

  it('fills the knockout once the groups are done', () => {
    const gk: DrawSetup = { format: 'groups_knockout', settings: { ...settings, groups: { size: 4, through: 2 } } }
    const { matches } = playOut(gk, seeded(8))
    expect(isComplete(matches)).toBe(true)
    expect(matches.filter(m => m.bracket === 'main').every(m => m.sides.every(s => s.entry !== null))).toBe(true)
  })
})

describe('finalPlaces', () => {
  it('gives a single elimination 1, 2, 3, 3, 5, 5, 5, 5', () => {
    const { matches } = playOut(se, seeded(8))
    const places = finalPlaces(se, seeded(8), matches)
    expect(Object.fromEntries(places)).toEqual({ e1: 1, e2: 2, e3: 3, e4: 3, e5: 5, e6: 5, e7: 5, e8: 5 })
  })

  it('places a bye seed by the round it went out in', () => {
    // 6 entries: seeds 1 and 2 have byes; the lower seed wins every played match
    const { matches } = playOut(se, seeded(6), () => 1)
    const places = finalPlaces(se, seeded(6), matches)
    expect([...places.values()].sort()).toEqual([1, 2, 3, 3, 5, 5])
  })

  it('takes a double elimination champion from the grand final, reset or not', () => {
    const de: DrawSetup = { format: 'double_elimination', settings }
    for (const pick of [() => 0 as const, (m: Match) => (m.bracket === 'final' && m.round === 1 ? 1 : 0)] as const) {
      const { matches } = playOut(de, seeded(8), pick)
      const places = finalPlaces(de, seeded(8), matches)
      expect(places.get('e1')).toBe(1)
      expect([...places.values()].filter(p => p === 1)).toHaveLength(1)
      expect([...places.values()].filter(p => p === 2)).toHaveLength(1)
    }
  })

  it('uses the table for a round robin', () => {
    const rr: DrawSetup = { format: 'round_robin', settings }
    const { matches } = playOut(rr, seeded(4), m => (m.sides[0].entry! < m.sides[1].entry! ? 0 : 1))
    expect(Object.fromEntries(finalPlaces(rr, seeded(4), matches))).toEqual({ e1: 1, e2: 2, e3: 3, e4: 4 })
  })

  it('ranks group leavers below every knockout entry, by their group place', () => {
    const gk: DrawSetup = { format: 'groups_knockout', settings: { ...settings, groups: { size: 4, through: 1 } } }
    const { matches } = playOut(gk, seeded(8), m => (m.sides[0].entry! < m.sides[1].entry! ? 0 : 1))
    const places = finalPlaces(gk, seeded(8), matches)
    // Two groups of four, the winners meet in the final
    expect(places.get('e1')).toBe(1)
    expect(places.get('e2')).toBe(2)
    expect([...places.values()].sort()).toEqual([1, 2, 3, 3, 5, 5, 7, 7])
  })
})
