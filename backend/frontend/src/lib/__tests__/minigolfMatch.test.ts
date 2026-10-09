import { describe, it, expect } from 'vitest'
import type { MinigolfGame } from '$lib/api'
import { fmtToPar, latestShot, otherBalls, ownBall, rows, trySlots } from '$lib/minigolf/match'

const hole = {
  id: 'h',
  name: 'Straight',
  par: 2,
  outline: [
    [0, 0],
    [500, 0],
    [500, 3000],
    [0, 3000],
  ],
  walls: [],
  bumpers: [],
  slopes: [],
  tee: [250, 2750],
  cup: { at: [250, 300], r: 54 },
}
const players = [{ name: 'Anna' }, { name: 'Ben' }, { name: 'Cleo' }]

function game(over: Partial<MinigolfGame> = {}): MinigolfGame {
  return {
    winner: null,
    finished: false,
    currentPlayer: 1,
    visitLocked: false,
    config: { course: 'test', tries: 3, maxStrokes: 6, ballContact: false, shotDelay: 3 },
    courseName: 'Test',
    holeIdx: 1,
    holeCount: 3,
    hole,
    pars: [2, 3, 3],
    holeNames: ['Straight', 'Dogleg', 'Summit'],
    order: [1, 0, 2],
    balls: [
      { at: [100, 1000], strokes: 1, status: 'playing' },
      { at: [250, 2750], strokes: 0, status: 'waiting' },
      { at: [250, 300], strokes: 2, status: 'holed' },
    ],
    scores: [
      [3, 2, 2],
      [null, null, null],
      [null, null, null],
    ],
    totals: [3, 2, 2],
    toPar: [1, 0, 0],
    tries: [],
    lastHole: null,
    currentVisitDarts: [],
    totalDarts: [0, 0, 0],
    totalVisits: [0, 0, 0],
    ...over,
  }
}

const tryOf = (label: string, o: Partial<MinigolfGame['tries'][number]> = {}): MinigolfGame['tries'][number] => ({
  label,
  coords: { x: 0, y: 0.5 },
  power: 0.52,
  holed: false,
  missed: false,
  path: [
    [250, 2750],
    [250, 2000],
  ],
  others: [],
  ...o,
})

describe('minigolf match', () => {
  it('formats the score to par', () => {
    expect([fmtToPar(2), fmtToPar(-1), fmtToPar(0)]).toEqual(['+2', '−1', 'E'])
  })

  it('lists players in turn order with their status', () => {
    expect(rows(game(), players).map(r => [r.name, r.status, r.toPar, r.active])).toEqual([
      ['Ben', 'Putting', 'E', true],
      ['Anna', 'On the green', '+1', false],
      ['Cleo', 'In the cup', 'E', false],
    ])
  })

  it('shows the tries: replaced, kept and the ones left', () => {
    const g = game({ tries: [tryOf('S20', { missed: false }), tryOf('Miss', { missed: true, power: null, path: [] })] })
    expect(trySlots(g)).toEqual([
      { label: 'S20', note: '52%', state: 'replaced' },
      { label: 'Miss', note: 'Missed the board', state: 'kept' },
      { label: '', note: 'Retry optional', state: 'empty' },
    ])
    expect(trySlots(game({ config: { ...g.config, tries: 1 } }))).toEqual([{ label: '', note: 'Throw', state: 'empty' }])
  })

  it('draws the putter on the tee and the other played balls', () => {
    expect(ownBall(game())).toEqual([250, 2750])
    expect(otherBalls(game(), players)).toEqual([{ seat: 0, at: [100, 1000], label: 'A' }])
  })

  it('animates the latest try, with a new key for a new try or a correction', () => {
    expect(latestShot(game())).toBeNull()
    const a = latestShot(game({ tries: [tryOf('S20')] }))
    const b = latestShot(game({ tries: [tryOf('S20', { coords: { x: 0.1, y: 0.5 } })] }))
    expect(a?.own).toEqual([
      [250, 2750],
      [250, 2000],
    ])
    expect(a?.key).not.toBe(b?.key)
  })
})
