import { describe, it, expect } from 'vitest'
import { canSwitchTo, settlePending, withDefaults } from '../gameModes.js'

const games = [
  { id: 'atc', defaultConfig: { order: 'asc' }, configMeta: {}, teams: false, supportsBots: false },
  { id: 'x01', defaultConfig: { startScore: 501, firstTo: 3 }, configMeta: {}, teams: true, supportsBots: true },
]

describe('withDefaults', () => {
  it('lays the saved settings over the defaults', () => {
    expect(withDefaults({ startScore: 301 }, { startScore: 501, firstTo: 3 })).toEqual({ startScore: 301, firstTo: 3 })
  })
  it('is the defaults when nothing is saved, and the saved settings without defaults', () => {
    expect(withDefaults({}, { firstTo: 3 })).toEqual({ firstTo: 3 })
    expect(withDefaults({ firstTo: 5 }, undefined)).toEqual({ firstTo: 5 })
  })
})

describe('canSwitchTo', () => {
  it('takes a playable mode the backend has that is not the current one', () => {
    expect(canSwitchTo('atc', 'x01', games)).toBe(true)
    expect(canSwitchTo('x01', null, games)).toBe(true)
  })
  it('refuses the current mode, nothing picked, a mode that is coming soon, and one the backend lacks', () => {
    expect(canSwitchTo('x01', 'x01', games)).toBe(false)
    expect(canSwitchTo(null, 'x01', games)).toBe(false)
    expect(
      canSwitchTo('soccer', 'x01', [...games, { id: 'soccer', defaultConfig: {}, configMeta: {}, teams: false, supportsBots: false }]),
    ).toBe(false)
    expect(canSwitchTo('atc', 'x01', [])).toBe(false)
  })
})

describe('settlePending', () => {
  it('keeps the changes the saved settings do not show yet', () => {
    expect(settlePending({ startScore: 301, firstTo: 5 }, { startScore: 501, firstTo: 5 }, {})).toEqual({ startScore: 301 })
  })
  it('drops the changes whose save came back, whatever the snapshot shows', () => {
    expect(settlePending({ startScore: 301, outMode: 'master' }, { startScore: 501 }, { startScore: 301 })).toEqual({ outMode: 'master' })
  })
  it('keeps a newer change to a key whose earlier save came back', () => {
    expect(settlePending({ startScore: 701 }, { startScore: 501 }, { startScore: 301 })).toEqual({ startScore: 701 })
  })
})
