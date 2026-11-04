import { describe, it, expect } from 'vitest'
import { queueView } from '../ranked/queueCard.js'
import type { Matchmaking } from '../lobby/sockets.js'

const NOW = Date.parse('2026-11-04T12:00:00Z')
const search = (over = {}): NonNullable<Matchmaking['search']> => ({
  mode: '2v2',
  firstTo: 2,
  since: '2026-11-04T11:58:48Z',
  range: 75,
  rating: 1226,
  hostUserId: 'me',
  players: ['Christoph', 'Lena'],
  searching: 38,
  ...over,
})
const seat = (accepted: boolean, you = false) => ({ person: null, accepted, you })
const match = (yours: boolean[], theirs: boolean[], expiresAt = '2026-11-04T12:00:09Z'): NonNullable<Matchmaking['match']> => ({
  id: 'm1',
  mode: yours.length > 1 ? '2v2' : '1v1',
  firstTo: 2,
  expiresAt,
  range: 75,
  stakes: { win: 16, loss: 14 },
  yours: yours.map((a, i) => seat(a, i === 0)),
  theirs: theirs.map(a => seat(a)),
})
const mm = (over: Partial<Matchmaking>): Matchmaking => ({ search: null, match: null, pausedUntil: null, ...over })

describe('queueView', () => {
  it('is null with nothing searching, even while paused', () => {
    expect(queueView(null, 'me', NOW)).toBeNull()
    expect(queueView(mm({ pausedUntil: '2026-11-04T12:02:00Z' }), 'me', NOW)).toBeNull()
  })

  it('counts the search up, and lets only the host cancel a duo', () => {
    const host = queueView(mm({ search: search() }), 'me', NOW)!
    expect(host).toMatchObject({
      kind: 'searching',
      tag: 'Searching · 2v2',
      name: 'Ranked duo',
      clock: '1:12',
      canCancel: true,
      line: 'You started · ±75 RP',
    })
    const member = queueView(mm({ search: search() }), 'lena', NOW)!
    expect(member).toMatchObject({ canCancel: false, line: 'Christoph started it · ±75 RP' })
  })

  it('is the solo card without a lobby', () => {
    const v = queueView(mm({ search: search({ mode: '1v1', players: ['Christoph'] }) }), 'me', NOW)!
    expect(v).toMatchObject({ name: 'Solo 1v1', strip: 'Searching · Ranked 1v1', canCancel: true })
  })

  it('shows the match with the seconds left to accept', () => {
    const v = queueView(mm({ search: search(), match: match([false, false], [false, false]) }), 'me', NOW)!
    expect(v).toMatchObject({ kind: 'found', tag: 'Match found', name: 'Ranked 2v2', clock: '0:09', secondsLeft: 9, canCancel: false })
  })

  it('waits for the others once you accepted, counting who did', () => {
    const v = queueView(mm({ match: match([true, false], [true, false]) }), 'me', NOW)!
    expect(v).toMatchObject({ kind: 'accepted', tag: 'Accepted · waiting', line: 'Everyone has to accept · 2 of 4 so far' })
  })
})
