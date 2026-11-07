import { describe, expect, it } from 'vitest'
import type { HistoryGame, HistorySeat } from '../db/history.js'
import type { X01Detail } from '../session/types.js'
import { x01Legs, type StatLeg } from './x01Legs.js'
import { pickWindow, x01StatsFor } from './x01Stats.js'

type Leg = X01Detail['legs'][number]
type Dart = Leg['visits'][number]['darts'][number]

const BED = { 0: 'Outside', 1: 'Single', 2: 'Double', 3: 'Triple' } as const
function dart(label: string): Dart {
  const m = /^([SDT])(\d+)$/.exec(label)
  const multiplier = m ? ({ S: 1, D: 2, T: 3 } as const)[m[1] as 'S' | 'D' | 'T'] : 0
  const number = m ? Number(m[2]) : 0
  return {
    index: 0,
    segment: { name: label, number, multiplier, bed: BED[multiplier] },
    coords: null,
    source: 'manual',
    corrected: false,
    thrownAt: '',
  }
}

/** A double-out leg from `start`: each visit's darts, the seats taking turns from seat 0. */
function leg(start: number, visits: string[][], seats = 2): Leg {
  const left = Array<number>(seats).fill(start)
  let winner: number | null = null
  const out = visits.map((labels, i) => {
    const seat = i % seats
    const from = left[seat]
    let now = from
    let bust = false
    for (const l of labels) {
      const { number, multiplier } = dart(l).segment
      const next = now - number * multiplier
      if (next < 0 || next === 1 || (next === 0 && multiplier !== 2)) {
        bust = true
        break
      }
      now = next
    }
    if (!bust) left[seat] = now
    if (now === 0 && !bust) winner = seat
    return { visit: i, seat, committedAt: '', darts: labels.map(dart), scored: bust ? 0 : from - now, remaining: left[seat], bust }
  })
  return { leg: 0, starter: 0, winner, visits: out }
}

const seat = (n: number, name: string, extra: Partial<HistorySeat> = {}): HistorySeat => ({
  seat: n,
  name,
  user_id: null,
  avatar: { kind: 'none' },
  bot_level: null,
  placement: n + 1,
  throw_position: n,
  stats: {},
  forfeited: false,
  ...extra,
})

const game = (id: string, finished: string, config: Record<string, unknown>, seats: HistorySeat[]): HistoryGame => ({
  id,
  game_id: 'x01',
  config,
  rng_seed: 1,
  game_version: 1,
  created_at: new Date(finished),
  finished_at: new Date(finished),
  board: null,
  mySeat: 0,
  invalidated: false,
  seats,
})

const DUO = [seat(0, 'Me'), seat(1, 'Lena')]
const DAY = '2026-11-01T20:00:00Z'
// 101, me against Lena. WON: 60 (41 left), then S1 D20 out; 3 darts.
const WON = [['T20'], ['S20'], ['S1', 'D20']]
// LOST: 60, then S1 D10 S5 (15 left, two darts at a finish missed); Lena checks out first.
const LOST = [['T20'], ['T20'], ['S1', 'D10', 'S5'], ['S1', 'D20']]

describe('x01Legs', () => {
  it('gives each dart the score left and the one-dart finish it was thrown at', () => {
    const [l] = x01Legs(game('g', DAY, { startScore: 101 }, DUO), { mode: 'x01', legs: [leg(101, WON)] }, 0, false)
    expect(l.won).toBe(true)
    expect(l.visits.map(v => v.start)).toEqual([101, 41])
    expect(l.visits[1]).toMatchObject({
      checkout: true,
      darts: [
        { name: 'S1', left: 41, target: null },
        { name: 'D20', left: 40, target: 'D20' },
      ],
    })
    expect(l.game).toMatchObject({ kind: 'casual', opponents: ['Lena'], outMode: 'double', startScore: 101 })
  })

  it('stops the targets at a bust', () => {
    const [l] = x01Legs(
      game('g', DAY, { startScore: 32 }, [seat(0, 'Me')]),
      { mode: 'x01', legs: [leg(32, [['T20', 'D16']], 1)] },
      0,
      false,
    )
    expect(l.visits[0].bust).toBe(true)
    expect(l.visits[0].darts.map(d => d.target)).toEqual(['D16', null])
    expect(l.game.kind).toBe('solo')
  })

  it('gives darts before a double in opens the leg no target', () => {
    // The helper scores S20 too: what matters is how x01Legs walks the darts it is given
    const legs = [{ ...leg(40, [['S20', 'D10', 'D5']], 1), winner: null }]
    const [l] = x01Legs(game('g', DAY, { startScore: 40, inMode: 'double' }, [seat(0, 'Me')]), { mode: 'x01', legs }, 0, false)
    // S20 doesn't open; D10 opens and leaves 20; D5 leaves 10
    expect(l.visits[0].darts.map(d => [d.left, d.target])).toEqual([
      [40, null],
      [40, 'D20'],
      [20, 'D10'],
    ])
  })

  it('counts a leg the team won as won, and tells bots and ranked games apart', () => {
    const won = leg(101, WON)
    const teams = [{ id: 'A', name: 'Team A', seats: [1, 2] }] as X01Detail['teams']
    const g = game('g', DAY, { startScore: 101 }, [...DUO, seat(2, 'Max')])
    expect(x01Legs(g, { mode: 'x01', legs: [won] }, 1, false)[0].won).toBe(false)
    expect(x01Legs(g, { mode: 'x01', legs: [{ ...won, winner: 2 }], teams }, 1, false)[0].won).toBe(true)
    const bots = [seat(0, 'Me'), seat(1, 'Bot', { bot_level: 3 })]
    expect(x01Legs(game('g', DAY, {}, bots), { mode: 'x01', legs: [won] }, 0, false)[0].game.kind).toBe('bots')
    expect(x01Legs(game('g', DAY, {}, bots), { mode: 'x01', legs: [won] }, 0, true)[0].game.kind).toBe('ranked')
  })
})

