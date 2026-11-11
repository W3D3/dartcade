import { describe, expect, it } from 'vitest'
import { tabOf } from './tabs'

describe('tabOf', () => {
  it('reads the tab from the route, Browse for none or an unknown one', () => {
    expect(tabOf('mine')).toBe('mine')
    expect(tabOf('teams')).toBe('teams')
    expect(tabOf(undefined)).toBe('browse')
    expect(tabOf('nope')).toBe('browse')
  })
})
