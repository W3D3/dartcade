import { describe, it, expect } from 'vitest'
import { DEFAULT_FILTERS, filterQuery, outcome, type AdminGameSummary } from './games'

const game = (o: Partial<AdminGameSummary> = {}): AdminGameSummary => ({
  id: 'g1',
  mode: 'x01',
  status: 'finished',
  config: {},
  createdAt: '2026-10-01T09:00:00Z',
  finishedAt: '2026-10-01T09:30:00Z',
  board: null,
  ranked: false,
  players: [
    { seat: 0, name: 'Ann', userId: 'u1', bot: null, placement: 1, forfeited: false },
    { seat: 1, name: 'Bob', userId: 'u2', bot: null, placement: 2, forfeited: false },
  ],
  ...o,
})

describe('filterQuery', () => {
  it('asks for finished games with nothing else by default', () => {
    expect(filterQuery(DEFAULT_FILTERS, null)).toEqual({ status: 'finished' })
  })

  it('leaves blank filters out and trims the player', () => {
    expect(filterQuery({ ...DEFAULT_FILTERS, status: 'all', mode: 'x01', player: '  ann ', ranked: true }, 'c1')).toEqual({
      status: 'all',
      mode: 'x01',
      player: 'ann',
      ranked: true,
      cursor: 'c1',
    })
  })

  it('makes the to date inclusive of its whole day', () => {
    const q = filterQuery({ ...DEFAULT_FILTERS, from: '2026-10-01', to: '2026-10-03' }, null)
    expect(new Date(q.to).getTime() - new Date(q.from).getTime()).toBeGreaterThanOrEqual(2 * 23 * 3600_000)
    expect(filterQuery({ ...DEFAULT_FILTERS, from: 'nope' }, null)).toEqual({ status: 'finished' })
  })
})

describe('outcome', () => {
  it('names the winner', () => {
    expect(outcome(game())).toBe('Ann won')
  })
  it('names every seat of a winning team', () => {
    const players = game().players.map((p, i) => ({ ...p, placement: i < 2 ? 1 : 2 }))
    expect(outcome(game({ players }))).toBe('Ann & Bob won')
  })
  it('says why a game has no winner', () => {
    expect(outcome(game({ status: 'aborted' }))).toBe('Aborted')
    expect(outcome(game({ status: 'active' }))).toBe('In progress')
  })
  it('does not call a solo game won', () => {
    expect(outcome(game({ players: game().players.slice(0, 1) }))).toBe('Finished')
  })
})
