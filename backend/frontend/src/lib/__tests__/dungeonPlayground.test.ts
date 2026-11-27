import { afterEach, describe, expect, it } from 'vitest'
import { ARTIFACTS } from '$shared/dungeon/content/artifacts.js'
import { liveCatalogue, pickables } from '../dungeon/playground/catalogue.js'
import { exportPreset, importPreset, SCENARIOS } from '../dungeon/playground/presets.js'
import { parseScript } from '../dungeon/playground/script.js'
import { determinism, diff, replay, type Action } from '../dungeon/playground/session.js'
import { checks, emptySetup, heroesOf, parseSetup, type Setup } from '../dungeon/playground/setup.js'
import { testCase } from '../dungeon/playground/testcase.js'

const scenario = (name: string) => SCENARIOS.find(s => s.name === name)!
const throwAll = (script: string): Action[] => [...parseScript(script).hits.map((hit): Action => ({ t: 'dart', hit })), { t: 'end' }]

describe('throw script', () => {
  it('reads every form', () => {
    const r = parseScript('t20 D16, 25; bull miss 20x3 s5 7 3x2')
    expect(r.errors).toEqual([])
    expect(r.hits.map(h => [h.number, h.ring, h.score])).toEqual([
      [20, 'treble', 60],
      [16, 'double', 32],
      [25, 'bull', 25],
      [25, 'bullseye', 50],
      [0, 'miss', 0],
      [20, 'treble', 60],
      [5, 'single', 5],
      [7, 'single', 7],
      [3, 'double', 6],
    ])
  })

  it('names the tokens it cannot read and keeps the rest', () => {
    const r = parseScript('t20 t21 banana 25x3 d0')
    expect(r.hits).toHaveLength(1)
    expect(r.errors.map(e => e.token)).toEqual(['t21', 'banana', '25x3', 'd0'])
  })
})

describe('setup and engine state', () => {
  it('maps a setup to the engine types, one seat per hero and a uid per enemy', () => {
    const s = scenario('Mage chain on two enemies').setup
    const state = replay(s, [])
    expect(state.heroes[0]).toMatchObject({ seat: 0, classId: 'mage', artifacts: ['piercingSword'] })
    expect(state.enemies.map(e => e.uid)).toEqual(['e0', 'e1'])
    expect(state.items).toEqual([{ number: 20, item: 'whetstoneRune' }])
  })

  it('resolves Pin Cushion + Piercing Sword exactly as the engine does', () => {
    const state = replay(scenario('Pin Cushion + Piercing Sword').setup, throwAll('t20 t20 t20'))
    const ids = state.trace!.darts.flatMap(d => d.steps.map(st => st.id))
    expect(ids).toContain('pinCushion')
    expect(ids).toContain('piercingSword')
    // brawler: no single; t20 = 60, +10 pin cushion on darts 2 and 3, x2 sword
    expect(state.trace!.darts.map(d => d.damage)).toEqual([120, 140, 140])
    expect(state.enemies[0].hp).toBe(200)
    expect(diff(state.before!, state).find(c => c.what === 'Enemy 1 HP')).toEqual({ what: 'Enemy 1 HP', before: '600', after: '200' })
  })

  it('moves to the next living hero after a visit and runs the enemy turn on the round', () => {
    const s: Setup = {
      ...emptySetup(),
      heroes: [heroesOf(emptySetup())[0], heroesOf(emptySetup())[0]].map(({ seat: _s, ...h }) => ({ ...h, classId: null })),
      enemies: [{ kind: 'slime', hp: 60, maxHp: 60, burn: 0, chilled: false }],
    }
    const state = replay(s, [...throwAll('s1'), { t: 'enemyTurn' }])
    expect(state.round).toBe(2)
    expect(state.heroes.map(h => h.hp)).toEqual([74, 74])
    expect(state.turn!.attacks[0].hits).toHaveLength(2)
  })

  it('undo, clear and a full visit', () => {
    const s = emptySetup()
    const hit = parseScript('t20').hits[0]
    const state = replay(s, [
      { t: 'dart', hit },
      { t: 'dart', hit },
      { t: 'undo' },
      { t: 'dart', hit },
      { t: 'dart', hit },
      { t: 'dart', hit },
      { t: 'clear' },
    ])
    expect(state.visit).toEqual([])
    expect(
      replay(s, [
        { t: 'dart', hit },
        { t: 'dart', hit },
        { t: 'dart', hit },
        { t: 'dart', hit },
      ]).visit,
    ).toHaveLength(3)
  })
})

describe('replay', () => {
  it('draws the same random darts from the same seed, and other ones from another', () => {
    const log: Action[] = [{ t: 'random' }, { t: 'random' }, { t: 'random' }]
    const a = replay({ ...emptySetup(5) }, log).visit
    expect(replay({ ...emptySetup(5) }, log).visit).toEqual(a)
    expect(replay({ ...emptySetup(6) }, log).visit).not.toEqual(a)
  })

  it('rewinding is replaying a shorter log', () => {
    const setup = scenario('Tinderbox burn stacking').setup
    const log: Action[] = [...throwAll('t20 t19 t18'), { t: 'enemyTurn' }, ...throwAll('t20 t20 t20')]
    expect(replay(setup, log).enemies[0].burn).toBe(60)
    expect(replay(setup, log.slice(0, 5)).enemies[0].burn).toBe(30)
  })

  it('the determinism check passes for the shipped content', () => {
    const setup = scenario('Tinderbox burn stacking').setup
    expect(determinism(setup, [...throwAll('t20 t19 t18'), { t: 'enemyTurn' }, { t: 'random' }]).ok).toBe(true)
  })
})

