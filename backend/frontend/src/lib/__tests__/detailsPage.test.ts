import { describe, it, expect } from 'vitest'
import type { GameDetail } from '../api'
import { detailSides, headline, highlightDefault, isGameDetail, layoutOf, loadPhase, metaLine } from '../details/page.js'

const seat = (s: number, name: string, placement: number, stats: Record<string, number> = {}) => ({
  seat: s,
  throwPosition: s,
  name,
  userId: s === 0 ? 'me' : null,
  bot: null,
  placement,
  stats,
  forfeited: false,
})
const x01 = (players: ReturnType<typeof seat>[], extra: Partial<GameDetail> = {}): GameDetail => ({
  game: {
    id: 'g1',
    mode: 'x01',
    config: { startScore: 501, inMode: 'straight', outMode: 'double', firstTo: 3 },
    createdAt: '2026-09-26T19:00:00.000Z',
    finishedAt: '2026-09-26T19:14:00.000Z',
    board: { id: 'b', name: 'Living room' },
    mySeat: 0,
    players,
  },
  detail: { mode: 'x01', legs: [] },
  stats: {
    rows: [],
    seats: players.map(p => ({ index: p.seat, values: { legsWon: p.placement === 1 ? 3 : 1 } })),
  },
  ...extra,
})

describe('details page helpers', () => {
  it('picks the layout', () => {
    expect(layoutOf(x01([seat(0, 'A', 1)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2)]))).toBe('duel')
    expect(layoutOf(x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 3)]))).toBe('party')
    const teams = x01([seat(0, 'A', 1), seat(1, 'B', 2), seat(2, 'C', 1), seat(3, 'D', 2)])
    teams.stats.teams = [
      { index: 0, values: { legsWon: 2 } },
      { index: 1, values: { legsWon: 1 } },
    ]
    teams.detail = {
      mode: 'x01',
      legs: [],
      teams: [
        { id: 'A', name: 'Team A', seats: [0, 2] },
        { id: 'B', name: 'Team B', seats: [1, 3] },
      ],
    }
    expect(layoutOf(teams)).toBe('teams')
    expect(detailSides(teams).map(s => [s.name, s.members, s.placement])).toEqual([
      ['Team A', ['A', 'C'], 1],
      ['Team B', ['B', 'D'], 2],
    ])
  })

  it('makes the X01 headline from legs', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(headline(d, detailSides(d))).toEqual({ big: '3–1', caption: 'Legs · first to 3' })
  })

  it('writes the meta line', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(metaLine(d)).toMatch(/^501 · Double out · First to 3 legs · 26 Sep 2026, \d\d:\d\d · Living room$/)
  })

  it('marks who gave up', () => {
    const d = x01([seat(0, 'A', 2), { ...seat(1, 'B', 1), forfeited: false }])
    d.game.players[0].forfeited = true
    expect(detailSides(d).map(s => s.forfeited)).toEqual([true, false])
  })

  it('highlights you, else the winner', () => {
    const d = x01([seat(0, 'A', 2), seat(1, 'B', 1), seat(2, 'C', 3)])
    expect(highlightDefault(d)).toBe(0)
    expect(highlightDefault({ ...d, game: { ...d.game, mySeat: null } })).toBe(1)
  })
})

describe('isGameDetail', () => {
  it('accepts a full payload', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    expect(isGameDetail(d)).toBe(true)
  })

  it('rejects a payload without stats (an older backend)', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    const { stats: _stats, ...rest } = d
    expect(isGameDetail(rest)).toBe(false)
  })

  it('rejects stats missing rows', () => {
    const d = x01([seat(0, 'A', 1), seat(1, 'B', 2)])
    const { rows: _rows, ...statsRest } = d.stats
    expect(isGameDetail({ ...d, stats: statsRest })).toBe(false)
  })

  it('rejects null', () => {
    expect(isGameDetail(null)).toBe(false)
  })
})

describe('loadPhase', () => {
  it('treats a malformed id (400) the same as a missing game (404)', () => {
    expect(loadPhase(404)).toBe('missing')
    expect(loadPhase(400)).toBe('missing')
  })

  it('fails on anything else', () => {
    expect(loadPhase(500)).toBe('failed')
    expect(loadPhase(403)).toBe('failed')
  })
})
