import { describe, expect, it } from 'vitest'
import type { LightRule } from '$lib/api'
import {
  describeRule,
  effectChoices,
  formOf,
  missingHint,
  NEW_RULE,
  paletteChoices,
  ruleOf,
  RULE_TRIGGERS,
  type RuleForm,
} from '$lib/lights/rules'

const made = (f: RuleForm): LightRule => {
  const r = ruleOf(f)
  if (!('rule' in r)) throw new Error(r.problems.join('; '))
  return r.rule
}
const problems = (f: RuleForm): string[] => {
  const r = ruleOf(f)
  return 'problems' in r ? r.problems : []
}

const fireworks: LightRule = {
  when: { trigger: 'visit', seats: 'any', total: { op: '=', n: 180 }, game: 'x01' },
  type: 'flash',
  enabled: true,
  look: { color: '#ff9b45', fx: 42, bri: 255, speed: 160 },
  holdMs: 4000,
}

describe('the rule form', () => {
  it('gives back the rule it was made from, for every look', () => {
    const looks: LightRule['look'][] = [
      { color: 'seat', fx: 2, bri: 200 },
      { color: '#ff9b45', fx: 42, bri: 255, speed: 160, ix: 90, pal: 6 },
      { preset: '180' },
      { ps: 12 },
      { pl: 3 },
      { raw: { on: true, bri: 90, seg: [{ id: 0, fx: 1 }] } },
    ]
    for (const look of looks) {
      // The game filter is X01's own on a visit, so it goes: a visit is X01 only
      const rule = { ...fireworks, when: { trigger: 'bust', seats: 'mine' as const }, look }
      expect(made(formOf(rule))).toEqual(rule)
    }
  })

  it('keeps what was typed in one look while another is picked', () => {
    const f = formOf(fireworks)
    f.look = 'playlist'
    f.pl = 7
    expect(made(f).look).toEqual({ pl: 7 })
    f.look = 'color'
    expect(made(f).look).toEqual(fireworks.look)
  })

  it('filters a visit by =, ≥, ≤ or between (put in order), and only a visit', () => {
    const f = formOf(fireworks)
    f.op = 'between'
    f.n = 140
    f.to = 100
    expect(made(f).when.total).toEqual({ op: 'between', n: 100, to: 140 })
    f.op = '<='
    expect(made(f).when.total).toEqual({ op: '<=', n: 140 })
    f.op = 'any'
    expect(made(f).when.total).toBeUndefined()
    f.op = '='
    f.trigger = 'bust'
    expect(made(f).when.total).toBeUndefined()
  })

  it("leaves the seat as any for a trigger with no seat, and a game's own trigger to its game", () => {
    const f = formOf(fireworks)
    f.trigger = 'takeout.started'
    f.seats = 'mine'
    expect(made(f).when.seats).toBe('any')
    f.trigger = 'checkout' // an X01 trigger: no game filter on top
    f.game = 'cricket'
    expect(made(f).when.game).toBeUndefined()
    f.trigger = 'game.won'
    expect(made(f).when.game).toBe('cricket')
  })

  it('a scene has no hold time', () => {
    const f = formOf(fireworks)
    f.type = 'scene'
    expect(made(f).holdMs).toBeUndefined()
  })

  it('says what stops a rule: bad JSON, a key WLED must not get, an id out of range', () => {
    const f = formOf(fireworks)
    f.look = 'raw'
    f.raw = '{ on: true'
    expect(problems(f)).toEqual(['This is not valid JSON.'])
    f.raw = '{"on": true, "psave": 3}'
    expect(problems(f)).toEqual(['psave is not allowed'])
    f.look = 'preset'
    f.presetSource = 'strip'
    f.ps = 0
    expect(problems(f)).toEqual(['A preset id is a whole number from 1 to 250.'])
    f.look = 'playlist'
    f.pl = 251
    expect(problems(f)).toEqual(['A playlist id is a whole number from 1 to 250.'])
  })

  it('offers every trigger the lights fire, and not Takeout finished, which brings the scene back instead', () => {
    expect(RULE_TRIGGERS).toContain('visit')
    expect(RULE_TRIGGERS).toContain('golf.sunk')
    expect(RULE_TRIGGERS).not.toContain('takeout.finished')
  })

  it('a new rule is valid as it is', () => {
    expect(made(formOf(NEW_RULE))).toEqual(NEW_RULE)
  })
})

describe('describeRule', () => {
  const name = (fx: number) => (fx === 42 ? 'Fireworks' : `Effect ${fx}`)
  it('says the look, the type and when, in words', () => {
    expect(describeRule(fireworks, name, () => '')).toBe(
      'Flashes for 4 s on top: #ff9b45, Fireworks #42, brightness 255, speed 160. When visit scored (total = 180), on any seat, in X01.',
    )
    const scene: LightRule = { when: { trigger: 'lobby', seats: 'any' }, type: 'scene', enabled: false, look: { pl: 3 } }
    expect(describeRule(scene, name, () => '')).toBe(
      'Stays until the next scene: playlist 3 saved on your strip. When lobby, in every game. Switched off.',
    )
  })
})

describe('effect and palette choices', () => {
  const ring = { name: 'Dartboard ring', effects: ['Solid', 'Blink', 'RSVD', 'Fireworks'], palettes: ['Default', 'Party'] }
  const shelf = { name: 'Shelf strip', effects: ['Solid', 'Blink'] }

  it("lists what the board's devices report, and which lack an effect", () => {
    const { fromDevices, choices } = effectChoices([ring, shelf], 0)
    expect(fromDevices).toBe(true)
    expect(choices.map(c => [c.id, c.name])).toEqual([
      [0, 'Solid'],
      [1, 'Blink'],
      [3, 'Fireworks'],
    ])
    const fw = choices.find(c => c.id === 3)
    expect(fw?.missingOn).toEqual(['Shelf strip'])
    expect(missingHint(fw)).toBe('Not on Shelf strip: it plays Solid instead.')
    expect(missingHint(choices[0])).toBeNull()
  })

  it('falls back to the common WLED effects while no device reported its own, and always offers the one in use', () => {
    const { fromDevices, choices } = effectChoices([{ name: 'Old bridge' }], 150)
    expect(fromDevices).toBe(false)
    expect(choices.find(c => c.id === 42)?.name).toBe('Fireworks')
    expect(choices.find(c => c.id === 150)?.name).toBe('Effect 150')
    expect(choices.every(c => c.missingOn.length === 0)).toBe(true)
  })

  it('palettes the same way', () => {
    expect(paletteChoices([ring], 0).choices.map(c => c.name)).toEqual(['Default', 'Party'])
    expect(paletteChoices([], 0).choices[0].name).toBe('Default')
  })
})
