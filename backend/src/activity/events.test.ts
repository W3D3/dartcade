import { describe, it, expect } from 'vitest'
import { finishEvents, rankUpEvent, type FinishedSeat } from './events.js'

const at = new Date('2026-10-27T20:00:00Z')

describe('finishEvents', () => {
  it('turns 180s into one event that carries how many', () => {
    expect(finishEvents('g1', 'x01', [{ userId: 'ann', stats: { count180: 2 }, forfeited: false }], at)).toEqual([
      { userId: 'ann', gameId: 'g1', kind: 'one_eighty', payload: { count: 2 }, at },
    ])
  })

  it('turns ton-plus outs into one event with how many and the highest', () => {
    expect(finishEvents('g1', 'x01', [{ userId: 'ann', stats: { tonOuts: 1, bestCheckout: 129 }, forfeited: false }], at)).toEqual([
      { userId: 'ann', gameId: 'g1', kind: 'ton_out', payload: { count: 1, best: 129 }, at },
    ])
  })

  it('writes both kinds for a seat that earned both, and one per seat', () => {
    const events = finishEvents(
      'g1',
      'x01',
      [
        { userId: 'ann', stats: { count180: 1, tonOuts: 1, bestCheckout: 100 }, forfeited: false },
        { userId: 'bob', stats: { count180: 3 }, forfeited: false },
      ],
      at,
    )
    expect(events.map(e => [e.userId, e.kind])).toEqual([
      ['ann', 'one_eighty'],
      ['ann', 'ton_out'],
      ['bob', 'one_eighty'],
    ])
  })

  it('writes nothing for a seat without a 180 or a ton-plus out', () => {
    expect(finishEvents('g1', 'x01', [{ userId: 'ann', stats: { average: 61, bestCheckout: 40 }, forfeited: false }], at)).toEqual([])
  })

  it('writes nothing for a guest or a bot, which have no account', () => {
    expect(finishEvents('g1', 'x01', [{ userId: null, stats: { count180: 1 }, forfeited: false }], at)).toEqual([])
  })

  it('writes nothing when a seat left by forfeit', () => {
    const seats: FinishedSeat[] = [
      { userId: 'ann', stats: { count180: 1 }, forfeited: false },
      { userId: 'bob', stats: {}, forfeited: true },
    ]
    expect(finishEvents('g1', 'x01', seats, at)).toEqual([])
  })

  it('writes nothing for another game mode', () => {
    expect(finishEvents('g1', 'atc', [{ userId: 'ann', stats: { count180: 1 }, forfeited: false }], at)).toEqual([])
  })
})

describe('rankUpEvent', () => {
  it('is an event when the held stage went up', () => {
    expect(rankUpEvent('g1', '1v1', 'ann', 4, 5, at)).toEqual({
      userId: 'ann',
      gameId: 'g1',
      kind: 'rank_up',
      payload: { mode: '1v1', rankIndex: 5 },
      at,
    })
  })

  it('is not an event when the stage stayed or dropped', () => {
    expect(rankUpEvent('g1', '1v1', 'ann', 5, 5, at)).toBeNull()
    expect(rankUpEvent('g1', '1v1', 'ann', 5, 4, at)).toBeNull()
  })

  it('is not an event when a placing player is first shown a stage', () => {
    expect(rankUpEvent('g1', '1v1', 'ann', null, 7, at)).toBeNull()
    expect(rankUpEvent('g1', '1v1', 'ann', null, null, at)).toBeNull()
  })
})
