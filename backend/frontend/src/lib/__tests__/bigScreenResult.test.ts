import { describe, it, expect } from 'vitest'
import { placings } from '../bigscreen/result.js'

describe('placings', () => {
  it('lists a 121 snapshot, which has no win view, by seat', () => {
    const snap = { gameId: 'p121', status: 'finished', players: [{ name: 'A' }, { name: 'B' }] } as never
    expect(placings(snap)).toEqual([
      { name: 'A', placement: 1 },
      { name: 'B', placement: 2 },
    ])
  })
})
