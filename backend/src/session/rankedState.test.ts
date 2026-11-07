import { describe, it, expect } from 'vitest'
import { rankedState, type RankedPresence } from './rankedState.js'
import { newSession } from './replay.js'
import { chargeVisit } from './rankedClock.js'
import { x01Module } from '../games/x01.js'
import { PLACEMENT_MATCHES } from '../shared/ranked.js'
import type { RankedGame, Seat } from './types.js'

const seat = (name: string, user: string | null): Seat => ({
  name,
  userId: user,
  controllerUserId: user ?? 'ann',
  boardId: null,
  boardName: null,
  bot: null,
})
const T0 = 1_000_000
const sec = (n: number) => n * 1000
const game: RankedGame = {
  mode: '1v1',
  sides: [['ann'], ['bob']],
  entries: {
    ann: { rating: 1301, rankIndex: 15, matches: 12, stakes: { win: 16, loss: 14 } },
    bob: { rating: 1180, rankIndex: null, matches: 2, stakes: null },
  },
  rules: { visitSeconds: 10, reserveSeconds: 20, manualEntry: false },
}
const present: RankedPresence = { connected: new Set(['ann', 'bob']), awayUntil: () => null }

function session(cfg: Record<string, unknown> = { bullOff: 'off' }, r: RankedGame = game) {
  return newSession({
    id: 's',
    ownerUserId: 'ann',
    boardId: null,
    module: x01Module,
    config: { ...x01Module.defaultConfig, ...cfg },
    seats: [seat('Ann', 'ann'), seat('Bob', 'bob')],
    seed: 1,
    createdAt: new Date(T0),
    ranked: r,
  })
}

describe('rankedState', () => {
  it('is null for a game that is not ranked', () => {
    const s = session()
    s.ranked = null
    expect(rankedState(s, T0, present, undefined)).toBeNull()
  })

  it('gives the clock of the seat that is up, and every seat’s rank, stakes and placement', () => {
    const state = rankedState(session(), T0 + sec(4), present, undefined)
    expect(state).toMatchObject({
      now: new Date(T0 + sec(4)).toISOString(),
      mode: '1v1',
      visitSeconds: 10,
      reserveSeconds: 20,
      manualEntry: false,
      visitDeadline: new Date(T0 + sec(10)).toISOString(),
      forfeitAt: new Date(T0 + sec(30)).toISOString(),
    })
    expect(state?.seats[0]).toEqual({
      reserveSeconds: 20,
      inReserve: false,
      disconnectForfeitAt: null,
      stakes: { win: 16, loss: 14 },
      rating: 1301,
      rankIndex: 15,
      placement: null,
      result: null,
    })
    // Still placing: the rating and rank stay hidden, only the progress shows
    expect(state?.seats[1]).toMatchObject({ rating: null, rankIndex: null, stakes: null, placement: { played: 2, of: PLACEMENT_MATCHES } })
  })

  it('counts the up seat’s reserve down once its visit ran over, and leaves the other seat’s whole', () => {
    const s = session()
    chargeVisit(s.clock!, 0, new Date(T0 + sec(14))) // an earlier visit of hers ran 4 s over: 16 s left
    // Her next visit ran 15 s: 5 s into the reserve of 16 s, with Bob's whole
    const state = rankedState(s, T0 + sec(14) + sec(15), present, undefined)
    expect(state?.seats.map(x => [x.reserveSeconds, x.inReserve])).toEqual([
      [11, true],
      [20, false],
    ])
  })

  it('has no visit clock during the bull off or once the game is over', () => {
    expect(rankedState(session({ bullOff: 'pdc' }), T0, present, undefined)).toMatchObject({ visitDeadline: null, forfeitAt: null })
    const done = session()
    done.status = 'finished'
    expect(rankedState(done, T0, present, undefined)).toMatchObject({ visitDeadline: null, forfeitAt: null })
  })

  it('shows when an absent player’s grace ends and, once recorded, what the game did to each player', () => {
    const state = rankedState(
      session(),
      T0,
      { connected: new Set(['ann']), awayUntil: u => (u === 'bob' ? T0 + sec(90) : null) },
      new Map([['ann', { userId: 'ann', change: 16, rankIndexBefore: 15, rankIndexAfter: 16 }]]),
    )
    expect(state?.seats[1].disconnectForfeitAt).toBe(new Date(T0 + sec(90)).toISOString())
    expect(state?.seats[0].result).toEqual({ change: 16, rankIndexBefore: 15, rankIndexAfter: 16 })
    expect(state?.seats[1].result).toBeNull()
  })
})
