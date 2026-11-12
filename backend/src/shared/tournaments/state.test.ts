import { describe, expect, it } from 'vitest'
import {
  isEditable,
  MATCH_STATUSES,
  MATCH_TRANSITIONS,
  OUTCOME_OF,
  TOURNAMENT_STATUSES,
  TOURNAMENT_TRANSITIONS,
  nextMatchStatus,
  nextTournamentStatus,
  type MatchEvent,
  type MatchStatus,
  type TournamentEvent,
  type TournamentStatus,
} from './state.js'

function walk<S extends string, E extends string>(next: (s: S, e: E) => S | null, from: S, events: E[]): S | null {
  let at: S | null = from
  for (const e of events) at = at === null ? null : next(at, e)
  return at
}

function reachable<S extends string>(table: Record<S, Partial<Record<string, S>>>, from: S): Set<S> {
  const seen = new Set<S>([from])
  for (const s of seen) for (const to of Object.values(table[s]) as S[]) seen.add(to)
  return seen
}

describe('tournament transitions', () => {
  it.each<[string, TournamentEvent[], TournamentStatus]>([
    ['online with check-in', ['publish', 'open_check_in', 'start', 'finish'], 'finished'],
    ['in person, started from open', ['publish', 'start', 'finish'], 'finished'],
    ['cancelled during registration', ['publish', 'cancel'], 'cancelled'],
    ['cancelled during check-in', ['publish', 'open_check_in', 'cancel'], 'cancelled'],
    ['cancelled while running', ['publish', 'start', 'cancel'], 'cancelled'],
  ])('%s', (_, events, end) => {
    expect(walk(nextTournamentStatus, 'draft', events)).toBe(end)
  })

  it.each<[TournamentStatus, TournamentEvent]>([
    ['finished', 'start'],
    ['finished', 'cancel'],
    ['cancelled', 'start'],
    ['cancelled', 'publish'],
    ['draft', 'start'],
    ['draft', 'open_check_in'],
    ['draft', 'cancel'],
    ['open', 'finish'],
    ['open', 'publish'],
    ['check_in', 'open_check_in'],
    ['check_in', 'finish'],
    ['running', 'publish'],
    ['running', 'start'],
  ])('refuses %s → %s', (from, event) => {
    expect(nextTournamentStatus(from, event)).toBeNull()
  })

  it('ends in finished or cancelled, which nothing leaves', () => {
    expect(TOURNAMENT_TRANSITIONS.finished).toEqual({})
    expect(TOURNAMENT_TRANSITIONS.cancelled).toEqual({})
    for (const s of TOURNAMENT_STATUSES) {
      const ends = reachable(TOURNAMENT_TRANSITIONS, s)
      expect(ends.has('finished') || ends.has('cancelled'), s).toBe(true)
    }
  })

  it('reaches every status from a draft and never goes back to draft', () => {
    expect([...reachable(TOURNAMENT_TRANSITIONS, 'draft')].sort()).toEqual([...TOURNAMENT_STATUSES].sort())
    for (const s of TOURNAMENT_STATUSES.filter(s => s !== 'draft')) expect(reachable(TOURNAMENT_TRANSITIONS, s).has('draft')).toBe(false)
  })
})

describe('match transitions', () => {
  it.each<[string, MatchStatus, MatchEvent[], MatchStatus]>([
    ['played', 'pending', ['seat', 'start', 'finish'], 'finished'],
    ['bye', 'pending', ['bye'], 'finished'],
    ['no-show', 'pending', ['seat', 'walkover'], 'finished'],
    ['withdrawn mid-game', 'pending', ['seat', 'start', 'walkover'], 'finished'],
    ['aborted game, replayed', 'pending', ['seat', 'start', 'abort', 'start', 'finish'], 'finished'],
    ['result set, then corrected', 'ready', ['set_result', 'set_result'], 'finished'],
  ])('%s', (_, from, events, end) => {
    expect(walk(nextMatchStatus, from, events)).toBe(end)
  })

  it.each<[MatchStatus, MatchEvent]>([
    ['finished', 'start'],
    ['finished', 'finish'],
    ['finished', 'abort'],
    ['finished', 'walkover'],
    ['pending', 'start'],
    ['pending', 'finish'],
    ['pending', 'set_result'],
    ['ready', 'seat'],
    ['ready', 'finish'],
    ['ready', 'bye'],
    ['live', 'seat'],
    ['live', 'start'],
    ['live', 'set_result'],
  ])('refuses %s → %s', (from, event) => {
    expect(nextMatchStatus(from, event)).toBeNull()
  })

  it('never goes back to pending, and only a result leads to finished', () => {
    for (const s of MATCH_STATUSES.filter(s => s !== 'pending')) expect(reachable(MATCH_TRANSITIONS, s).has('pending')).toBe(false)
    for (const s of MATCH_STATUSES)
      for (const [event, to] of Object.entries(MATCH_TRANSITIONS[s]))
        if (to === 'finished') expect(Object.keys(OUTCOME_OF), `${s} → ${event}`).toContain(event)
  })
})

describe('isEditable', () => {
  it('lets organizers change a tournament until it starts', () => {
    expect(TOURNAMENT_STATUSES.filter(isEditable)).toEqual(['draft', 'open'])
  })
})
