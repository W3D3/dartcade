import { describe, expect, it } from 'vitest'
import type { ArtifactId } from './content/artifacts.js'
import type { ClassId } from './content/classes.js'
import type { EnemyId } from './content/enemies.js'
import type { Hit } from './hit.js'
import { resolveVisit, type VisitInput } from './resolve.js'
import type { Enemy, Hero, PlacedItem } from './state.js'

const S = (n: number): Hit => ({ number: n, ring: 'single', score: n })
const D = (n: number): Hit => ({ number: n, ring: 'double', score: 2 * n })
const T = (n: number): Hit => ({ number: n, ring: 'treble', score: 3 * n })
const MISS: Hit = { number: 0, ring: 'miss', score: 0 }

const hero = (over: Partial<Hero> = {}): Hero => ({
  seat: 0,
  classId: null,
  healSegment: null,
  hp: 80,
  maxHp: 80,
  block: 0,
  artifacts: [],
  ...over,
})
const enemy = (kind: EnemyId, hp: number, uid = 'e0'): Enemy => ({ uid, kind, hp, maxHp: hp, burn: 0, chilled: false })

function run(
  visit: Hit[],
  opts: {
    artifacts?: ArtifactId[]
    classId?: ClassId
    enemies?: Enemy[]
    items?: PlacedItem[]
    heroes?: Hero[]
    healSegment?: number
  } = {},
) {
  const me = hero({ artifacts: opts.artifacts ?? [], classId: opts.classId ?? null, healSegment: opts.healSegment ?? null })
  const input: VisitInput = {
    seat: 0,
    visit,
    heroes: opts.heroes ?? [me],
    enemies: opts.enemies ?? [enemy('armoredKnight', 1000)],
    items: opts.items ?? [],
    gold: 0,
  }
  return resolveVisit(input)
}

// The Armored Knight is weak to trebles and resists singles; doubles hit it plainly
const plain = () => [enemy('skeleton', 1000)]

