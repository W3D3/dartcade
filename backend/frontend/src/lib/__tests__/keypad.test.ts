import { describe, it, expect } from 'vitest'
import { keypadPick } from '../keypad.js'

describe('keypadPick', () => {
  it('builds the dart for the tab that is on', () => {
    expect(keypadPick(20, 1).dart).toEqual({ name: 'S20', number: 20, bed: 'SingleOuter', multiplier: 1 })
    expect(keypadPick(20, 2).dart).toEqual({ name: 'D20', number: 20, bed: 'Double', multiplier: 2 })
    expect(keypadPick(19, 3).dart).toEqual({ name: 'T19', number: 19, bed: 'Triple', multiplier: 3 })
  })

  it('goes back to Single after every dart', () => {
    expect(keypadPick(20, 3).mult).toBe(1)
    expect(keypadPick(16, 2).mult).toBe(1)
    expect(keypadPick(5, 1).mult).toBe(1)
  })
})
