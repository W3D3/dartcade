import { describe, expect, it } from 'vitest'
import type { MissionGame, MissionRun } from '$lib/api/game-ws'
import {
  bests,
  bigNumber,
  boardTarget,
  canReport,
  cardPills,
  emptyLine,
  filterOf,
  fmtClock,
  highscoreRank,
  liveElapsed,
  outcomeLine,
  personalBest,
  resultRows,
  runLine,
  segments,
  stepState,
  stepStatusLine,
  timeLeft,
  type MissionCard,
} from './view'

const mission: MissionGame['mission'] = {
  name: 'Tungsten Gauntlet',
  description: '',
  difficulty: 'hard',
  order: 'any',
  timeLimit: 900,
  onFail: 'retry',
  pause: false,
  rankBy: 'time',
  steps: [
    { type: 'checkout', start: 170, maxDarts: 8, finish: 'double' },
    { type: 'hit', targets: ['S20'], hits: 9, inARow: true, order: 'any' },
    { type: 'hit', targets: ['D11', 'B', 'D6'], hits: 1, inARow: false, order: 'in_order' },
  ],
}

const step = (o: Partial<MissionRun['steps'][number]> = {}): MissionRun['steps'][number] => ({
  attempts: 1,
  best: 0,
  darts: 0,
  doneAt: null,
  progress: { value: 0, of: 9 },
  ...o,
})

const clock = (o: Partial<MissionRun['clock']> = {}): MissionRun['clock'] => ({
  now: null,
  startedAt: null,
  pausedAt: null,
  pausedMs: 0,
  deadline: null,
  ...o,
})

// Christoph on step 2: step 1 done at 2:04, a 5-streak in attempt 3, step 3 untouched
const playing = (o: Partial<MissionRun> = {}): MissionRun => ({
  status: 'playing',
  failure: null,
  active: 1,
  steps: [
    step({ doneAt: 124_000, darts: 6, progress: { value: 1, of: 1, left: 0 } }),
    step({ attempts: 3, best: 6, darts: 35, progress: { value: 5, of: 9 } }),
    step({ progress: { value: 0, of: 3 } }),
  ],
  restarts: 0,
  darts: 41,
  clock: clock({ now: 1_000_000, startedAt: 800_000 }),
  timeMs: null,
  place: null,
  ...o,
})

const card = (o: Partial<MissionCard> = {}): MissionCard => ({
  id: 'm1',
  mission,
  visibility: 'public',
  official: false,
  author: { id: 'lena', name: 'Lena' },
  plays: 3,
  yourBest: null,
  friendsBest: null,
  tries: 0,
  hidden: null,
  canEdit: false,
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  ...o,
})

