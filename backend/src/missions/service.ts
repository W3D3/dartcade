// What a finished mission game leaves behind: the player's best run (never a test run's) and, by the
// rules of missions/rewards.ts, its XP. Missions count for no other stats (db/counts.ts gameCounts).
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import { finishedMissionGame, getMission, missionRewardsOn, recordBest, type FinishedMissionGame, type MissionRow } from '../db/missions.js'
import { creditXp, lockUser, userTimeZone } from '../db/progression.js'
import type { GameEnded, GameEndedConsumer } from '../session/engine.js'
import { localDate } from '../shared/progression.js'
import { sameRules } from '../shared/missions/highscores.js'
import { missionReward } from './rewards.js'

export class MissionService implements GameEndedConsumer {
  constructor(private readonly deps: { db: Kysely<Database>; warn: (message: string, details: unknown) => void }) {}

  async onGameEnded(e: Pick<GameEnded, 'sessionId' | 'status' | 'gameId'>): Promise<void> {
    if (e.gameId !== 'mission' || e.status !== 'finished') return
    const { db } = this.deps
    const game = await finishedMissionGame(db, e.sessionId)
    if (!game || game.test) return
    const mission = await getMission(db, game.missionId)
    // Deleted since the start: nothing left to rank or pay for
    if (!mission) return
    // Each player on their own: a forfeit or a failed run of one changes nothing for the others
    for (const seat of game.seats) {
      if (!seat.completed) continue
      // A run of rules changed since its start doesn't compare with the fresh highscores
      if (sameRules(game.mission, mission.mission)) await recordBest(db, mission, seat.userId, seat.run, game.sessionId, game.finishedAt)
      await this.pay(game, mission, seat.userId)
    }
  }

  private async pay(game: FinishedMissionGame, mission: MissionRow, userId: string): Promise<void> {
    await this.deps.db.transaction().execute(async trx => {
      await lockUser(trx, userId)
      const day = localDate(game.finishedAt, await userTimeZone(trx, userId))
      const reward = missionReward({
        completed: true,
        test: game.test,
        playerId: userId,
        authorId: mission.ownerUserId,
        visibility: mission.visibility,
        mission: game.mission,
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
