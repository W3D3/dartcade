import { describe, expect, it } from 'vitest'
import type { EnemyId } from './content/enemies.js'
import { enemyTurn, intentOf, intentValue } from './enemyTurn.js'
import { DUNGEON_RULES } from './rules.js'
import type { Enemy, Hero } from './state.js'

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
const enemy = (kind: EnemyId, over: Partial<Enemy> = {}): Enemy => ({
  uid: 'e0',
  kind,
  hp: 50,
  maxHp: 50,
  burn: 0,
  chilled: false,
  ...over,
})

describe('enemyTurn', () => {
  it('an attack hits every living hero, block first, and block resets after', () => {
    const r = enemyTurn([hero({ block: 5 }), hero({ seat: 1 }), hero({ seat: 2, hp: 0 })], [enemy('skeleton')], 1, 'medium', DUNGEON_RULES)
    expect(r.heroes.map(h => [h.hp, h.block])).toEqual([
      [77, 0],
      [72, 0],
      [0, 0],
    ])
    expect(r.log.attacks[0].name).toBe('Bone Slash')
    expect(r.log.attacks[0].hits).toEqual([
      { seat: 0, blocked: 5, damage: 3 },
      { seat: 1, blocked: 0, damage: 8 },
    ])
  })

  it('a Ghost ignores block; a Guardian keeps half of what is left', () => {
    const r = enemyTurn([hero({ block: 20, classId: 'guardian' })], [enemy('ghost')], 1, 'medium', DUNGEON_RULES)
    expect(r.heroes[0]).toMatchObject({ hp: 72, block: 10 })
  })

  it('scales with the difficulty, Chill cuts the attack once, Burn ticks', () => {
    const chilled = enemy('skeleton', { chilled: true, burn: 12 })
    expect(intentValue(chilled, 1, 'hard', DUNGEON_RULES)).toBe(8)
    const r = enemyTurn([hero()], [chilled], 1, 'hard', DUNGEON_RULES)
    expect(r.heroes[0].hp).toBe(72)
    expect(r.enemies[0]).toMatchObject({ hp: 38, chilled: false })
    expect(r.log.burns).toEqual([{ uid: 'e0', damage: 12 }])
  })

  it('an every-other-round attacker rests on its off round', () => {
    expect(intentOf(enemy('armoredKnight'), 1)).toEqual({ kind: 'none', name: 'Raise Shield' })
    expect(intentOf(enemy('armoredKnight'), 2)).toEqual({ kind: 'attack', name: 'Heavy Swing', value: 14 })
    expect(enemyTurn([hero()], [enemy('armoredKnight')], 1, 'medium', DUNGEON_RULES).heroes[0].hp).toBe(80)
  })
})
