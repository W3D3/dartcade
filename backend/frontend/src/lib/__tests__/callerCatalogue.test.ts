import { describe, it, expect } from 'vitest'
import { CATALOGUE, haveOf, otherKeys } from '../caller/catalogue.js'

const keys = () => CATALOGUE.flatMap(g => g.keys.map(k => k.key))

describe('the caller sound catalogue', () => {
  it('lists each sound once', () => {
    expect(new Set(keys()).size).toBe(keys().length)
  })

  it('lists every key the caller asks for', () => {
    // The calls callsFor builds: scores, shots, legs, and the checkout phrases (requirePart)
    for (const k of [
      'gameon',
      'bulling_start',
      'busted',
      'gameshot',
      'matchshot',
      'and',
      'you_require',
      'gameshot_leg_1',
      '0',
      '60',
      '180',
      'require_170',
      'leg_1',
    ])
      expect(keys(), k).toContain(k)
  })

  it('leaves out scores three darts cannot make', () => {
    for (const n of [163, 166, 169, 172, 173, 175, 176, 178, 179]) {
      expect(keys()).not.toContain(String(n))
      expect(keys()).not.toContain(`require_${n}`)
    }
    expect(keys()).toContain('180')
    expect(keys()).toContain('162')
  })

  it('counts what a pack has of a group and finds what no group lists', () => {
    const clips = { '180': ['/a'], '60': ['/b', '/c'], gameshot: ['/d'], set_2: ['/e'], leg_30: ['/f'], empty: [] }
    const scores = CATALOGUE.find(g => g.id === 'scores')
    expect(scores && haveOf(scores, clips)).toEqual({ have: 2, total: 172 })
    expect(otherKeys(clips)).toEqual(['leg_30', 'set_2'])
  })
})
