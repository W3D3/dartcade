import { afterEach, describe, it, expect, vi } from 'vitest'
import { createCopy } from '../clipboard.svelte'

const clipboard = (writeText: (t: string) => Promise<void>) => vi.stubGlobal('navigator', { clipboard: { writeText } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('createCopy', () => {
  it('says copied, then idle again after the reset', async () => {
    vi.useFakeTimers()
    const written: string[] = []
    clipboard(t => {
      written.push(t)
      return Promise.resolve()
    })
    const clip = createCopy(1500)
    await clip.copy('7KQ4-M2XD')
    expect(written).toEqual(['7KQ4-M2XD'])
    expect(clip.state).toBe('copied')
    vi.advanceTimersByTime(1500)
    expect(clip.state).toBe('idle')
  })

  it('says failed instead of throwing when the browser refuses, and keeps it with no reset', async () => {
    vi.useFakeTimers()
    clipboard(() => Promise.reject(new Error('NotAllowedError')))
    const clip = createCopy(0)
    await expect(clip.copy('x')).resolves.toBeUndefined()
    expect(clip.state).toBe('failed')
    vi.advanceTimersByTime(60_000)
    expect(clip.state).toBe('failed')
  })
})
