import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, DEFAULT_SEAT_COLORS, PRESETS, type Rule } from '../shared/lights/index.js'
import { exportProfile, importProfile, MAX_EFFECTS, PROFILE_FORMAT, uniqueName } from './profileFile.js'

const file = (over: Record<string, unknown> = {}): Record<string, unknown> => ({ ...exportProfile(DEFAULT_PROFILE), ...over })
const effect = (over: Record<string, unknown> = {}) => ({
  trigger: 'bust',
  seats: 'mine',
  type: 'flash',
  enabled: true,
  look: { color: '#ff0000', fx: 1, bri: 255 },
  holdMs: 1500,
  ...over,
})
const imported = (raw: unknown) => {
  const r = importProfile(raw)
  if (!r.ok) throw new Error(r.error)
  return r
}

describe('exportProfile', () => {
  const out = exportProfile(DEFAULT_PROFILE)
  it('is a versioned file with the name, seat colours and every effect with its on/off state', () => {
    expect(out).toMatchObject({ format: PROFILE_FORMAT, version: 1, name: 'Dartcade default', seatColors: [...DEFAULT_SEAT_COLORS] })
    expect(out.effects).toHaveLength(DEFAULT_PROFILE.rules.length)
    expect(out.effects.find(e => e.trigger === 'lobby')?.enabled).toBe(false)
    expect(out.effects.filter(e => e.trigger === 'visit').map(e => e.total)).toEqual([
      { op: '=', n: 180 },
      { op: '>=', n: 100 },
    ])
  })
  it('names a preset look and never writes WLED state, ids or addresses', () => {
    const presets = out.effects.flatMap(e => ('preset' in e.look ? [e.look] : []))
    expect(presets.map(p => p.preset)).toEqual(['Matchshot', '180', 'Busted', 'Gameshot'])
    for (const p of presets) expect(Object.keys(p)).toEqual(['preset'])
    expect(Object.keys(out).sort()).toEqual(['effects', 'format', 'name', 'seatColors', 'version'])
    expect(JSON.stringify(out)).not.toMatch(/"(id|host|mac|token|state|seg|device)/i)
  })
})

describe('importProfile', () => {
  it('round-trips the built-in profile: the same rules, the same colours', () => {
    const r = imported(JSON.parse(JSON.stringify(exportProfile(DEFAULT_PROFILE))))
    expect(r.rules).toEqual(DEFAULT_PROFILE.rules)
    expect(r.seatColors).toEqual([...DEFAULT_SEAT_COLORS])
    expect(r.name).toBe('Dartcade default')
    expect(r.imported).toBe(DEFAULT_PROFILE.rules.length)
    expect(r.ignored).toEqual([])
    expect(r.adjusted).toEqual([])
  })

  describe('rejects the file', () => {
    it.each([
      ['null', null],
      ['an array', []],
      ['a string', 'hello'],
      ['another format', file({ format: 'something-else' })],
      ['no format', { name: 'x', effects: [] }],
    ])('when it is %s', (_n, raw) => {
      expect(importProfile(raw)).toEqual({ ok: false, error: 'This is not a Dartcade light profile file.' })
    })
    it('of another version, saying which', () => {
      expect(importProfile(file({ version: 2 }))).toEqual({
        ok: false,
        error: 'This file is version 2; this server reads version 1.',
      })
      expect(importProfile(file({ version: undefined }))).toMatchObject({ ok: false })
    })
    it('with no list of effects, or none it can use', () => {
      expect(importProfile(file({ effects: 'nope' }))).toEqual({ ok: false, error: 'The file has no list of effects.' })
      expect(importProfile(file({ effects: [] }))).toEqual({ ok: false, error: 'The file has no effect this server can use.' })
      expect(importProfile(file({ effects: [effect({ trigger: 'nope' }), 5, null] }))).toMatchObject({ ok: false })
    })
  })

  describe('ignores and reports what it does not know', () => {
    it('an effect for an unknown trigger (a future or removed effect), the rest still comes through', () => {
      const r = imported(file({ effects: [effect(), effect({ trigger: 'atc.hit' }), effect({ trigger: 'turn' })] }))
      expect(r.imported).toBe(2)
      expect(r.ignored).toEqual(['effect 2: unknown effect "atc.hit"'])
    })
    it('an effect for an unknown game', () => {
      const r = imported(file({ effects: [effect(), effect({ game: 'darts-of-doom' }), effect({ game: 'x01' })] }))
      expect(r.imported).toBe(2)
      expect(r.ignored).toEqual(['effect 2: game is not valid'])
      expect(r.rules[1].when.game).toBe('x01')
    })
    it('unknown fields on the file, an effect and a look, and keeps none of them', () => {
      const r = imported(file({ extra: 1, effects: [effect({ colour: 'red', look: { color: '#00ff00', fx: 0, bri: 10, evil: true } })] }))
      expect(r.ignored).toEqual(['unknown field "extra"', 'effect 1: unknown field "colour"', 'effect 1: unknown look field "evil"'])
      expect(JSON.stringify(r.rules)).not.toMatch(/colour|evil|extra/)
    })
    it('an effect that is not an object, an unknown preset or a bad field', () => {
      const r = imported(
        file({
          effects: [
            effect(),
            'a string',
            effect({ look: { preset: 'Rm -rf' } }),
            effect({ seats: 'everyone' }),
            effect({ type: 'explosion' }),
            effect({ enabled: 'yes' }),
          ],
        }),
      )
      expect(r.imported).toBe(1)
      expect(r.ignored).toEqual([
        'effect 2: not an object',
        'effect 3: look is not valid',
        'effect 4: seats is not valid',
        'effect 5: type is not valid',
        'effect 6: enabled is not valid',
      ])
    })
  })

  describe('trusts nothing a device would receive', () => {
    it('takes a preset’s WLED state from the built-in presets, whatever the file says', () => {
      const r = imported(file({ effects: [effect({ look: { preset: '180', state: { rb: true, on: false }, seg: [{ id: 9 }] } })] }))
      expect(r.rules[0].look).toEqual({ preset: '180', state: PRESETS['180'] })
      expect(r.ignored).toEqual(['effect 1: unknown look field "state"', 'effect 1: unknown look field "seg"'])
    })
    it('only accepts a colour as seat, team or #rrggbb', () => {
      const r = imported(
        file({
          effects: [
            effect({ look: { color: 'seat', fx: 0, bri: 1 } }),
            effect({ look: { color: 'team', fx: 0, bri: 1 } }),
            effect({ look: { color: '#ABCDEF', fx: 0, bri: 1 } }),
            effect({ look: { color: 'red', fx: 0, bri: 1 } }),
            effect({ look: { color: '#fff', fx: 0, bri: 1 } }),
            effect({ look: { color: 'javascript:alert(1)', fx: 0, bri: 1 } }),
          ],
        }),
      )
      expect(r.rules.map(x => ('color' in x.look ? x.look.color : null))).toEqual(['seat', 'team', '#abcdef'])
      expect(r.ignored).toHaveLength(3)
    })
  })

  describe('moves numbers into range and says so', () => {
    it('brightness, effect id, speed, hold time and visit total', () => {
      const r = imported(
        file({
          effects: [
            effect({
              trigger: 'visit',
              total: { op: '>=', n: 9999 },
              look: { color: '#ffffff', fx: -5, bri: 999, speed: 1e9 },
              holdMs: 5,
            }),
            effect({ holdMs: 999_999, look: { color: '#ffffff', fx: 12.6, bri: -3 } }),
          ],
        }),
      )
      expect(r.rules[0]).toMatchObject({ when: { total: { op: '>=', n: 180 } }, look: { fx: 0, bri: 255, speed: 255 }, holdMs: 100 })
      expect(r.rules[1]).toMatchObject({ look: { fx: 13, bri: 0 }, holdMs: 60_000 })
      expect(r.adjusted).toEqual([
        'effect 1: effect id moved into range',
        'effect 1: brightness moved into range',
        'effect 1: speed moved into range',
        'effect 1: visit total moved into range',
        'effect 1: hold time moved into range',
        'effect 2: effect id moved into range',
        'effect 2: brightness moved into range',
        'effect 2: hold time moved into range',
      ])
    })
    it('reports each number on its own: a speed alone, a visit total alone', () => {
      const speed = imported(file({ effects: [effect({ look: { color: '#ffffff', fx: 1, bri: 1, speed: 999 } })] }))
      expect(speed.rules[0].look).toMatchObject({ speed: 255 })
      expect(speed.adjusted).toEqual(['effect 1: speed moved into range'])
      const total = imported(file({ effects: [effect({ trigger: 'visit', total: { op: '>=', n: 500 } })] }))
      expect(total.rules[0].when.total).toEqual({ op: '>=', n: 180 })
      expect(total.adjusted).toEqual(['effect 1: visit total moved into range'])
    })
    it('reports nothing for numbers already in range, at the edges too', () => {
      const r = imported(
        file({
          effects: [
            effect({ trigger: 'visit', total: { op: '=', n: 180 }, look: { color: '#ffffff', fx: 255, bri: 0, speed: 0 }, holdMs: 100 }),
            effect({ look: { preset: '180' }, holdMs: 60_000 }),
          ],
        }),
      )
      expect(r.adjusted).toEqual([])
    })
    it('rejects a number that is not a number', () => {
      const r = imported(file({ effects: [effect(), effect({ look: { color: '#ffffff', fx: 'fast', bri: 1 } }), effect({ holdMs: NaN })] }))
      expect(r.imported).toBe(1)
    })
    it('keeps a total only on a visit effect', () => {
      const r = imported(file({ effects: [effect({ total: { op: '=', n: 5 } })] }))
      expect(r.rules[0].when.total).toBeUndefined()
    })
  })

  describe('seat colours', () => {
    it('lower-cases them and fills a short list with the defaults', () => {
      const r = imported(file({ seatColors: ['#AABBCC', '#112233'] }))
      expect(r.seatColors).toEqual(['#aabbcc', '#112233', ...DEFAULT_SEAT_COLORS.slice(2)])
      expect(r.adjusted).toEqual([
        'seat 3 had no colour: the default was used',
        'seat 4 had no colour: the default was used',
        'seat 5 had no colour: the default was used',
        'seat 6 had no colour: the default was used',
      ])
    })
    it('replaces a bad colour with the default and drops colours past the sixth', () => {
      const r = imported(file({ seatColors: ['red', 7, '#112233', '#445566', '#778899', '#aabbcc', '#ddeeff', '#000000'] }))
      expect(r.seatColors).toEqual([DEFAULT_SEAT_COLORS[0], DEFAULT_SEAT_COLORS[1], '#112233', '#445566', '#778899', '#aabbcc'])
      expect(r.adjusted).toEqual([
        'seat 1 colour was not #rrggbb: the default was used',
        'seat 2 colour was not #rrggbb: the default was used',
      ])
      expect(r.ignored).toEqual(['2 seat colours past the sixth'])
    })
    it('uses the defaults when the file has none', () => {
      const r = imported(file({ seatColors: undefined }))
      expect(r.seatColors).toEqual([...DEFAULT_SEAT_COLORS])
      expect(r.adjusted).toEqual(['no seat colours: the defaults were used'])
    })
  })

  describe('effects', () => {
    it('keeps the on/off state, and an effect with none is on', () => {
      const r = imported(file({ effects: [effect({ enabled: false }), effect({ enabled: undefined })] }))
      expect(r.rules.map((x: Rule) => x.enabled)).toEqual([false, true])
    })
    it('takes at most as many as a profile can hold', () => {
      const r = imported(file({ effects: Array.from({ length: MAX_EFFECTS + 5 }, () => effect()) }))
      expect(r.imported).toBe(MAX_EFFECTS)
      expect(r.ignored).toEqual([`5 effects past the ${MAX_EFFECTS}th`])
    })
    it('keeps the file’s order, which decides which effect wins', () => {
      const r = imported(file({ effects: [effect({ trigger: 'checkout' }), effect({ trigger: 'bust' }), effect({ trigger: 'turn' })] }))
      expect(r.rules.map(x => x.when.trigger)).toEqual(['checkout', 'bust', 'turn'])
    })
  })

  describe('the name', () => {
    it.each([
      ['  Spaced   out  ', 'Spaced out'],
      ['Line\nbreak\ttab\u0000nul', 'Line break tab nul'],
      ['', 'Imported profile'],
      ['   ', 'Imported profile'],
      [42, 'Imported profile'],
      [undefined, 'Imported profile'],
      ['x'.repeat(200), 'x'.repeat(60)],
    ])('%j becomes %j', (name, expected) => {
      expect(imported(file({ name })).name).toBe(expected)
    })
  })
})

describe('uniqueName', () => {
  it('keeps a free name and numbers a taken one, ignoring case', () => {
    expect(uniqueName('Mine', [])).toBe('Mine')
    expect(uniqueName('Mine', ['Other'])).toBe('Mine')
    expect(uniqueName('Mine', ['mine'])).toBe('Mine 2')
    expect(uniqueName('Mine', ['Mine', 'Mine 2', 'MINE 3'])).toBe('Mine 4')
  })
  it('stays within the name limit', () => {
    const long = 'y'.repeat(60)
    const name = uniqueName(long, [long])
    expect(name).toHaveLength(60)
    expect(name.endsWith(' 2')).toBe(true)
  })
})
