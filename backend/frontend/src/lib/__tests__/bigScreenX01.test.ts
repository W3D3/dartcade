import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { x01Live, x01Win } from '../bigscreen/x01View.js'
import X01Live from '../components/bigscreen/X01Live.svelte'
import X01Win from '../components/bigscreen/X01Win.svelte'
import type { Snapshot } from '../ws.js'
import type { GameDetail } from '../api'

const dart = (name: string, score: number) => ({ segment: { name, number: 0, bed: 'Single', multiplier: 1 }, score })

function x01(o: { players?: string[]; game?: Record<string, unknown>; status?: string } = {}): Snapshot {
  const names = o.players ?? ['Christoph', 'Lena']
  const n = names.length
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId: 'x01',
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players: names.map(name => ({ name })),
    game: {
      scores: [141, 87, 140, 205].slice(0, n),
      legs: [1, 1, 0, 0].slice(0, n),
      firstTo: 3,
      currentPlayer: 0,
      nextPlayer: 1,
      round: 3,
      phase: 'game',
      winner: null,
      opened: names.map(() => true),
      bustThisVisit: false,
      config: { outMode: 'double', inMode: 'straight', startScore: 501, botSpeed: 'normal' },
      visitLocked: false,
      bullOff: null,
      currentVisitDarts: [],
      totalDarts: [16, 18, 12, 12].slice(0, n),
      totalVisits: [5, 6, 4, 4].slice(0, n),
      pointsScored: [384, 414, 300, 200].slice(0, n),
      dartsThrown: [16, 18, 12, 12].slice(0, n),
      legVisits: [],
      lastVisit: names.map(() => null),
      checkoutAttempts: [4, 4, 0, 0].slice(0, n),
      checkoutHits: [2, 1, 0, 0].slice(0, n),
      visitStartScores: [141, 87, 140, 205].slice(0, n),
      ...o.game,
    },
    bmStatus: null,
    status: o.status ?? 'active',
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: names.map(() => ({ userId: null, boardName: 'Living room', forfeited: false, bot: null })),
    mySeats: [0],
  } as unknown as Snapshot
}

describe('x01Live', () => {
  it('flags the thrower and the next seat', () => {
    const v = x01Live(x01())
    expect(v.seats.map(s => [s.name, s.initial, s.throwing, s.next])).toEqual([
      ['Christoph', 'C', true, false],
      ['Lena', 'L', false, true],
    ])
    expect(v.party).toBe(false)
    expect(v.header).toMatchObject({ title: 'X01', meta: '501 · Double out · First to 3 legs · Leg 3' })
  })

  it('shows score, average and darts per seat', () => {
    const [a] = x01Live(x01()).seats
    expect([a.score, a.avg, a.darts, a.legs]).toEqual([141, '72.0', 16, 1])
  })

  it('computes leaves from the visit start and the darts thrown', () => {
    const v = x01Live(x01({ game: { scores: [81, 87], visitStartScores: [141, 87], currentVisitDarts: [dart('T20', 60)] } }))
    expect(v.visit).toEqual({ darts: ['T20'], total: 60, leaves: 81 })
  })

  it('has no leaves before the first dart or after a bust', () => {
    expect(x01Live(x01()).visit).toEqual({ darts: [], total: 0, leaves: null })
    const bust = x01Live(x01({ game: { bustThisVisit: true, currentVisitDarts: [dart('T20', 60)] } }))
    expect(bust.visit.leaves).toBeNull()
  })

  it('offers a checkout only when a finish is possible', () => {
    const on = x01Live(x01({ game: { scores: [81, 87], currentVisitDarts: [dart('T20', 60)], visitStartScores: [141, 87] } }))
    expect(on.checkout).toEqual({ text: '81 left · 2 darts', route: 'T19 · D12' })
    expect(x01Live(x01({ game: { scores: [501, 501] } })).checkout).toBeNull()
  })

  it('flags the bull off thrower and hides the visit', () => {
    const v = x01Live(
      x01({
        game: { phase: 'bulloff', currentPlayer: 0, bullOff: { throws: [null, null], sequence: [1, 0], currentPlayer: 1, result: null } },
      }),
    )
    expect(v.bullOff).toBe(true)
    expect(v.seats.map(s => [s.throwing, s.next])).toEqual([
      [false, false],
      [true, false],
    ])
    expect(v.checkout).toBeNull()
    expect(v.slots).toEqual([])
  })

  it('is a party from three seats', () => {
    expect(x01Live(x01({ players: ['A', 'B', 'C'] })).party).toBe(true)
  })

  it('treats a team as one seat', () => {
    const teams = [
      { id: 'a', name: 'Team A', seats: [0, 1], score: 200, legs: 1 },
      { id: 'b', name: 'Team B', seats: [2, 3], score: 300, legs: 0 },
    ]
    const v = x01Live(x01({ players: ['A', 'B', 'C', 'D'], game: { teams, currentPlayer: 1, nextPlayer: 2 } }))
    expect(v.party).toBe(false)
    expect(v.seats.map(s => [s.name, s.score, s.throwing, s.next])).toEqual([
      ['Team A', 200, true, false],
      ['Team B', 300, false, true],
    ])
    expect(v.seats[0].darts).toBe(16 + 18)
  })
})

