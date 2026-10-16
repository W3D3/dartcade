import { describe, it, expect } from 'vitest'
import type { MatchmakingMatch, MatchmakingSearch } from '$lib/api/lobby-ws'
import { acceptedLine, clock, pausedFor, searchView, secondsLeft, youAccepted } from '../ranked/queue'
import { fmtRp } from '../ranked/view'

const T0 = Date.UTC(2026, 9, 15, 20)
const search = (s: Partial<MatchmakingSearch>): MatchmakingSearch => ({
  mode: '1v1',
  firstTo: 2,
  since: new Date(T0).toISOString(),
  range: 75,
  rating: 1200,
  hostUserId: 'chris',
  players: ['Christoph'],
  searching: 1,
  ...s,
})
const seat = (accepted: boolean, you = false) => ({ name: you ? 'Christoph' : null, accepted, you })
const match = (m: Partial<MatchmakingMatch>): MatchmakingMatch => ({
  id: 'm1',
  mode: '1v1',
  firstTo: 2,
  expiresAt: new Date(T0 + 10_000).toISOString(),
  range: 75,
  stakes: null,
  yours: [seat(false, true)],
  theirs: [seat(false)],
  ...m,
})

describe('ranked queue', () => {
  it('writes the clock in minutes and seconds', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(65.9)).toBe('1:05')
    expect(clock(-3)).toBe('0:00')
  })

  it('shows a solo search with its range bar', () => {
    const v = searchView(search({ searching: 212 }), T0 + 42_000)
    expect(v).toMatchObject({ title: 'Searching · Solo 1v1', range: '±75 RP', elapsed: '0:42', searching: '212 players searching' })
    expect(v.bar).toEqual({ inset: 22, low: fmtRp(1125), you: `You · ${fmtRp(1200)}`, high: fmtRp(1275) })
  })

  it('widens the band as the range grows, up to nearly the whole bar', () => {
    const inset = (range: number) => searchView(search({ range }), T0).bar?.inset ?? 0
    expect(inset(150)).toBeLessThan(inset(75))
    expect(inset(600)).toBe(5)
  })

  it('hides the bar while placing, and names a duo', () => {
    const v = searchView(search({ mode: '2v2', rating: null, players: ['Christoph', 'Lena'], searching: 1 }), T0)
    expect(v).toMatchObject({ title: 'Searching · Duo 2v2', bar: null, players: 'Christoph & Lena', searching: '1 duo searching' })
  })

  it('counts down to the accept deadline', () => {
    expect(secondsLeft(match({}), T0)).toBe(10)
    expect(secondsLeft(match({}), T0 + 9_100)).toBe(1)
    expect(secondsLeft(match({}), T0 + 20_000)).toBe(0)
  })

  it('counts accepts only in 2v2', () => {
    expect(acceptedLine(match({}))).toBeNull()
    const duo = match({ mode: '2v2', yours: [seat(true, true), seat(false)], theirs: [seat(true), seat(false)] })
    expect(acceptedLine(duo)).toBe('Everyone has to accept · 2 of 4 so far')
    expect(youAccepted(duo)).toBe(true)
    expect(youAccepted(match({}))).toBe(false)
  })

  it('shows how long a pause has left', () => {
    expect(pausedFor(null, T0)).toBeNull()
    expect(pausedFor(new Date(T0 + 102_000).toISOString(), T0)).toBe('1:42')
    expect(pausedFor(new Date(T0).toISOString(), T0 + 1)).toBeNull()
  })
})
