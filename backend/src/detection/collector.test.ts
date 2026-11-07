import { describe, it, expect, vi } from 'vitest'
import { SampleCollector, maxSampleBytes } from './collector.js'

const jpeg = Buffer.from('x')

/** Feeds the takeout's round (seq 10) and a dart's (seq 14) to board b1. */
async function throwOne(c: SampleCollector, data: unknown = { source_seq: 14 }) {
  for (const cam of [0, 1, 2]) c.still('b1', { cam, source_seq: 10 }, jpeg)
  c.event('b1', 'dart.detected', data, 'ev14', '2.1.0')
  for (const cam of [0, 1, 2]) c.still('b1', { cam, source_seq: 14, previous_seq: 10 }, jpeg)
  await new Promise(r => setTimeout(r, 0))
}

describe('SampleCollector', () => {
  it('stores a complete sample when the board shares', async () => {
    const save = vi.fn(() => Promise.resolve())
    await throwOne(new SampleCollector({ shares: () => Promise.resolve(true), save, warn: vi.fn() }))
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ boardId: 'b1', bridgeEventId: 'ev14', bmVersion: '2.1.0' }))
  })

  it("keeps nothing from a board that doesn't share", async () => {
    const save = vi.fn(() => Promise.resolve())
    await throwOne(new SampleCollector({ shares: () => Promise.resolve(false), save, warn: vi.fn() }))
    expect(save).not.toHaveBeenCalled()
  })

  it('ignores the combined still, stills after no event and darts without a source_seq', async () => {
    const save = vi.fn(() => Promise.resolve())
    const c = new SampleCollector({ shares: () => Promise.resolve(true), save, warn: vi.fn() })
    c.still('b1', { cam: 3, source_seq: 14, previous_seq: 10 }, jpeg)
    c.still('b1', { cam: 0 }, jpeg)
    await throwOne(c, {})
    expect(save).not.toHaveBeenCalled()
  })

  it('logs a failed save instead of throwing', async () => {
    const warn = vi.fn()
    await throwOne(new SampleCollector({ shares: () => Promise.resolve(true), save: () => Promise.reject(new Error('disk full')), warn }))
    expect(warn).toHaveBeenCalledWith(
      'dart sample not stored',
      expect.objectContaining({ bridgeEventId: 'ev14', error: 'Error: disk full' }),
    )
  })
})

describe('maxSampleBytes', () => {
  it('defaults to 20 GB, and 0 or garbage turns collection off', () => {
    expect(maxSampleBytes({})).toBe(20 * 1024 ** 3)
    expect(maxSampleBytes({ DART_SAMPLES_MAX_GB: '0.5' })).toBe(512 * 1024 ** 2)
    expect(maxSampleBytes({ DART_SAMPLES_MAX_GB: '0' })).toBe(0)
    expect(maxSampleBytes({ DART_SAMPLES_MAX_GB: 'lots' })).toBe(0)
  })
})
