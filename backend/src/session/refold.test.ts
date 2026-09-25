import { describe, it, expect } from 'vitest'
import { refoldVisit } from './refold.js'
import type { GameModule, BoardEvent } from './types.js'

type CountState = { count: number }
const countModule: GameModule<CountState, Record<string, never>> = {
  id: 'count',
  defaultConfig: {},
  init: () => ({ count: 0 }),
  onBoardEvent: (s, e) =>
    e.kind === 'dart.detected' ? { state: { count: s.count + 1 } } : { state: s },
  onUserAction: (s) => ({ state: s }),
  view: (s) => s as unknown as Record<string, unknown>,
}

describe('refoldVisit', () => {
  it('returns committedState when events is empty', () => {
    const result = refoldVisit(countModule, { count: 5 }, [])
    expect(result).toEqual({ count: 5 })
  })

  it('folds events in order', () => {
    const events: BoardEvent[] = [
      { kind: 'dart.detected', data: {} as any },
      { kind: 'dart.detected', data: {} as any },
    ]
    const result = refoldVisit(countModule, { count: 0 }, events)
    expect(result.count).toBe(2)
  })

  it('skips unknown event kinds', () => {
    const events: BoardEvent[] = [{ kind: 'board.status', data: {} as any }]
    const result = refoldVisit(countModule, { count: 3 }, events)
    expect(result.count).toBe(3)
  })
})
