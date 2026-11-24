import { describe, expect, it } from 'vitest'
import { applyInput, type GameInput } from '../session/apply.js'
import { newSession, replay, type LoggedInput } from '../session/replay.js'
import type { AnyGameModule, Session, UserAction } from '../session/types.js'
import { MissionSchema, type Mission } from '../shared/missions/types.js'
import { missionModule, type MissionConfig, type MissionState } from './mission.js'

const mission = (o: Partial<Mission> = {}): Mission =>
  MissionSchema.parse({
    name: 'Twenties',
    description: '',
    difficulty: 'easy',
    order: 'in_order',
    onFail: 'retry',
    pause: true,
    rankBy: 'time',
    steps: [
      { type: 'hit', targets: ['S20'], hits: 2, inARow: true, order: 'any' },
      { type: 'score', points: 100, within: 3 },
    ],
    ...o,
  })

const config = (m: Mission): MissionConfig => ({ missionId: 'm1', test: false, mission: m, highscores: [] })

// oxlint-disable-next-line typescript/consistent-type-assertions -- the registry erases the state type
const mod = missionModule as unknown as AnyGameModule

const start = (m: Mission): Session =>
  newSession({
    id: 'g1',
    ownerUserId: 'u1',
    boardId: null,
    module: mod,
    config: config(m),
    seats: [{ name: 'Ann', userId: 'u1', controllerUserId: 'u1', boardId: null, boardName: null, bot: null }],
    seed: 1,
    createdAt: new Date(0),
  })

const RING = { S: { bed: 'SingleOuter', multiplier: 1 }, D: { bed: 'Double', multiplier: 2 }, T: { bed: 'Triple', multiplier: 3 } } as const

const add = (label: string): UserAction => {
  const ring = RING[label[0] as keyof typeof RING]
  return { type: 'add_dart', segment: { name: label, number: Number(label.slice(1)), ...ring } }
}

/** Inputs one second apart; `|` takes the darts out. */
function inputs(labels: string): UserAction[] {
  return labels
    .split(' ')
    .filter(Boolean)
    .map(l =>
      l === '|' ? { type: 'takeout' } : l === 'pause' ? { type: 'mission_pause' } : l === 'resume' ? { type: 'mission_resume' } : add(l),
    )
}

/** Applies the actions at 1 s, 2 s, ...; the log rows a replay would read; whether the game was won. */
function play(session: Session, actions: UserAction[], from = 0): { rows: LoggedInput[]; won: boolean } {
  const rows: LoggedInput[] = []
  let won = false
  actions.forEach((action, i) => {
    const at = new Date((from + i + 1) * 1000)
    const input: GameInput = { source: 'user', action }
    if (applyInput(session, input, at).won) won = true
    rows.push({ seq: rows.length, source: 'user', kind: action.type, data: action, created_at: at })
  })
  return { rows, won }
}

const state = (s: Session) => s.committedState as MissionState

describe('mission game', () => {
  it('plays a mission to the end: the darts and the time', () => {
    const s = start(mission())
    const { won } = play(s, inputs('S20 S20 S1 | T20 T20 |'))
    expect(won).toBe(true)
    const v = missionModule.view(state(s), [])
    expect(v).toMatchObject({ status: 'completed', winner: 0, darts: 5 })
    // The clock starts at the first dart (1 s); the score step is done with the last T20 (6 s)
    expect(v.timeMs).toBe(5000)
    expect(missionModule.summarize(state(s), { totalDarts: [5], totalVisits: [2] })[0].stats).toEqual({
      completed: 1,
      stepsDone: 2,
      steps: 2,
      timeMs: 5000,
      darts: 5,
    })
  })

  it('a replay of the log gives the same state', () => {
    const s = start(mission({ onFail: 'restart' }))
    const { rows } = play(s, inputs('S20 S1 S1 | S20 S20 T20 | pause resume T20 T20 |'))
    const again = start(mission({ onFail: 'restart' }))
    replay(again, rows, () => undefined)
    expect(again.committedState).toEqual(s.committedState)
  })

  it('the time limit ends the game at the first input after it; the open visit does not count', () => {
    const s = start(mission({ timeLimit: 30 }))
    play(s, inputs('S20'))
    const late = play(s, [{ type: 'mission_clock' }], 40)
    expect(late.won).toBe(true)
    expect(missionModule.view(state(s), [])).toMatchObject({ status: 'failed', failure: 'time', timeMs: 30_000, darts: 0 })
    expect(s.openVisitEvents).toEqual([])
  })

  it('the clock stops with the deciding dart, not the takeout', () => {
    const s = start(mission({ steps: [{ type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any' }] }))
    play(s, inputs('S1 S20'))
    play(s, inputs('|'), 60)
    expect(missionModule.view(state(s), []).timeMs).toBe(1000)
  })

  it('give up ends the game failed', () => {
    const s = start(mission())
    const { won } = play(s, [add('S20'), { type: 'takeout' }, { type: 'mission_give_up' }])
    expect(won).toBe(true)
    expect(missionModule.view(state(s), [])).toMatchObject({ status: 'failed', failure: 'gave_up' })
  })

  it('refuses a config that is no mission or has more than one player', () => {
    expect(missionModule.validate?.(config(mission()), [{ name: 'A' }, { name: 'B' }])).toBe('A mission is played alone')
    expect(missionModule.validate?.({ ...config(mission()), mission: { ...mission(), steps: [] } }, [{ name: 'A' }])).toBe(
      'Invalid mission',
    )
    expect(missionModule.validate?.(config(mission()), [{ name: 'A' }])).toBeNull()
  })
})
