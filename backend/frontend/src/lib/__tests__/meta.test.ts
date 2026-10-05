import { describe, it, expect } from 'vitest'
import { x01Meta, atcMeta } from '../gameViews/meta.js'
import type { AtcGame, X01Game } from '../api/game-ws'

const x01 = (o: Record<string, unknown> = {}): X01Game =>
  ({
    config: { startScore: 501, outMode: 'double', inMode: 'straight' },
    legs: [1, 1],
    firstTo: 3,
    winner: null,
    ...o,
  }) as unknown as X01Game

describe('x01Meta', () => {
  it('two players', () => {
    expect(x01Meta(x01(), 2)).toBe('501 · Double out · First to 3 legs · Leg 3')
  })
  it('party and solo', () => {
    expect(x01Meta(x01({ legs: [0, 1, 0, 0], firstTo: 2 }), 4)).toBe('4 players · 501 · Double out · First to 2 legs · Leg 2')
    expect(x01Meta(x01({ legs: [3] }), 1)).toBe('501 · Double out · Practice · Leg 4')
  })
  it('names a non-straight in mode and a single leg', () => {
    expect(x01Meta(x01({ config: { startScore: 301, outMode: 'master', inMode: 'double' }, legs: [0, 0], firstTo: 1 }), 2)).toBe(
      '301 · Double in · Master out · First to 1 leg · Leg 1',
    )
  })
  it('does not count past the last leg once the match is won', () => {
    expect(x01Meta(x01({ legs: [3, 1], winner: 0 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 4')
  })

  it('a match ended by the round limit names the leg in play', () => {
    expect(x01Meta(x01({ legs: [0, 0], winner: 1 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 1')
    expect(x01Meta(x01({ legs: [1, 0], winner: 0 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 2')
  })
})

describe('x01Meta with teams', () => {
  const team = (id: 'A' | 'B', seats: number[], legs = 0) => ({ id, name: `Team ${id}`, seats, score: 501, legs, next: seats[0] })
  it('starts with the team sizes instead of the player count', () => {
    const g = x01({ legs: [1, 1, 1, 1], firstTo: 2, teams: [team('A', [0, 2], 1), team('B', [1, 3])] })
    expect(x01Meta(g, 4)).toBe('Teams 2v2 · 501 · Double out · First to 2 legs · Leg 2')
  })
  it('uneven teams', () => {
    const g = x01({ legs: [0, 0, 0], teams: [team('A', [0, 2]), team('B', [1])] })
    expect(x01Meta(g, 3)).toBe('Teams 2v1 · 501 · Double out · First to 3 legs · Leg 1')
  })
})

describe('atcMeta', () => {
  const atc = (o: Record<string, unknown> = {}): AtcGame =>
    ({
      cfg: { order: 'asc', multiplierAdvances: false, finishOn: 'bull' },
      sequence: [1, 2, 22],
      totalVisits: [11, 11],
      ...o,
    }) as unknown as AtcGame
  it('two players', () => {
    expect(atcMeta(atc(), 2)).toBe('1–20, then Bull · any segment counts · Round 12')
  })
  it('party and solo', () => {
    expect(atcMeta(atc({ totalVisits: [11, 12, 11, 11] }), 4)).toBe('4 players · 1–20, then Bull · Round 12')
    expect(atcMeta(atc({ totalVisits: [11] }), 1)).toBe('1–20, then Bull · Practice · Round 12')
  })
  it('names the order and the outer bull', () => {
    expect(atcMeta(atc({ cfg: { order: 'desc', multiplierAdvances: true, finishOn: 'single_bull' }, sequence: [20, 21] }), 2)).toBe(
      '20–1, then 25 · multiplier advances · Round 12',
    )
  })
})

import { x01Rules, atcRules } from '../gameViews/meta.js'

describe('rules lines (config only)', () => {
  it('x01', () => {
    expect(x01Rules({ startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 }, 2)).toBe('501 · Double out · First to 3 legs')
    expect(x01Rules({ startScore: 301, inMode: 'double', outMode: 'master', firstTo: 1 }, 4)).toBe(
      '4 players · 301 · Double in · Master out · First to 1 leg',
    )
    expect(x01Rules({ startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 }, 1)).toBe('501 · Double out · Practice')
  })
  it('atc', () => {
    expect(atcRules({ order: 'asc', finishOn: 'bull', multiplierAdvances: false }, 2)).toBe('1–20, then Bull · any segment counts')
    expect(atcRules({ order: 'random', finishOn: 'twenty', multiplierAdvances: true }, 1)).toBe('Random order · Practice')
    expect(atcRules({ order: 'desc', finishOn: 'single_bull', multiplierAdvances: false }, 3)).toBe('3 players · 20–1, then 25')
  })
})
