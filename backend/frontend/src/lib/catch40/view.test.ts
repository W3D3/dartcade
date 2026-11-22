import { describe, it, expect } from 'vitest'
import { catch40Meta, catch40Pips, catch40Banner, pointsLabel } from './view.js'
import type { Catch40Game } from '../api/game-ws'

type Seat = Catch40Game['seats'][number]

const seat = (o: Partial<Seat> = {}): Seat => ({
  target: 63,
  left: 24,
  darts: 3,
  tries: [
    { target: 61, darts: 2, points: 3, finish: 'D2' },
    { target: 62, darts: 6, points: 0, finish: null },
  ],
  total: 3,
  done: false,
  ...o,
})

const game = (seats: Seat[], o: Partial<Catch40Game> = {}): Catch40Game =>
  ({
    phase: 'game',
    currentPlayer: 0,
    nextPlayer: 0,
    winner: null,
    visitLocked: false,
    bust: false,
    visitStartLeft: 63,
    seats,
    lastResult: null,
    bullOff: null,
    currentVisitDarts: [],
    totalDarts: 0,
    totalVisits: 0,
    ...o,
  }) as Catch40Game

describe('catch40Meta', () => {
  it('names the target and the rules', () => {
    expect(catch40Meta(game([seat()]), 0)).toBe('Target 63 of 100 · 6 darts · double out')
  })
  it('caps the target after the last one', () => {
    expect(catch40Meta(game([seat({ target: 101 })]), 0)).toBe('Target 100 of 100 · 6 darts · double out')
  })
  it('is the session summary once finished', () => {
    expect(catch40Meta(game([seat()], { phase: 'finished' }), 0)).toBe('Session summary')
  })
})

describe('catch40Pips', () => {
  it('marks committed and open-visit darts in two groups of three', () => {
    expect(catch40Pips(game([seat()]), 0, 2)).toEqual([
      ['used', 'used', 'used'],
      ['current', 'current', 'open'],
    ])
  })
})

describe('catch40Banner', () => {
  it('says the points of a checkout for the seat that threw it', () => {
    const g = game([seat()], { lastResult: { seat: 0, target: 61, darts: 2, points: 3 } })
    expect(catch40Banner(g, 0)).toEqual({ kind: 'made', text: 'Checked out 61 in 2 darts · 3 pts' })
    expect(catch40Banner(g, 1)).toBeNull()
  })
  it('says a target was missed', () => {
    const g = game([seat()], { lastResult: { seat: 0, target: 62, darts: 6, points: 0 } })
    expect(catch40Banner(g, 0)).toEqual({ kind: 'missed', text: 'Missed 62 · 0 pts' })
  })
  it('pluralises points', () => {
    expect(pointsLabel(1)).toBe('1 pt')
  })
})
