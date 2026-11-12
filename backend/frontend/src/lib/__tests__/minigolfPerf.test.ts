import { describe, it, expect } from 'vitest'
import { RecentFrames, summarize } from '$lib/minigolf/perf'

describe('summarize', () => {
  it('gives the rate, the 1% low and the percentiles of the frames', () => {
    const frames = [...Array(99).fill(10), 100].map(frameMs => ({
      frameMs,
      cpuMs: 1,
      gpuMs: null,
      calls: 9,
      triangles: 99,
      canvas: [1, 1] as [number, number],
      tier: 'low' as const,
      scale: 1,
    }))
    const s = summarize(frames)
    expect(s.fps).toBeCloseTo(1000 / 10.9, 1)
    expect(s.low1Fps).toBe(10)
    expect(s.frameMs.p50).toBe(10)
    expect(s.gpuMs).toBeNull()
    expect([s.calls, s.triangles]).toEqual([9, 99])
  })
})

describe('RecentFrames', () => {
  const frame = (frameMs: number) => ({
    frameMs,
    cpuMs: 1,
    gpuMs: null,
    calls: 9,
    triangles: 99,
    canvas: [1, 1] as [number, number],
    tier: 'low' as const,
    scale: 1,
  })

  it('summarises at most twice a second, over the last 2 s of frames', () => {
    const w = new RecentFrames()
    expect(w.add(frame(100), 0)?.frames).toBe(1)
    expect(w.add(frame(100), 100)).toBeNull()
    let last = null
    for (let t = 200; t <= 5000; t += 100) last = w.add(frame(100), t) ?? last
    expect(last?.frames).toBe(20)
  })
})
