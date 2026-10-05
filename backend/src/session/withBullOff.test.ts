import { describe, it, expect } from 'vitest'
import { withBullOff } from './withBullOff.js'
import type { BoardEvent, GameModule, Player } from './types.js'

// A minimal game, to show the bull off works with any module, not just X01.
type CountState = { order: number[]; current: number; darts: number }
type CountConfig = { bullOff?: 'off' | 'wdc' | 'pdc' }

const countGame: GameModule<CountState, CountConfig> = {
  id: 'count',
  version: 1,
  defaultConfig: {},
  init: (_cfg, players, _rng) => ({ order: players.map((_, i) => i), current: 0, darts: 0 }),
  getCurrentPlayer: s => s.current,
  onBoardEvent: (s, e) => ({ state: e.kind === 'dart.detected' ? { ...s, darts: s.darts + 1 } : s }),
  onUserAction: s => ({ state: s }),
  view: s => ({ darts: s.darts, currentPlayer: s.current, winner: null }),
  summarize: () => [],
  detail: () => ({}),
}

const game = withBullOff(countGame, {
  applyStartOrder: (s, order) => ({ ...s, order, current: order[0] }),
})

const players: Player[] = [{ name: 'A' }, { name: 'B' }]
const opened: BoardEvent = { kind: 'visit.opened', data: { visit_id: 'v' } }
const takeout: BoardEvent = { kind: 'takeout.finished', data: {} }
const dartAt = (mm: number): BoardEvent => ({
  kind: 'dart.detected',
  data: {
    visit_id: 'v',
    index: 0,
    source_seq: 1,
    dart: {
      segment: { name: '25', number: 25, bed: 'Single', multiplier: 1 },
      score: 25,
      polar: { r: mm / 170, theta_deg: 0 },
    },
  } as any,
})

function play(s: ReturnType<typeof game.init>, ...events: BoardEvent[]) {
  return events.reduce((acc, e) => game.onBoardEvent(acc, e).state, s)
}

describe('withBullOff', () => {
  it('adds the bullOff option to the game config', () => {
    expect(game.defaultConfig.bullOff).toBe('off')
    expect(game.configMeta?.bullOff.options?.map(o => o.value)).toEqual(['off', 'wdc', 'pdc'])
  })

  it('passes straight through to the game when bull off is off', () => {
    const s = play(game.init({}, players), opened, dartAt(50))
    expect(s.stage).toBe('game')
    expect(s.game.darts).toBe(1)
  })

  it('keeps darts away from the game until the bull off is decided', () => {
    let s = play(game.init({ bullOff: 'wdc' }, players), opened, dartAt(40), takeout, opened, dartAt(5), takeout)
    expect(s.game.darts).toBe(0)
    expect(game.view(s, players)).toMatchObject({
      phase: 'bulloff',
      bullOff: { result: { order: [1, 0], rethrow: false } },
    })

    // The first visit after the result starts the game in the ranked order
    s = play(s, opened, dartAt(20))
    expect(s.stage).toBe('game')
    expect(s.game).toEqual({ order: [1, 0], current: 1, darts: 1 })
    expect(game.view(s, players).bullOff).toBeNull()
  })

  it('exposes the bull off thrower as the current player', () => {
    const s = play(game.init({ bullOff: 'wdc' }, players), opened, dartAt(40), takeout)
    expect(game.getCurrentPlayer(s)).toBe(1)
    expect(game.view(s, players).currentPlayer).toBe(1)
  })

  it('makes the winner current once the bull off is decided, and the last thrower on a rethrow', () => {
    const decided = play(game.init({ bullOff: 'wdc' }, players), opened, dartAt(5), takeout, opened, dartAt(40), takeout)
    expect(game.getCurrentPlayer(decided)).toBe(0)
    // The bull off view still shows who threw last
    expect(game.view(decided, players).currentPlayer).toBe(1)
    const tied = play(game.init({ bullOff: 'wdc' }, players), opened, dartAt(20), takeout, opened, dartAt(20), takeout)
    expect(game.getCurrentPlayer(tied)).toBe(1)
  })

  it('handles skip, rethrow and start actions', () => {
    let s = game.init({ bullOff: 'wdc' }, players)
    s = game.onUserAction(s, { type: 'bulloff_skip' }).state
    expect(s.bullOff.currentPlayer).toBe(1)

    s = game.onUserAction(s, { type: 'bulloff_rethrow' }).state
    expect(s.bullOff.throws).toEqual([null, null])
    expect(s.bullOff.currentPlayer).toBe(1)

    // start is ignored until there is a result without a rethrow
    expect(game.onUserAction(s, { type: 'bulloff_start' }).state.stage).toBe('bulloff')
    s = play(s, dartAt(3), takeout, opened, dartAt(9), takeout)
    s = game.onUserAction(s, { type: 'bulloff_start' }).state
    expect(s.stage).toBe('game')
    expect(s.game.current).toBe(1)
  })

  it('does not start a bull off for a single player', () => {
    expect(game.validate!({ bullOff: 'wdc' }, [{ name: 'A' }])).toMatch(/at least two players/)
    expect(game.init({ bullOff: 'wdc' }, [{ name: 'A' }]).stage).toBe('game')
  })
})
