// Counts achievements when a game ends: loads the finished game, asks the pure rules (rules.ts)
// what each account's seat added, and writes the counts, the XP of every tier reached and the
// "this game is counted" mark in one transaction per account. Running it twice for a game changes
// nothing: the mark is unique per account and game.
import type { Kysely } from 'kysely'
import type { Database } from '../db/schema.js'
import * as q from '../db/achievements.js'
import * as xp from '../db/progression.js'
import { playerGame, x01DetailOf } from '../progression/service.js'
import { challengeGame } from '../progression/facts.js'
import { xpForTiers } from '../shared/achievements.js'
import { levelOf, localDate } from '../shared/progression.js'
import type { AchievementUnlockedMessage } from '../schema/lobby-ws.js'
import type { GameEnded } from '../session/engine.js'
import { achievementDeltas } from './rules.js'

export type AchievementsDeps = {
  db: Kysely<Database>
  /** Whether achievements.enabled is on for the account: a game counts only for those it is on for. */
  enabled: (userId: string) => Promise<boolean>
  manualDarts?: (userId: string) => Promise<boolean>
  push: (userId: string, msg: AchievementUnlockedMessage) => void | Promise<void>
  warn: (message: string, details: unknown) => void
}

export class AchievementsService {
  constructor(private readonly deps: AchievementsDeps) {}

  async onGameEnded(e: Pick<GameEnded, 'sessionId' | 'status'>): Promise<void> {
    if (e.status === 'finished') await this.countGame(e.sessionId)
  }

  /** Counts the game for every account seated in it; where the flag is on it also pays the tiers' XP and pushes what was unlocked. */
  async countGame(sessionId: string, opts: { backfill?: boolean } = {}): Promise<void> {
    const game = await xp.getXpGame(this.deps.db, sessionId)
    if (!game || game.gameId !== 'x01') return
    const userIds = [...new Set(game.seats.flatMap(s => (s.userId !== null && !s.bot ? [s.userId] : [])))]
    const x01 = await x01DetailOf(this.deps.db, game.id, this.deps.warn)
    for (const userId of userIds) {
      // Counts are kept for everyone (turning the flag on later loses nothing); XP and the push only where it is on
      const paying = !opts.backfill && (await this.deps.enabled(userId))
      const player = playerGame(game, userId)
      if (!player) continue
      const manual = (await this.deps.manualDarts?.(userId)) ?? false
      const deltas = achievementDeltas(challengeGame(game, userId, player, x01, manual))
      const msg = await this.deps.db.transaction().execute(async trx => {
        await xp.lockUser(trx, userId)
        if (!(await q.claimGame(trx, userId, game.id))) return null
        const changed = (await q.addCounts(trx, userId, game.id, game.finishedAt, deltas)).filter(c => c.after > c.before)
        if (changed.length === 0) return null
        const unlocked = changed.map(c => ({
          id: c.id,
          tier: c.after,
          count: c.count,
          tierUp: c.before > 0,
          xp: xpForTiers(c.before, c.after),
        }))
        if (!paying) return null
        const day = localDate(game.finishedAt, await xp.userTimeZone(trx, userId))
        await xp.insertAwards(
          trx,
          userId,
          game.id,
          day,
          unlocked.map(u => ({
            kind: 'milestone',
            sourceType: 'achievement',
            sourceId: `${u.id}:${u.tier}`,
            amount: u.xp,
            meta: { achievement: u.id, tier: u.tier },
          })),
          game.finishedAt,
        )
        const { before, after } = await xp.addXp(
          trx,
          userId,
          unlocked.reduce((a, u) => a + u.xp, 0),
        )
        return {
          type: 'achievement.unlocked',
          sessionId: game.id,
          unlocked,
          levelBefore: levelOf(before).level,
          levelAfter: levelOf(after).level,
        } satisfies AchievementUnlockedMessage
      })
      if (msg) {
        try {
          await this.deps.push(userId, msg)
        } catch (err) {
          this.deps.warn('achievement push failed', { sessionId, userId, error: String(err) })
        }
      }
    }
  }

  /** Counts the finished games from before achievements existed, once; a restart resumes (counted games write nothing). Pays no XP. */
  async backfill(): Promise<number> {
    if (await q.backfillDone(this.deps.db)) return 0
    const ids = await xp.finishedGameIds(this.deps.db)
    for (const id of ids) await this.countGame(id, { backfill: true })
    await q.markBackfillDone(this.deps.db)
    return ids.length
  }
}