describe('resolveVisit', () => {
  it('damage is the board score without effects, and the trace starts each dart with its base', () => {
    const r = run([S(20), S(1), MISS], { enemies: [enemy('slime', 1000)] })
    // 20 is resisted by the Slime (half), 1 is plain, a miss deals nothing
    expect(r.trace.darts.map(d => d.damage)).toEqual([10, 1, 0])
    expect(r.trace.darts[0].steps).toEqual([
      { source: 'dart', id: null, effect: 'base_add', value: 20, base: 20, mult: 1, target: 'e0' },
      { source: 'resist', id: 'slime', effect: 'mult_mul', value: 0.5, base: 20, mult: 0.5, target: 'e0' },
    ])
    expect(r.trace.total).toBe(11)
  })

  it('weakness doubles, immunity stops a dart', () => {
    const r = run([D(20), S(7)], { enemies: [enemy('skeleton', 1000)] })
    expect(r.trace.darts.map(d => d.damage)).toEqual([80, 0])
    expect(r.trace.darts[1].steps.at(-1)).toMatchObject({ source: 'immune', mult: 0 })
  })

  it('a kill retargets the next dart and overkill is wasted', () => {
    const r = run([D(18), D(18)], { enemies: [enemy('slime', 10, 'e0'), enemy('slime', 100, 'e1')] })
    expect(r.trace.darts.map(d => [d.target, d.damage, d.killed])).toEqual([
      ['e0', 36, true],
      ['e1', 36, false],
    ])
    expect(r.enemies.map(e => e.hp)).toEqual([0, 64])
    expect(r.trace.enemies).toEqual([
      { uid: 'e0', hpBefore: 10, hpAfter: 0 },
      { uid: 'e1', hpBefore: 100, hpAfter: 64 },
    ])
  })

  it('a dart after every enemy died has no target and deals nothing', () => {
    const r = run([D(20), D(20)], { enemies: [enemy('slime', 5)] })
    expect(r.trace.darts[1]).toMatchObject({ target: null, damage: 0, killed: false })
  })

  it('fires segment items, then artifacts in the order owned, then the class, then the defences', () => {
    const r = run([T(20), T(20), T(20)], {
      artifacts: ['piercingSword', 'pinCushion'],
      classId: 'archer',
      items: [{ number: 20, item: 'whetstoneRune' }],
      enemies: [enemy('armoredKnight', 10000)],
    })
    const third = r.trace.darts[2].steps.map(s => [s.source, s.id, s.effect, s.value, s.base, s.mult])
    expect(third).toEqual([
      ['dart', null, 'base_add', 60, 60, 1],
      ['segment', 'whetstoneRune', 'base_add', 10, 70, 1],
      ['artifact', 'piercingSword', 'mult_mul', 2, 70, 2],
      ['artifact', 'pinCushion', 'base_add', 10, 80, 2],
      ['class', 'archer', 'mult_mul', 0.75, 80, 1.5],
      ['weakness', 'armoredKnight', 'mult_mul', 2, 80, 3],
    ])
    expect(r.trace.darts[2].damage).toBe(240)
    // The first dart has no previous one: no Pin Cushion
    expect(r.trace.darts[0].steps.some(s => s.id === 'pinCushion')).toBe(false)
  })

  it('Pin Cushion needs the same number as the dart before', () => {
    const r = run([S(20), S(20), S(19)], { artifacts: ['pinCushion'], enemies: plain() })
    expect(r.trace.darts.map(d => d.damage)).toEqual([20, 30, 19])
  })

  it('Piercing Sword doubles only when all three darts share a number', () => {
    expect(run([S(20), D(20), T(20)], { artifacts: ['piercingSword'], enemies: plain() }).trace.darts.map(d => d.damage)).toEqual([
      40, 160, 120,
    ])
    expect(run([S(20), S(19), S(20)], { artifacts: ['piercingSword'], enemies: plain() }).trace.total).toBe(59)
    expect(run([S(20), S(20)], { artifacts: ['piercingSword'], enemies: plain() }).trace.total).toBe(40)
    expect(run([MISS, MISS, MISS], { artifacts: ['piercingSword'], enemies: plain() }).trace.total).toBe(0)
  })

  it('Twin Buckler blocks on doubles; Spiked Buckler hits the front enemy with the block after the visit', () => {
    const r = run([D(1), D(1), S(1)], { artifacts: ['twinBuckler', 'spikedBuckler'], enemies: plain() })
    expect(r.heroes[0].block).toBe(16)
    expect(r.trace.afterVisit).toEqual([
      { source: 'afterVisit', id: 'spikedBuckler', effect: 'damage', value: 16, base: 0, mult: 1, target: 'e0' },
    ])
    expect(r.trace.total).toBe(4 + 4 + 1 + 16)
  })

  it('Tinderbox burns the target on a treble', () => {
    const r = run([T(1), T(1), S(1)], { artifacts: ['tinderbox'], enemies: plain() })
    expect(r.enemies[0].burn).toBe(20)
    expect(r.trace.darts[0].steps.find(s => s.effect === 'burn')).toMatchObject({ id: 'tinderbox', value: 10, target: 'e0' })
  })

  it('the Mage chains half a treble to a second enemy', () => {
    const r = run([T(10)], { classId: 'mage', enemies: [enemy('skeleton', 500, 'e0'), enemy('skeleton', 500, 'e1')] })
    expect(r.enemies.map(e => e.hp)).toEqual([470, 485])
    expect(r.trace.total).toBe(45)
  })

  it('the Healer heals the living party on their number, capped at max HP', () => {
    const heroes = [hero({ classId: 'healer', healSegment: 6, hp: 50 }), hero({ seat: 1, hp: 75 }), hero({ seat: 2, hp: 0 })]
    const r = run([S(6)], { heroes, enemies: plain() })
    expect(r.heroes.map(h => h.hp)).toEqual([60, 80, 0])
  })

  it('a segment item fires for the number only', () => {
    const r = run([S(5), S(6)], { items: [{ number: 5, item: 'stoneWall' }], enemies: plain() })
    expect(r.heroes[0].block).toBe(10)
  })

  it('a boss changes its defences by phase', () => {
    // Below a third of its HP the Warden is weak to the bull
    const r = run([{ number: 25, ring: 'bull', score: 25 }], { enemies: [{ ...enemy('dungeonWarden', 600), hp: 150 }] })
    expect(r.trace.darts[0].damage).toBe(50)
    const armoured = run([S(20)], { enemies: [{ ...enemy('dungeonWarden', 600), hp: 350 }] })
    expect(armoured.trace.darts[0].damage).toBe(0)
  })

  it('leaves its input untouched', () => {
    const enemies = plain()
    const heroes = [hero({ artifacts: ['twinBuckler'] })]
    run([D(20)], { enemies, heroes })
    expect(enemies[0].hp).toBe(1000)
    expect(heroes[0].block).toBe(0)
  })
})
