import { describe, expect, it } from 'vitest'
import type { Hit } from './hit.js'
import type { RoomType } from './content/rooms.js'
import { beginRun, endVisit, pickClass, pickTreasure, startRun, throwDart, voteEvent, type Battle, type RunState } from './run.js'
import { runSummary } from './summary.js'
import { DEFAULT_CONFIG, type DungeonConfig } from './rules.js'

const S = (n: number): Hit => ({ number: n, ring: 'single', score: n })
const D = (n: number): Hit => ({ number: n, ring: 'double', score: 2 * n })
const MISS: Hit = { number: 0, ring: 'miss', score: 0 }
const LEFT = S(19)
const RIGHT = S(1)
const KILL = [D(19), D(19), D(19)]

const visit = (s: RunState, hits: Hit[]) => endVisit(hits.reduce(throwDart, s))

function battleOf(s: RunState): Battle {
  if (s.scene.phase !== 'battle') throw new Error(`in ${s.scene.phase}, not a battle`)
  return s.scene.battle
}

const picked = (cfg: Partial<DungeonConfig>, seats: number, seed: number) => {
  let s = startRun({ ...DEFAULT_CONFIG, ...cfg }, seats, seed)
  for (let seat = 0; seat < seats; seat++) s = pickClass(s, seat, ['archer', 'brawler', 'mage', 'guardian'][seat], null)
  return s
}

/** Started: the party is in the floor 1 fight (the only way up). */
const ready = (cfg: Partial<DungeonConfig> = {}, seats = 1, seed = 1): RunState => beginRun(picked(cfg, seats, seed))

/** Throws good darts until the fight is over. */
function win(s: RunState): RunState {
  for (let i = 0; i < 50 && s.scene.phase === 'battle'; i++) s = visit(s, KILL)
  return s
}

