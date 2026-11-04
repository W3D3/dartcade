import { describe, it, expect } from 'vitest'
import { RESERVE_WARN_SECONDS, VISIT_WARN_SECONDS, clockView, reconnectView } from '../ranked/clock.js'

describe('clockView', () => {
  it('stays hidden while the visit has time', () => {
    expect(clockView({ visitLeft: 120, reserveLeft: 300 })).toEqual({ phase: 'hidden' })
    expect(clockView({ visitLeft: VISIT_WARN_SECONDS + 1, reserveLeft: 300 })).toEqual({ phase: 'hidden' })
  })

  it('shows the turn chip for the last seconds of the visit', () => {
    expect(clockView({ visitLeft: VISIT_WARN_SECONDS, reserveLeft: 300 })).toEqual({ phase: 'visit', turn: '0:20' })
    expect(clockView({ visitLeft: 0.4, reserveLeft: 300 })).toEqual({ phase: 'visit', turn: '0:01' })
  })

  it('hides a reserve that has plenty left, even though the visit ran over', () => {
    expect(clockView({ visitLeft: 0, reserveLeft: RESERVE_WARN_SECONDS + 1 })).toEqual({ phase: 'hidden' })
  })

  it('shows the reserve once it is nearly gone, with the turn chip run out', () => {
    expect(clockView({ visitLeft: -5, reserveLeft: 13 })).toEqual({ phase: 'reserve', turn: '0:00', reserve: '0:13', drain: 13 / 60 })
    expect(clockView({ visitLeft: 0, reserveLeft: RESERVE_WARN_SECONDS })).toMatchObject({ phase: 'reserve', drain: 1 })
  })

  it('never goes below zero', () => {
    expect(clockView({ visitLeft: -9, reserveLeft: -3 })).toEqual({ phase: 'reserve', turn: '0:00', reserve: '0:00', drain: 0 })
  })
})

describe('reconnectView', () => {
  it('counts down to the deadline and drains over the two minutes', () => {
    expect(reconnectView(1_000_000 + 102_000, 1_000_000)).toEqual({ left: '1:42', drain: 102 / 120 })
    expect(reconnectView(1_000_000 + 130_000, 1_000_000).drain).toBe(1)
    expect(reconnectView(1_000_000, 1_005_000)).toEqual({ left: '0:00', drain: 0 })
  })
})