describe('checks', () => {
  it('flags what breaks the engine invariants', () => {
    const s = emptySetup()
    s.heroes = [
      { classId: 'archer', healSegment: null, hp: 90, maxHp: 80, block: 0, artifacts: ['pinCushion', 'pinCushion'] },
      { classId: 'archer', healSegment: null, hp: 80, maxHp: 80, block: 0, artifacts: [] },
    ]
    s.items = [
      { number: 20, item: 'stoneWall' },
      { number: 20, item: 'whetstoneRune' },
    ]
    const msgs = checks(s)
      .map(c => c.message)
      .join('\n')
    expect(msgs).toContain('no two heroes share a class')
    expect(msgs).toContain('twice')
    expect(msgs).toContain('above max HP')
    expect(msgs).toContain('2 items on 20')
    expect(msgs).toContain('No living enemy')
  })

  it('the built-in scenarios have no errors', () => {
    for (const sc of SCENARIOS)
      expect(
        checks(sc.setup).filter(c => c.level === 'error'),
        sc.name,
      ).toEqual([])
  })
})

describe('presets', () => {
  it('round-trips through the export file', () => {
    const sc = scenario('Mage chain on two enemies')
    const r = importPreset(exportPreset(sc.name, sc.setup))
    expect(r).toEqual({ preset: { name: sc.name, setup: sc.setup } })
  })

  it('rejects a file that is not a setup, naming the field', () => {
    expect(importPreset('{')).toEqual({ error: 'not JSON' })
    expect('error' in importPreset(JSON.stringify({ v: 1, name: 'x', setup: { v: 1, seed: -1 } }))).toBe(true)
    const bad = { ...scenario('Mage chain on two enemies').setup, heroes: [] }
    expect(parseSetup(bad)).toMatchObject({ error: expect.stringContaining('heroes') })
  })

  it('rejects an id the registries do not have', () => {
    const s = structuredClone(scenario('Pin Cushion + Piercing Sword').setup)
    s.heroes[0].artifacts.push('notAThing')
    expect(parseSetup(s)).toEqual({ error: 'unknown artifact notAThing' })
  })
})

describe('content discovery', () => {
  const registry = ARTIFACTS as Record<string, unknown>
  afterEach(() => {
    delete registry.fakeFeather
  })

  it('a new artifact appears in the picker, is accepted by import and fires in a visit', () => {
    expect(pickables(liveCatalogue().artifacts).map(p => p.id)).not.toContain('fakeFeather')
    registry.fakeFeather = {
      name: 'Fake Feather',
      rarity: 'legendary',
      status: 'draft',
      description: 'Every dart deals +1000 damage.',
      trigger: 'On each dart',
      hooks: { onDart: () => [{ effect: 'base_add', value: 1000 }] },
    }
    const row = pickables(liveCatalogue().artifacts).find(p => p.id === 'fakeFeather')
    expect(row).toMatchObject({ name: 'Fake Feather', rarity: 'legendary', description: 'Every dart deals +1000 damage.' })
    const s = structuredClone(scenario('Pin Cushion + Piercing Sword').setup)
    s.heroes[0].artifacts = ['fakeFeather']
    expect('setup' in parseSetup(s)).toBe(true)
    expect(replay(s, throwAll('s1')).trace!.darts[0].steps.map(st => st.id)).toContain('fakeFeather')
  })
})

describe('copy as a test case', () => {
  it('writes the setup, the visit and what the engine gave', () => {
    const sc = scenario('Pin Cushion + Piercing Sword')
    const log = throwAll('t20 t20 t20')
    const text = testCase(sc.setup, log, 'pin cushion with the sword')
    expect(text).toContain("it('pin cushion with the sword'")
    expect(text).toContain("'pinCushion'")
    expect(text).toContain('resolveVisit({ seat: 0')
    expect(text).toContain(`expect(enemies.map(e => e.hp)).toEqual(${JSON.stringify(replay(sc.setup, log).enemies.map(e => e.hp))})`)
  })

  it('takes the seat from the replay: two heroes, two visits', () => {
    const setup = { ...scenario('Mage chain on two enemies').setup }
    setup.heroes = [setup.heroes[0], { ...setup.heroes[0], classId: 'archer', artifacts: ['tinderbox'] }]
    const log = [...throwAll('t20 t20 t20'), ...throwAll('t19 t19 t19')]
    const text = testCase(setup, log)
    expect(text).toContain('resolveVisit({ seat: 0')
    expect(text).toContain('resolveVisit({ seat: 1')
    expect(text).toContain('// hero 2 throws T19 T19 T19')
    expect(text).not.toContain('(random')
  })
})
