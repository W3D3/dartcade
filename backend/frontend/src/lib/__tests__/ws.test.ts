import { describe, it, expect } from 'vitest'
import { isSnapshot } from '../ws.js'

describe('isSnapshot', () => {
  it('accepts a snapshot message', () => {
    expect(isSnapshot({ type: 'snapshot', sessionId: 's', gameId: 'x01', players: [], game: {}, boardId: null, bmStatus: null })).toBe(true)
  })
  it('rejects anything else', () => {
    for (const m of [null, 'x', 42, {}, { type: 'hello' }, { type: 'snapshot' }]) expect(isSnapshot(m)).toBe(false)
  })
})
