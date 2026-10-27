import { describe, it, expect } from 'vitest'
import { BigScreenState } from './bigScreenState.js'

describe('BigScreenState', () => {
  it('is idle until reported, and again once cleared', () => {
    const s = new BigScreenState()
    expect(s.get('b1')).toEqual({ helper: false, running: false })
    s.set('b1', { helper: true, running: true })
    expect(s.get('b1')).toEqual({ helper: true, running: true })
    expect(s.get('b2').running).toBe(false)
    s.clear('b1')
    expect(s.get('b1').running).toBe(false)
  })
})
