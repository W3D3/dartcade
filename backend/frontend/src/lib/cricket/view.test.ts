import { describe, it, expect } from 'vitest'
import { cricketMeta } from './view.js'
import type { CricketGame } from '../api/game-ws'

const game = (o: Partial<CricketGame> = {}): CricketGame => ({
  config: { mode: 'standard', firstTo: 3, botSpeed: 'normal' },
  phase: 'game',
  targets: [20, 19, 18, 17, 16, 15, 25],
  marks: [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
  ],
  points: [0, 0],
  legs: [0, 0],
  firstTo: 3,
  closed: [false, false, false, false, false, false, false],
  scorable: [false, false, false, false, false, false, false],
  currentPlayer: 0,
  nextPlayer: 1,
  round: 4,
  winner: null,
  visitLocked: false,
  marksScored: [0, 0],
  dartsThrown: [0, 0],
  lastVisit: [null, null],
  bullOff: null,
  currentVisitDarts: [],
  totalDarts: [0, 0],
  totalVisits: [0, 0],
  ...o,
})

describe('cricketMeta', () => {
  it('shows the player count, mode, first to, and round', () => {
    expect(cricketMeta(game(), 2)).toBe('2 players · Standard · First to 3 · Round 4')
  })
  it('cut-throat mode reads as Cut-throat', () => {
    expect(cricketMeta(game({ config: { mode: 'cutthroat', firstTo: 3, botSpeed: 'normal' } }), 2)).toBe(
      '2 players · Cut-throat · First to 3 · Round 4',
    )
  })
  it('a solo practice session still reads "1 player"', () => {
    expect(cricketMeta(game({ round: 1 }), 1)).toBe('1 player · Standard · First to 3 · Round 1')
  })
})
