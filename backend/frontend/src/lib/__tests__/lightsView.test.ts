import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import { boardDeviceLabel, lightsLoadState, ruleLabel, sectionVisible, segmentHint, since } from '$lib/lights/view'

describe('lights view', () => {
  it('labels the default rules like the design', () => {
    const base = { filter: null, enabled: true, hint: null }
    expect(ruleLabel(DEFAULT_PROFILE.rules[0])).toEqual({ ...base, when: 'Turn changes', type: 'Scene', look: 'seat colour · solid' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[1]).filter).toBe('other board')
    expect(ruleLabel(DEFAULT_PROFILE.rules[2])).toEqual({
      ...base,
      when: 'Visit scored',
      filter: '= 180',
      type: 'Flash',
      look: '180 preset · 4 s',
    })
    expect(ruleLabel(DEFAULT_PROFILE.rules[3])).toEqual({
      ...base,
      when: 'Visit scored',
      filter: '≥ 100',
      type: 'Flash',
      look: 'seat colour · pulse · 2 s',
    })
    expect(ruleLabel(DEFAULT_PROFILE.rules[4])).toEqual({ ...base, when: 'Bust', type: 'Flash', look: 'Busted preset · 1.5 s' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[5])).toEqual({ ...base, when: 'Checkout', type: 'Flash', look: 'Gameshot preset · 3 s' })
    expect(ruleLabel(DEFAULT_PROFILE.rules[6])).toEqual({ ...base, when: 'Game won', type: 'Flash', look: 'Matchshot preset · 5 s' })
    // The takeout scene is a yellow pulse, so players see the board isn't ready
    expect(ruleLabel(DEFAULT_PROFILE.rules[10])).toEqual({ ...base, when: 'Takeout', type: 'Scene', look: 'yellow · pulse' })
    // The calibration scene is a purple comet travelling around the strip
    expect(ruleLabel(DEFAULT_PROFILE.rules[11])).toEqual({ ...base, when: 'Calibrating', type: 'Scene', look: 'purple · comet' })
  })
  it('the Lobby rule is off by default and says it shows only in a lobby', () => {
    // It uses the lime colour directly (not 'seat'); name it instead of the hex
    expect(ruleLabel(DEFAULT_PROFILE.rules[12])).toEqual({
      when: 'Lobby',
      filter: null,
      type: 'Scene',
      look: 'lime · pulse',
      enabled: false,
      hint: 'Shows only while you are in a lobby with no game running',
    })
  })
  it('has no Target hit rule', () => {
    expect(DEFAULT_PROFILE.rules.map(r => r.when.trigger)).not.toContain('atc.hit')
  })
  it('falls back to the hex for an unnamed colour', () => {
    expect(
      ruleLabel({ when: { trigger: 'lobby', seats: 'any' }, type: 'scene', enabled: true, look: { color: '#123456', fx: 0, bri: 1 } }).look,
    ).toBe('#123456 · solid')
  })
  it('segment hints', () => {
    expect(segmentHint(144, 'perSeat', 4, 1)).toBe('4 × 36 LEDs')
    expect(segmentHint(145, 'perSeat', 4, 1)).toBe('3 × 36 + 37 LEDs')
    expect(segmentHint(120, 'whole', 2, 1)).toBe('120 LEDs')
    expect(segmentHint(60, 'wled', 2, 3)).toBe('3 WLED segments')
  })
  it('since', () => {
    expect(since('2026-10-18T12:00:00Z', new Date('2026-10-18T12:02:10Z'))).toBe('2 min ago')
    expect(since('2026-10-18T12:00:00Z', new Date('2026-10-18T12:00:20Z'))).toBe('just now')
    expect(since('2026-10-18T09:00:00Z', new Date('2026-10-18T12:00:00Z'))).toBe('3 h ago')
    expect(since('2026-10-18T11:00:00Z', new Date('2026-10-18T12:00:00Z'))).toBe('1 h ago')
  })
  it('a flagged section shows only with its flag', () => {
    expect(sectionVisible({ flag: 'lights.enabled' }, {})).toBe(false)
    expect(sectionVisible({ flag: 'lights.enabled' }, { 'lights.enabled': true })).toBe(true)
    expect(sectionVisible({}, {})).toBe(true)
  })
  it("a board picker count is an em dash until it's loaded, never 0 devices", () => {
    expect(boardDeviceLabel(true, undefined)).toBe('—')
    expect(boardDeviceLabel(true, 0)).toBe('0 devices')
    expect(boardDeviceLabel(true, 1)).toBe('1 device')
    expect(boardDeviceLabel(true, 3)).toBe('3 devices')
    expect(boardDeviceLabel(false, 3)).toBe('offline')
    expect(boardDeviceLabel(false, undefined)).toBe('offline')
  })
  it('the lights panel shows once loaded, an error once a load fails, else nothing yet', () => {
    expect(lightsLoadState(false, false)).toBe('loading')
    expect(lightsLoadState(false, true)).toBe('error')
    expect(lightsLoadState(true, true)).toBe('panel')
    expect(lightsLoadState(true, false)).toBe('panel')
  })
})
