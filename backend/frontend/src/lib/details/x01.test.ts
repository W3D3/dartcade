import { describe, expect, it } from 'vitest'
import type { X01Detail } from '../api'
import { legStarterKey, legSummary, type Side } from './x01'

const legs = [
  { leg: 0, starter: 2, winner: 0, visits: [{ seat: 0, darts: [{ segment: { number: 20, multiplier: 2 } }] }] },
  { leg: 1, starter: 1, winner: null, visits: [] },
] as unknown as X01Detail['legs']
const detail = { legs } as unknown as X01Detail
const players: Side[] = [0, 1, 2].map(s => ({ key: s, name: `P${s}`, seats: [s] }))
const teams: Side[] = [
  { key: 0, name: 'Red', seats: [0, 2] },
  { key: 1, name: 'Blue', seats: [1, 3] },
]
const name = (seat: number) => `P${seat}`

describe('legStarterKey', () => {
  it('is the player who started', () => expect(legStarterKey(detail, 0, players)).toBe(2))
  it('is the team of the member who started', () => expect(legStarterKey(detail, 0, teams)).toBe(0))
  it('follows an alternating starter', () => expect(legStarterKey(detail, 1, players)).toBe(1))
  it('is null for an unknown leg', () => expect(legStarterKey(detail, 9, players)).toBeNull())
})

describe('legSummary', () => {
  it('no longer names who threw first', () => {
    expect(legSummary(detail, 0, players, name, null)).toBe('P0 won in 1 darts, checking out D20')
    expect(legSummary(detail, 1, players, name, null)).toBe('No winner: the round limit ended it')
  })
})
