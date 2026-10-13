import { afterEach, describe, it, expect, vi } from 'vitest'
import { playFrames, playPath } from '$lib/minigolf/animate'

afterEach(() => vi.unstubAllGlobals())

describe('playPath', () => {
  it('starts on the first point even when the frame time is just before the start', async () => {
    // Browsers stamp a frame with when it began, which can be a moment before the call
    const start = performance.now()
    let t = start - 25
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((t += 20)), 0))
    const seen: unknown[] = []
    await playPath(
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
      p => seen.push(p),
      false,
    )
    expect(seen[0]).toEqual([0, 0])
    expect(seen).not.toContain(undefined)
  })
})

describe('playFrames', () => {
  it('never goes before the first frame when the frame time is just before the start', async () => {
    const start = performance.now()
    let t = start - 25
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb((t += 20)), 0))
    const seen: number[] = []
    await new Promise<void>(onDone => playFrames(3, i => seen.push(i), false, { onDone }))
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0)
  })
})
