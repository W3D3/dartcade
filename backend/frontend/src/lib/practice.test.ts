import { describe, it, expect } from 'vitest'
import { hasPracticeSummary } from './practice.js'
import type { Snapshot } from './api/game-ws'

const snap = (gameId: string) => ({ gameId }) as unknown as Snapshot

describe('hasPracticeSummary', () => {
  it('is true for the practice modes only', () => {
    expect(hasPracticeSummary(snap('p121'))).toBe(true)
    expect(hasPracticeSummary(snap('catch40'))).toBe(true)
    expect(hasPracticeSummary(snap('x01'))).toBe(false)
    expect(hasPracticeSummary(null)).toBe(false)
  })
})