const detail = {
  game: {
    players: [
      { seat: 0, name: 'Christoph', placement: 1, stats: {} },
      { seat: 1, name: 'Lena', placement: 2, stats: {} },
    ],
  },
  detail: {
    mode: 'x01',
    legs: [
      {
        leg: 0,
        starter: 0,
        winner: 0,
        visits: [{ seat: 0, scored: 75, darts: [{ segment: { name: 'T17' } }, { segment: { name: 'D12' } }] }],
      },
    ],
  },
  stats: {
    rows: [
      { key: 'average', label: '3-dart average', format: 'decimal', better: 'higher', compact: false },
      { key: 'first9Average', label: 'First 9 average', format: 'decimal', better: 'higher', compact: true },
      {
        key: 'checkout',
        label: 'Checkout',
        format: 'ratio',
        better: 'higher',
        compact: true,
        value: 'checkoutHits',
        of: 'checkoutAttempts',
      },
      { key: 'highestFinish', label: 'Highest finish', format: 'integer', better: 'higher', compact: true },
      { key: 'count180', label: '180s', format: 'integer', better: 'higher', compact: false },
      { key: 'count140', label: '140+', format: 'integer', better: 'higher', compact: false },
      { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true },
      { key: 'dartsThrown', label: 'Darts thrown', format: 'integer', better: null, compact: true },
    ],
    seats: [
      {
        index: 0,
        values: {
          average: 83.9,
          first9Average: 86.4,
          checkoutHits: 3,
          checkoutAttempts: 6,
          highestFinish: 116,
          count180: 2,
          count140: 3,
          bestLegDarts: 15,
          dartsThrown: 66,
        },
      },
      {
        index: 1,
        values: {
          average: 71.6,
          first9Average: 80.7,
          checkoutHits: 1,
          checkoutAttempts: 4,
          highestFinish: 60,
          count180: 0,
          count140: 1,
          bestLegDarts: 17,
          dartsThrown: 65,
        },
      },
    ],
  },
} as unknown as GameDetail

const won = (players = ['Christoph', 'Lena'], game: Record<string, unknown> = {}) =>
  x01({
    players,
    status: 'finished',
    game: {
      phase: 'finished',
      winner: 0,
      nextPlayer: null,
      legs: [3, 1, 0, 0].slice(0, players.length),
      scores: [0, 75, 152, 245].slice(0, players.length),
      ...game,
    },
  })

