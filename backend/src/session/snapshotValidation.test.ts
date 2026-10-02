import { describe, it, expect } from 'vitest'
import { checkSnapshot } from './snapshotValidation.js'
import type { Snapshot } from './types.js'

describe('checkSnapshot', () => {
  it('names the game in the error', () => {
    const bad = { type: 'snapshot', sessionId: 'game-42', gameId: 'x01' } as unknown as Snapshot
    expect(() => checkSnapshot(bad, () => undefined)).toThrow(/game-42 \(x01\)/)
  })
})
