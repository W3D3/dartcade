import { describe, it, expect } from 'vitest'
import { emptyHistory } from '../visitHistory.js'
import { matchView } from '../matchView.js'
import type { Snapshot } from '../ws.js'

const dart = (name: string, score: number, number = 0) => ({ segment: { name, number, bed: 'Single', multiplier: 1 }, score })
const SETTINGS = { checkoutSuggestions: true, favouriteDouble: null, scoreUpdates: 'dart', showMarkers: true } as const

function snap(gameId: string, names: string[], game: Record<string, unknown>, status = 'active'): Snapshot {
  return {
    type: 'snapshot',
    sessionId: 's1',
    gameId,
    boardId: 'b1',
    lobbyId: null,
    lobbyName: null,
    players: names.map(name => ({ name })),
    game,
    bmStatus: null,
    status,
    finishPending: false,
    canUndoVisit: false,
    ownerUserId: 'u1',
    seats: names.map(() => ({ userId: null, boardName: 'Living room', forfeited: false, bot: null })),
    mySeats: [0],
  } as unknown as Snapshot
}

function x01(darts = [dart('T20', 60, 20), dart('T20', 60, 20)], scores = [40, 87]) {
  const n = scores.length
  return snap(
    'x01',
    scores.map((_, i) => `P${i + 1}`),
    {
      scores,
      legs: scores.map(() => 0),
      firstTo: 1,
      currentPlayer: 0,
      nextPlayer: 1,
      round: 3,
      phase: 'game',
      winner: null,
      opened: scores.map(() => true),
      bustThisVisit: false,
      config: { outMode: 'double', inMode: 'straight', startScore: 501, botSpeed: 'normal' },
      visitLocked: false,
      bullOff: null,
      currentVisitDarts: darts,
      totalDarts: scores.map(() => 12),
      totalVisits: scores.map(() => 4),
      pointsScored: scores.map(() => 300),
      dartsThrown: scores.map(() => 12),
      legVisits: [],
      lastVisit: scores.map(() => null),
      checkoutAttempts: scores.map(() => 0),
      checkoutHits: scores.map(() => 0),
      visitStartScores: [160, 87].slice(0, n),
    },
  )
}

function atc(names = ['A', 'B']) {
  return snap('atc', names, {
    targets: [14, 9, 3].slice(0, names.length),
    sequence: [...Array.from({ length: 20 }, (_, i) => i + 1), 22],
    currentPlayer: 0,
    nextPlayer: 1,
    winner: null,
    cfg: { throwAgainOnAllHit: false, finishOn: 'bull', multiplierAdvances: false, order: 'asc' },
    currentVisitHits: [true, false],
    hitCounts: [13, 8, 2].slice(0, names.length),
    currentVisitDarts: [dart('S13', 13, 13), dart('S11', 11, 11)],
    totalDarts: names.map(() => 12),
    totalVisits: names.map(() => 4),
  })
}

describe('matchView, X01', () => {
  const mv = matchView(x01(), emptyHistory(), SETTINGS)
  it('derives the seats, the band, the slots and the pop', () => {
    expect(mv.x01Players.map(p => p.remaining)).toEqual([40, 87])
    expect(mv.band).toMatchObject({ sum: '120', fx: 'ton', bust: false })
    expect(mv.slots.map(s => s.kind)).toEqual(['thrown', 'thrown', 'suggested-next'])
    expect(mv.popIndex).toBe(1)
    // every finished visit: 4 + 4
    expect(mv.visitKey).toBe(8)
  })
  it('lights the very next suggested dart on the board', () => {
    expect(mv.checkoutTargets).toHaveLength(1)
  })
  it('has no Around the Clock extras', () => {
    expect([mv.boardTarget, mv.boardNext, mv.markers, mv.legend]).toEqual([null, null, [], []])
  })
  it('names who is throwing and who is next', () => {
    expect([mv.pillFor(0, false), mv.pillFor(1, false), mv.nextPlayer]).toEqual(['throwing', 'up-next', 1])
  })
  it('names the winner', () => {
    const won = x01([], [0, 87])
    if (won.gameId !== 'x01') throw new Error('x01')
    won.game.winner = 0
    won.status = 'finished'
    expect(matchView(won, emptyHistory(), SETTINGS).pillFor(0, false)).toBe('winner')
  })
  it('makes a practice pill for a solo game and no teams', () => {
    expect(matchView(x01([], [141]), emptyHistory(), SETTINGS).pillFor(0, false)).toBe('practice')
    expect(mv.teams).toEqual([])
  })
})

describe('matchView, Around the Clock', () => {
  it('highlights the thrower’s target and the next player’s, in a duel', () => {
    const mv = matchView(atc(), emptyHistory(), SETTINGS)
    expect([mv.boardTarget, mv.boardNext]).toEqual([14, 9])
    expect(mv.legend.map(l => l.kind)).toEqual(['current', 'next'])
    expect(mv.atcPlayers.map(p => p.target)).toEqual(['14', '9'])
    expect(mv.popIndex).toBeNull()
    expect(mv.nextPlayer).toBe(1)
  })
  it('marks every target from three players, if markers are on', () => {
    const three = atc(['A', 'B', 'C'])
    expect(matchView(three, emptyHistory(), SETTINGS).markers.map(m => [m.initial, m.segment, m.isActive])).toEqual([
      ['A', 14, true],
      ['B', 9, false],
      ['C', 3, false],
    ])
    const off = matchView(three, emptyHistory(), { ...SETTINGS, showMarkers: false })
    expect([off.markers, off.legend.map(l => l.kind)]).toEqual([[], ['current']])
  })
  it('has nothing to highlight once the game is over', () => {
    const mv = matchView({ ...atc(), status: 'finished' }, emptyHistory(), SETTINGS)
    expect([mv.boardTarget, mv.boardNext, mv.legend]).toEqual([null, null, []])
  })
})

describe('matchView, no game', () => {
  it('is empty', () => {
    const mv = matchView(null, emptyHistory(), SETTINGS)
    expect([mv.x01Players, mv.atcPlayers, mv.teams, mv.visitKey]).toEqual([[], [], [], 0])
  })
})
