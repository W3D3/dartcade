import { describe, it, expect } from 'vitest'
import { changesRules, handicapLine, handicapProblem, readRulesConfig, rulesText, seatRules } from './handicap.js'

const game = { startScore: 501, inMode: 'straight', outMode: 'double' } as const

describe('handicaps', () => {
  it("a seat plays the game's rules with its handicap on top", () => {
    const cfg = { ...game, handicaps: [null, { startScore: 301, inMode: 'double' as const }] }
    expect(seatRules(cfg, 0)).toEqual(game)
    expect(seatRules(cfg, 1)).toEqual({ startScore: 301, inMode: 'double', outMode: 'double' })
    expect(seatRules(game, 3)).toEqual(game)
  })

  it('start scores from 101 to 1001, whole numbers', () => {
    expect(handicapProblem({ startScore: 101 })).toBeNull()
    expect(handicapProblem({ startScore: 1001 })).toBeNull()
    expect(handicapProblem({ startScore: 100 })).toBe('start score must be 101 to 1001')
    expect(handicapProblem({ startScore: 301.5 })).toBe('start score must be 101 to 1001')
    expect(handicapProblem({ inMode: 'master' })).toBeNull()
  })

  it('says what differs, and every rule a seat plays by', () => {
    expect(handicapLine(game, { startScore: 301, inMode: 'double', outMode: 'double' })).toBe('501 → 301, double in')
    expect(handicapLine(game, { startScore: 501 })).toBe('')
    expect(rulesText(game)).toBe('501 · straight in · double out')
    expect(changesRules(game, { startScore: 501, outMode: 'double' })).toBe(false)
    expect(changesRules(game, { outMode: 'master' })).toBe(true)
    expect(changesRules(game, null)).toBe(false)
  })

  it("reads a stored config defensively, with X01's defaults", () => {
    expect(readRulesConfig({})).toEqual(game)
    expect(readRulesConfig({ startScore: 301, inMode: 'nope', handicaps: [null, { outMode: 'straight', junk: 1 }, 'x', {}] })).toEqual({
      startScore: 301,
      inMode: 'straight',
      outMode: 'double',
      handicaps: [null, { outMode: 'straight' }, null, null],
    })
  })
})
