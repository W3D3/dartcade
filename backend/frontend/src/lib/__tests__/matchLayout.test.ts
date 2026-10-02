import { describe, it, expect } from 'vitest'
import { matchLayout } from '../matchLayout.js'

describe('matchLayout', () => {
  it('uses the phone layout on a phone for any player count', () => {
    expect([1, 2, 3, 6].map(n => matchLayout(n, true))).toEqual(['phone', 'phone', 'phone', 'phone'])
  })
  it('keeps the desktop layouts otherwise', () => {
    expect([1, 2, 3, 6].map(n => matchLayout(n, false))).toEqual(['solo', 'duel', 'party', 'party'])
  })
})
