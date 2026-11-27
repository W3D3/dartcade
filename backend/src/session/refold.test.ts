import { describe, it, expect } from 'vitest'
import { refoldVisit } from './refold.js'
import type { GameModule, BoardEvent } from './types.js'

type CountState = { count: number }
const countModule: GameModule<CountState> = {
  id: 'count',
  version: 1,
  defaultConfig: {},
  init: () => ({ count: 0 }),
  onBoardEvent: (s, e) => (e.kind === 'dart.detected' ? { state: { count: s.count + 1 } } : { state: s }),
  onUserAction: s => ({ state: s }),
  view: s => s,
  getCurrentPlayer: () => 0,
  summarize: () => [],
  detail: () => ({}),
}

describe('refoldVisit', () => {
  it('returns committedState when events is empty', () => {
    const result = refoldVisit(countModule, { count: 5 }, [])
    expect(result).toEqual({ count: 5 })
  })

  it('folds events in order', () => {
    const data = {
      visit_id: 'v',
      index: 0,
      dart: { segment: { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }, score: 1 },
      source_seq: 1,
    } as const
    const events: BoardEvent[] = [
      { kind: 'dart.detected', data },
      { kind: 'dart.detected', data: { ...data, index: 1 } },
    ]
    const result = refoldVisit(countModule, { count: 0 }, events)
    expect(result.count).toBe(2)
  })

  it('skips unknown event kinds', () => {
    const events: BoardEvent[] = [{ kind: 'board.status', data: {} }]
    const result = refoldVisit(countModule, { count: 3 }, events)
    expect(result.count).toBe(3)
  })

  it("a game that keeps time hears each dart's own time before the dart", () => {
    type Timed = { at: number[]; now: number | null }
    const timed: GameModule<Timed> = {
      ...(countModule as unknown as GameModule<Timed>),
      init: () => ({ at: [], now: null }),
      onClock: (s, now) => ({ ...s, now }),
      onBoardEvent: (s, e) => (e.kind === 'dart.detected' && s.now !== null ? { state: { ...s, at: [...s.at, s.now] } } : { state: s }),
    }
    const dart = {
      visit_id: 'v',
      index: 0,
      dart: { segment: { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }, score: 1 },
      source_seq: 1,
    } as const
    const events: BoardEvent[] = [
      { kind: 'visit.opened', data: { visit_id: 'v' } },
      { kind: 'dart.detected', data: dart },
      { kind: 'dart.detected', data: { ...dart, index: 1 } },
    ]
    expect(refoldVisit(timed, { at: [], now: null }, events, [1000, 2500]).at).toEqual([1000, 2500])
  })
})
