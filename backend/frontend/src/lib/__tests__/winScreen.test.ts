import { describe, it, expect } from 'vitest'
import { sharedBoard, winMeta, winView } from '../winScreen.js'
import type { GameDetail, Snapshot } from '../api'

const seat = (o: { userId?: string | null; boardName?: string | null } = {}) => ({
  controllerUserId: 'u1', userId: o.userId === undefined ? 'u1' : o.userId, boardId: 'b1',
  boardName: o.boardName === undefined ? 'Living room' : o.boardName, boardOnline: true,
  controllerConnected: true, disconnectedAt: null, forfeited: false,
})

function x01(o: { players?: string[]; game?: Record<string, unknown>; guests?: number[] } = {}): Snapshot {
  const names = o.players ?? ['Christoph', 'Guest 1']
  const n = names.length
  return {
    type: 'snapshot', sessionId: 's1', gameId: 'x01', boardId: 'b1', lobbyId: 'l1', lobbyName: 'Friday darts',
    players: names.map(name => ({ name })),
    game: {
      scores: [0, 75, 152, 245].slice(0, n), legs: [3, 1, 0, 0].slice(0, n), firstTo: 3, currentPlayer: 0, nextPlayer: null,
      round: 20, phase: 'finished', winner: 0, opened: names.map(() => true), bustThisVisit: false,
      config: { outMode: 'double', inMode: 'straight', startScore: 501 }, visitLocked: true,
      currentVisitDarts: [], totalDarts: [66, 65, 60, 60].slice(0, n), totalVisits: [22, 22, 20, 20].slice(0, n),
      ...o.game,
    },
    bmStatus: null, status: 'finished', finishPending: false, canUndoVisit: false, ownerUserId: 'u1',
    seats: names.map((_, i) => seat({ userId: o.guests?.includes(i) ? null : `u${i + 1}` })), mySeats: [0],
  } as unknown as Snapshot
}

const dart = (name: string, index = 0) => ({ index, segment: { name, number: 0, bed: 'Single', multiplier: 1 }, coords: null, source: 'camera', corrected: false, thrownAt: '' })
const visit = (seat: number, darts: string[], scored: number, remaining: number) =>
  ({ visit: 0, seat, committedAt: '', darts: darts.map(dart), scored, remaining, bust: false })

// Christoph wins 3–1: legs 1, 3 and 4 his (leg 4 checked out 75 with T17 · D12), leg 2 Guest 1's
const detail = (): GameDetail => ({
  game: {
    id: 's1', mode: 'x01', config: {}, createdAt: '', finishedAt: '', board: null, mySeat: 0,
    players: [
      { seat: 0, name: 'Christoph', userId: 'u1', placement: 1, throwPosition: 0, forfeited: false, stats: { average: 83.9, dartsThrown: 66, legsWon: 3, pointsScored: 1846, bestCheckout: 116 } },
      { seat: 1, name: 'Guest 1', userId: null, placement: 2, throwPosition: 1, forfeited: false, stats: { average: 71.6, dartsThrown: 65, legsWon: 1, pointsScored: 1551.33, bestCheckout: 60 } },
    ],
  },
  detail: {
    mode: 'x01',
    legs: [
      { leg: 0, starter: 0, winner: 0, visits: [visit(0, ['T20', 'T20', 'T20'], 180, 321), visit(1, ['S20', 'S20', 'S20'], 60, 441), visit(0, ['D15'], 30, 0)] },
      { leg: 1, starter: 1, winner: 1, visits: [visit(1, ['S20', 'D20'], 60, 0)] },
      { leg: 2, starter: 0, winner: 0, visits: [visit(0, ['T20', 'S20', 'D18'], 116, 0)] },
      { leg: 3, starter: 1, winner: 0, visits: [visit(1, ['S1', 'S1', 'S1'], 3, 498), visit(0, ['T20', 'T20', 'T20'], 180, 75), visit(0, ['T17', 'D12'], 75, 0)] },
    ],
  },
}) as unknown as GameDetail

