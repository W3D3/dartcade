import { describe, expect, it } from 'vitest'
import { initial } from './fmt'

describe('initial', () => {
  it('upper-cases the first letter', () => expect(initial('  anna')).toBe('A'))
  it('keeps an emoji whole, with its modifiers', () => {
    expect(initial('🎯 Dart Queen')).toBe('🎯')
    expect(initial('👩🏽‍🦰 Ann')).toBe('👩🏽‍🦰')
  })
  it('falls back to ? for a blank name', () => expect(initial('   ')).toBe('?'))
})
