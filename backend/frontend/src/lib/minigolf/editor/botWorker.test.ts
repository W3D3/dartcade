import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PHYSICS } from '$shared/minigolf/physics'
import { testCourse } from '$shared/minigolf/courses/test'
import type { BotMessage } from './botWorker'

vi.mock('$shared/minigolf/3d/physics3d', () => ({ initPhysics3d: () => Promise.resolve() }))
vi.mock('$shared/minigolf/bot', () => ({
  testHole: () => {
    throw new Error('a degenerate hole')
  },
}))
const { runBot } = await import('./botWorker')

describe('runBot', () => {
  it('posts an error when the bot throws', async () => {
    const posted: BotMessage[] = []
    await runBot({ hole: testCourse.holes[0], physics: DEFAULT_PHYSICS, seed: 1, rounds: 20 }, m => posted.push(m))
    expect(posted).toEqual([{ type: 'error' }])
  })
})
