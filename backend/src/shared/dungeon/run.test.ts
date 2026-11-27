import { describe, expect, it } from 'vitest'
import type { Hit } from './hit.js'
import type { DungeonMap } from './map.js'
import { endVisit, pickClass, pickTreasure, startRun, throwDart, voteEvent, type Battle, type RunState } from './run.js'
import { DEFAULT_CONFIG, type DungeonConfig } from './rules.js'

const S = (n: number): Hit => ({ number: n, ring: 'single', score: n })
const D = (n: number): Hit => ({ number: n, ring: 'double', score: 2 * n })
const MISS: Hit = { number: 0, ring: 'miss', score: 0 }
const LEFT = S(19)
const RIGHT = S(1)

const visit = (s: RunState, hits: Hit[]) => endVisit(hits.reduce(throwDart, s))

function battleOf(s: RunState): Battle {
  if (s.scene.phase !== 'battle') throw new Error(`in ${s.scene.phase}, not a battle`)
  return s.scene.battle
}

function ready(cfg: Partial<DungeonConfig> = {}, seats = 1, seed = 1): RunState {
  let s = startRun({ ...DEFAULT_CONFIG, ...cfg }, seats, seed)
  for (let seat = 0; seat < seats; seat++) s = pickClass(s, seat, ['archer', 'brawler', 'mage', 'guardian'][seat], null)
  return s
}

// A run whose rooms are the given types, one per floor (always on the left), then the boss
const withRooms = (s: RunState, types: DungeonMap['floors'][number][number]['type'][]): RunState => ({
  ...s,
  map: {
    floors: [
      ...types.map(type => [
        { side: 'left' as const, type },
        { side: 'right' as const, type: 'fight' as const },
      ]),
      [{ side: 'left', type: 'boss' }],
    ],
  },
})

/** Plays until the run ends or `limit` steps: battle darts from `aim`, votes on the left, the first treasure and decision. */
function autoplay(s: RunState, aim: Hit[], limit = 500): RunState {
  for (let i = 0; i < limit && s.scene.phase !== 'ended'; i++) {
    if (s.scene.phase === 'map') s = visit(s, [LEFT])
    else if (s.scene.phase === 'battle' || s.scene.phase === 'rest') s = visit(s, aim)
    else if (s.scene.phase === 'treasure') s = pickTreasure(s, s.turn, 0)
    else if (s.scene.phase === 'event') s = voteEvent(s, s.turn, 0)
  }
  return s
}

describe('setup', () => {
  it('waits for every class, then starts on the map at full HP', () => {
    let s = startRun(DEFAULT_CONFIG, 2, 1)
    s = pickClass(s, 0, 'brawler', null)
    expect(s.scene.phase).toBe('setup')
    expect(s.turn).toBe(1)
    s = pickClass(s, 1, 'healer', null)
    expect(s.scene.phase).toBe('setup') // the Healer needs a number
    s = pickClass(s, 1, 'healer', 6)
    expect(s.scene.phase).toBe('map')
    expect(s.heroes.map(h => [h.classId, h.hp, h.maxHp, h.healSegment])).toEqual([
      ['brawler', 96, 96, null],
      ['healer', 80, 80, 6],
    ])
  })

  it('gives each class its starting artifact and lets no two heroes share a class', () => {
    let s = pickClass(startRun(DEFAULT_CONFIG, 2, 1), 0, 'archer', null)
    expect(s.heroes[0].artifacts).toEqual(['tinderbox'])
    expect(pickClass(s, 1, 'archer', null)).toBe(s)
    s = pickClass(s, 0, 'mage', null)
    expect(s.heroes[0]).toMatchObject({ classId: 'mage', artifacts: ['piercingSword'] })
  })

  it('ignores an unknown class', () => {
    const s = startRun(DEFAULT_CONFIG, 1, 1)
    expect(pickClass(s, 0, 'wizard', null)).toBe(s)
  })
})

describe('the map vote', () => {
  it('counts one dart per living hero and enters the winning room', () => {
    let s = ready({}, 2)
    s = visit(s, [S(20), S(3), LEFT]) // 20 and 3 vote for neither; 19 is left
    expect(s.scene).toEqual({ phase: 'map', votes: ['left', null] })
    expect(s.turn).toBe(1)
    s = visit(s, [RIGHT])
    // A tie: drawn from the run's generator
    expect(s.scene.phase).toBe('battle')
    expect(s.floor).toBe(1)
    expect(['left', 'right']).toContain(s.room)
  })

  it('makes the same hero throw again when no dart voted', () => {
    const s = visit(ready(), [S(20), MISS])
    expect(s.scene.phase).toBe('map')
    expect(s.scene).toEqual({ phase: 'map', votes: [null] })
  })
})