describe('x01Win', () => {
  it('names the winner and orders the standings by placement', () => {
    const v = x01Win(won(['Christoph', 'Lena', 'Max'], { legs: [1, 2, 0], winner: 1, scores: [100, 0, 50] }))
    expect(v.party).toBe(true)
    expect(v.winner.name).toBe('Lena')
    expect(v.standings.map(s => [s.place, s.name, s.legs])).toEqual([
      [1, 'Lena', 2],
      [2, 'Christoph', 1],
      [3, 'Max', 0],
    ])
    expect(v.legs).toEqual([2, 1, 0])
  })

  it('compares the two sides with the artboard labels', () => {
    const v = x01Win(won())
    expect(v.party).toBe(false)
    expect(v.stats.map(s => s.label)).toEqual(['3-DART AVERAGE', 'FIRST 9 AVERAGE', 'CHECKOUT', 'HIGHEST FINISH', '180S', 'BEST LEG'])
    expect(v.stats[0].values).toEqual(['72.0', '69.0'])
    // Without the saved game only the average is known
    expect(v.stats.slice(1).map(s => s.values)).toEqual(Array(5).fill(['–', '–']))
  })

  it('builds the game shot line from the last visit, the darts from the saved game', () => {
    const legVisits = [
      { seat: 1, scored: 3, left: 498, bust: false, darts: 3 },
      { seat: 0, scored: 75, left: 0, bust: false, darts: 2 },
    ]
    const v = x01Win(won(undefined, { legVisits, legs: [3, 1] }))
    // legs 3 + 1: this was leg 4; Christoph threw 2 darts in it
    expect(v.gameShotText).toBe('Christoph · 75 left · leg 4 in 2 darts')
    expect(v.gameShot).toBeNull()
    expect(v.kicker).toBe('GAME SHOT')
    expect(x01Win(won(undefined, { legVisits }), detail).gameShot).toBe('T17 · D12')
  })

  it('hides the game shot when the last visit is not the winner’s', () => {
    expect(x01Win(won(undefined, { legVisits: [{ seat: 1, scored: 3, left: 498, bust: false, darts: 3 }] })).gameShotText).toBeNull()
    expect(x01Win(won()).gameShotText).toBeNull()
  })

  it('reads the six stat rows and the first 9 from the saved game', () => {
    const v = x01Win(won(), detail)
    expect(v.stats.map(s => [s.label, s.values])).toEqual([
      ['3-DART AVERAGE', ['83.9', '71.6']],
      ['FIRST 9 AVERAGE', ['86.4', '80.7']],
      ['CHECKOUT', ['50%', '25%']],
      ['HIGHEST FINISH', ['116', '60']],
      ['180S', ['2', '0']],
      ['BEST LEG', ['15', '17']],
    ])
    expect(v.standings.map(s => s.firstNine)).toEqual(['86.4', '80.7'])
  })

  it('ranks a forfeit (no winner in the snapshot) from the saved placements', () => {
    const forfeit = won(undefined, { winner: null, legs: [1, 1], scores: [100, 60] })
    // Lena (seat 1) was placed first by the server although seat 0 is first in the snapshot
    const placed = {
      ...detail,
      game: { ...detail.game, players: detail.game.players.map(p => ({ ...p, placement: 2 - p.seat })) },
    }
    expect(x01Win(forfeit, placed).winner.name).toBe('Lena')
  })
})

describe('big screen X01 components', () => {
  const live = { game: { scores: [81, 87], currentVisitDarts: [dart('T20', 60)] } }
  it.each(['landscape', 'portrait'] as const)('renders the live view in %s', orientation => {
    for (const players of [
      ['Christoph', 'Lena'],
      ['A', 'B', 'C', 'D'],
    ]) {
      const { body } = render(X01Live, { props: { snapshot: x01({ players, ...live }), orientation } })
      for (const text of ['THROWING', 'THIS VISIT', 'AVG', 'DARTS', 'TO WIN']) expect(body).toContain(text)
      expect(body).not.toContain('<button')
    }
  })

  it.each(['landscape', 'portrait'] as const)('renders the match won view in %s', orientation => {
    const duel = render(X01Win, { props: { snapshot: won(), orientation, countdown: 'Board screen in 0:42' } }).body
    for (const text of [
      'WINNER',
      'MATCH STATS',
      '3-DART AVERAGE',
      'FIRST 9 AVERAGE',
      'BEST LEG',
      'Saved to History',
      'Board screen in',
      '0:42',
    ]) {
      expect(duel).toContain(text)
    }
    const party = render(X01Win, { props: { snapshot: won(['A', 'B', 'C', 'D']), orientation, countdown: 'Board screen in 0:42' } }).body
    expect(party).toContain('A WINS')
    expect(party).toContain('FIRST 9')
  })
})
