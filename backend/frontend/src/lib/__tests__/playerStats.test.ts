import { describe, it, expect } from 'vitest'
import { x01Player, atcPlayer, x01Roll } from '../playerStats.js'
import type { AtcGame, X01Game } from '../api/game-ws'

const visit = (seat: number, scored: number, left: number, darts = 3) => ({ seat, scored, left, darts, bust: false })
// Alice has thrown 100 and 60 this leg and is on 81 with a T20 in her running visit
const game = (o: Record<string, unknown> = {}): X01Game =>
  ({
    scores: [81, 87],
    opened: [true, true],
    legs: [1, 0],
    firstTo: 3,
    totalDarts: [16, 18],
    config: { outMode: 'double' },
    currentVisitDarts: [{ segment: { name: 'T20' }, score: 60 }],
    pointsScored: [160, 45],
    dartsThrown: [6, 3],
    legVisits: [visit(0, 100, 401), visit(0, 60, 341)],
    lastVisit: [visit(0, 60, 341), null],
    checkoutAttempts: [0, 0],
    checkoutHits: [0, 0],
    visitStartScores: [141, 87],
    ...o,
  }) as unknown as X01Game
const none = { pointsScored: [0, 0], dartsThrown: [0, 0], legVisits: [], lastVisit: [null, null] }

describe('x01Player', () => {
  it('the thrower: running visit on the chalkboard, finish with the darts left', () => {
    const p = x01Player(game(), 0, { active: true, suggest: true })
    expect(p).toMatchObject({
      remaining: 81,
      canFinish: 'T19 · D12',
      avg: '80.0',
      legAvg: '80.0',
      last: '60',
      darts: 16,
      legsWon: 1,
      firstTo: 3,
      visits: [visit(0, 100, 401), visit(0, 60, 341)],
      current: { scored: 60, left: 81, bust: false },
    })
  })

  it('a cold snapshot (after a reload) has the whole match: averages, last visit and chalkboard', () => {
    // Two legs in: the match average spans both, the leg average and chalkboard only this leg
    const g = game({
      pointsScored: [601, 0],
      dartsThrown: [18, 0],
      legVisits: [visit(0, 100, 401)],
      lastVisit: [visit(0, 100, 401), null],
      currentVisitDarts: [],
    })
    const p = x01Player(g, 0, { active: false, suggest: true })
    expect(p).toMatchObject({ avg: '100.2', legAvg: '100.0', last: '100', visits: [visit(0, 100, 401)] })
  })

  it("only the seat's own visits are on its chalkboard", () => {
    const g = game({ legVisits: [visit(0, 100, 401), visit(1, 45, 456), visit(0, 60, 341)] })
    expect(x01Player(g, 1, { active: false, suggest: true }).visits).toEqual([visit(1, 45, 456)])
  })

  it("'visit': the thrower's big score holds at the visit's start from the snapshot; the rest stays per dart", () => {
    const p = x01Player(game(), 0, { active: true, suggest: true, scoreUpdates: 'visit' })
    expect(p).toMatchObject({ remaining: 81, shown: 141, canFinish: 'T19 · D12', current: { scored: 60, left: 81 } })
    expect(x01Player(game(), 0, { active: true, suggest: true }).shown).toBe(81)
    expect(x01Player(game({ visitLocked: true, scores: [0, 87] }), 0, { active: true, suggest: true, scoreUpdates: 'visit' }).shown).toBe(0)
  })

  it('checkout rate: hits over darts at a finish, a dash before the first', () => {
    expect(x01Player(game(), 0, { active: false, suggest: true })).toMatchObject({ checkout: '—', checkoutDarts: '0/0' })
    const g = game({ checkoutAttempts: [5, 0], checkoutHits: [2, 0] })
    expect(x01Player(g, 0, { active: false, suggest: true })).toMatchObject({ checkout: '40%', checkoutDarts: '2/5' })
  })

  it('x01Roll: how the big score rolls (new leg, bust, checkout), for players and teams alike', () => {
    expect(x01Roll({ leg: 3, shown: 81, current: null })).toEqual({ value: 81, reset: 3, bust: false, checkout: false })
    expect(x01Roll({ leg: 3, shown: 32, current: { bust: true } })).toEqual({ value: 32, reset: 3, bust: true, checkout: false })
    expect(x01Roll({ leg: 3, shown: 0, current: { bust: false } })).toEqual({ value: 0, reset: 3, bust: false, checkout: true })
  })

  it('counts the legs played: the score starts over when that changes', () => {
    expect(x01Player(game({ legs: [1, 2] }), 1, { active: false, suggest: true }).leg).toBe(3)
  })

  it('a waiting player has no running visit and three darts to finish', () => {
    const p = x01Player(game({ legVisits: [visit(1, 45, 87)] }), 1, { active: false, suggest: true })
    expect(p.current).toBeNull()
    // First two-dart finish the finder meets (it prefers trebles high to low), not the design's sample T17 · D18
    expect(p.canFinish).toBe('T17 · D18')
  })

  it('averages and last show a dash before any visit', () => {
    const p = x01Player(game(none), 1, { active: false, suggest: true })
    expect([p.avg, p.legAvg, p.last]).toEqual(['—', '—', '—'])
  })

  it('no finish is null (too high, not opened, or suggestions off)', () => {
    expect(x01Player(game({ scores: [301, 87] }), 0, { active: true, suggest: true }).canFinish).toBeNull()
    expect(x01Player(game({ opened: [false, true] }), 0, { active: true, suggest: true }).canFinish).toBeNull()
    expect(x01Player(game(), 1, { active: false, suggest: false }).canFinish).toBeNull()
  })

  it('leg average uses this leg only', () => {
    const p = x01Player(game({ pointsScored: [130, 0], dartsThrown: [6, 0], legVisits: [visit(0, 30, 471)] }), 0, {
      active: false,
      suggest: true,
    })
    expect([p.avg, p.legAvg]).toEqual(['65.0', '30.0'])
  })

  it('during a bust: no finish, running row marked bust', () => {
    const p = x01Player(game(), 0, { active: true, suggest: true, bust: true })
    expect(p.canFinish).toBeNull()
    expect(p.current).toEqual({ scored: 60, left: 81, bust: true })
  })

  it('showFinish follows the suggestions setting', () => {
    expect(x01Player(game(), 1, { active: false, suggest: false }).showFinish).toBe(false)
    expect(x01Player(game(), 1, { active: false, suggest: true }).showFinish).toBe(true)
  })
})

describe('atcPlayer', () => {
  it('shows target, progress and hit rate', () => {
    const seq = [...Array.from({ length: 20 }, (_, i) => i + 1), 22]
    const p = atcPlayer({ sequence: seq, targets: [14], hitCounts: [13], totalDarts: [35] } as unknown as AtcGame, 0)
    expect(p).toMatchObject({ target: '14', done: 13, total: 21, darts: 35, hitRate: '37%' })
    expect(p.cells).toHaveLength(21)
  })

  it('hit rate is 0% before the first dart', () => {
    expect(atcPlayer({ sequence: [1, 2], targets: [1], hitCounts: [0], totalDarts: [0] } as unknown as AtcGame, 0).hitRate).toBe('0%')
  })
})