describe('a fight', () => {
  it('resolves at the third dart and passes the turn at the takeout', () => {
    let s = visit(ready({}, 2), [LEFT])
    s = visit(s, [LEFT])
    expect(s.scene.phase).toBe('battle')
    const hp = battleOf(s).enemies[0].hp
    s = [S(1), S(1), S(1)].reduce(throwDart, s)
    expect(battleOf(s).resolved).toBe(true)
    expect(s.trace?.darts).toHaveLength(3)
    expect(battleOf(s).enemies[0].hp).toBeLessThan(hp)
    expect(s.turn).toBe(0)
    expect(throwDart(s, S(20))).toBe(s) // a fourth dart changes nothing
    s = endVisit(s)
    expect(s.turn).toBe(1)
  })

  it('lets the enemies attack every living hero after the round, then starts the next round', () => {
    let s = visit(ready({}, 2), [LEFT])
    s = visit(s, [LEFT])
    s = visit(s, [MISS, MISS, MISS])
    s = visit(s, [MISS, MISS, MISS])
    expect(battleOf(s).round).toBe(2)
    expect(battleOf(s).lastEnemyTurn?.attacks.length).toBeGreaterThan(0)
    expect(s.heroes.every(h => h.hp < h.maxHp)).toBe(true)
    expect(s.turn).toBe(0)
  })

  it('pays gold and returns to the map when the last enemy falls', () => {
    let s = visit(ready({ difficulty: 'easy' }), [LEFT])
    for (let i = 0; i < 20 && s.scene.phase === 'battle'; i++) s = visit(s, [D(19), D(19), D(19)])
    expect(s.scene.phase).toBe('map')
    expect(s.cleared).toBe(1)
    expect(s.gold).toBe(12)
  })
})

describe('rooms', () => {
  it('rest heals each living hero by their visit, capped at max HP', () => {
    let s = withRooms(ready({}, 2), ['rest'])
    s = { ...s, heroes: s.heroes.map(h => ({ ...h, hp: 40 })) }
    s = visit(visit(s, [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('rest')
    s = visit(s, [S(20), S(20), S(5)])
    expect(s.heroes[0].hp).toBe(80)
    expect(s.lastHeal).toEqual({ seat: 0, amount: 40 })
    s = visit(s, [S(10)])
    expect(s.heroes[1].hp).toBe(50)
    expect(s.scene.phase).toBe('battle') // the boss floor is entered without a vote
  })

  it('treasure offers each hero three artifacts of their own and ends when all picked', () => {
    let s = withRooms(ready({}, 2), ['treasure'])
    s = visit(visit(s, [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('treasure')
    if (s.scene.phase !== 'treasure') throw new Error('not in treasure')
    expect(s.scene.offers.map(o => o?.length)).toEqual([3, 3])
    const offer = s.scene.offers[1]?.[2]
    s = pickTreasure(s, 1, 2)
    expect(s.heroes[1].artifacts).toEqual(['pinCushion', offer])
    expect(s.turn).toBe(0)
    s = pickTreasure(s, 0, 0)
    expect(s.cleared).toBe(1)
    expect(s.scene.phase).not.toBe('treasure')
  })

  it('an event applies the decision most heroes voted for', () => {
    let s = withRooms(ready({}, 3), ['event'])
    s = visit(visit(visit(s, [LEFT]), [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('event')
    if (s.scene.phase !== 'event') throw new Error('not in an event')
    const id = s.scene.event
    s = voteEvent(s, 0, 1)
    s = voteEvent(s, 1, 1)
    s = voteEvent(s, 2, 0)
    expect(s.lastEvent).toMatchObject({ id, decision: 1 })
    expect(s.cleared).toBe(1)
  })
})

describe('a whole run', () => {
  it('reaches victory with good darts and is the same every time for a seed', () => {
    const a = autoplay(ready({ floors: 5, difficulty: 'easy' }, 1, 42), [D(19), D(19), D(19)])
    expect(a.scene).toEqual({ phase: 'ended', outcome: 'victory' })
    expect(a.cleared).toBe(5)
    expect(autoplay(ready({ floors: 5, difficulty: 'easy' }, 1, 42), [D(19), D(19), D(19)])).toEqual(a)
  })

  it('ends in defeat when nothing hits', () => {
    const s = autoplay(ready({ difficulty: 'expert' }, 2, 3), [MISS, MISS, MISS])
    expect(s.scene).toEqual({ phase: 'ended', outcome: 'defeat' })
    expect(s.heroes.every(h => h.hp === 0)).toBe(true)
  })
})
