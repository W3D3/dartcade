import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import StatsTable from '../components/details/StatsTable.svelte'
import Standings from '../components/details/Standings.svelte'
import ResultCard from '../components/details/ResultCard.svelte'
import TeamShares from '../components/details/TeamShares.svelte'
import X01Legs from '../components/details/X01Legs.svelte'
import AtcTargets from '../components/details/AtcTargets.svelte'
import RaceChart from '../components/details/RaceChart.svelte'
import type { GameDetail, StatRow } from '../api'
import { detailSides } from '../details/page.js'

const rows: StatRow[] = [
  { key: 'average', label: '3-dart average', format: 'decimal', better: 'higher', compact: false },
  { key: 'bestLegDarts', label: 'Best leg', format: 'darts', better: 'lower', compact: true },
]
const seat = (s: number, name: string, placement: number) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: null,
  placement,
  stats: {},
  forfeited: false,
})
const game = (n: number): GameDetail => ({
  game: {
    id: 'g',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: null,
    mySeat: 0,
    players: Array.from({ length: n }, (_, i) => seat(i, `P${i}`, i + 1)),
  },
  detail: { mode: 'x01', legs: [] },
  stats: {
    rows,
    seats: Array.from({ length: n }, (_, i): { index: number; values: Record<string, number> } => ({
      index: i,
      values: i === 1 ? { average: 71.6 } : { average: 83.9, bestLegDarts: 15 },
    })),
  },
})

describe('details components', () => {
  it('duel stats: labels, values, a dash for what does not apply, lime on the better side', () => {
    const d = game(2)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('3-dart average')
    expect(out).toContain('83.9')
    expect(out).toContain('71.6')
    expect(out).toContain('—')
    expect(out).toMatch(/text-accent[^>]*>83\.9/)
  })

  it('solo: one side, no highlight', () => {
    const d = game(1)
    const out = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('83.9')
    expect(out).not.toMatch(/text-accent[^>]*>83\.9/)
    expect(render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body).not.toContain('Winner')
  })

  it('shows who gave up instead of a Winner tag', () => {
    const d = game(2)
    d.game.players[0].forfeited = true
    const out = render(ResultCard, { props: { detail: d, sides: detailSides(d) } }).body
    expect(out).toContain('Gave up')
  })

  it('hides non-compact rows on phones', () => {
    const out = render(StatsTable, { props: { rows, sides: detailSides(game(2)) } }).body
    expect(out).toMatch(/max-md:hidden[^>]*>[^<]*<span[^>]*>83\.9/)
  })

  it('party standings: places and only the compact rows', () => {
    const d = game(3)
    const out = render(Standings, { props: { rows, sides: detailSides(d) } }).body
    expect(out).toContain('1st')
    expect(out).toContain('3rd')
    expect(out).toContain('Best leg')
    expect(out).not.toContain('3-dart average')
  })

  it('teams: stats, each player share and the chalkboard name the thrower', () => {
    const d = game(4)
    d.detail = {
      mode: 'x01',
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: null,
          visits: [
            { visit: 0, seat: 0, committedAt: '', darts: [], scored: 60, remaining: 441, bust: false },
            { visit: 1, seat: 1, committedAt: '', darts: [], scored: 45, remaining: 456, bust: false },
          ],
        },
      ],
    }
    d.stats.teams = [
      { index: 0, values: { average: 78.2 } },
      { index: 1, values: { average: 65.4 } },
    ]
    d.stats.seats = [
      { index: 0, values: { average: 80.1, legsClosed: 2 } },
      { index: 1, values: { average: 60.3, legsClosed: 1 } },
      { index: 2, values: { average: 76.3, legsClosed: 1 } },
      { index: 3, values: { average: 70.5, legsClosed: 0 } },
    ]

    const statsOut = render(StatsTable, { props: { rows, sides: detailSides(d) } }).body
    expect(statsOut).toContain('Team A')
    expect(statsOut).toContain('Team B')
    expect(statsOut).toContain('78.2')

    const sharesOut = render(TeamShares, { props: { detail: d } }).body
    expect(sharesOut).toContain("Each player's share")
    expect(sharesOut).toContain('P0')
    expect(sharesOut).toContain('2')

    const legsOut = render(X01Legs, { props: { detail: d, party: false } }).body
    expect(legsOut).toContain('P0')
    expect(legsOut).toContain('P1')
  })
})

describe('X01 leg by leg', () => {
  it('shows the last leg: summary, chart and chalkboard', () => {
    const seg = (name: string, number: number, multiplier: 1 | 2 | 3) => ({ name, number, multiplier, bed: 'Single' as const })
    const dart = (s: ReturnType<typeof seg>, index: number) => ({
      index,
      segment: s,
      coords: null,
      source: 'manual' as const,
      corrected: false,
      thrownAt: '',
    })
    const d = game(2)
    d.detail = {
      mode: 'x01',
      legs: [
        {
          leg: 0,
          starter: 0,
          winner: 0,
          visits: [
            {
              visit: 0,
              seat: 0,
              committedAt: '',
              darts: [dart(seg('T20', 20, 3), 0), dart(seg('T20', 20, 3), 1), dart(seg('T20', 20, 3), 2)],
              scored: 180,
              remaining: 321,
              bust: false,
            },
            { visit: 1, seat: 1, committedAt: '', darts: [dart(seg('S20', 20, 1), 0)], scored: 20, remaining: 481, bust: false },
            {
              visit: 2,
              seat: 0,
              committedAt: '',
              darts: [dart(seg('D20', 20, 2), 0)],
              scored: 40,
              remaining: 0,
              bust: false,
            },
          ],
        },
      ],
    }
    const out = render(X01Legs, { props: { detail: d, party: false } }).body
    expect(out).toContain('Leg by leg')
    expect(out).toContain('Leg 1')
    expect(out).toContain('P0 threw first')
    expect(out).toContain('<svg')
    expect(out).toContain('T20')
    // seat 0's first visit (321 left) is crossed out once passed, not the checkout visit
    expect(out).toContain('321')
    expect(out).toContain('Out')
  })
})

describe('Around the Clock sections', () => {
  const atc = (): GameDetail => {
    const d = game(2)
    d.game.mode = 'atc'
    d.game.config = { order: 'asc', finishOn: 'twenty', multiplierAdvances: false }
    d.detail = {
      mode: 'atc',
      sequence: [1, 2, 3],
      visits: [],
      progress: [
        {
          seat: 0,
          steps: [
            { target: 1, darts: 2, hit: true },
            { target: 2, darts: 3, hit: false },
          ],
        },
        { seat: 1, steps: [{ target: 1, darts: 5, hit: false }] },
      ],
    }
    d.stats = {
      rows: [],
      seats: [
        { index: 0, values: { hardestTarget: 1 } },
        { index: 1, values: {} },
      ],
    }
    return d
  }

  it('grids targets per player with the hardest-target line', () => {
    const out = render(AtcTargets, { props: { detail: atc() } }).body
    expect(out).toContain('Target by target')
    expect(out).toContain('1 cost P0 the most.')
    expect(out).toContain('P1')
  })

  it('draws the race', () => {
    const out = render(RaceChart, { props: { detail: atc(), highlight: 0 } }).body
    expect(out).toContain('Race to the Bull')
    expect(out).toContain('<path')
  })
})
