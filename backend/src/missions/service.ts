// What a finished mission game leaves behind: the player's best run (never a test run's) and, by the
// rules of missions/rewards.ts, its XP. Missions count for no other stats (db/counts.ts gameCounts).
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { finishedMissionGame, getMission, missionRewardsOn, recordBest } from '../db/missions.js'
import { creditXp, lockUser, userTimeZone } from '../db/progression.js'
import type { GameEnded, GameEndedConsumer } from '../session/engine.js'
import { localDate } from '../shared/progression.js'
import { missionReward } from './rewards.js'

export class MissionService implements GameEndedConsumer {
  constructor(private readonly deps: { db: Kysely<Database>; warn: (message: string, details: unknown) => void }) {}

  async onGameEnded(e: Pick<GameEnded, 'sessionId' | 'status' | 'gameId'>): Promise<void> {
    if (e.gameId !== 'mission' || e.status !== 'finished') return
    const { db } = this.deps
    const game = await finishedMissionGame(db, e.sessionId)
    if (!game?.completed || game.test || game.userId === null) return
    const mission = await getMission(db, game.missionId)
    // Deleted since the start: nothing left to rank or pay for
    if (!mission) return
    const userId = game.userId
    await recordBest(db, mission, userId, game.run, game.sessionId, game.finishedAt)
    await db.transaction().execute(async trx => {
      await lockUser(trx, userId)
      const day = localDate(game.finishedAt, await userTimeZone(trx, userId))
      const reward = missionReward({
        completed: game.completed,
        test: game.test,
        playerId: userId,
        authorId: mission.ownerUserId,
        visibility: mission.visibility,
        difficulty: mission.mission.difficulty,
        paidToday: await missionRewardsOn(trx, userId, day),
      })
      if (!('xp' in reward)) return
      // Keyed by the mission: a later completion of it pays nothing (creditXp gives null)
      await creditXp(
        trx,
        userId,
        { kind: 'mission', sourceId: mission.id, amount: reward.xp, meta: { sessionId: game.sessionId } },
        game.finishedAt,
      )
    })
  }
}
