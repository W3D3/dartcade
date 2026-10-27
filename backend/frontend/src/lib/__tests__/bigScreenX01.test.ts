import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import { x01Live, x01Win } from '../bigscreen/x01View.js'
import X01Live from '../components/bigscreen/X01Live.svelte'
import X01Win from '../components/bigscreen/X01Win.svelte'
import type { Snapshot } from '../ws.js'

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
    expect(v.stats[2].values).toEqual(['50%', '25%'])
    // The snapshot has no first-9, finish or 180 history
    expect(v.stats[1].values).toEqual(['–', '–'])
  })

  it('has no game shot without the finishing darts, and names them with them', () => {
    expect(x01Win(won()).gameShot).toBeNull()
    const v = x01Win(won(undefined, { currentVisitDarts: [dart('T17', 51), dart('D12', 24)] }))
    expect(v.gameShot).toBe('T17 · D12')
  })
})

describe('big screen X01 components', () => {
  const live = { game: { scores: [81, 87], currentVisitDarts: [dart('T20', 60)] } }
  it.each(['landscape', 'portrait'] as const)('renders the live view in %s', orientation => {
    for (const players of [
      ['Christoph', 'Lena'],
      ['A', 'B', 'C', 'D'],
    ]) {
      const { body } = render(X01Live, { props: { snapshot: x01({ players, ...live }), orientation, countdown: '' } })
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
