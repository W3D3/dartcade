import { describe, it, expect } from 'vitest'
import { MotionState } from './motionState.js'

describe('MotionState', () => {
  it('is unknown until reported, then holds the latest, and is unknown again once cleared', () => {
    const m = new MotionState()
    expect(m.get('b1')).toBeNull()
    m.set('b1', { state: 'hand' }, '2026-01-01T10:00:00Z')
    m.set('b1', { state: 'takeout', takeout: 'partial' }, '2026-01-01T10:00:02Z')
    expect(m.get('b1')).toEqual({ state: 'takeout', takeout: 'partial', since: '2026-01-01T10:00:02Z' })
    expect(m.get('b2')).toBeNull()
    m.clear('b1')
    expect(m.get('b1')).toBeNull()
  })
})
