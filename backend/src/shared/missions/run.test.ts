import { describe, expect, it } from 'vitest'
import { dart } from '../../test/missionDarts.js'
import {
  deadline,
  elapsed,
  endVisit,
  giveUp,
  type MissionRun,
  pause,
  resume,
  startRun,
  stepsDone,
  switchStep,
  throwDart,
  tick,
} from './run.js'
import { MissionSchema, type Mission } from './types.js'

const mission = (o: Partial<Mission> = {}): Mission =>
  MissionSchema.parse({
    name: 'Test',
    description: '',
    difficulty: 'easy',
    order: 'any',
    onFail: 'retry',
    pause: true,
    rankBy: 'time',
    steps: [
      { type: 'hit', targets: ['S20'], hits: 2, inARow: true, order: 'any' },
      { type: 'visits', compare: 'at_least', points: 60, visits: 1, inARow: false },
    ],
    ...o,
  })

/** Plays `labels` (`|` ends the visit) at time `at`, one second apart. */
function play(m: Mission, run: MissionRun, labels: string, at = { t: 0 }): MissionRun {
  for (const l of labels.split(' ').filter(Boolean)) {
    at.t += 1000
    run = tick(m, run, at.t)
    run = l === '|' ? endVisit(m, run) : throwDart(m, run, dart(l))
  }
  return run
}

describe('a mission run', () => {
  it('completes when every step is done, with the time of the last', () => {
    const m = mission()
    const r = play(m, startRun(m), 'S20 S20 | T20 |')
    expect(r.status).toBe('completed')
    expect(stepsDone(r)).toBe(2)
    // The clock starts at the first input (t = 1 s); the visit step is done at its visit end (t = 5 s)
    expect(r.timeMs).toBe(4000)
    expect(r.steps[0].doneAt).toBe(1000)
    expect(r.darts).toBe(3)
  })

  it('Retry that step: a failed attempt counts, finished steps stay done', () => {
    const m = mission({ order: 'in_order' })
    let r = play(m, startRun(m), 'S20 S20 |')
    r = play(m, r, 'S1 |')
    expect(r.steps[0].doneAt).not.toBeNull()
    expect(r.steps[1].attempts).toBe(1)
    const other = mission({ steps: [{ type: 'hit', targets: ['S20'], hits: 3, inARow: true, order: 'any' }] })
    const failed = play(other, startRun(other), 'S20 S20 S1')
    expect(failed.steps[0].attempts).toBe(2)
    expect(failed.steps[0].best).toBe(2)
  })

  it('Start over: a failed step resets every step and goes back to the first', () => {
    const m = mission({
      onFail: 'restart',
      order: 'in_order',
      steps: [
        { type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any' },
        { type: 'hit', targets: ['S19'], hits: 2, inARow: true, order: 'any' },
      ],
    })
    const r = play(m, startRun(m), 'S20 S19 S1')
    expect(r.active).toBe(0)
    expect(r.restarts).toBe(1)
    expect(r.steps[0].doneAt).toBeNull()
    expect(r.steps[1].attempts).toBe(2)
  })

  it('a step done mid-visit hands the rest of the visit to the next dart step', () => {
    const m = mission({
      steps: [
        { type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any' },
        { type: 'hit', targets: ['S19'], hits: 1, inARow: false, order: 'any' },
      ],
    })
    expect(play(m, startRun(m), 'S20 S19').status).toBe('completed')
  })

  it('but a step that counts whole visits starts with the next visit', () => {
    const m = mission({
      order: 'in_order',
      steps: [
        { type: 'hit', targets: ['S20'], hits: 1, inARow: false, order: 'any' },
        { type: 'visits', compare: 'at_least', points: 40, visits: 1, inARow: false },
      ],
    })
    let r = play(m, startRun(m), 'S20 T20 T20')
    expect(r.visit.locked).toBe(true)
    expect(r.steps[1].darts).toBe(0)
    expect(r.darts).toBe(3)
    r = play(m, r, '| S20 S20 |')
    expect(r.status).toBe('completed')
  })

  it('in order: darts go to the first step until it is done', () => {
    const m = mission({ order: 'in_order' })
    expect(switchStep(m, startRun(m), 1).active).toBe(0)
  })

  it('any order: switches step between visits, never mid-visit or to a done step', () => {
    const m = mission()
    const r = startRun(m)
    expect(switchStep(m, r, 1).active).toBe(1)
    const mid = play(m, r, 'S20')
    expect(switchStep(m, mid, 1)).toBe(mid)
    // The step left starts over when it comes back
    const back = switchStep(m, play(m, switchStep(m, play(m, r, 'S20 S1 |'), 1), ''), 0)
    expect(back.steps[0].attempt).toEqual({ counts: [0], next: 0, darts: 0 })
    const done = play(m, r, 'S20 S20 |')
    expect(switchStep(m, done, 0)).toBe(done)
  })

  it('the time limit fails the mission at the first input after it', () => {
    const m = mission({ timeLimit: 60 })
    let r = play(m, startRun(m), 'S20')
    expect(deadline(m, r)).toBe(1000 + 60_000)
    r = tick(m, r, 61_000)
    expect(r.status).toBe('playing')
    r = tick(m, r, 61_001)
    expect(r).toMatchObject({ status: 'failed', failure: 'time', timeMs: 60_000 })
    expect(throwDart(m, r, dart('S20'))).toBe(r)
  })

  it('pause stops the clock between visits; darts while paused do not count', () => {
    const m = mission({ timeLimit: 60 })
    let r = play(m, startRun(m), 'S20 |')
    r = pause(m, r)
    expect(deadline(m, r)).toBeNull()
    r = tick(m, r, 100_000)
    expect(r.status).toBe('playing')
    expect(throwDart(m, r, dart('S20'))).toBe(r)
    r = resume(tick(m, r, 200_000))
    expect(elapsed(r.clock)).toBe(1000)
    expect(deadline(m, r)).toBe(200_000 + 59_000)
  })

  it('pause is refused when the mission does not allow it, or mid-visit', () => {
    const m = mission({ pause: false })
    const r = play(m, startRun(m), 'S20 |')
    expect(pause(m, r)).toBe(r)
    const allowed = mission()
    const mid = play(allowed, startRun(allowed), 'S20')
    expect(pause(allowed, mid)).toBe(mid)
  })

  it('give up fails the mission at the time so far', () => {
    const m = mission()
    const r = giveUp(play(m, startRun(m), 'S20 S1'))
    expect(r).toMatchObject({ status: 'failed', failure: 'gave_up', timeMs: 1000 })
  })
})
