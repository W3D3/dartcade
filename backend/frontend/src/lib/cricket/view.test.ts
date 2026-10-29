import { describe, it, expect } from 'vitest'
import { cricketMeta, cricketMpr, cricketSides, dartMarks, legNumber, markGlyph, targetLabel, targetState } from './view.js'
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

describe('markGlyph', () => {
  it('0 marks is blank, 1 is a slash, 2 is an X, 3 or more is the closed glyph', () => {
    expect(markGlyph(0)).toBe('')
    expect(markGlyph(1)).toBe('/')
    expect(markGlyph(2)).toBe('X')
    expect(markGlyph(3)).toBe('⊗')
    expect(markGlyph(4)).toBe('⊗')
  })
})

describe('targetLabel', () => {
  it('names every target, and the bull by name', () => {
    expect(targetLabel(20)).toBe('20')
    expect(targetLabel(15)).toBe('15')
    expect(targetLabel(25)).toBe('Bull')
  })
})

describe('targetState', () => {
  it('closed once every team has opened it, even for the thrower', () => {
    const g = game({
      closed: [true, false, false, false, false, false, false],
      marks: [
        [3, 0, 0, 0, 0, 0, 0],
        [3, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(targetState(g, 0, 0)).toBe('closed')
  })
  it('scorable for the thrower once only their team has opened it', () => {
    const g = game({
      currentPlayer: 0,
      scorable: [true, false, false, false, false, false, false],
      marks: [
        [3, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(targetState(g, 0, 0)).toBe('score')
  })
  it('not scorable for the other team, even though the target is scorable for the thrower', () => {
    const g = game({
      currentPlayer: 0,
      scorable: [true, false, false, false, false, false, false],
      marks: [
        [3, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(targetState(g, 1, 0)).toBe('need')
  })
  it('needs more marks while this seat has fewer than 3', () => {
    const g = game({
      marks: [
        [1, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(targetState(g, 0, 0)).toBe('need')
  })
  it('done once this seat opened it but it is not scorable (opponent not throwing, or already closed for them)', () => {
    const g = game({
      currentPlayer: 1,
      scorable: [false, false, false, false, false, false, false],
      marks: [
        [3, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0],
      ],
    })
    expect(targetState(g, 0, 0)).toBe('done')
  })
  it('in a team game, a teammate of the thrower also sees score', () => {
    const g = game({
      currentPlayer: 0,
      scorable: [true, false, false, false, false, false, false],
      marks: [
        [3, 0, 0, 0, 0, 0, 0],
        [3, 0, 0, 0, 0, 0, 0],
      ],
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 1], points: 0, legs: 0 },
        { id: 'B', name: 'Team B', seats: [2, 3], points: 0, legs: 0 },
      ],
    })
    expect(targetState(g, 1, 0)).toBe('score')
  })
})

describe('dartMarks', () => {
  const targets = [20, 19, 18, 17, 16, 15, 25]
  it('counts a treble 3, a double 2 and a single 1 on a target, nothing elsewhere', () => {
    expect(dartMarks({ number: 19, multiplier: 3 }, targets)).toBe(3)
    expect(dartMarks({ number: 18, multiplier: 2 }, targets)).toBe(2)
    expect(dartMarks({ number: 5, multiplier: 3 }, targets)).toBe(0)
    expect(dartMarks({ number: 20, multiplier: 0 }, targets)).toBe(0)
  })
  it('counts the outer bull 1 and the bullseye 2, however it is reported', () => {
    expect(dartMarks({ number: 25, multiplier: 1 }, targets)).toBe(1)
    expect(dartMarks({ number: 25, multiplier: 2 }, targets)).toBe(2)
    expect(dartMarks({ number: 50, multiplier: 1 }, targets)).toBe(2)
  })
})

describe('cricketSides', () => {
  it('is a side per player, or per team with its members', () => {
    const players = [{ name: 'Ann' }, { name: 'Ben' }, { name: 'Cat' }, { name: 'Dan' }]
    expect(cricketSides(game(), players.slice(0, 2))).toEqual([
      { seat: 0, seats: [0], name: 'Ann', members: null },
      { seat: 1, seats: [1], name: 'Ben', members: null },
    ])
    const teams = [
      { id: 'A' as const, name: 'Team A', seats: [0, 2], points: 0, legs: 0 },
      { id: 'B' as const, name: 'Team B', seats: [1, 3], points: 0, legs: 0 },
    ]
    expect(cricketSides(game({ teams }), players)[1]).toEqual({ seat: 1, seats: [1, 3], name: 'Team B', members: 'Ben · Dan' })
  })
})

describe('cricketMpr', () => {
  it("is marks per three darts, counting the thrower's open visit", () => {
    expect(cricketMpr(game({ marksScored: [0, 0], dartsThrown: [0, 0] }), [1])).toBe('0.0')
    expect(cricketMpr(game({ marksScored: [0, 7], dartsThrown: [0, 9] }), [1])).toBe('2.3')
    const open = game({ currentPlayer: 1, marksScored: [0, 10], dartsThrown: [0, 9], currentVisitDarts: [{}, {}, {}] as never })
    expect(cricketMpr(open, [1])).toBe('2.5')
  })
})

describe('legNumber', () => {
  it('counts the legs played so far, a team once', () => {
    expect(legNumber(game({ legs: [1, 2] }))).toBe(4)
    const teams = [
      { id: 'A' as const, name: 'Team A', seats: [0, 2], points: 0, legs: 1 },
      { id: 'B' as const, name: 'Team B', seats: [1, 3], points: 0, legs: 0 },
    ]
    expect(legNumber(game({ legs: [1, 0, 1, 0], teams }))).toBe(2)
  })
})
