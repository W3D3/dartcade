import { describe, it, expect, vi } from 'vitest'
import { encodeCursor, decodeCursor } from './cursor.js'
import { aggregateStats, type StatRow } from './stats.js'
import { buildDetail } from './detail.js'
import type { HistoryGame } from '../db/history.js'

describe('cursor', () => {
  it('round-trips', () => {
    const c = { finishedAt: new Date('2026-10-01T10:00:00.123Z'), id: '01J9X' }
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })
  it('rejects junk', () => {
    expect(decodeCursor('nope')).toBeNull()
    expect(decodeCursor(Buffer.from('["x", 1]').toString('base64url'))).toBeNull()
  })
})

const now = new Date('2026-10-01T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000)
const row = (o: Partial<StatRow>): StatRow => ({ mode: 'x01', finishedAt: daysAgo(1), placement: 1, seats: 2, stats: {}, ...o })

describe('aggregateStats', () => {
  it('counts matches, contested games and wins in the period', () => {
    const s = aggregateStats(
      [row({ placement: 1 }), row({ placement: 2 }), row({ seats: 1, placement: 1, mode: 'atc' }), row({ finishedAt: daysAgo(40) })],
      30,
      now,
    )
    expect([s.days, s.matches, s.contested, s.wins]).toEqual([30, 3, 2, 1])
    expect(s.modes.atc).toMatchObject({ matches: 1, contested: 0, wins: 0 })
  })

  it('aggregates each stat with the previous period average', () => {
    const s = aggregateStats(
      [
        row({ stats: { average: 60 } }),
        row({ stats: { average: 80 } }),
        row({ finishedAt: daysAgo(45), stats: { average: 50 } }),
        row({ finishedAt: daysAgo(70), stats: { average: 10 } }),
      ],
      30,
      now,
    )
    expect(s.modes.x01.stats.average).toEqual({ avg: 70, min: 60, max: 80, sum: 140, previousAvg: 50 })
  })

  it('previousAvg is null without earlier games', () => {
    expect(aggregateStats([row({ stats: { dartsThrown: 52 } })], 30, now).modes.x01.stats.dartsThrown.previousAvg).toBeNull()
  })

  it('no games: zeros and no modes', () => {
    expect(aggregateStats([], 30, now)).toEqual({ days: 30, matches: 0, wins: 0, contested: 0, modes: {} })
  })
})

describe('buildDetail', () => {
  const game: HistoryGame = {
    id: 'g1',
    game_id: 'atc',
    config: { throwAgainOnAllHit: false, finishOn: 'twenty', multiplierAdvances: false, order: 'asc' },
    rng_seed: 0,
    created_at: new Date(0),
    finished_at: new Date(1),
    board: null,
    mySeat: 0,
    seats: [{ seat: 0, name: 'A', user_id: 'u1', placement: 1, throw_position: 0, stats: {}, forfeited: false }],
  }
  const at = new Date('2026-10-01T10:00:00.000Z')
  it('replays the log into the mode detail', () => {
    const d = buildDetail(
      game,
      [
        {
          seq: 0,
          source: 'user',
          kind: 'add_dart',
          data: { type: 'add_dart', segment: { name: 'S1', number: 1, bed: 'Single', multiplier: 1 } },
          created_at: at,
        },
        { seq: 1, source: 'user', kind: 'takeout', data: { type: 'takeout' }, created_at: at },
      ],
      vi.fn(),
    )
    expect(d).toMatchObject({ mode: 'atc', visits: [{ visit: 0, seat: 0, hits: 1, targetBefore: 1, targetAfter: 2 }] })
  })
  it('null for a mode that no longer exists', () => {
    expect(buildDetail({ ...game, game_id: 'gone' }, [], vi.fn())).toBeNull()
  })
})
