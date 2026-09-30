import { describe, it, expect } from 'vitest'
import { x01Meta, atcMeta } from '../gameViews/meta.js'

const x01 = (o: Record<string, unknown> = {}) => ({
  config: { startScore: 501, outMode: 'double', inMode: 'straight' }, legs: [1, 1], firstTo: 3, winner: null, ...o,
})

describe('x01Meta', () => {
  it('two players', () => {
    expect(x01Meta(x01(), 2)).toBe('501 · Double out · First to 3 legs · Leg 3')
  })
  it('party and solo', () => {
    expect(x01Meta(x01({ legs: [0, 1, 0, 0], firstTo: 2 }), 4)).toBe('4 players · 501 · Double out · First to 2 legs · Leg 2')
    expect(x01Meta(x01({ legs: [3] }), 1)).toBe('501 · Double out · Practice · Leg 4')
  })
  it('names a non-straight in mode and a single leg', () => {
    expect(x01Meta(x01({ config: { startScore: 301, outMode: 'master', inMode: 'double' }, legs: [0, 0], firstTo: 1 }), 2))
      .toBe('301 · Double in · Master out · First to 1 leg · Leg 1')
  })
  it('does not count past the last leg once the match is won', () => {
    expect(x01Meta(x01({ legs: [3, 1], winner: 0 }), 2)).toBe('501 · Double out · First to 3 legs · Leg 4')
  })
})

describe('atcMeta', () => {
  const atc = (o: Record<string, unknown> = {}) => ({
    cfg: { order: 'asc', multiplierAdvances: false }, sequence: [1, 2, 22], totalVisits: [11, 11], ...o,
  })
  it('two players', () => {
    expect(atcMeta(atc(), 2)).toBe('1–20, then Bull · any segment counts · Round 12')
  })
  it('party and solo', () => {
    expect(atcMeta(atc({ totalVisits: [11, 12, 11, 11] }), 4)).toBe('4 players · 1–20, then Bull · Round 12')
    expect(atcMeta(atc({ totalVisits: [11] }), 1)).toBe('1–20, then Bull · Practice · Round 12')
  })
  it('names the order and the outer bull', () => {
    expect(atcMeta(atc({ cfg: { order: 'desc', multiplierAdvances: true }, sequence: [20, 21] }), 2))
      .toBe('20–1, then 25 · multiplier advances · Round 12')
  })
})
