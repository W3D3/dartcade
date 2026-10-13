import { describe, it, expect } from 'vitest'
import type { MinigolfGame } from '$lib/api'
import {
  PLAYBACK,
  SLOW_MO,
  aimLines,
  fmtToPar,
  nextRoll,
  otherBalls,
  ownBall,
  rollFor,
  rollRate,
  rows,
  trySlots,
} from '$lib/minigolf/match'

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
    config: { course: 'test', tries: 3, maxStrokes: 6, ballContact: false, aimAssist: true, shotPreview: true },
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
    shotHidden: false,
    reach: { treble: 1700, double: 4500 },
    lastHole: null,
    lastStroke: null,
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
  aim: null,
  hits: [],
  ...o,
})

describe('minigolf match', () => {
  it('formats the score to par', () => {
    expect([fmtToPar(2), fmtToPar(-1), fmtToPar(0)]).toEqual(['+2', '−1', '±0'])
  })

  it('lists players in turn order with their status', () => {
    expect(rows(game(), players).map(r => [r.name, r.status, r.toPar, r.active])).toEqual([
      ['Ben', 'Putting', '±0', true],
      ['Anna', 'On the green', '+1', false],
      ['Cleo', 'In the cup', '±0', false],
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

  it('rolls the latest shown try after the delay, with a new key for a new try or a correction', () => {
    expect(rollFor(game())).toBeNull()
    const a = rollFor(game({ tries: [tryOf('S20')] }))
    const b = rollFor(game({ tries: [tryOf('S20', { coords: { x: 0.1, y: 0.5 } })] }))
    expect(a).toMatchObject({
      seat: 1,
      kept: false,
      own: [
        [250, 2750],
        [250, 2000],
      ],
    })
    expect(a?.key).not.toBe(b?.key)
  })

  it('rolls nothing for a hidden try, then the kept stroke once the darts are pulled', () => {
    expect(rollFor(game({ shotHidden: true, tries: [tryOf('S20', { path: [], holed: false })] }))).toBeNull()
    const lastStroke: NonNullable<MinigolfGame['lastStroke']> = {
      hole: 1,
      seat: 1,
      stroke: 1,
      path: [
        [250, 2750],
        [250, 1500],
      ],
      others: [],
      hits: [],
      holed: false,
    }
    expect(rollFor(game({ currentPlayer: 0, lastStroke }))).toMatchObject({ seat: 1, kept: true })
    // A stroke that ended the last hole shows on the scorecard instead
    expect(rollFor(game({ lastStroke: { ...lastStroke, hole: 0 } }))).toBeNull()
  })

  it('draws aim lines from the putter’s ball only while results are hidden, the latest bright', () => {
    const aim = { dir: [0, -1], roll: 500 }
    const tries = [tryOf('S20', { path: [], aim }), tryOf('S1', { path: [], aim })]
    const lines = aimLines(game({ shotHidden: true, tries }), [250, 2750])
    expect(lines.map(l => l.current)).toEqual([false, true])
    expect(lines[1]).toEqual({ from: [250, 2750], dir: [0, -1], roll: 500, current: true })
    expect(aimLines(game({ shotHidden: false, tries }), [250, 2750])).toEqual([])
  })

  it('slows a roll down near the cup', () => {
    expect(rollRate([250, 400], [250, 300])).toBe(SLOW_MO)
    expect(rollRate([250, 1000], [250, 300])).toBe(PLAYBACK)
    // In between it eases, no jump
    const mid = rollRate([250, 525], [250, 300])
    expect(mid).toBeLessThan(PLAYBACK)
    expect(mid).toBeGreaterThan(SLOW_MO)
  })

  it('rolls the stroke that ended a hole on that hole, and keeps its player up meanwhile', () => {
    const lastStroke: NonNullable<MinigolfGame['lastStroke']> = {
      hole: 0,
      seat: 2,
      stroke: 2,
      path: [
        [250, 2750],
        [250, 300],
      ],
      others: [],
      hits: [],
      holed: false,
    }
    const lastHole = { index: 0, scores: [3, 2, 2], paths: [[], [], []], hole }
    expect(rollFor(game({ holeIdx: 1, lastHole, lastStroke }))).toMatchObject({ hole: 0, seat: 2, kept: true })
    // Two holes back: nothing to roll
    expect(rollFor(game({ holeIdx: 2, lastHole, lastStroke }))).toBeNull()
    expect(rows(game(), players, 0).find(r => r.active)?.name).toBe('Anna')
  })

  it('names the stroke a try belongs to the same as the stroke it becomes', () => {
    // Ben (seat 1) has no strokes on hole 2 yet: his try is stroke 1, kept as hole 1, seat 1, stroke 1
    const t = rollFor(game({ tries: [tryOf('S20')] }))
    const k = rollFor(
      game({
        currentPlayer: 0,
        lastStroke: {
          hole: 1,
          seat: 1,
          stroke: 1,
          path: [
            [250, 2750],
            [250, 2000],
          ],
          others: [],
          hits: [],
          holed: false,
        },
      }),
    )
    expect(t?.stroke).toBe('1:1:1')
    expect(k?.stroke).toBe(t?.stroke)
  })

  it('rolls a stroke once: not again when kept after its last try rolled, but after an undo it does', () => {
    const tryRoll = rollFor(game({ tries: [tryOf('S1'), tryOf('S5'), tryOf('S20')] }))!
    const kept = rollFor(
      game({
        currentPlayer: 0,
        lastStroke: {
          hole: 1,
          seat: 1,
          stroke: 1,
          path: [
            [250, 2750],
            [250, 2000],
          ],
          others: [],
          hits: [],
          holed: false,
        },
      }),
    )!
    // The third try is revealed and rolls
    let step = nextRoll(tryRoll, null, '')
    expect(step.animate).toBe(true)
    // Shoot: the kept stroke is that try, already rolled
    expect(nextRoll(kept, null, step.rolledStroke).animate).toBe(false)
    // Undo instead (the tries hide again: no roll), then Shoot: the kept stroke rolls
    step = nextRoll(null, null, step.rolledStroke)
    expect(nextRoll(kept, null, step.rolledStroke).animate).toBe(true)
  })

  it('does not roll what was already there when the page opened', () => {
    const tryRoll = rollFor(game({ tries: [tryOf('S20')] }))!
    expect(nextRoll(tryRoll, tryRoll.key, '').animate).toBe(false)
  })
})
