import { describe, it, expect } from 'vitest'
import { cleanName, isValidName, normalizeName, numbered } from './names.js'

describe('name rules', () => {
  it('takes letters (umlauts too), digits, dots, underscores and dashes, 2–20 long', () => {
    for (const ok of ['Luke', 'sam.180', 'felix_k', 'nina-darts', 'Jürgen', 'Zoë', 'ab', 'a'.repeat(20)]) {
      expect(isValidName(ok), ok).toBe(true)
    }
  })

  it('refuses spaces, other symbols, non-decimal digits and names too short or too long', () => {
    for (const bad of ['Phil Taylor', 'x', 'a'.repeat(21), 'luke!', '@luke', 'l😀ke', '²²', '']) {
      expect(isValidName(bad), bad).toBe(false)
    }
  })

  it('counts characters, not UTF-16 units', () => {
    expect(isValidName('𝒜'.repeat(20))).toBe(true)
    expect(isValidName('𝒜'.repeat(21))).toBe(false)
  })

  it('normalizes: trims and composes, so a decomposed ü is the same name', () => {
    expect(normalizeName('  Jürgen ')).toBe('Jürgen')
    expect(isValidName(normalizeName('Jürgen'))).toBe(true)
  })

  it('cleans an old name to the rules for a suggestion', () => {
    expect(cleanName('Phil Taylor')).toBe('Phil.Taylor')
    expect(cleanName('  ~x~ ')).toBe('player')
    expect(cleanName('Bartholomew Maximilian von Hohenzollern')).toBe('Bartholomew.Maximili')
    expect(cleanName('Zoë!!')).toBe('Zoë')
  })

  it('numbers a name within 20 characters', () => {
    expect(numbered('Phil.Taylor', 2)).toBe('Phil.Taylor2')
    expect(numbered('Bartholomew.Maximili', 12)).toBe('Bartholomew.Maximi12')
  })
})
