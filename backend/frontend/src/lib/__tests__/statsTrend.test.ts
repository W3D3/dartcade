import { describe, expect, it } from 'vitest'
import { dec1, pct, trendOf } from '$lib/stats/trend'
import { RING, polar, rateFill } from '$lib/stats/board'
import { bandwidth, scaled } from '$lib/stats/chart'

describe('trendOf', () => {
  it('points up and is good when a higher-is-better number rose', () => {
    expect(trendOf(68.4, 65.3, 'decimal', 'higher')).toEqual({ text: '▲ 3.1', good: true })
  })

  it('is good when a lower-is-better number fell', () => {
    expect(trendOf(19.8, 20.7, 'decimal', 'lower')).toEqual({ text: '▼ 0.9', good: true })
  })

  it('gives a share in points and a count as a whole number', () => {
    expect(trendOf(0.36, 0.38, 'pts', 'higher')).toEqual({ text: '▼ 2 pts', good: false })
    expect(trendOf(7, 4, 'count', 'lower')).toEqual({ text: '▲ 3', good: false })
  })

  it('shows nothing without an earlier value, or when nothing changed at the shown precision', () => {
    expect(trendOf(4, null, 'count', 'higher')).toBeNull()
    expect(trendOf(0.361, 0.358, 'pts', 'higher')).toBeNull()
  })
})

describe('number formats', () => {
  it('writes a rare share with a decimal, so it never reads as 0%', () => {
    expect([pct(0.36), pct(0.004), pct(0), pct(null)]).toEqual(['36%', '0.4%', '0%', '–'])
    expect([dec1(68.43), dec1(null)]).toEqual(['68.4', '–'])
  })
})

describe('the double ring', () => {
  it('puts the 20 at the top and the 6 at three o’clock', () => {
    expect(RING[0]).toMatchObject({ number: 20, mid: 0 })
    const six = RING.find(s => s.number === 6)!
    expect(six.mid).toBeCloseTo(Math.PI / 2)
    const [x, y] = polar(100, six.mid)
    expect([Math.round(x), Math.round(y) + 0]).toEqual([100, 0])
    expect(polar(100, 0).map(Math.round)).toEqual([0, -100])
  })

  it('fills a rate up to the full colour at 55%', () => {
    expect([rateFill(0), rateFill(0.275), rateFill(0.55), rateFill(0.9)]).toEqual([0, 0.5, 1, 1])
  })
})

describe('reading a chart scale', () => {
  it('gives a pixel position, or 0 where the scale has none', () => {
    const band = Object.assign((v: number | string) => (v === 'a' ? 10 : undefined), { bandwidth: () => 8 })
    expect([scaled(band, 'a'), scaled(band, 'z'), bandwidth(band), bandwidth({})]).toEqual([10, 0, 8, 0])
  })
})
