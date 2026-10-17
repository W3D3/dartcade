import { describe, it, expect } from 'vitest'
import { hiloMeta, needsLine, highHint, outcomeText, bannerText, zoneOf } from './view.js'
import type { HiloGame } from '../api/game-ws'

const game = (o: Partial<HiloGame> = {}): HiloGame => ({
  cfg: { startHigh: 41, startLow: 21, lives: 3, t1Zero: false, matchExtremes: true },
  phase: 'game',
  high: 60,
  low: 15,
  round: 4,
  currentPlayer: 0,
  nextPlayer: 1,
  winner: null,
  visitLocked: false,
  visitTotal: 0,
  seats: [
    { lives: 3, out: false, place: null, outRound: null, visits: [] },
    { lives: 3, out: false, place: null, outRound: null, visits: [] },
  ],
  lastResult: null,
  bullOff: null,
  currentVisitDarts: [],
  totalDarts: [0, 0],
  totalVisits: [0, 0],
  ...o,
})

describe('hiloMeta', () => {
  it('shows the player count, lives and round', () => {
    expect(hiloMeta(game(), 2)).toBe('2 players · 3 lives · Round 4')
  })
  it('a solo practice session reads "1 player"', () => {
    expect(hiloMeta(game({ round: 1 }), 1)).toBe('1 player · 3 lives · Round 1')
  })
  it('one life reads "1 life", not "1 lifes"', () => {
    expect(hiloMeta(game({ cfg: { ...game().cfg, lives: 1 } }), 2)).toBe('2 players · 1 life · Round 4')
  })
})

describe('needsLine', () => {
  it('names the current bars', () => {
    expect(needsLine(game())).toBe('Over 60 · under 15')
  })
})

describe('highHint', () => {
  it('the smallest total that beats the high bar', () => {
    expect(highHint(game({ visitTotal: 25 }), 1)).toEqual({ need: 36, label: '36+ · beats HIGH 60' })
  })
  it('null once the visit is already safe high', () => {
    expect(highHint(game({ visitTotal: 70 }), 1)).toBeNull()
  })
  it('null when it needs more than 60 per dart left', () => {
    // 2 darts thrown, 1 left: 60 max, but 61 is needed
    expect(highHint(game({ high: 60, visitTotal: 0 }), 2)).toBeNull()
  })
  it('never a hint with the high bar at 180 (matchExtremes only matches it, never beats it)', () => {
    expect(highHint(game({ high: 180, visitTotal: 0 }), 0)).toBeNull()
  })
})

describe('outcomeText', () => {
  it('reads the outcome', () => {
    expect(outcomeText({ total: 60, outcome: 'high' })).toBe('Set HIGH 60')
    expect(outcomeText({ total: 7, outcome: 'low' })).toBe('Set LOW 7')
    expect(outcomeText({ total: 45, outcome: 'between' })).toBe('Lost a life · 45')
    expect(outcomeText({ total: 0, outcome: 'miss' })).toBe('Missed the board')
  })
})

describe('bannerText', () => {
  it('a life lost between the bars', () => {
    expect(bannerText({ seat: 0, total: 45, outcome: 'between', high: 60, low: 15 })).toBe('−1 life · 45 is between 15 and 60')
  })
  it('a life lost to a miss', () => {
    expect(bannerText({ seat: 0, total: 0, outcome: 'miss', high: 60, low: 15 })).toBe('−1 life · missed the board')
  })
  it('no banner for setting a bar (high or low)', () => {
    expect(bannerText({ seat: 0, total: 65, outcome: 'high', high: 60, low: 15 })).toBeNull()
    expect(bannerText({ seat: 0, total: 10, outcome: 'low', high: 60, low: 15 })).toBeNull()
  })
})

describe('zoneOf', () => {
  it('above the high bar is safe-high, below the low bar is safe-low, otherwise danger', () => {
    expect(zoneOf(70, game())).toBe('safe-high')
    expect(zoneOf(10, game())).toBe('safe-low')
    expect(zoneOf(40, game())).toBe('danger')
  })
  it('a 180 high bar: matched only with matchExtremes on', () => {
    const g = game({ high: 180, cfg: { ...game().cfg, matchExtremes: true } })
    expect(zoneOf(180, g)).toBe('safe-high')
    expect(zoneOf(180, { ...g, cfg: { ...g.cfg, matchExtremes: false } })).toBe('danger')
  })
  it('a 0 low bar: matched only with matchExtremes on', () => {
    const g = game({ low: 0, cfg: { ...game().cfg, matchExtremes: true } })
    expect(zoneOf(0, g)).toBe('safe-low')
    expect(zoneOf(0, { ...g, cfg: { ...g.cfg, matchExtremes: false } })).toBe('danger')
  })
})
