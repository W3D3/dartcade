import { describe, it, expect } from 'vitest'
import { rankedOutcome } from '../ranked/result.js'
import type { components } from '../api/schema'

type Profile = components['schemas']['RankedProfile']
const avatar = { type: 'none' } as never
const game = (over: Partial<Profile['recent'][number]> = {}): Profile['recent'][number] => ({
  sessionId: 's1',
  mode: '1v1',
  won: true,
  change: 17,
  at: '2026-11-04T12:00:00Z',
  opponents: [{ userId: 'u2', name: 'Anna K.', rating: 1301, avatar }],
  ...over,
})
const rating = (over: Partial<Profile['ratings'][number]> = {}): Profile['ratings'][number] => ({
  mode: '1v1',
  rating: 1290,
  rankIndex: 15,
  matches: 41,
  wins: 24,
  streak: 4,
  change30d: 46,
  ...over,
})
const profile = (g: Profile['recent'][number], r: Profile['ratings'][number]): Profile => ({
  ratings: [r],
  onlineAverage: null,
  recent: [g],
})

describe('rankedOutcome', () => {
  it('is null until the game is recorded', () => {
    expect(rankedOutcome(profile(game({ sessionId: 'other' }), rating()), 's1')).toBeNull()
  })

  it('says what a win moved, and promotes when the stage went up', () => {
    // 1 273 was Silver V (index 14), 1 290 is Gold I (index 15)
    const o = rankedOutcome(profile(game(), rating()), 's1')!
    expect(o).toMatchObject({
      change: '+17 RP',
      before: 1273,
      after: 1290,
      moved: 'promoted',
      streak: '4 wins in a row',
      opponentRating: 1301,
    })
    expect(o.rankBefore?.name).toBe('Silver V')
    expect(o.rankAfter?.name).toBe('Gold I')
    expect(o.record).toEqual({ score: '24–17', line: '58% won' })
  })

  it('shows no move when the stage held, and a minus sign on a loss', () => {
    const o = rankedOutcome(profile(game({ won: false, change: -14 }), rating({ rating: 1370, rankIndex: 16, streak: -1 })), 's1')!
    expect(o).toMatchObject({ change: '−14 RP', before: 1384, moved: null, streak: null })
  })

  it('hides the rating while placing and counts the placement matches', () => {
    const o = rankedOutcome(
      profile(game({ change: null }), rating({ rating: null, rankIndex: null, matches: 2, wins: 1, streak: 1 })),
      's1',
    )!
    expect(o).toMatchObject({
      change: null,
      before: null,
      after: null,
      rankAfter: null,
      moved: null,
      placing: { played: 2, of: 5 },
      progress: null,
    })
  })
})
