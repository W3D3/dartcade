import { describe, it, expect } from 'vitest'
import { render } from 'svelte/server'
import StatsTable from '../components/details/StatsTable.svelte'
import Standings from '../components/details/Standings.svelte'
import ResultCard from '../components/details/ResultCard.svelte'
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
})
