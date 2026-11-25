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

const oneStep = (o: Partial<Mission> = {}) =>
  mission({ steps: [{ type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any' }], ...o })

const config = (m: Mission): MissionConfig => ({ missionId: 'm1', test: false, mission: m, highscores: [], bests: {} })

// oxlint-disable-next-line typescript/consistent-type-assertions -- the registry erases the state type
const mod = missionModule as unknown as AnyGameModule

const NAMES = ['Ann', 'Bob', 'Cid']

const start = (m: Mission, players = 1): Session =>
  newSession({
    id: 'g1',
    ownerUserId: 'u0',
    boardId: null,
    module: mod,
    config: config(m),
    seats: NAMES.slice(0, players).map((name, i) => ({
      name,
      userId: `u${i}`,
      controllerUserId: `u${i}`,
      boardId: null,
      boardName: null,
      bot: null,
    })),
    seed: 1,
    createdAt: new Date(0),
  })

const RING = { S: { bed: 'SingleOuter', multiplier: 1 }, D: { bed: 'Double', multiplier: 2 }, T: { bed: 'Triple', multiplier: 3 } } as const

const add = (label: string): UserAction => {
  const ring = RING[label[0] as keyof typeof RING]
  return { type: 'add_dart', segment: { name: label, number: Number(label.slice(1)), ...ring } }
}

const ACTIONS: Record<string, UserAction> = {
  '|': { type: 'takeout' },
  pause: { type: 'mission_pause' },
  resume: { type: 'mission_resume' },
  giveup: { type: 'mission_give_up' },
  clock: { type: 'mission_clock' },
}

/** `|` takes the darts out (the turn passes); a word is a mission action; anything else a dart. */
const inputs = (labels: string): UserAction[] =>
  labels
    .split(' ')
    .filter(Boolean)
    .map(l => ACTIONS[l] ?? add(l))

/** Applies the actions one second apart from `from` s; the log rows a replay reads; whether the game was won. */
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
// oxlint-disable-next-line typescript/consistent-type-assertions -- the session erases the state type
const view = (s: Session) => missionModule.view(s.currentState as MissionState, [])

describe('mission game, solo', () => {
  it('plays a mission to the end: the darts and the time', () => {
    const s = start(mission())
    const { won } = play(s, inputs('S20 S20 S1 | T20 T20 |'))
    expect(won).toBe(true)
    const v = view(s)
    expect(v.winner).toBe(0)
    // The clock starts at the first dart (1 s); the score step is done with the last T20 (6 s)
    expect(v.runs[0]).toMatchObject({ status: 'completed', darts: 5, timeMs: 5000, place: 1 })
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
    expect(play(s, inputs('clock'), 40).won).toBe(true)
    expect(view(s).runs[0]).toMatchObject({ status: 'failed', failure: 'time', timeMs: 30_000, darts: 0 })
    expect(s.openVisitEvents).toEqual([])
  })

  it('the clock stops with the deciding dart, not the takeout', () => {
    const s = start(oneStep())
    play(s, inputs('S1 S20'))
    play(s, inputs('|'), 60)
    expect(view(s).runs[0].timeMs).toBe(1000)
  })

  it('give up ends the game failed', () => {
    const s = start(mission())
    expect(play(s, inputs('S20 | giveup')).won).toBe(true)
    expect(view(s).runs[0]).toMatchObject({ status: 'failed', failure: 'gave_up' })
  })

  it('refuses a config that is no mission, or a test run with company', () => {
    expect(missionModule.validate?.({ ...config(mission()), test: true }, [{ name: 'A' }, { name: 'B' }])).toBe(
      'A test run is played alone',
    )
    expect(missionModule.validate?.({ ...config(mission()), mission: { ...mission(), steps: [] } }, [{ name: 'A' }])).toBe(
      'Invalid mission',
    )
    expect(missionModule.validate?.(config(mission()), [{ name: 'A' }, { name: 'B' }])).toBeNull()
  })
})

describe('mission game, players taking turns', () => {
  it('two players alternate visits, each with their own progress', () => {
    const s = start(mission(), 2)
    play(s, inputs('S20 S1 S1 |'))
    expect(view(s)).toMatchObject({ currentPlayer: 1, nextPlayer: 0 })
    play(s, inputs('S20 S20 T20 |'), 4)
    const v = view(s)
    expect(v.currentPlayer).toBe(0)
    // Ann's streak broke twice (two misses in a row: her third attempt); Bob finished the streak and scored 60 of the 100
    expect(v.runs[0].steps[0]).toMatchObject({ attempts: 3, best: 1 })
    expect(v.runs[1].steps[0].doneAt).not.toBeNull()
    expect(v.runs[1].steps[1].progress).toMatchObject({ value: 60, of: 100 })
  })

  it("a player's clock runs only during their turn", () => {
    const s = start(oneStep({ steps: [{ type: 'score', points: 120, within: 6 }] }), 2)
    // Ann: 1 s to 4 s (her takeout); Bob's turn starts with it, and he is done at 6 s: 2 s
    play(s, inputs('T20 S1 S1 | T20 T20 |'))
    expect(view(s).runs[1]).toMatchObject({ status: 'completed', timeMs: 2000 })
    // Ann's turn starts with Bob's takeout (7 s): done with her dart at 8 s, so 3 s + 1 s of her own time
    play(s, inputs('T20'), 7)
    const v = view(s)
    expect(v.runs[0]).toMatchObject({ status: 'completed', timeMs: 4000 })
    expect(v.winner).toBe(1)
  })

  it('three players: one who gives up is out and skipped, the others play on to the end', () => {
    const s = start(oneStep({ steps: [{ type: 'hit', targets: ['S20'], hits: 2, inARow: true, order: 'any' }] }), 3)
    play(s, inputs('S20 | S1 | S20 |'))
    // Ann's turn: she plays on; Bob gives up when it is his turn
    play(s, inputs('S1 |'), 6)
    play(s, inputs('giveup'), 8)
    expect(view(s)).toMatchObject({ currentPlayer: 2, nextPlayer: 0 })
    expect(view(s).runs[1]).toMatchObject({ status: 'failed', failure: 'gave_up', place: null })
    // Cid completes; then Ann, and never back to Bob
    play(s, inputs('S20 |'), 9)
    expect(view(s).currentPlayer).toBe(0)
    const { won } = play(s, inputs('S20 S20 |'), 11)
    expect(won).toBe(true)
    const v = view(s)
    expect(v.runs.map(r => r.place)).toEqual([2, 3, 1])
    expect(v.winner).toBe(2)
    expect(missionModule.summarize(state(s), { totalDarts: [], totalVisits: [] }).map(r => r.placement)).toEqual([2, 3, 1])
  })

  it('ranks by steps done first, then by the time of those who completed', () => {
    const s = start(mission({ timeLimit: 30 }), 2)
    // Ann does the streak; Bob does it too and starts on the score
    play(s, inputs('S20 S20 |'))
    play(s, inputs('S20 S20 S1 |'), 3)
    // Ann's time runs out on step 2: she is out, the turn goes to Bob, who finishes
    play(s, inputs('clock'), 60)
    expect(view(s).runs[0]).toMatchObject({ status: 'failed', failure: 'time' })
    expect(view(s).currentPlayer).toBe(1)
    expect(play(s, inputs('T20 T20 |'), 61).won).toBe(true)
    expect(view(s).runs.map(r => r.place)).toEqual([2, 1])
  })

  it('a replay of a game of three gives the same state', () => {
    const m = mission({ onFail: 'restart', timeLimit: 120 })
    const s = start(m, 3)
    const { rows } = play(s, inputs('S20 S1 | S20 S20 T20 | giveup S1 S1 S1 | S20 S20 T20 | T20 T20 |'))
    const again = start(m, 3)
    replay(again, rows, () => undefined)
    expect(again.committedState).toEqual(s.committedState)
  })
})
