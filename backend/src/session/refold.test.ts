import { describe, it, expect } from 'vitest'
import { refoldVisit } from './refold.js'
import type { GameModule, BoardEvent } from './types.js'

type CountState = { count: number }
const countModule: GameModule<CountState> = {
  id: 'count',
  defaultConfig: {},
  init: () => ({ count: 0 }),
  onBoardEvent: (s, e) =>
    e.kind === 'dart.detected' ? { state: { count: s.count + 1 } } : { state: s },
  onUserAction: (s) => ({ state: s }),
  view: (s) => s,
  getCurrentPlayer: () => 0,
}

describe('refoldVisit', () => {
  it('returns committedState when events is empty', () => {
    const result = refoldVisit(countModule, { count: 5 }, [])
    expect(result).toEqual({ count: 5 })
  })

  it('folds events in order', () => {
    const data = { visit_id: 'v', index: 0, dart: { segment: { name: 'S1', number: 1, bed: 'Single', multiplier: 1 }, score: 1 }, source_seq: 1 } as const
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
})
