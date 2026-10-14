import { describe, it, expect, vi } from 'vitest'
import { render } from 'svelte/server'
import type { MinigolfGame } from '$lib/api'
import { defaultSettings } from '$lib/gameSettings'
import MinigolfMatch from '$lib/components/minigolf/MinigolfMatch.svelte'
import {
  PLAYBACK,
  SLOW_MO,
  aimLines,
  endsHole,
  fmtToPar,
  otherBalls,
  ownBall,
  rollCup,
  rollFor,
  rollRate,
  rows,
  trySlots,
} from '$lib/minigolf/match'

const webgl = vi.hoisted(() => ({ ok: true }))
vi.mock('$lib/webgl', () => ({ webglAvailable: () => webgl.ok }))

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
    paused: false,
    config: { course: 'test', tries: 3, maxStrokes: 6, ballContact: false, aimAssist: true, shotPreview: true, physics: '3d' },
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
    const [anna, cleo] = otherBalls(game(), players)
    expect(anna).toEqual({ seat: 0, at: [100, 1000], label: 'A' })
    // Cleo's ball is in the cup: drawn there, below the rim (the felt is flat at 0 here)
    expect(cleo).toMatchObject({ seat: 2, label: 'C', at: [250, 300, expect.any(Number)] })
    expect(cleo.at[2]).toBeLessThan(0)
  })

  it('rolls nothing while the darts are still on the board, shown or hidden', () => {
    expect(rollFor(game())).toBeNull()
    // The third dart shows the tries, but the stroke rolls only once it's kept (Shoot or pulling the darts)
    expect(rollFor(game({ tries: [tryOf('S1'), tryOf('S5'), tryOf('S20')] }))).toBeNull()
  })

  it('keeps the heights of a 3D roll', () => {
    const r = rollFor(
      game({
        currentPlayer: 0,
        lastStroke: {
          hole: 1,
          seat: 1,
          stroke: 1,
          path: [
            [250, 2750, 21],
            [250, 300, -80],
          ],
          others: [
            {
              seat: 0,
              holed: true,
              path: [
                [100, 1000, 21],
                [250, 300, -90],
              ],
            },
          ],
          hits: [],
          holed: true,
        },
      }),
    )
    expect(r?.own[1][2]).toBe(-80)
    expect(r?.others[0].path[1][2]).toBe(-90)
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
    expect(rollFor(game({ currentPlayer: 0, lastStroke }))).toMatchObject({ seat: 1 })
    // A stroke that ended the last hole shows on the scorecard instead
    expect(rollFor(game({ lastStroke: { ...lastStroke, hole: 0 } }))).toBeNull()
  })

  it('draws aim lines from the putter’s ball while the tries are on the board, the latest bright', () => {
    const aim = { dir: [0, -1], roll: 500 }
    const tries = [tryOf('S20', { path: [], aim }), tryOf('S1', { path: [], aim })]
    const lines = aimLines(game({ shotHidden: true, tries }), [250, 2750])
    expect(lines.map(l => l.current)).toEqual([false, true])
    expect(lines[1]).toEqual({ from: [250, 2750], dir: [0, -1], roll: 500, current: true })
    // Still there once the last dart shows the tries, until Shoot keeps the stroke
    expect(aimLines(game({ shotHidden: false, tries }), [250, 2750])).toHaveLength(2)
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
    const r = rollFor(game({ holeIdx: 1, lastHole, lastStroke }))
    expect(r).toMatchObject({ hole: 0, seat: 2 })
    // It slows down near that hole's cup, not the next one's
    expect(rollCup(game({ holeIdx: 1, lastHole, lastStroke, hole: { ...hole, cup: { at: [999, 999], r: 80 } } }), r!)).toEqual(hole.cup.at)
    // It ended its hole: the camera circles that cup before the scorecard
    expect(endsHole(game({ holeIdx: 1, lastHole, lastStroke }), r!)).toBe(true)
    expect(endsHole(game({ holeIdx: 0, lastStroke: { ...lastStroke, hole: 0 } }), { ...r!, hole: 0 })).toBe(false)
    expect(endsHole(game({ holeIdx: 0, finished: true }), { ...r!, hole: 0 })).toBe(true)
    // Two holes back: nothing to roll
    expect(rollFor(game({ holeIdx: 2, lastHole, lastStroke }))).toBeNull()
    expect(rows(game(), players, 0).find(r => r.active)?.name).toBe('Anna')
  })
})

describe('minigolf match screen', () => {
  const show = (g: MinigolfGame, host = true) =>
    render(MinigolfMatch, {
      props: {
        game: g,
        players,
        darts: [],
        canThrow: true,
        locked: false,
        canUndo: false,
        next: { prominent: false, enabled: true },
        onUndo: () => {},
        onNext: () => {},
        onBoardClick: () => {},
        settings: defaultSettings,
        host,
        onNextHole: () => {},
      },
    }).body
  // Hole3D loads lazily, so the server render has only the section's choice; HoleView is hole-view
  const is3d = (body: string) => body.includes('data-view="3d"') && !body.includes('data-testid="hole-view"')
  const is2d = (body: string) => body.includes('data-view="2d"') && body.includes('data-testid="hole-view"')

  it('plays a 3D game in 3D where WebGL works', () => {
    webgl.ok = true
    const body = show(game())
    expect([is3d(body), is2d(body)]).toEqual([true, false])
  })

  it('shows the flat view for a 2D game', () => {
    webgl.ok = true
    const g = game()
    const body = show(game({ config: { ...g.config, physics: '2d' } }))
    expect([is3d(body), is2d(body)]).toEqual([false, true])
  })

  it('falls back to the flat view, with a note, without WebGL', () => {
    webgl.ok = false
    const body = show(game())
    expect([is3d(body), is2d(body)]).toEqual([false, true])
    expect(body).toContain("3D isn't available on this device; showing the flat view")
  })

  it('offers Shoot with darts in, and skipping the stroke (a miss, one stroke more) without', () => {
    webgl.ok = true
    expect(show(game())).toContain('Skip stroke')
    expect(show(game())).not.toContain('Next player')
  })

  it('waits between holes: the host starts the next hole, everyone else waits for them', () => {
    webgl.ok = true
    const lastHole = { index: 0, scores: [3, 2, 2], paths: [[], [], []], hole }
    const paused = game({ holeIdx: 1, paused: true, lastHole })
    expect(show(paused, true)).toContain('Next hole')
    expect(show(paused, false)).toContain('Waiting for the host to start the next hole')
    expect(show(paused, false)).not.toContain('>Next hole<')
    expect(show(game({ holeIdx: 1, lastHole }))).not.toContain('Next hole')
  })
})
