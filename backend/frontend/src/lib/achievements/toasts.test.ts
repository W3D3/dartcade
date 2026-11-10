import { describe, it, expect } from 'vitest'
import type { AchievementUnlockedMessage } from '$lib/api/lobby-ws'
import { toastFor } from './toasts'

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
        { id: 'x01.bigFish', tier: 1, count: 1, tierUp: false, xp: 100 },
        { id: 'x01.180', tier: 3, count: 10, tierUp: true, xp: 450 },
        { id: 'nope', tier: 1, count: 1, tierUp: false, xp: 100 },
      ]),
    )
    expect(t).toMatchObject({ kicker: 'Achievement Tier Up · Gold', more: 1, xp: 550, tierUp: { from: 'Silver', to: 'Gold', target: 20 } })
    expect(t?.badge.def.id).toBe('x01.180')
  })
  it('calls a first tier a new achievement', () => {
    expect(toastFor(msg([{ id: 'x01.bigFish', tier: 1, count: 1, tierUp: false, xp: 100 }]))).toMatchObject({
      kicker: 'New Achievement',
      tierUp: null,
      more: 0,
    })
  })
  it('shows nothing for achievements outside the catalogue', () => {
    expect(toastFor(msg([{ id: 'nope', tier: 1, count: 1, tierUp: false, xp: 100 }]))).toBeNull()
  })
})
