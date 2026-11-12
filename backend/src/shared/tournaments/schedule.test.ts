import { describe, expect, it } from 'vitest'
import { advance, doubleElimination, roundRobin, singleElimination } from './bracket.js'
import { schedule, type MatchTimes } from './schedule.js'

const at = (hhmm: string) => Date.parse(`2026-11-14T${hhmm}:00Z`)
const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`)
// First to 3: at most 5 legs, 20 minutes
const FIRST_TO_3 = { firstTo: 3 }
const view = (s: ReturnType<typeof schedule>) =>
  s.map(x => [x.name, x.state, x.at === null ? null : new Date(x.at).toISOString().slice(11, 16)])

describe('schedule', () => {
  it('lays out a knockout that has not started round after round', () => {
    const matches = singleElimination(ids(8), FIRST_TO_3)
    expect(view(schedule('single_elimination', matches, new Map(), at('20:00'), at('19:00')))).toEqual([
      ['Quarter-finals', 'later', '20:00'],
      ['Semi-finals', 'later', '20:20'],
      ['Final', 'later', '20:40'],
    ])
  })

  it('moves with the real times: a round being played is now, the next waits for its slowest match', () => {
    let matches = singleElimination(ids(4), FIRST_TO_3)
    matches = advance(matches, 'R1M1', { outcome: 'played', winner: 0, legs: [3, 1] })
    const times = new Map<string, MatchTimes>([
      ['R1M1', { status: 'finished', startedAt: at('20:00'), finishedAt: at('20:12') }],
      ['R1M2', { status: 'live', startedAt: at('20:05'), finishedAt: null }],
    ])
    expect(view(schedule('single_elimination', matches, times, at('20:00'), at('20:15')))).toEqual([
      ['Semi-finals', 'now', null],
      ['Final', 'later', '20:25'],
    ])
    // The live match overran its estimate: the final waits on from now
    expect(view(schedule('single_elimination', matches, times, at('20:00'), at('20:40')))[1]).toEqual(['Final', 'later', '20:40'])
  })

  it('counts a finished stage as done', () => {
    let matches = singleElimination(ids(2), FIRST_TO_3)
    matches = advance(matches, 'R1M1', { outcome: 'walkover', winner: 1 })
    const times = new Map<string, MatchTimes>([['R1M1', { status: 'finished', startedAt: null, finishedAt: at('20:01') }]])
    expect(view(schedule('single_elimination', matches, times, at('20:00'), at('20:02')))).toEqual([['Final', 'done', null]])
  })

  it('starts a round robin round once its players finished the one before', () => {
    const matches = roundRobin(ids(4), 2)
    // First to 2: 3 legs, 12 minutes
    expect(view(schedule('round_robin', matches, new Map(), at('20:00'), at('19:00')))).toEqual([
      ['Round 1', 'later', '20:00'],
      ['Round 2', 'later', '20:12'],
      ['Round 3', 'later', '20:24'],
    ])
  })

  it('names a double elimination: upper rounds, lower rounds waiting for the upper losers, the grand final last', () => {
    const s = schedule('double_elimination', doubleElimination(ids(4), { firstTo: 1 }), new Map(), at('20:00'), at('19:00'))
    expect(view(s)).toEqual([
      ['Semi-finals', 'later', '20:00'],
      ['Upper final', 'later', '20:04'],
      ['Lower round 1', 'later', '20:04'],
      ['Lower final', 'later', '20:08'],
      ['Grand final', 'later', '20:12'],
      ['Grand final reset', 'later', '20:16'],
    ])
  })
})
