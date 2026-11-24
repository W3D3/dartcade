import { describe, expect, it } from 'vitest'
import { MISSION_REWARDS_PER_DAY, MISSION_XP } from '../shared/progression.js'
import { missionReward, type RewardFacts } from './rewards.js'

const facts = (o: Partial<RewardFacts> = {}): RewardFacts => ({
  completed: true,
  test: false,
  playerId: 'p',
  authorId: 'a',
  visibility: 'public',
  difficulty: 'hard',
  paidToday: 0,
  ...o,
})

describe('mission rewards', () => {
  it('pays a completed mission someone else made by its difficulty; an official one too', () => {
    expect(missionReward(facts())).toEqual({ xp: MISSION_XP.hard })
    expect(missionReward(facts({ authorId: null, difficulty: 'easy' }))).toEqual({ xp: MISSION_XP.easy })
    expect(missionReward(facts({ visibility: 'friends' }))).toEqual({ xp: MISSION_XP.hard })
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
