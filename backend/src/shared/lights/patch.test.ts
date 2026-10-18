import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, patchFor, type Rule } from './index.js'

const turn = DEFAULT_PROFILE.rules[0] // seat colour, solid, 255
const lime = [198, 242, 78]
const offWhite = [239, 238, 230]

describe('patchFor', () => {
  it('whole strip: one segment over every LED, the rest removed', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 120, segmentMode: 'whole', segments: 1 }, { seatCount: 2 })
    expect(s.bri).toBe(255)
    expect(s.seg[0]).toEqual({ id: 0, start: 0, stop: 120, on: true, bri: 255, col: [lime], fx: 0, sx: 128 })
    expect(s.seg.slice(1)).toEqual(Array.from({ length: 15 }, (_, i) => ({ id: i + 1, stop: 0 })))
  })
  it('one per seat: equal parts, remainder to the last, others dimmed in their own colour', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 1, local: true }, { leds: 145, segmentMode: 'perSeat', segments: 1 }, { seatCount: 4 })
    expect(s.seg.slice(0, 4).map(g => [g.start, g.stop])).toEqual([
      [0, 36],
      [36, 72],
      [72, 108],
      [108, 145],
    ])
    expect(s.seg[1]).toMatchObject({ bri: 255, col: [offWhite] })
    expect(s.seg[0]).toMatchObject({ bri: 38, col: [lime], fx: 0 })
    expect(s.seg[4]).toEqual({ id: 4, stop: 0 })
  })
  it('one per seat with a seatless trigger lights every part with the look', () => {
    const takeout = DEFAULT_PROFILE.rules.find(r => r.when.trigger === 'takeout.started') as Rule
    const s = patchFor(
      takeout,
      { kind: 'takeout.started', local: true },
      { leds: 60, segmentMode: 'perSeat', segments: 1 },
      { seatCount: 2 },
    )
    expect(s.seg.slice(0, 2).every(g => g.bri === 255 && g.col?.[0].join() === '255,255,255')).toBe(true)
  })
  it('WLED segments: seat i is segment i, no layout changes, extra seats skipped', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 60, segmentMode: 'wled', segments: 2 }, { seatCount: 3 })
    expect(s.seg).toHaveLength(2)
    expect(s.seg.every(g => g.start === undefined && g.stop === undefined)).toBe(true)
  })
  it('team colour is the team’s first seat', () => {
    const r: Rule = { ...turn, look: { ...turn.look, color: 'team' } }
    const s = patchFor(
      r,
      { kind: 'turn', seat: 3, local: true },
      { leds: 10, segmentMode: 'whole', segments: 1 },
      {
        seatCount: 4,
        teams: [
          [0, 2],
          [1, 3],
        ],
      },
    )
    expect(s.seg[0].col).toEqual([offWhite])
  })
  it('seat colours cycle after four', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 4, local: true }, { leds: 10, segmentMode: 'whole', segments: 1 }, { seatCount: 6 })
    expect(s.seg[0].col).toEqual([lime])
  })
  it('a strip with fewer LEDs than seats still gets valid segments', () => {
    const s = patchFor(turn, { kind: 'turn', seat: 0, local: true }, { leds: 3, segmentMode: 'perSeat', segments: 1 }, { seatCount: 4 })
    for (const g of s.seg.slice(0, 4)) expect(g.stop! >= g.start!).toBe(true)
    expect(s.seg[3].stop).toBe(3)
  })
})
