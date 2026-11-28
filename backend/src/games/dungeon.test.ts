import { Ajv2019 } from 'ajv/dist/2019.js'
import { describe, expect, it } from 'vitest'
import wsSchema from '../schema/game-ws-v1.deref.json' with { type: 'json' }
import { authorizeAction } from '../session/access.js'
import type { BoardEvent, Session, UserAction } from '../session/types.js'
import { seededRng } from '../shared/rng.js'
import type { RunState } from '../shared/dungeon/run.js'
import { dungeonModule as game, type DungeonConfig } from './dungeon.js'

const cfg: DungeonConfig = { difficulty: 'medium', floors: 9 }
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }))
const dart = (number: number, multiplier: number, index = 0): BoardEvent =>
  ({
    kind: 'dart.detected',
    data: {
      visit_id: 'v',
      index,
      dart: { segment: { name: '', number, bed: multiplier === 0 ? 'Outside' : 'Single', multiplier }, score: number * multiplier },
      source_seq: 1,
    },
  }) as BoardEvent
const opened: BoardEvent = { kind: 'visit.opened', data: {} }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
const act = (s: RunState, a: UserAction) => game.onUserAction(s, a).state

function visit(s: RunState, darts: [number, number][]): RunState {
  s = game.onBoardEvent(s, opened).state
  darts.forEach(([n, m], i) => (s = game.onBoardEvent(s, dart(n, m, i)).state))
  return game.onBoardEvent(s, takeout).state
}

const start = (n = 1, seed = 5) => {
  let s = game.init(cfg, players(n), seededRng(seed))
  for (let seat = 0; seat < n; seat++)
    s = act(s, { type: 'dungeon_pick_class', seat, classId: ['brawler', 'archer', 'mage', 'guardian'][seat] })
  return act(s, { type: 'dungeon_start' })
}

describe('config', () => {
  it('accepts the default and parties of 1 to 4', () => {
    for (const n of [1, 2, 3, 4]) expect(game.validate!(game.defaultConfig, players(n))).toBeNull()
  })
  it.each([{ difficulty: 'nightmare' }, { floors: 8 }])('refuses %o', bad =>
    expect(game.validate!({ ...cfg, ...bad } as DungeonConfig, players(1))).not.toBeNull(),
  )
  it('refuses a party of 5', () => expect(game.validate!(cfg, players(5))).not.toBeNull())
})

describe('the module', () => {
  it("starts in setup with darts locked; the host's start enters the floor 1 fight", () => {
    const s = game.init(cfg, players(2), seededRng(1))
    expect(game.view(s, players(2))).toMatchObject({
      phase: 'setup',
      visitLocked: true,
      winner: null,
      currentPlayer: 0,
      map: { floors: [] },
    })
    expect(game.view(start(2), players(2))).toMatchObject({
      phase: 'battle',
      visitLocked: false,
      currentPlayer: 0,
      nextPlayer: 1,
      floor: 1,
      room: 2,
      path: [2],
    })
  })

  it('reads board darts in a fight', () => {
    let s = start()
    const v = game.view(s, players(1))
    expect(v.phase).toBe('battle')
    expect(v.battle?.target).toBe('e0')
    expect(v.battle?.enemies[0].intent.kind).toBe('attack')
    s = visit(s, [
      [20, 3],
      [20, 3],
      [0, 0],
    ])
    expect(game.view(s, players(1)).trace?.darts.map(d => d.ring)).toEqual(['treble', 'treble', 'miss'])
  })

  it('locks the visit at its third dart and names who is up next', () => {
    let s = start(2)
    s = [dart(1, 1, 0), dart(1, 1, 1), dart(1, 1, 2)].reduce((st, e) => game.onBoardEvent(st, e).state, game.onBoardEvent(s, opened).state)
    expect(game.view(s, players(2))).toMatchObject({ visitLocked: true, currentPlayer: 0, nextPlayer: 1 })
  })

  it('replays the same inputs to the same state, the seed deciding the map', () => {
    const a = visit(start(1, 9), [
      [20, 2],
      [5, 1],
      [1, 3],
    ])
    expect(
      visit(start(1, 9), [
        [20, 2],
        [5, 1],
        [1, 3],
      ]),
    ).toEqual(a)
    expect(start(1, 10).map).not.toEqual(start(1, 9).map)
  })

  it('a corrected last dart refolds the open visit cleanly', () => {
    const base = game.onBoardEvent(start(), opened).state
    const two = [dart(20, 1, 0), dart(20, 1, 1)].reduce((st, e) => game.onBoardEvent(st, e).state, base)
    const misread = game.onBoardEvent(two, dart(7, 1, 2)).state
    const fixed = game.onBoardEvent(two, dart(19, 1, 2)).state
    expect(fixed.trace).not.toEqual(misread.trace)
    expect(game.onBoardEvent(two, dart(19, 1, 2)).state).toEqual(fixed)
  })

  it('summarizes an unfinished run (a forfeit) with every seat sharing the place', () => {
    const s = start(2)
    expect(game.summarize(s, { totalDarts: [2, 1], totalVisits: [2, 1] })).toEqual([
      { placement: 1, stats: { victory: 0, cleared: 0, damage: 0, bestVisit: 0, dartsThrown: 2 } },
      { placement: 1, stats: { victory: 0, cleared: 0, damage: 0, bestVisit: 0, dartsThrown: 1 } },
    ])
    expect(game.detail([], s)).toMatchObject({
      mode: 'dungeon',
      darts: [0, 0],
      summary: { outcome: null, cleared: 0, heroes: [{ classId: 'brawler' }, { classId: 'archer' }] },
    })
  })

  it('takes no darts or actions once the run is over', () => {
    const ended: RunState = { ...start(), scene: { phase: 'ended', outcome: 'defeat' } }
    expect(game.view(ended, players(1))).toMatchObject({ winner: 0, outcome: 'defeat', nextPlayer: null })
    expect(game.onBoardEvent(ended, dart(20, 3)).state).toBe(ended)
    expect(act(ended, { type: 'dungeon_vote', seat: 0, decision: 0 })).toBe(ended)
  })
})

