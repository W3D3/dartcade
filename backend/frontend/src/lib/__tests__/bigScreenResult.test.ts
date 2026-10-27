import { describe, it, expect } from 'vitest'
import { placings } from '../bigscreen/result.js'

describe('placings', () => {
  it('lists a minigolf snapshot without a winner by seat', () => {
    const snap = { gameId: 'minigolf', status: 'finished', players: [{ name: 'A' }, { name: 'B' }], game: { winner: null } } as never
    expect(placings(snap)).toEqual([
      { name: 'A', placement: 1 },
      { name: 'B', placement: 2 },
    ])
  })
})
