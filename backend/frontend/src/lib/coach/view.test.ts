import { describe, it, expect } from 'vitest'
import { coachable, coachSeats, defaultCoachSeat, legsPlayed, opponents } from './view'

const x01 = (config: Record<string, unknown>) => ({ mode: 'x01', config })
const seat = (n: number, bot = false) => ({
  seat: n,
  name: `P${n}`,
  userId: bot ? null : `u${n}`,
  avatar: { kind: 'none' as const },
  throwPosition: n,
  bot: bot ? { level: 1 } : null,
  placement: n + 1,
  stats: {},
  forfeited: false,
})

describe('coachable', () => {
  it('takes X01, straight in, double out, bull 25/50, singles', () => {
    expect(coachable(x01({ startScore: 501, inMode: 'straight', outMode: 'double', bullValue: '25_50', format: 'singles' }))).toBe(true)
  })

  it('takes an old game whose config lacks the newer keys', () => {
    expect(coachable(x01({ startScore: 501 }))).toBe(true)
  })

  it.each([
    ['straight out', { outMode: 'straight' }],
    ['master out', { outMode: 'master' }],
    ['double in', { inMode: 'double' }],
    ['bull 50/50', { bullValue: '50_50' }],
    ['teams', { format: 'teams' }],
  ])('leaves out %s', (_l, config) => {
    expect(coachable(x01(config))).toBe(false)
  })

  it('leaves out other modes', () => {
    expect(coachable({ mode: 'atc', config: {} })).toBe(false)
  })
})

describe('seats', () => {
  it('lists humans only, and defaults to your seat', () => {
    const game = { players: [seat(0, true), seat(1), seat(2)], mySeat: 2 }
    expect(coachSeats(game)).toEqual([1, 2])
    expect(defaultCoachSeat(game)).toBe(2)
  })

  it("defaults to the first human for a spectator, or when you're not a human seat", () => {
    expect(defaultCoachSeat({ players: [seat(0, true), seat(1)], mySeat: null })).toBe(1)
    expect(defaultCoachSeat({ players: [seat(0, true)], mySeat: null })).toBeNull()
  })
})

describe('opponents', () => {
  it('names the other seats', () => {
    expect(opponents({ players: [seat(0), seat(1)], mySeat: 0 })).toBe('P1')
  })

  it('is Solo without another seat, or when none of the seats is yours', () => {
    expect(opponents({ players: [seat(0)], mySeat: 0 })).toBe('Solo')
    expect(opponents({ players: [seat(0), seat(1)], mySeat: null })).toBe('P0, P1')
  })
})

describe('legsPlayed', () => {
  it("adds up every seat's legs won, a seat without the stat counting none", () => {
    expect(legsPlayed({ players: [{ ...seat(0), stats: { legsWon: 3 } }, { ...seat(1), stats: { legsWon: 1 } }, seat(2)] })).toBe(4)
  })
})