describe('who may choose for a hero', () => {
  const session = {
    module: game,
    currentState: game.init(cfg, players(2), seededRng(1)),
    ownerUserId: 'host',
    ranked: null,
    tournamentMatchId: null,
    clock: null,
    seats: [{ controllerUserId: 'host' }, { controllerUserId: 'guest' }],
  } as unknown as Session
  const pick = (seat: number): UserAction => ({ type: 'dungeon_pick_class', seat, classId: 'mage' })

  it('the host for any hero, a player for their own', () => {
    expect(authorizeAction(session, 'host', pick(1))).toEqual(pick(1))
    expect(authorizeAction(session, 'guest', pick(1))).toEqual(pick(1))
    expect(authorizeAction(session, 'guest', pick(0))).toBeNull()
    expect(authorizeAction(session, 'stranger', pick(1))).toBeNull()
  })
})

describe('the view matches schema/game-ws-v1.json in every phase', () => {
  const validate = new Ajv2019({ strict: false, allErrors: true }).compile(wsSchema.$defs.DungeonGame)
  const check = (s: RunState) => {
    const ok = validate({ ...game.view(s, players(s.heroes.length)), currentVisitDarts: [], totalDarts: [0], totalVisits: [0] })
    expect(ok, JSON.stringify(validate.errors)).toBe(true)
  }

  it.each([
    ['setup', () => game.init(cfg, players(1), seededRng(1))],
    ['map', () => start()],
    [
      'battle with a trace',
      () =>
        visit(start(), [
          [20, 3],
          [20, 2],
          [25, 1],
        ]),
    ],
    [
      'the boss in its second phase',
      (): RunState => ({
        ...start(),
        scene: {
          phase: 'battle',
          battle: {
            room: 'boss',
            round: 2,
            resolved: false,
            lastEnemyTurn: null,
            enemies: [{ uid: 'e0', kind: 'dungeonWarden', hp: 100, maxHp: 600, burn: 0, chilled: false }],
          },
        },
      }),
    ],
    ['treasure', (): RunState => ({ ...start(), scene: { phase: 'treasure', offers: [['pinCushion', 'tinderbox', 'twinBuckler']] } })],
    ['event', (): RunState => ({ ...start(), scene: { phase: 'event', event: 'placeholderShrine', votes: [null] } })],
    ['ended', (): RunState => ({ ...start(), scene: { phase: 'ended', outcome: 'victory' } })],
  ])('%s', (_, state) => check(state()))
})
