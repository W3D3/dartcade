import { describe, it, expect } from 'vitest'
import type { AchievementUnlockedMessage } from '$lib/api/lobby-ws'
import { gameUnlocks, toastFor, unlockViews } from './toasts'

const msg = (unlocked: AchievementUnlockedMessage['unlocked']): AchievementUnlockedMessage => ({
  type: 'achievement.unlocked',
  sessionId: 'g1',
  unlocked,
  levelBefore: 1,
  levelAfter: 1,
})

describe('toastFor', () => {
  it('leads with the biggest tier and counts the rest', () => {
    const t = toastFor(
      msg([
        { id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 },
        { id: 'x01.180', from: 2, tier: 3, count: 10, xp: 450 },
        { id: 'nope', from: 0, tier: 1, count: 1, xp: 100 },
      ]),
    )
    expect(t).toMatchObject({
      kicker: 'Achievement Tier Up · Gold',
      more: 1,
      totalXp: 550,
      xp: 450,
      tierUp: { from: 'Silver', to: 'Gold' },
      next: { label: 'Next: tier 4 · Platinum', count: 10, target: 20 },
    })
    expect(t?.badge.def.id).toBe('x01.180')
  })
  it('calls a first tier a new achievement', () => {
    expect(toastFor(msg([{ id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 }]))).toMatchObject({
      kicker: 'New Achievement',
      tierUp: null,
      more: 0,
    })
  })
  it('names the tier the game started from when it jumped several', () => {
    expect(unlockViews(msg([{ id: 'x01.bullseye', from: 1, tier: 3, count: 105, xp: 300 }]))).toMatchObject([
      { kicker: 'Achievement Tier Up · Gold', tierUp: { from: 'Dark', to: 'Gold' } },
    ])
  })
  it('shows nothing for achievements outside the catalogue', () => {
    expect(toastFor(msg([{ id: 'nope', from: 0, tier: 1, count: 1, xp: 100 }]))).toBeNull()
  })
})

describe('gameUnlocks', () => {
  const m = msg([
    { id: 'x01.bigFish', from: 0, tier: 1, count: 1, xp: 100 },
    { id: 'x01.180', from: 2, tier: 3, count: 10, xp: 450 },
  ])
  it("lists the game's own unlocks, biggest tier first", () => {
    expect(gameUnlocks(m, 'g1').map(u => u.badge.def.id)).toEqual(['x01.180', 'x01.bigFish'])
  })
  it("shows nothing for another game's message or none at all", () => {
    expect(gameUnlocks(m, 'g2')).toEqual([])
    expect(gameUnlocks(null, 'g1')).toEqual([])
  })
})
