// Whether a finished mission game pays XP (shared/progression.ts MISSION_XP): pure, so the rules are
// tested on their own and missions/service.ts only gathers the facts.
import { MISSION_REWARDS_PER_DAY, MISSION_XP } from '../shared/progression.js'
import { suggestDifficulty } from '../shared/missions/difficulty.js'
import { DIFFICULTIES, type Difficulty, type Mission, type MissionVisibility } from '../shared/missions/types.js'

export type RewardFacts = {
  completed: boolean
  test: boolean
  playerId: string
  /** null: official. */
  authorId: string | null
  visibility: MissionVisibility
  /** The mission as the game played it (its config's snapshot). */
  mission: Pick<Mission, 'difficulty' | 'steps' | 'onFail' | 'timeLimit'>
  /** Mission rewards the player was paid today (their local day). */
  paidToday: number
}

/** The XP the completion pays, or why it pays none. The ledger pays a mission once per player (first completion). */
export function missionReward(
  f: RewardFacts,
): { xp: number } | { none: 'not completed' | 'test run' | 'own mission' | 'private' | 'daily cap' } {
  if (!f.completed) return { none: 'not completed' }
  if (f.test) return { none: 'test run' }
  if (f.authorId === f.playerId) return { none: 'own mission' }
  if (f.visibility === 'private') return { none: 'private' }
  if (f.paidToday >= MISSION_REWARDS_PER_DAY) return { none: 'daily cap' }
  return { xp: MISSION_XP[paidDifficulty(f.mission)] }
}

/**
 * The difficulty a mission pays at: its label, but never above what the server makes of its steps
 * (suggestDifficulty), so a one-dart mission labelled expert pays as easy.
 */
export function paidDifficulty(m: RewardFacts['mission']): Difficulty {
  return DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(m.difficulty), DIFFICULTIES.indexOf(suggestDifficulty(m)))]
}
