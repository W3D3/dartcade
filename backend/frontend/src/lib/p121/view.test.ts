import { describe, it, expect } from 'vitest'
import { p121Meta, p121Hint, p121Pips, p121Banner } from './view.js'
import type { P121Game } from '../api/game-ws'

type Seat = P121Game['seats'][number]

const seat = (o: Partial<Seat> = {}): Seat => ({
  target: 123,
  left: 24,
  darts: 3,
  visits: [60],
  floor: 0,
  tries: [
    { target: 121, made: true, darts: 6, finish: 'D10' },
    { target: 122, made: true, darts: 7, finish: 'D11' },
    { target: 123, made: true, darts: 5, finish: 'D12' },
  ],
  made: 3,
  highestMade: 122,
  avgDarts: 6,
  done: false,
  ...o,
})

const game = (seats: Seat[], o: Partial<P121Game> = {}): P121Game => ({
  cfg: { startTarget: 121, tries: 10, dartsPerTry: 9, outMode: 'double', missRule: 'reset', lock: false },
  phase: 'game',
  currentPlayer: 0,
  nextPlayer: 1,
  winner: null,
  visitLocked: false,
  bust: false,
  visitStartLeft: 60,
  seats,
  lastResult: null,
  bullOff: null,
  currentVisitDarts: [],
  totalDarts: [9],
  totalVisits: [1],
  ...o,
})

describe('p121Meta', () => {
  it('shows the try count, darts per try and out mode', () => {
    expect(p121Meta(game([seat()]), 0)).toBe('Try 4 of 10 · 9 darts · double out')
  })
  it('caps the try count at the configured tries', () => {
    const many = Array.from({ length: 10 }, () => ({ target: 121, made: true, darts: 6, finish: 'D10' }))
    expect(p121Meta(game([seat({ tries: many })]), 0)).toBe('Try 10 of 10 · 9 darts · double out')
  })
  it('shows the session summary once the game has finished', () => {
    expect(p121Meta(game([seat()], { phase: 'finished' }), 0)).toBe('Session summary')
  })
})

describe('p121Hint', () => {
  it('hits the route to make it and shows the next target', () => {
    expect(p121Hint(game([seat()]), 0, ['D12'])).toBe('Hit D12 to make it and move up to 124.')
  })
  it('falls back to scoring when there is no route (above 170, or none fits)', () => {
    expect(p121Hint(game([seat({ left: 171 })]), 0, null)).toBe('Score 171 to make it.')
  })
  it('joins a two-dart route with "then"', () => {
    expect(p121Hint(game([seat()]), 0, ['T20', 'D16'])).toBe('Hit T20 then D16 to make it and move up to 124.')
  })
  it('joins a three-dart route with "then"', () => {
    expect(p121Hint(game([seat()]), 0, ['T20', 'T20', 'D16'])).toBe('Hit T20 then T20 then D16 to make it and move up to 124.')
  })
})

describe('p121Pips', () => {
  it('groups darts in threes: used (committed), current (open visit), open (not thrown)', () => {
    expect(p121Pips(game([seat()]), 0, 1)).toEqual([
      ['used', 'used', 'used'],
      ['current', 'open', 'open'],
      ['open', 'open', 'open'],
    ])
  })
})

describe('p121Banner', () => {
  it('misses and drops back to a lower target', () => {
    const g = game([seat()], { lastResult: { seat: 0, target: 123, made: false, darts: 9, next: 121 } })
    expect(p121Banner(g, 0)).toEqual({ kind: 'missed', text: 'Missed 123 · back to 121' })
  })
  it('misses and stays on the same target', () => {
    const g = game([seat()], { lastResult: { seat: 0, target: 123, made: false, darts: 9, next: 123 } })
    expect(p121Banner(g, 0)).toEqual({ kind: 'missed', text: 'Missed 123 · again' })
  })
  it('makes it and shows the next target', () => {
    const g = game([seat()], { lastResult: { seat: 0, target: 123, made: true, darts: 5, next: 124 } })
    expect(p121Banner(g, 0)).toEqual({ kind: 'made', text: 'Checked out 123 in 5 darts · next 124' })
  })
  it('is null without a result for this seat', () => {
    expect(p121Banner(game([seat()]), 0)).toBeNull()
  })
})
