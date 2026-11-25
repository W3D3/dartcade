import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROFILE,
  kinded,
  lookKind,
  match,
  PRESET_180,
  ruleSchema,
  rulesSchema,
  type BoardTrigger,
  type Profile,
  type Rule,
} from './index.js'

const rule = (over: Omit<Partial<Rule>, 'when'> & { when?: Partial<Rule['when']> } = {}): Rule => ({
  type: 'flash',
  enabled: true,
  look: { color: 'seat', fx: 0, bri: 255 },
  holdMs: 2000,
  ...over,
  when: { trigger: 'visit', seats: 'any', ...over.when },
})

describe('ruleSchema', () => {
  it('keeps every look kind, with the preset state from the server whatever was sent', () => {
    const looks = [{ color: '#FF9B45', fx: 42, bri: 255, speed: 160, ix: 90, pal: 6 }, { ps: 4 }, { pl: 3 }, { raw: { on: true, ps: 2 } }]
    expect(looks.map(look => ruleSchema.parse(rule({ look: look as Rule['look'] })).look)).toEqual([
      { color: '#ff9b45', fx: 42, bri: 255, speed: 160, ix: 90, pal: 6 },
      { ps: 4 },
      { pl: 3 },
      { raw: { on: true, ps: 2 } },
    ])
    expect(ruleSchema.parse(rule({ look: { preset: '180', state: { rb: true } } })).look).toEqual({ preset: '180', state: PRESET_180 })
  })

  it('moves numbers into range and puts a between filter in order', () => {
    const r = ruleSchema.parse(rule({ when: { total: { op: 'between', n: 170, to: 100 } }, look: { ps: 999 }, holdMs: 5 }))
    expect(r.when.total).toEqual({ op: 'between', n: 100, to: 170 })
    expect(r.look).toEqual({ ps: 250 })
    expect(r.holdMs).toBe(100)
  })

  it('keeps a total only on a visit and a hold time only on a flash', () => {
    const r = ruleSchema.parse(rule({ type: 'scene', when: { trigger: 'bust', total: { op: '=', n: 180 } } }))
    expect(r.when.total).toBeUndefined()
    expect(r.holdMs).toBeUndefined()
  })

  it('names what is wrong', () => {
    const issues = (v: unknown) => {
      const r = ruleSchema.safeParse(v)
      return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    }
    expect(issues(rule({ look: { raw: { psave: 1 } } as never }))).toEqual(['look.raw: psave is not allowed'])
    expect(issues(rule({ look: { preset: 'Disco', state: {} } }))).toEqual(['look.preset: unknown preset'])
    expect(issues(rule({ when: { trigger: 'atc.hit' as never } }))).toEqual(['when.trigger: unknown trigger'])
  })

  it('round-trips the built-in profile and refuses more than 100 rules', () => {
    expect(rulesSchema.parse(DEFAULT_PROFILE.rules)).toEqual(DEFAULT_PROFILE.rules)
    expect(rulesSchema.safeParse(Array.from({ length: 101 }, () => rule())).success).toBe(false)
  })
})

describe('match with the visit filters', () => {
  const visit = (total: number): BoardTrigger => ({ kind: 'visit', seat: 0, total, local: true })
  const profile = (rules: Rule[]): Profile => ({ id: 'p', name: 'p', seatColors: [], rules })
  const low = rule({ when: { total: { op: '<=', n: 20 } }, look: { ps: 1 } })
  const mid = rule({ when: { total: { op: 'between', n: 100, to: 139 } }, look: { ps: 2 } })
  const ton = rule({ when: { total: { op: '>=', n: 100 } }, look: { ps: 3 } })

  it('fits <= and between, both ends included', () => {
    const p = profile([low, mid, ton])
    expect([0, 20, 21, 100, 139, 140, 180].map(n => match(p, visit(n), 'x01')?.look)).toEqual([
      { ps: 1 },
      { ps: 1 },
      undefined,
      { ps: 2 },
      { ps: 2 },
      { ps: 3 },
      { ps: 3 },
    ])
  })

  it('the first matching rule wins, so the order decides', () => {
    expect(match(profile([ton, mid]), visit(120), 'x01')?.look).toEqual({ ps: 3 })
    expect(match(profile([mid, ton]), visit(120), 'x01')?.look).toEqual({ ps: 2 })
  })
})

describe('lookKind', () => {
  it('tells every look apart by its key, a colour look by having none of the others', () => {
    const looks: [Rule['look'], string][] = [
      [{ color: 'seat', fx: 0, bri: 255 }, 'color'],
      [{ preset: '180', state: PRESET_180 }, 'preset'],
      [{ ps: 4 }, 'ps'],
      [{ pl: 2 }, 'pl'],
      [{ raw: { on: true } }, 'raw'],
    ]
    for (const [look, kind] of looks) {
      expect(lookKind(look)).toBe(kind)
      expect(kinded(look)).toEqual({ kind, look })
    }
  })
})
