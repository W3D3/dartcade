import { describe, it, expect } from 'vitest'
import { autoTier, FrameBudget, MIN_SCALE, pixelRatio, TIERS, urlQuality } from '$lib/minigolf/quality'

/** Feeds `seconds` of frames `ms` apart from `start`; returns the time after and whether anything changed. */
function run(b: FrameBudget, ms: number, seconds: number, start: number): { end: number; changes: number } {
  let now = start
  let changes = 0
  for (let k = 0; k < (seconds * 1000) / ms; k++) {
    now += ms
    if (b.frame(ms, now)) changes++
  }
  return { end: now, changes }
}

describe('autoTier', () => {
  it.each([
    ['V3D 7.1.7.0', 'low'],
    ['ANGLE (Broadcom, V3D 7.1, OpenGL ES 3.1)', 'low'],
    ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'low'],
    ['llvmpipe (LLVM 15.0.7, 256 bits)', 'low'],
    ['ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL ES 3.2)', 'medium'],
    ['Adreno (TM) 730', 'medium'],
    ['ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
  ])('%s is %s', (gpu, tier) => {
    expect(autoTier(gpu)).toBe(tier)
  })
})

describe('urlQuality', () => {
  it('reads a known quality from the hash query, else null', () => {
    expect(urlQuality('#/big-screen/b1?quality=low')).toBe('low')
    expect(urlQuality('#/session/x?quality=auto')).toBe('auto')
    expect(urlQuality('#/session/x?quality=ultra')).toBeNull()
    expect(urlQuality('#/session/x')).toBeNull()
  })
})

describe('pixelRatio', () => {
  it('keeps the full look on high, up to twice the CSS pixels', () => {
    expect(pixelRatio(TIERS.high, 3, 1280, 720, 1)).toBe(2)
  })
  it('draws a 4K window at no more than the tier budget', () => {
    expect(pixelRatio(TIERS.medium, 1, 3840, 2160, 1) * 3840).toBeCloseTo(1920)
    expect(pixelRatio(TIERS.low, 1, 3840, 2160, 1) * 3840).toBeCloseTo(1440)
  })
  it('scales with the controller', () => {
    expect(pixelRatio(TIERS.low, 1, 1280, 720, 0.5)).toBe(0.5)
  })
})

describe('FrameBudget', () => {
  it('stays put while frames keep up', () => {
    const b = new FrameBudget('high')
    expect(run(b, 1000 / 60, 10, 0).changes).toBe(0)
    expect([b.scale, b.tier]).toEqual([1, 'high'])
  })

  it('lowers the resolution while slow, down to MIN_SCALE, then the tier', () => {
    const b = new FrameBudget('high')
    run(b, 50, 30, 0)
    expect(b.scale).toBe(MIN_SCALE)
    expect(b.tier).toBe('low')
  })

  it('goes back up after a run of fast seconds, and never above 1', () => {
    const b = new FrameBudget('medium')
    const { end } = run(b, 50, 3, 0)
    expect(b.scale).toBeLessThan(1)
    run(b, 1000 / 60, 60, end)
    expect(b.scale).toBe(1)
  })

  it('waits longer each time a step up does not hold, so it does not flap', () => {
    const b = new FrameBudget('medium')
    let t = run(b, 50, 3, 0).end
    // A device that is fast at the lower scale and slow at the higher one: count the step ups
    let raises = 0
    for (let second = 0; second < 120; second++) {
      const before = b.scale
      const slow = b.scale > 0.7
      t = run(b, slow ? 50 : 1000 / 60, 1, t).end
      if (b.scale > before) raises++
    }
    expect(raises).toBeLessThanOrEqual(5)
  })
})