describe('the list', () => {
  it('reads an unknown tab as All', () => {
    expect(filterOf('friends')).toBe('friends')
    expect(filterOf('nope')).toBe('all')
    expect(filterOf(undefined)).toBe('all')
  })

  it('pills: steps, order only with more than one step, official, the time limit', () => {
    expect(cardPills(card()).map(p => p.label)).toEqual(['3 steps', 'Any order', '15 min'])
    const sprint = { ...mission, steps: [mission.steps[2]], timeLimit: undefined }
    expect(cardPills(card({ official: true, mission: sprint })).map(p => p.label)).toEqual(['1 step', 'Official'])
  })

  it('bests: a time, darts for a darts race, tried but not completed, Not tried, and a dash on your own untried mission', () => {
    const best = { userId: 'me', name: 'Me', timeMs: 462_000, darts: 38, achievedAt: '2026-11-21T10:00:00Z' }
    expect(bests(card({ yourBest: best, tries: 4 }), 'me')).toEqual({ yours: '7:42', tried: null, friends: '—' })
    expect(bests(card({ tries: 2 }), 'me')).toEqual({ yours: 'Not completed', tried: 'Tried 2×', friends: '—' })
    expect(bests(card({ tries: 1, author: { id: 'me', name: 'Me' } }), 'me').yours).toBe('Not completed')
    expect(bests(card({ yourBest: best, mission: { ...mission, rankBy: 'darts' } }), 'me').yours).toBe('38 darts')
    expect(bests(card(), 'me').yours).toBe('Not tried')
    expect(bests(card({ author: { id: 'me', name: 'Me' } }), 'me').yours).toBe('—')
  })

  it('report: only someone else’s player mission that everyone sees', () => {
    expect(canReport(card(), 'me')).toBe(true)
    expect(canReport(card({ author: { id: 'me', name: 'Me' } }), 'me')).toBe(false)
    expect(canReport(card({ visibility: 'friends' }), 'me')).toBe(false)
    expect(canReport(card({ official: true, author: null }), 'me')).toBe(false)
  })

  it('an empty tab says why, the difficulty first', () => {
    expect(emptyLine('all', null)).toBe('No missions yet. Build the first one.')
    expect(emptyLine('completed', null)).toMatch(/haven't completed/)
    expect(emptyLine('mine', 'expert')).toMatch(/No expert missions/)
  })
})

describe('the play screen', () => {
  it('step states: done, active, started, idle, and the step a run failed on', () => {
    const run = playing()
    expect([0, 1, 2].map(i => stepState(run, i))).toEqual(['done', 'active', 'idle'])
    const switched = playing({ active: 2 })
    expect(stepState(switched, 1)).toBe('started')
    expect(stepState(playing({ status: 'failed', failure: 'time' }), 1)).toBe('failed')
  })

  it('status lines as the artboard writes them', () => {
    const run = playing()
    expect(stepStatusLine(mission.steps[0], run, 0, true)).toBe('Done · 6 darts · 2:04')
    expect(stepStatusLine(mission.steps[1], run, 1, true)).toBe('Attempt 3 · best streak 6')
    expect(stepStatusLine(mission.steps[2], run, 2, true)).toBe('Not started · switch any time')
    expect(stepStatusLine(mission.steps[2], run, 2, false)).toBe('Not started')
    expect(stepStatusLine(mission.steps[1], playing({ status: 'failed', failure: 'gave_up' }), 1, true)).toBe('Gave up · attempt 3')
  })

  it('the big number: progress of a goal, the score left of a checkout', () => {
    expect(bigNumber(mission.steps[1], { value: 5, of: 9 })).toEqual({ value: '5', of: '9', caption: null })
    expect(bigNumber(mission.steps[0], { value: 0, of: 1, left: 170 })).toEqual({ value: '170', of: null, caption: 'left' })
  })

  it('a cell per unit, the next one outlined; none past 21', () => {
    expect(segments({ value: 2, of: 4 })).toEqual(['done', 'done', 'next', 'empty'])
    expect(segments({ value: 40, of: 100 })).toBeNull()
  })

  it('the board target', () => {
    expect(boardTarget(mission.steps[1])).toBe(20)
    expect(boardTarget(mission.steps[2])).toBeNull()
  })

  it('the clock runs only while it is the run’s turn and stops when paused', () => {
    const run = playing()
    expect(liveElapsed(run, 1_100_000)).toBe(300_000)
    expect(timeLeft({ mission }, run, 1_100_000)).toBe(600_000)
    // Waiting (another player's turn) or paused: frozen at the pause
    const waiting = playing({ clock: clock({ now: 1_000_000, startedAt: 800_000, pausedAt: 900_000 }) })
    expect(liveElapsed(waiting, 2_000_000)).toBe(100_000)
    // Not started: the whole limit is left
    expect(timeLeft({ mission }, playing({ clock: clock() }), 5_000_000)).toBe(900_000)
    // Out of time: 0, never negative
    expect(timeLeft({ mission }, run, 9_000_000)).toBe(0)
    expect(timeLeft({ mission: { ...mission, timeLimit: undefined } }, run, 1)).toBeNull()
  })

  it('the other players’ rows: their step, done with a time, or out', () => {
    expect(runLine({ mission }, playing())).toBe('Step 2 of 3 · 5/9')
    expect(runLine({ mission }, playing({ status: 'completed', timeMs: 598_000 }))).toBe('Done · 9:58')
    expect(runLine({ mission }, playing({ status: 'failed', failure: 'time' }))).toBe('Out · time ran out · 1/3 steps')
  })
})

describe('the result', () => {
  it('says where a run that did not complete ended', () => {
    expect(outcomeLine({ mission }, playing({ status: 'failed', failure: 'time', active: 1 }))).toBe('Time ran out at step 2 of 3')
    expect(outcomeLine({ mission }, playing({ status: 'failed', failure: 'gave_up', active: 0 }))).toBe('Gave up at step 1 of 3')
    expect(outcomeLine({ mission }, playing({ status: 'completed' }))).toBeNull()
  })

  it('rows by place, each with its outcome', () => {
    const game = {
      mission,
      runs: [
        playing({ status: 'failed', failure: 'gave_up', timeMs: 300_000, place: 2 }),
        playing({ status: 'completed', timeMs: 667_000, place: 1 }),
      ],
    }
    expect(resultRows(game, ['Christoph', 'Lena']).map(r => [r.name, r.place, r.outcome, r.time])).toEqual([
      ['Lena', 1, 'Completed', '11:07'],
      ['Christoph', 2, 'Gave up', '5:00'],
    ])
  })

  it('where a completed run lands in the highscores it started with; never for a test run or a failed one', () => {
    const highscores = [
      { userId: 'lena', name: 'Lena', timeMs: 598_000, darts: 60 },
      { userId: 'max', name: 'Max', timeMs: 684_000, darts: 70 },
    ]
    const done = playing({ status: 'completed', timeMs: 667_000 })
    expect(highscoreRank({ mission, highscores, test: false }, done)).toBe(2)
    expect(highscoreRank({ mission, highscores, test: true }, done)).toBeNull()
    expect(highscoreRank({ mission, highscores, test: false }, playing({ status: 'failed', failure: 'time', timeMs: 900_000 }))).toBeNull()
  })

  it('a new personal best against the player’s own best from the start, also outside the top 10', () => {
    const top10 = Array.from({ length: 10 }, (_, i) => ({ userId: `u${i}`, name: `P${i}`, timeMs: 300_000 + i * 1000, darts: 30 }))
    // 11th: in no highscore, best 10:00 before the game
    const game = { mission, highscores: top10, test: false, bests: { me: { timeMs: 600_000, darts: 50 }, first: null } }
    const slower = playing({ status: 'completed', timeMs: 667_000, darts: 55 })
    const faster = playing({ status: 'completed', timeMs: 590_000, darts: 55 })
    expect(personalBest(game, slower, 'me')).toBe(false)
    expect(personalBest(game, faster, 'me')).toBe(true)
    // No best yet: any completion is one; failed, a test run or an account the game doesn't know: never
    expect(personalBest(game, slower, 'first')).toBe(true)
    expect(personalBest(game, playing({ status: 'failed', failure: 'time', timeMs: 900_000 }), 'first')).toBe(false)
    expect(personalBest({ ...game, test: true }, faster, 'me')).toBe(false)
    expect(personalBest(game, faster, 'stranger')).toBe(false)
  })

  it('formats times past an hour', () => {
    expect(fmtClock(3_725_000)).toBe('1:02:05')
    expect(fmtClock(-5)).toBe('0:00')
  })
})
