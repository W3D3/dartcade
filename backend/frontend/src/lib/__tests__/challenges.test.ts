import { describe, it, expect } from 'vitest'
import { get, writable } from 'svelte/store'
import { createChallenges, doneOf, resetsText, type Challenges } from '../progress/challenges.js'
import type { XpGainedMessage } from '../api/lobby-ws.js'

const item = (id: string, completed: boolean) => ({
  id,
  slot: 1,
  title: 'Throw 100 darts on a board',
  difficulty: 'easy' as const,
  target: 100,
  progress: completed ? 100 : 20,
  xp: 40,
  completed,
  claimed: completed,
  canReroll: !completed,
})
const set = (resetsAt: string, done: boolean[]) => ({ resetsAt, items: done.map((d, i) => item(`c${i}`, d)) })
const challenges = (resetsAt = '2026-10-21T22:00:00.000Z'): Challenges => ({
  daily: set(resetsAt, [true, false, false]),
  weekly: set('2026-10-25T22:00:00.000Z', [false, false, false]),
})

describe('challenge copy', () => {
  it('counts down to the daily reset, and names the weekly one', () => {
    const c = challenges()
    expect(resetsText(c.daily, 'daily', new Date('2026-10-21T15:48:00Z'))).toBe('Resets in 6 h')
    expect(resetsText(c.daily, 'daily', new Date('2026-10-21T21:30:00Z'))).toBe('Resets in 30 m')
    expect(resetsText(c.weekly, 'weekly', new Date())).toBe('Resets Monday')
    expect(doneOf(c.daily)).toBe('1 of 3')
  })
})

describe('createChallenges', () => {
  it('reads the sets and reads them again after a game paid XP', async () => {
    const xp = writable<XpGainedMessage | null>(null)
    let reads = 0
    const store = createChallenges({ xp }, () => {
      reads++
      return Promise.resolve(challenges())
    })
    const stop = store.subscribe(() => undefined)
    await Promise.resolve()
    expect(reads).toBe(1)
    xp.set({ type: 'xp.gained', sessionId: 'g', lines: [], total: 0, xpBefore: 0, xpAfter: 0, levelBefore: 1, levelAfter: 1 })
    await Promise.resolve()
    expect(reads).toBe(2)
    expect(get(store)?.daily.items).toHaveLength(3)
    stop()
  })
})
