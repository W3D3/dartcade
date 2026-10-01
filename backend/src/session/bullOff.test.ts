import { describe, it, expect } from 'vitest'
import {
  clearCurrentBullOffThrow, initBullOff, onBullOffDart, onBullOffTakeout, rank, rethrowBullOff,
  skipBullOffThrow, throwFromDart,
} from './bullOff.js'
import type { BullOffThrow } from './bullOff.js'
import type { Dart } from './types.js'

const at = (mm: number | null): BullOffThrow => ({ mm, segment: '', thetaDeg: null, estimated: false })

function dart(overrides: Partial<Dart> = {}): Dart {
  return { segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 }, score: 25, ...overrides }
}

describe('initBullOff', () => {
  it('is inactive for mode=off', () => {
    expect(initBullOff({ mode: 'off', playerCount: 2 }).active).toBe(false)
  })

  it('starts with player 0, no throws and the index order', () => {
    const s = initBullOff({ mode: 'wdc', playerCount: 3 })
    expect(s.active).toBe(true)
    expect(s.throws).toEqual([null, null, null])
    expect(s.sequence).toEqual([0, 1, 2])
    expect(s.currentPlayer).toBe(0)
    expect(s.result).toBeNull()
  })
})

describe('throwFromDart', () => {
  it('measures from the cameras: r = 1 is the outer double wire (170 mm)', () => {
    const t = throwFromDart(dart({ polar: { r: 0.0753, theta_deg: 135 } }))
    expect(t).toEqual({ mm: 12.8, segment: '25', thetaDeg: 135, estimated: false })
  })

  it('falls back to coords when polar is missing', () => {
    const t = throwFromDart(dart({ coords: { x: 0, y: 0.1 } }))
    expect(t.mm).toBe(17)
    expect(t.thetaDeg).toBe(90)
  })

  it('treats a dart off the board as a miss', () => {
    const t = throwFromDart(dart({ segment: { name: 'Miss', number: 0, bed: 'Outside', multiplier: 0 }, score: 0 }))
    expect(t.mm).toBeNull()
  })

  it('estimates the distance from the segment without coordinates', () => {
    expect(throwFromDart(dart()).estimated).toBe(true)
    expect(throwFromDart(dart({ segment: { name: 'Bull', number: 50, bed: 'Double', multiplier: 2 } })).mm).toBeLessThan(6.35)
    expect(throwFromDart(dart({ segment: { name: 'T20', number: 20, bed: 'Triple', multiplier: 3 } })).mm).toBe(103)
  })
})

describe('turns', () => {
  it('records only the first dart per player', () => {
    let s = initBullOff({ mode: 'wdc', playerCount: 2 })
    s = onBullOffDart(s, dart({ polar: { r: 0.1, theta_deg: 0 } }))
    s = onBullOffDart(s, dart({ polar: { r: 0.01, theta_deg: 0 } }))
    expect(s.throws[0]?.mm).toBe(17)
  })

  it('moves to the next player on takeout, then ranks everyone', () => {
    let s = initBullOff({ mode: 'wdc', playerCount: 2 })
    s = onBullOffTakeout(onBullOffDart(s, dart({ polar: { r: 0.2, theta_deg: 0 } })))
    expect(s.currentPlayer).toBe(1)
    expect(s.result).toBeNull()
    s = onBullOffTakeout(onBullOffDart(s, dart({ polar: { r: 0.05, theta_deg: 0 } })))
    expect(s.result).toEqual({ order: [1, 0], rethrow: false })
  })

  it('skip counts the current player as off the board and moves on', () => {
    const s = skipBullOffThrow(initBullOff({ mode: 'wdc', playerCount: 2 }))
    expect(s.throws[0]?.mm).toBeNull()
    expect(s.currentPlayer).toBe(1)
  })

  it('clearing a throw lets the current player throw again', () => {
    let s = onBullOffDart(initBullOff({ mode: 'wdc', playerCount: 2 }), dart())
    s = clearCurrentBullOffThrow(s)
    expect(s.throws[0]).toBeNull()
    expect(s.currentPlayer).toBe(0)
  })

  it('rethrows in reverse order, reversing again each time', () => {
    let s = rethrowBullOff(initBullOff({ mode: 'wdc', playerCount: 3 }))
    expect(s.sequence).toEqual([2, 1, 0])
    expect(s.currentPlayer).toBe(2)
    s = onBullOffTakeout(s)
    expect(s.currentPlayer).toBe(1)
    expect(rethrowBullOff(s).sequence).toEqual([0, 1, 2])
  })
})

describe('rank', () => {
  it('orders closest first, misses last', () => {
    expect(rank([at(null), at(30), at(8)])).toEqual({ order: [2, 1, 0], rethrow: false })
  })

  it('rethrows when the top two are within 0.5 mm', () => {
    expect(rank([at(10), at(10.4)])).toMatchObject({ rethrow: true, reason: 'tie' })
    expect(rank([at(10), at(10.5)]).rethrow).toBe(false)
  })

  it('rethrows when more than one dart is in the bullseye', () => {
    expect(rank([at(2), at(6)])).toMatchObject({ rethrow: true, reason: 'bullseye' })
  })

  it('rethrows when nobody hit the board', () => {
    expect(rank([at(null), at(null)])).toMatchObject({ rethrow: true, reason: 'all_missed' })
  })

  it('ties further down the order do not force a rethrow', () => {
    expect(rank([at(40), at(3), at(40.2)])).toEqual({ order: [1, 0, 2], rethrow: false })
  })
})