/** One leg per finished date, newest first like the API reads them. */
function legsOn(dates: string[], visits: string[][], startScore = 101): StatLeg[] {
  return dates.flatMap((d, i) =>
    x01Legs(game(`g${i}-${d}`, d, { startScore }, DUO), { mode: 'x01', legs: [leg(startScore, visits)] }, 0, false),
  )
}

const NOW = new Date('2026-11-06T00:00:00Z')

describe('pickWindow', () => {
  const legs = legsOn(['2026-11-05T20:00:00Z', '2026-11-01T20:00:00Z', '2026-10-01T20:00:00Z', '2026-09-20T20:00:00Z'], WON)
  const days = (ls: StatLeg[] | null) => ls?.map(l => l.game.finishedAt.toISOString().slice(0, 10))

  it('takes the last legs, then as many before them', () => {
    expect(pickWindow(legs, 'legs20', NOW)).toMatchObject({ current: legs, before: [] })
  })

  it('takes the last days, then as many days before them', () => {
    const { current, before } = pickWindow(legs, 'days30', NOW)
    expect(days(current)).toEqual(['2026-11-05', '2026-11-01'])
    expect(days(before)).toEqual(['2026-10-01', '2026-09-20'])
  })

  it('compares all time with nothing', () => {
    expect(pickWindow(legs, 'all', NOW).before).toBeNull()
  })
})

describe('x01StatsFor', () => {
  const both = [...legsOn(['2026-11-05T20:00:00Z'], WON), ...legsOn(['2026-10-01T20:00:00Z'], LOST)]

  it('reads averages, the checkout rate and legs won from the legs', () => {
    const s = x01StatsFor(both, { range: 'all' }, NOW)
    expect(s.totalLegs).toBe(2)
    expect(s.before).toBeNull()
    expect(s.overview.legsWon.value).toBe(0.5)
    expect(s.overview.dartsPerLeg.value).toBe(3)
    // 101 in 3 darts and 86 in 4
    expect(s.overview.average.value).toBeCloseTo((187 / 7) * 3)
    // At a finish: D20 from 40 (out); D10 from 40 and S5 from 20 (missed)
    expect(s.overview.checkout.value).toBeCloseTo(1 / 3)
    expect(s.overview.bests.bestLeg).toMatchObject({ value: 3, ref: { leg: 0, visit: null, opponents: ['Lena'] } })
    expect(s.overview.perLeg.map(l => l.won)).toEqual([false, true])
    expect(s.overview.bestStreak).toBe(1)
    expect(s.scoring.visits).toBe(4)
  })

  it('compares the range with the one before it', () => {
    const s = x01StatsFor(both, { range: 'days30' }, NOW)
    expect([s.window.legs, s.before?.legs]).toEqual([1, 1])
    expect(s.overview.legsWon).toMatchObject({ value: 1, before: 0 })
  })

  it('picks the start score played most, and lists the others', () => {
    const big = [['T20', 'T20', 'T20'], ['S1'], ['T20', 'T20', 'T20'], ['S1'], ['T20', 'T19', 'D12']]
    const legs = [...both, ...legsOn(['2026-11-03T20:00:00Z'], big, 501)]
    expect(x01StatsFor(legs, {}, NOW).applied).toEqual({ range: 'legs50', start: 101, out: 'double', kind: 'all' })
    expect(x01StatsFor(legs, {}, NOW).options.starts).toEqual([101, 501])
    const s = x01StatsFor(legs, { start: 501 }, NOW)
    expect(s.scoring.list180).toMatchObject([{ visit: 1 }, { visit: 2 }])
    expect(s.overview.bests.most180s?.value).toBe(2)
    expect(s.checkout.top).toMatchObject([{ value: 141, darts: ['T20', 'T19', 'D12'], ref: { visit: 3 } }])
    expect(s.checkout.tonPlus.value).toBe(1)
  })

  it('filters by the kind of match', () => {
    expect(x01StatsFor(both, { kind: 'bots' }, NOW).totalLegs).toBe(0)
    expect(x01StatsFor(both, { kind: 'casual' }, NOW).totalLegs).toBe(2)
  })

  it('counts each finishing double thrown at, and the ranges the visits started in', () => {
    const s = x01StatsFor(both, { range: 'all' }, NOW)
    expect(s.checkout.doubles).toEqual([
      { target: 'D20', hits: 1, attempts: 2 },
      { target: 'D10', hits: 0, attempts: 1 },
    ])
    // Both legs' second visits started on 41: one went out
    expect(s.checkout.ranges[1]).toEqual({ label: '41–60', rate: 0.5, visits: 2 })
  })

  it('is empty without legs', () => {
    const s = x01StatsFor([], {}, NOW)
    expect(s.applied.start).toBeNull()
    expect(s.overview.average).toEqual({ value: null, before: null, spark: [] })
    expect(s.checkout.top).toEqual([])
  })
})