// A started run (in the floor 1 fight) whose floor 2 has `type` on the left and a fight on the right, then the boss
const withRoom = (s: RunState, type: RoomType): RunState => ({
  ...s,
  map: {
    lanes: 5,
    floors: [
      [{ lane: 2, type: 'fight' }],
      [
        { lane: 1, type },
        { lane: 3, type: 'fight' },
      ],
      [{ lane: 2, type: 'boss' }],
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
  it('waits for the host to start once every hero has a class, then enters the floor 1 fight at full HP', () => {
    let s = startRun(DEFAULT_CONFIG, 2, 1)
    s = pickClass(s, 0, 'brawler', null)
    expect(s.turn).toBe(1)
    expect(beginRun(s)).toBe(s) // a hero has no class yet
    s = pickClass(s, 1, 'healer', null)
    expect(s.heroes[1].classId).toBeNull() // the Healer needs a number
    s = pickClass(s, 1, 'healer', 6)
    expect(s.scene.phase).toBe('setup')
    expect(s.map.floors).toEqual([])
    s = beginRun(s)
    expect(s.scene.phase).toBe('battle')
    expect(s).toMatchObject({ floor: 1, room: 2, path: [2] })
    expect(s.map.floors).toHaveLength(9)
    expect(s.heroes.map(h => [h.classId, h.hp, h.maxHp, h.healSegment])).toEqual([
      ['brawler', 96, 96, null],
      ['healer', 80, 80, 6],
    ])
  })

  it("plays the difficulty and length of the config it was started with (the lobby's)", () => {
    const s = beginRun(picked({ difficulty: 'hard', floors: 5 }, 1, 1))
    expect(s.cfg).toEqual({ difficulty: 'hard', floors: 5 })
    expect(s.map.floors).toHaveLength(5)
    expect(runSummary(s)).toMatchObject({ difficulty: 'hard', floors: 5 })
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
  it('counts one dart per living hero and moves one lane left or right', () => {
    let s = win(ready({ difficulty: 'easy' }, 2))
    expect(s.scene).toEqual({ phase: 'map', votes: [null, null] })
    s = visit(s, [S(20), S(3), LEFT]) // 20 and 3 vote for neither; 19 is left
    expect(s.scene).toEqual({ phase: 'map', votes: ['left', null] })
    expect(s.turn).toBe(1)
    s = visit(s, [RIGHT])
    // A tie: drawn from the run's generator
    expect(s.floor).toBe(2)
    expect([1, 3]).toContain(s.room)
    expect(s.path).toEqual([2, s.room])
  })

  it('makes the same hero throw again when no dart voted', () => {
    const s = visit(win(ready({ difficulty: 'easy' })), [S(20), MISS])
    expect(s.scene).toEqual({ phase: 'map', votes: [null] })
  })

  it('takes the only way up without a vote (a room on the edge, the boss)', () => {
    let s = visit(win(withRoom(ready({ difficulty: 'easy' }), 'fight')), [LEFT])
    for (let i = 0; i < 50 && s.floor === 2; i++) s = visit(s, KILL)
    expect(s.scene.phase).toBe('battle')
    expect(s).toMatchObject({ floor: 3, room: 2 })
  })
})

describe('a fight', () => {
  it('resolves at the third dart and passes the turn at the takeout', () => {
    let s = ready({}, 2)
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
    let s = ready({}, 2)
    s = visit(s, [MISS, MISS, MISS])
    s = visit(s, [MISS, MISS, MISS])
    expect(battleOf(s).round).toBe(2)
    expect(battleOf(s).lastEnemyTurn?.attacks.length).toBeGreaterThan(0)
    expect(s.heroes.every(h => h.hp < h.maxHp)).toBe(true)
    expect(s.turn).toBe(0)
  })

  it('pays gold and returns to the map when the last enemy falls', () => {
    const s = win(ready({ difficulty: 'easy' }))
    expect(s.scene.phase).toBe('map')
    expect(s.cleared).toBe(1)
    expect(s.gold).toBe(12)
  })

  it("keeps each hero's numbers for the summary", () => {
    const s = visit(ready({}, 2), [D(19), D(19), S(1)])
    const st = s.stats[0]
    expect(st.damage).toBe(s.trace?.total)
    expect(st.bestVisit).toBe(st.damage)
    expect(st.bestDart).toMatchObject({ number: 19, ring: 'double' })
    expect(st.damageByFloor).toEqual([st.damage])
    expect(s.best).toMatchObject({
      seat: 0,
      damage: st.damage,
      darts: [
        { number: 19, ring: 'double' },
        { number: 19, ring: 'double' },
        { number: 1, ring: 'single' },
      ],
    })
    expect(s.stats[1]).toEqual({ damage: 0, bestVisit: 0, healed: 0, blocked: 0, bestDart: null, damageByFloor: [] })
  })
})

describe('rooms', () => {
  it('rest heals each living hero by their visit, capped at max HP', () => {
    let s = win(withRoom(ready({ difficulty: 'easy' }, 2), 'rest'))
    s = visit(visit({ ...s, heroes: s.heroes.map(h => ({ ...h, hp: 40 })) }, [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('rest')
    s = visit(s, [S(20), S(20), S(5)])
    expect(s.heroes[0].hp).toBe(80)
    expect(s.lastHeal).toEqual({ seat: 0, amount: 40 })
    s = visit(s, [S(10)])
    expect(s.heroes[1].hp).toBe(50)
    expect(s.stats.map(st => st.healed)).toEqual([40, 10])
    expect(s.scene.phase).toBe('battle') // the boss floor is entered without a vote
  })

  it('treasure offers each hero three artifacts of their own and ends when all picked', () => {
    let s = win(withRoom(ready({ difficulty: 'easy' }, 2), 'treasure'))
    s = visit(visit(s, [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('treasure')
    if (s.scene.phase !== 'treasure') throw new Error('not in treasure')
    expect(s.scene.offers.map(o => o?.length)).toEqual([3, 3])
    const offer = s.scene.offers[1]?.[2]
    s = pickTreasure(s, 1, 2)
    expect(s.heroes[1].artifacts).toEqual(['pinCushion', offer])
    expect(s.turn).toBe(0)
    s = pickTreasure(s, 0, 0)
    expect(s.cleared).toBe(2)
    expect(s.scene.phase).not.toBe('treasure')
  })

  it('an event applies the decision most heroes voted for', () => {
    let s = win(withRoom(ready({ difficulty: 'easy' }, 3), 'event'))
    s = visit(visit(visit(s, [LEFT]), [LEFT]), [LEFT])
    expect(s.scene.phase).toBe('event')
    if (s.scene.phase !== 'event') throw new Error('not in an event')
    const id = s.scene.event
    s = voteEvent(s, 0, 1)
    s = voteEvent(s, 1, 1)
    s = voteEvent(s, 2, 0)
    expect(s.lastEvent).toMatchObject({ id, decision: 1 })
    expect(s.cleared).toBe(2)
  })
})

describe('a whole run', () => {
  it('reaches victory with good darts and is the same every time for a seed', () => {
    const a = autoplay(ready({ floors: 5, difficulty: 'easy' }, 1, 42), [D(19), D(19), D(19)])
    expect(a.scene).toEqual({ phase: 'ended', outcome: 'victory' })
    expect(a.cleared).toBe(5)
    const summary = runSummary(a)
    expect(summary.path.map(r => r.type).at(-1)).toBe('boss')
    expect(summary.path).toHaveLength(5)
    expect(summary.heroes[0].damageByFloor).toHaveLength(5)
    expect(autoplay(ready({ floors: 5, difficulty: 'easy' }, 1, 42), [D(19), D(19), D(19)])).toEqual(a)
  })

  it('ends in defeat when nothing hits', () => {
    const s = autoplay(ready({ difficulty: 'expert' }, 2, 3), [MISS, MISS, MISS])
    expect(s.scene).toEqual({ phase: 'ended', outcome: 'defeat' })
    expect(s.heroes.every(h => h.hp === 0)).toBe(true)
  })
})
