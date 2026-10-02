import { describe, it, expect } from 'vitest'
import { pickActive } from '../activeSession.js'

describe('pickActive', () => {
  it('picks the running game', () => {
    expect(pickActive([{ id: 'a', status: 'finished' }, { id: 'b', status: 'active' }])).toBe('b')
  })
  it('is null without one', () => {
    expect(pickActive([{ id: 'a', status: 'finished' }])).toBeNull()
    expect(pickActive(undefined)).toBeNull()
  })
})
