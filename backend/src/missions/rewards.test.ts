import { describe, expect, it } from 'vitest'
import { MISSION_REWARDS_PER_DAY, MISSION_XP } from '../shared/progression.js'
import { missionReward, type RewardFacts } from './rewards.js'
import { StepSchema, type Difficulty } from '../shared/missions/types.js'

// Nine S20s in a row: the steps alone rate it hard
const streak = StepSchema.parse({ type: 'hit', targets: ['S20'], hits: 9, inARow: true, order: 'any' })
// One dart at the 20: easy
const oneDart = StepSchema.parse({ type: 'hit', targets: ['20'], hits: 1, inARow: false, order: 'any' })
const mission = (difficulty: Difficulty, step = streak) => ({ difficulty, steps: [step], onFail: 'retry' as const })

const facts = (o: Partial<RewardFacts> = {}): RewardFacts => ({
  completed: true,
  test: false,
  playerId: 'p',
  authorId: 'a',
  visibility: 'public',
  mission: mission('hard'),
  paidToday: 0,
  ...o,
})

describe('mission rewards', () => {
  it('pays a completed mission someone else made by its difficulty; an official one too', () => {
    expect(missionReward(facts())).toEqual({ xp: MISSION_XP.hard })
    expect(missionReward(facts({ authorId: null, mission: mission('easy') }))).toEqual({ xp: MISSION_XP.easy })
    expect(missionReward(facts({ visibility: 'friends' }))).toEqual({ xp: MISSION_XP.hard })
  })

  it('pays by the steps, never above them: a one-dart mission labelled expert pays the easy rate', () => {
    expect(missionReward(facts({ mission: mission('expert', oneDart) }))).toEqual({ xp: MISSION_XP.easy })
    expect(missionReward(facts({ mission: mission('expert') }))).toEqual({ xp: MISSION_XP.hard })
  })

  it('pays nothing for a failed run, a test run, an own or a private mission', () => {
    expect(missionReward(facts({ completed: false }))).toEqual({ none: 'not completed' })
    expect(missionReward(facts({ test: true }))).toEqual({ none: 'test run' })
    expect(missionReward(facts({ authorId: 'p' }))).toEqual({ none: 'own mission' })
    expect(missionReward(facts({ visibility: 'private' }))).toEqual({ none: 'private' })
  })

  it('pays at most the daily cap', () => {
    expect(missionReward(facts({ paidToday: MISSION_REWARDS_PER_DAY - 1 }))).toEqual({ xp: MISSION_XP.hard })
    expect(missionReward(facts({ paidToday: MISSION_REWARDS_PER_DAY }))).toEqual({ none: 'daily cap' })
  })
})