describe('winView', () => {
  it('is null before anyone has won', () => {
    expect(winView(x01({ game: { winner: null } }), null)).toBeNull()
    // A winning visit waiting for Finish game: the match screen stays
    expect(winView({ ...x01(), status: 'active' }, null)).toBeNull()
    expect(winView(null, null)).toBeNull()
  })

  it('X01 duel: the winner first, the legs score, and the stats from the saved game', () => {
    const v = winView(x01({ guests: [1] }), detail())!
    expect(v.layout).toBe('duel')
    expect(v.competitors.map(c => [c.name, c.placement, c.score, c.guest])).toEqual([['Christoph', 1, 3, false], ['Guest 1', 2, 1, true]])
    expect(v.competitors[0].sub).toBe('3 legs · 83.9 avg')
    expect(v.scoreLabel).toBe('Legs · first to 3')
    expect(v.stats).toEqual([
      { label: '3-dart average', values: ['83.9', '71.6'], share: expect.closeTo(0.54, 2) },
      { label: 'Highest finish', values: ['116', '60'], share: expect.closeTo(0.66, 2) },
      { label: 'Darts thrown', values: ['66', '65'], share: expect.closeTo(0.5, 1) },
    ])
  })

  it('X01: the final checkout and every leg, with the darts the leg took its winner', () => {
    const v = winView(x01({ guests: [1] }), detail())!
    expect(v.checkout).toEqual({ name: 'Christoph', left: 75, darts: 'T17 · D12', tail: 'to take leg 4 in 5 darts.' })
    expect(v.legs).toEqual([
      { n: 1, name: 'Christoph', guest: false, byWinner: true, text: '4 darts · D15' },
      { n: 2, name: 'Guest 1', guest: true, byWinner: false, text: '2 darts · S20 · D20' },
      { n: 3, name: 'Christoph', guest: false, byWinner: true, text: '3 darts · T20 · S20 · D18' },
      { n: 4, name: 'Christoph', guest: false, byWinner: true, text: '5 darts · T17 · D12' },
    ])
  })

  it('X01 before the saved game loads: placements and legs from the snapshot, no averages', () => {
    const v = winView(x01(), null)!
    expect(v.competitors.map(c => c.sub)).toEqual(['3 legs', '1 leg'])
    expect(v.stats.map(s => s.label)).toEqual(['Darts thrown'])
    expect(v.legs).toEqual([])
    expect(v.checkout).toBeNull()
  })

  it('X01 party: the rest ranked by legs, then by points left', () => {
    const v = winView(x01({ players: ['Christoph', 'Lena', 'Guest 1', 'Max'], game: { legs: [3, 1, 0, 0], scores: [0, 32, 245, 152] } }), null)!
    expect(v.layout).toBe('party')
    expect(v.competitors.map(c => [c.name, c.placement])).toEqual([['Christoph', 1], ['Lena', 2], ['Max', 3], ['Guest 1', 4]])
    expect(v.kicker).toBe('Game shot · leg 4')
    expect(v.note).toBe("3 legs to Lena's 1 · the rest ranked by legs, then by points left in the last leg")
  })

  it('X01 teams: a side per team, named after it', () => {
    const v = winView(x01({
      players: ['Christoph', 'Lena', 'Guest 1', 'Max'],
      game: { winner: 2, legs: [1, 2, 1, 2], scores: [40, 0, 40, 0], teams: [
        { id: 'A', name: 'Team A', seats: [0, 2], score: 40, legs: 1 },
        { id: 'B', name: 'Team B', seats: [1, 3], score: 0, legs: 2 },
      ] },
    }), null)!
    expect(v.layout).toBe('duel')
    expect(v.competitors.map(c => [c.name, c.members, c.placement])).toEqual([['Team A', ['Christoph', 'Guest 1'], 1], ['Team B', ['Lena', 'Max'], 2]])
  })

  it('Around the Clock: targets done, darts and hit rate from the snapshot', () => {
    const snap = {
      ...x01(), gameId: 'atc',
      game: {
        targets: [22, 15], sequence: Array.from({ length: 21 }, (_, i) => i + 1), currentPlayer: 0, winner: 0,
        cfg: { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' },
        currentVisitHits: [], hitCounts: [21, 14], currentVisitDarts: [], totalDarts: [42, 42], totalVisits: [14, 14],
      },
    } as unknown as Snapshot
    const v = winView(snap, null)!
    expect(v.competitors.map(c => [c.name, c.score, c.cells])).toEqual([['Christoph', 21, ['21', '42', '50%']], ['Guest 1', 14, ['14', '42', '33%']]])
    expect(v.scoreLabel).toBe('Targets · of 21')
    expect(v.stats.map(s => s.label)).toEqual(['Targets done', 'Darts thrown', 'Hit rate'])
  })
})

describe('winMeta / sharedBoard', () => {
  it('names the rules, and both players in a duel', () => {
    expect(winMeta(x01())).toBe('501 · Double out · First to 3 legs · Christoph vs Guest 1')
    expect(winMeta(x01({ players: ['A', 'B', 'C'] }))).toBe('3 players · 501 · Double out · First to 3 legs')
  })

  it('names the board only when everyone threw on it', () => {
    expect(sharedBoard(x01())).toBe('Living room')
    const s = x01()
    s.seats[1] = seat({ boardName: "Lena's place" })
    expect(sharedBoard(s)).toBeNull()
  })
})
