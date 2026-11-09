import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '$shared/lights/index.js'
import { boardDeviceLabel, effectGroups, lightsLoadState, ruleLabel, sectionVisible, segmentHint, since } from '$lib/lights/view'

/** The nth default rule for a trigger, so these checks don't depend on the list's order */
const rule = (trigger: string, n = 0) => DEFAULT_PROFILE.rules.filter(r => r.when.trigger === trigger)[n]

describe('lights view', () => {
  it('labels the default rules like the design', () => {
    const base = { filter: null, enabled: true, hint: null }
    expect(ruleLabel(rule('turn'))).toEqual({ ...base, when: 'Turn changes', type: 'Scene', look: 'seat colour · solid' })
    expect(ruleLabel(rule('turn', 1)).filter).toBe('other board')
    expect(ruleLabel(rule('visit'))).toEqual({
      ...base,
      when: 'Visit scored',
      filter: '= 180',
      type: 'Flash',
      look: '180 preset · 4 s',
    })
    // A big score sparkles white rather than flashing the player's colour
    expect(ruleLabel(rule('visit', 1))).toEqual({
      ...base,
      when: 'Visit scored',
      filter: '≥ 100',
      type: 'Flash',
      look: 'white · sparkle · 2 s',
    })
    expect(ruleLabel(rule('bust'))).toEqual({ ...base, when: 'Bust', type: 'Flash', look: 'Busted preset · 1.5 s' })
    expect(ruleLabel(rule('checkout'))).toEqual({ ...base, when: 'Checkout', type: 'Flash', look: 'Gameshot preset · 3 s' })
    expect(ruleLabel(rule('game.won'))).toEqual({ ...base, when: 'Game won', type: 'Flash', look: 'Matchshot preset · 5 s' })
    // The takeout scene is a yellow pulse, so players see the board isn't ready
    expect(ruleLabel(rule('takeout.started'))).toEqual({ ...base, when: 'Takeout', type: 'Scene', look: 'yellow · pulse' })
    // The calibration scene is a purple comet travelling around the strip
    expect(ruleLabel(rule('calibration.started'))).toEqual({ ...base, when: 'Calibrating', type: 'Scene', look: 'purple · comet' })
  })
  it('the Lobby rule is off by default and says it shows only in a lobby', () => {
    // It uses the lime colour directly (not 'seat'); name it instead of the hex
    expect(ruleLabel(rule('lobby'))).toEqual({
      when: 'Lobby',
      filter: null,
      type: 'Scene',
      look: 'lime · pulse',
      enabled: false,
      hint: 'Shows only while you are in a lobby with no game running',
    })
  })
  it('labels the Cricket and 121 effects', () => {
    expect(ruleLabel(rule('cricket.closed')).when).toBe('Number closed')
    expect(ruleLabel(rule('p121.made')).when).toBe('Target made')
  })
  it('groups the effects by game, General first, keeping each rule’s place in the profile', () => {
    const groups = effectGroups(DEFAULT_PROFILE.rules)
    expect(groups.map(g => g.title)).toEqual(['General', 'X01', 'Cricket', '121', 'Minigolf', 'Higher Lower'])
    expect(groups.find(g => g.game === 'minigolf')?.items.map(i => ruleLabel(i.rule).when)).toEqual(['Ball sunk'])
    expect(groups.find(g => g.game === 'hilo')?.items.map(i => ruleLabel(i.rule).when)).toEqual(['Life lost'])
    // Every rule is in exactly one group, and its index points back at it
    expect(groups.flatMap(g => g.items).map(i => i.index)).toEqual(DEFAULT_PROFILE.rules.map((_, i) => i))
    for (const { rule: r, index } of groups.flatMap(g => g.items)) expect(DEFAULT_PROFILE.rules[index]).toBe(r)
  })
  it('puts a trigger this build does not know under General and leaves out games with no effect', () => {
    const groups = effectGroups([{ when: { trigger: 'future.thing' } }, { when: { trigger: 'golf.sunk' } }])
    expect(groups.map(g => [g.title, g.items.length])).toEqual([
      ['General', 1],
      ['Minigolf', 1],
    ])
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
