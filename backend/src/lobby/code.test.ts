import { describe, it, expect } from 'vitest'
import { newLobbyCode, normalizeCode } from './code.js'

describe('lobby codes', () => {
  it('are 6 characters without look-alikes (I, L, O, 0, 1)', () => {
    for (let i = 0; i < 200; i++) expect(newLobbyCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/)
  })

  it('are read the way people type them', () => {
    expect(normalizeCode(' k7q4-md ')).toBe('K7Q4MD')
    expect(normalizeCode('K7Q4 MD')).toBe('K7Q4MD')
  })
})
